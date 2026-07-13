import { TabController } from './TabController';
import type { SystemSpec } from '../physics/systemSpec';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderScalarField } from './labPlots';
import { downloadDataUrl } from './labExport';
import { num, readSystem } from './systemControls';
import { extractFtleRidges, type FtleRidgeResult } from '../chaos/ftleRidge';
import { ftleFieldFiniteDifference } from '../runtime/gpuFields';
import type { ResultBadgeLevel } from './resultBadges';

/**
 * Finite-Time Lyapunov Exponent (FTLE) field of the double pendulum over its
 * (θ₁, θ₂) section. Unlike the chaos-map Sweep (which time-averages λ₁), the
 * FTLE measures the largest singular value of the finite-time flow-map gradient
 * ∂x(T)/∂x(0) — so ridges of the field are Lagrangian Coherent Structures, the
 * transport barriers that organise the mixing. The horizon T is the key knob.
 *
 * The LCS ridge overlay marks the cells of the discrete ridge extractor
 * (percentile + transverse local-maximum proxy) on top of the heatmap, turning
 * the bright bands into explicit candidate transport-barrier curves.
 *
 * FTLE fields are double-pendulum specific; the tab reports a notice for the
 * triple pendulum. Takes over the tab's controls (idempotent).
 */
export class FtleTab extends TabController {
  private client = new ChaosClient();
  private values: number[] = [];
  private gridWidth = 0;
  private gridHeight = 0;
  private min = 0;
  private max = 0;
  private ridges: FtleRidgeResult | null = null;

  async run(): Promise<void> {
    if (this.running) return;
    const { spec } = readSystem();
    if (spec.kind !== 'double') {
      this.dom.setText('ftleStatus', 'FTLE field requires the double pendulum (set System → Double)');
      this.badge('ftleStatus', 'caveat', 'FTLE field requires the double pendulum (set System -> Double)', {
        title: 'FTLE Applicability Caveat',
        source: 'FTLE tab system gate',
        parameters: { selectedSystem: spec.kind },
        uncertainty: 'No FTLE field was computed.',
        externalValidation:
          'Double-pendulum FTLE field is pinned by tests; other systems need separate field definitions.',
        reproduce: 'npm test -- tests/ftle.test.ts tests/gpu-fields-validation.test.ts',
        caveat: 'This UI field currently supports only the double pendulum section.',
        artifact: 'none'
      });
      return;
    }
    this.running = true;
    const useGpu = this.dom.el<HTMLInputElement>('ftleGpu')?.checked ?? false;
    this.dom.setText(
      'ftleStatus',
      useGpu ? 'computing (WebGPU)…' : this.client.usesWorker() ? 'computing (worker)…' : 'computing…'
    );
    const n = Math.max(20, Math.min(160, Math.round(num('ftleRes', 70))));
    const totalTime = Math.max(0.5, num('ftleT', 3));
    try {
      const doubleSpec = spec as Extract<SystemSpec, { kind: 'double' }>;
      let min: number;
      let max: number;
      let backendNote = '';
      let badgeLevel: ResultBadgeLevel = 'finite-time-estimate';
      let badgeText: string;
      if (useGpu) {
        // GPU path: finite-difference flow-map FTLE (Shadden-style grid
        // gradient) — distinct method from the worker's variational STM, with
        // a CPU subsample cross-validation contract (see gpuFields.ts).
        const r = await ftleFieldFiniteDifference(
          { m1: doubleSpec.m1, m2: doubleSpec.m2, l1: doubleSpec.l1, l2: doubleSpec.l2, g: doubleSpec.g },
          { n, totalTime }
        );
        this.values = Array.from(r.values);
        this.gridWidth = r.width;
        this.gridHeight = r.height;
        min = r.min;
        max = r.max;
        backendNote =
          r.backend === 'webgpu'
            ? ` · WebGPU f32 (probe Δ≤${(r.validation?.maxAbsDiff ?? 0).toFixed(3)} vs CPU)`
            : ' · CPU fallback (f64)';
        badgeLevel =
          r.backend === 'webgpu' ? (r.validation?.passed ? 'finite-time-estimate' : 'caveat') : 'finite-time-estimate';
        badgeText = r.caveat;
      } else {
        const r = await this.client.ftle(doubleSpec, { n, totalTime });
        this.values = r.values;
        this.gridWidth = r.width;
        this.gridHeight = r.height;
        min = r.min;
        max = r.max;
        badgeText = 'FTLE field: finite-horizon flow-map gradient estimate (variational, CPU-validated path).';
      }
      this.min = min;
      this.max = max;
      this.ridges = extractFtleRidges(this.values, this.gridWidth, this.gridHeight, { percentile: 0.85 });
      this.dom.setText('ftleMin', min.toFixed(3));
      this.dom.setText('ftleMax', max.toFixed(3));
      this.dom.setText('ftleT2', `${totalTime.toFixed(1)} s`);
      this.dom.setText(
        'ftleRidgeInfo',
        `${this.ridges.ridgeCells} (${(this.ridges.ridgeFraction * 100).toFixed(1)}%, σ_T ≥ ${this.ridges.threshold.toFixed(2)})`
      );
      this.render();
      this.dom.setText(
        'ftleStatus',
        `done · σ_T∈[${min.toFixed(2)}, ${max.toFixed(2)}] · T=${totalTime.toFixed(1)}s · ${this.ridges.ridgeCells} LCS ridge cells${backendNote}`
      );
      this.badge('ftleStatus', badgeLevel, `${badgeText} Ridge overlay: ${this.ridges.caveat}`, {
        title: 'FTLE Field Trust',
        source: useGpu ? 'FTLE tab -> ftleFieldFiniteDifference' : 'FTLE tab -> ChaosClient.ftle',
        parameters: {
          system: doubleSpec.kind,
          resolution: `${this.gridWidth}x${this.gridHeight}`,
          totalTime,
          backend: useGpu ? 'gpu-field-or-fallback' : 'worker-or-main-thread'
        },
        uncertainty: `Finite-horizon field range [${min.toPrecision(4)}, ${max.toPrecision(4)}]; ridge threshold ${this.ridges.threshold.toPrecision(4)}.`,
        externalValidation: useGpu
          ? 'GPU finite-difference field must pass CPU probe validation or return CPU fallback.'
          : 'Variational FTLE path is pinned against linear systems and double-pendulum separation tests.',
        reproduce: useGpu
          ? 'npm run validate:gpu-scale'
          : 'npm test -- tests/ftle.test.ts tests/chaos-protocol-diagnostics.test.ts',
        caveat: `${badgeText} ${this.ridges.caveat}`,
        artifact: 'PNG export: pendulum_ftle_field.png'
      });
    } catch (err) {
      this.dom.setText('ftleStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private ridgeOverlayEnabled(): boolean {
    const el = this.dom.el<HTMLInputElement>('ftleRidges');
    return el ? el.checked : true;
  }

  private render(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('ftleCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    renderScalarField(
      ctx,
      { x: 0, y: 0, width: canvas.width, height: canvas.height },
      this.values,
      this.gridWidth,
      this.gridHeight,
      {
        range: [this.min, this.max]
      }
    );
    if (!this.ridges || !this.ridgeOverlayEnabled() || this.gridWidth === 0 || this.gridHeight === 0) return;
    // Ridge cells drawn with the same cell geometry as the scalar field so the
    // overlay registers exactly; red reads as "barrier" against the blue→red
    // ramp because ridge cells sit at the top of the range anyway.
    const cellW = canvas.width / this.gridWidth;
    const cellH = canvas.height / this.gridHeight;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 47, 84, 0.85)';
    const mask = this.ridges.mask;
    for (let y = 0; y < this.gridHeight; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        if (mask[y * this.gridWidth + x] === 1) {
          // Same top-down row order as renderScalarField, so the overlay
          // registers cell-for-cell with the heatmap.
          ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
        }
      }
    }
    ctx.restore();
  }

  private exportPng(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('ftleCanvas');
    if (canvas) downloadDataUrl('pendulum_ftle_field.png', canvas.toDataURL('image/png'));
  }

  protected bind(): void {
    this.dom.takeOver('ftleStart')?.addEventListener('click', () => void this.run());
    this.dom.takeOver('ftleStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      this.dom.setText('ftleStatus', 'stopped');
    });
    this.dom.takeOver('ftleExport')?.addEventListener('click', () => this.exportPng());
    this.dom.el<HTMLInputElement>('ftleRidges')?.addEventListener('change', () => this.render());
  }
}
