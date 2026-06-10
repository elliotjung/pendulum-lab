import { ChaosClient } from '../runtime/ChaosClient';
import { renderScatterPath } from './labPlots';
import { downloadText } from './labExport';
import { setText, takeOverButton } from './domTakeover';
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
export class ZeroOneTab {
  private client = new ChaosClient();
  private pPath: number[] = [];
  private qPath: number[] = [];
  private kValues: number[] = [];
  private running = false;

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    setText('zeroOneStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const { spec, state0 } = readSystem();
    const samples = Math.max(500, Math.round(num('zeroOneSamples', 3000)));
    try {
      const result = await this.client.zeroOne(spec, state0, { samples });
      this.pPath = result.pPath;
      this.qPath = result.qPath;
      this.kValues = result.kValues;
      const verdict = result.K > 0.5 ? 'chaotic' : 'regular';
      setText('zeroOneK', `${result.K.toFixed(3)} ± ${result.kStdError.toFixed(3)}`);
      setText('zeroOneVerdict', `${verdict} (K${result.K > 0.5 ? ' ≈ 1' : ' ≈ 0'})`);
      this.render();
      setText('zeroOneStatus', `done · K=${result.K.toFixed(3)}±${result.kStdError.toFixed(3)} · 95% CI [${result.kCi95[0].toFixed(3)}, ${result.kCi95[1].toFixed(3)}] · ${verdict}`);
    } catch (err) {
      setText('zeroOneStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = document.getElementById('zeroOneCanvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) renderScatterPath(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.pPath, this.qPath, { markOrigin: true });
  }

  private exportCsv(): void {
    const csv = ['index,k_c', ...this.kValues.map((v, i) => `${i + 1},${v.toPrecision(8)}`)].join('\n');
    downloadText('pendulum_zero_one_test.csv', csv, 'text/csv');
  }

  /** Take over the tab's controls. Idempotent. */
  install(): void {
    takeOverButton('zeroOneStart')?.addEventListener('click', () => void this.run());
    takeOverButton('zeroOneStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      setText('zeroOneStatus', 'stopped');
    });
    takeOverButton('zeroOneExport')?.addEventListener('click', () => this.exportCsv());
  }
}
