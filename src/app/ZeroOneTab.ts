import { TabController } from './TabController';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderScatterPath } from './labPlots';
import { downloadText } from './labExport';
import { num, readSystem } from './systemControls';

/**
 * 0–1 test for chaos (Gottwald–Melbourne). Independent of the Lyapunov /
 * variational machinery: it samples a bounded scalar observable cos(θ₁) of the
 * current system and reports K ∈ [0,1] (≈1 chaotic, ≈0 regular). The canvas
 * draws the translation-variable trajectory (p_c, q_c) for the median frequency —
 * a bounded blob ⇒ regular, a Brownian wandering ⇒ chaos.
 *
 * Takes over the tab's controls when the modern app mounts (idempotent).
 */
export class ZeroOneTab extends TabController {
  private client = new ChaosClient();
  private pPath: number[] = [];
  private qPath: number[] = [];
  private kValues: number[] = [];

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.dom.setText('zeroOneStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const { spec, state0 } = readSystem();
    const samples = Math.max(500, Math.round(num('zeroOneSamples', 3000)));
    try {
      const result = await this.client.zeroOne(spec, state0, { samples });
      this.pPath = result.pPath;
      this.qPath = result.qPath;
      this.kValues = result.kValues;
      const verdict = result.K > 0.5 ? 'chaotic' : 'regular';
      this.dom.setText('zeroOneK', `${result.K.toFixed(3)} ± ${result.kStdError.toFixed(3)}`);
      this.dom.setText('zeroOneVerdict', `${verdict} (K${result.K > 0.5 ? ' ≈ 1' : ' ≈ 0'})`);
      this.render();
      this.dom.setText(
        'zeroOneStatus',
        `done · K=${result.K.toFixed(3)}±${result.kStdError.toFixed(3)} · 95% CI [${result.kCi95[0].toFixed(3)}, ${result.kCi95[1].toFixed(3)}] · ${verdict}`
      );
      this.badge('zeroOneStatus', 'finite-time-estimate', '0-1 test K: finite-sample estimate with bootstrap CI.', {
        title: '0-1 Test Trust',
        source: '0-1 tab -> ChaosClient.zeroOne',
        parameters: { system: spec.kind, samples, observable: 'cos(theta)', seed: 12345 },
        uncertainty: `Bootstrap SE ${result.kStdError.toPrecision(4)} with 95% CI [${result.kCi95[0].toPrecision(4)}, ${result.kCi95[1].toPrecision(4)}].`,
        externalValidation:
          'Independent of Lyapunov tangent-space machinery; pinned by periodic/noise fixtures and chaotic pendulum tests.',
        reproduce: 'npm test -- tests/zero-one-test.test.ts tests/chaos-protocol-diagnostics.test.ts',
        caveat: 'Finite scalar-observable test; sticky transients and short series can understate chaos.',
        artifact: 'CSV export: pendulum_zero_one_test.csv'
      });
    } catch (err) {
      this.dom.setText('zeroOneStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('zeroOneCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx)
      renderScatterPath(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.pPath, this.qPath, {
        markOrigin: true
      });
  }

  private exportCsv(): void {
    const csv = ['index,k_c', ...this.kValues.map((v, i) => `${i + 1},${v.toPrecision(8)}`)].join('\n');
    downloadText('pendulum_zero_one_test.csv', csv, 'text/csv');
  }

  protected bind(): void {
    this.dom.takeOver('zeroOneStart')?.addEventListener('click', () => void this.run());
    this.dom.takeOver('zeroOneStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      this.dom.setText('zeroOneStatus', 'stopped');
    });
    this.dom.takeOver('zeroOneExport')?.addEventListener('click', () => this.exportCsv());
  }
}
