import { TabController } from './TabController';
import type { SystemSpec } from '../physics/systemSpec';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderLabelGrid } from './labPlots';
import { downloadDataUrl } from './labExport';
import { num, readSystem } from './systemControls';
import { flipBasinField } from '../runtime/gpuFields';
import { gpuTierBadge } from '../runtime/promotionContract';
import { basinEntropy, boundaryMask, boxCountingDimension, wadaCandidate } from '../chaos/basin';

/**
 * Double-pendulum flip basin + basin entropy + box-counting (fractal) dimension.
 * Each initial angle (θ₁, θ₂), released from rest, is coloured by which rod flips
 * over the top first; the boundary is the classic double-pendulum fractal. The
 * Daza basin entropy (Sb, Sbb) and the Minkowski–Bouligand dimension quantify it
 * — a measured fractal dimension, not "it looks fractal".
 *
 * Flip basins are double-pendulum specific, so the tab reports a notice when the
 * triple pendulum is selected. Takes over the tab's controls (idempotent).
 */
export class BasinTab extends TabController {
  private client = new ChaosClient();
  private labels: number[] = [];
  private gridWidth = 0;
  private gridHeight = 0;

  async run(): Promise<void> {
    if (this.running) return;
    const { spec } = readSystem();
    if (spec.kind !== 'double') {
      this.dom.setText('basinStatus', 'flip basins require the double pendulum (set System → Double)');
      return;
    }
    this.running = true;
    const useGpu = this.dom.el<HTMLInputElement>('basinGpu')?.checked ?? false;
    this.dom.setText('basinStatus', useGpu ? 'computing (WebGPU)…' : this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const n = Math.max(20, Math.min(200, Math.round(num('basinRes', 100))));
    if (useGpu) {
      await this.runGpu(spec as Extract<SystemSpec, { kind: 'double' }>, n);
      return;
    }
    try {
      const result = await this.client.basin(spec as Extract<SystemSpec, { kind: 'double' }>, { n });
      this.labels = result.labels;
      this.gridWidth = result.width;
      this.gridHeight = result.height;
      this.dom.setText('basinSb', `${result.basinEntropy.toFixed(4)} ± ${result.basinEntropyStdError.toFixed(4)}`);
      this.dom.setText('basinSbb', `${result.boundaryBasinEntropy.toFixed(4)} ± ${result.boundaryBasinEntropyStdError.toFixed(4)}`);
      this.dom.setText('basinDim', `${result.boxCountingDimension.toFixed(3)} ± ${result.boxCountingStdError.toFixed(3)}`);
      this.dom.setText('basinFractal', result.fractalBoundary ? 'Sbb > ln2 ✓' : `dim≈${result.boxCountingDimension.toFixed(2)}`);
      this.render();
      const wada = result.wadaCandidate ? 'Wada candidate ✓' : `Wada fraction ${(result.wadaFraction * 100).toFixed(0)}%`;
      this.dom.setText('basinStatus', `done · Sb=${result.basinEntropy.toFixed(3)}±${result.basinEntropyStdError.toFixed(3)} · dim=${result.boxCountingDimension.toFixed(3)}±${result.boxCountingStdError.toFixed(3)} (R²=${result.boxCountingR2.toFixed(3)}) · ${wada}`);
      this.badge('basinStatus', 'finite-time-estimate', 'Basin entropy/dimension: finite-resolution estimates with std errors.', {
        title: 'Flip Basin Trust',
        source: 'Basin tab -> ChaosClient.basin',
        parameters: { system: spec.kind, resolution: `${n}x${n}`, classifier: 'first rod flip from rest' },
        uncertainty: `Basin entropy SE ${result.basinEntropyStdError.toPrecision(4)}, boundary entropy SE ${result.boundaryBasinEntropyStdError.toPrecision(4)}, box-counting SE ${result.boxCountingStdError.toPrecision(4)}.`,
        externalValidation: 'Daza-style basin entropy and Wada candidate grid tests are pinned by unit fixtures.',
        reproduce: 'npm test -- tests/basin.test.ts tests/wada-convergence.test.ts',
        caveat: 'Finite-resolution basin grids are evidence of fractal boundaries, not a proof of Wada structure.',
        artifact: 'PNG export: pendulum_flip_basin.png'
      });
    } catch (err) {
      this.dom.setText('basinStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * GPU path: the flip-basin label grid is computed by the WebGPU kernel (with
   * the CPU cross-validation contract in gpuFields.ts), then the *same* entropy
   * / box-counting / Wada statistics the worker uses are applied on the main
   * thread. The label grid is identical in semantics, so the statistics carry
   * over unchanged — only the per-cell integration moved to the GPU.
   */
  private async runGpu(spec: Extract<SystemSpec, { kind: 'double' }>, n: number): Promise<void> {
    try {
      const field = await flipBasinField(
        { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        { n }
      );
      const grid = { labels: field.labels, width: field.width, height: field.height };
      const entropy = basinEntropy(grid);
      const box = boxCountingDimension(boundaryMask(grid), grid.width, grid.height);
      const wada = wadaCandidate(grid);
      this.labels = Array.from(field.labels);
      this.gridWidth = field.width;
      this.gridHeight = field.height;
      this.dom.setText('basinSb', `${entropy.basinEntropy.toFixed(4)} ± ${entropy.basinEntropyStdError.toFixed(4)}`);
      this.dom.setText('basinSbb', `${entropy.boundaryBasinEntropy.toFixed(4)} ± ${entropy.boundaryBasinEntropyStdError.toFixed(4)}`);
      this.dom.setText('basinDim', `${box.dimension.toFixed(3)} ± ${box.stdError.toFixed(3)}`);
      this.dom.setText('basinFractal', entropy.fractalBoundary ? 'Sbb > ln2 ✓' : `dim≈${box.dimension.toFixed(2)}`);
      this.render();
      const wadaText = wada.wadaCandidate ? 'Wada candidate ✓' : `Wada fraction ${(wada.wadaFraction * 100).toFixed(0)}%`;
      const tier = gpuTierBadge({ backend: field.backend, oracleComparisonPassed: field.validation?.passed ?? null });
      const backendNote = field.backend === 'webgpu'
        ? `${tier.label} · f32 · ${(field.validation?.maxAbsDiff ?? 0) === 0 ? 'probes match' : `probe Δ${((field.validation?.maxAbsDiff ?? 0) * 100).toFixed(0)}%`} vs CPU · ${field.elapsedMs.toFixed(0)} ms`
        : `${tier.label} (f64) · ${field.elapsedMs.toFixed(0)} ms`;
      this.dom.setText('basinStatus', `done · Sb=${entropy.basinEntropy.toFixed(3)}±${entropy.basinEntropyStdError.toFixed(3)} · dim=${box.dimension.toFixed(3)}±${box.stdError.toFixed(3)} (R²=${box.r2.toFixed(3)}) · ${wadaText} · ${backendNote}`);
      this.badge(
        'basinStatus',
        tier.tier === 'promoted' || tier.tier === 'cpu-fallback' ? 'finite-time-estimate' : 'caveat',
        field.caveat,
        {
          title: 'GPU Flip Basin Trust',
          source: 'Basin tab -> flipBasinField',
          parameters: { backend: field.backend, resultTier: tier.tier, resolution: `${field.width}x${field.height}`, validationPassed: field.validation?.passed ?? 'cpu-fallback' },
          uncertainty: `CPU probe disagreement fraction ${field.validation?.maxAbsDiff ?? 0}; box-counting SE ${box.stdError.toPrecision(4)}.`,
          externalValidation: 'GPU field output is accepted only after CPU probe validation, otherwise the CPU f64 grid is returned.',
          reproduce: 'npm run validate:gpu-scale',
          caveat: field.caveat,
          artifact: 'reports/gpu-scale-validation.md'
        }
      );
    } catch (err) {
      this.dom.setText('basinStatus', `WebGPU basin failed: ${err instanceof Error ? err.message : String(err)} — use the CPU path`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('basinCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      renderLabelGrid(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.labels, this.gridWidth, this.gridHeight);
    }
  }

  private exportPng(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('basinCanvas');
    if (canvas) downloadDataUrl('pendulum_flip_basin.png', canvas.toDataURL('image/png'));
  }

  protected bind(): void {
    this.dom.takeOver('basinStart')?.addEventListener('click', () => void this.run());
    this.dom.takeOver('basinStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      this.dom.setText('basinStatus', 'stopped');
    });
    this.dom.takeOver('basinExport')?.addEventListener('click', () => this.exportPng());
  }
}
