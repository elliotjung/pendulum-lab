import { ChaosClient } from '../runtime/ChaosClient';
import { renderLabelGrid } from './labPlots';
import { downloadText } from './labExport';
import { setText, takeOverButton } from './domTakeover';
import { num, readSystem } from './systemControls';

/**
 * Recurrence Quantification Analysis (RQA). Non-variational, like the 0–1 test:
 * it time-delay embeds a bounded observable cos(θ₁) and quantifies the geometry
 * of the recurrence plot. DET (determinism) separates structure from noise, and
 * DIV = 1/Lmax is a finite-size proxy for the largest Lyapunov exponent — so the
 * verdict cross-checks the spectrum tab without any tangent-space machinery.
 *
 * The canvas draws the recurrence plot itself (the iconic RQA picture): long
 * unbroken diagonals ⇒ regular, a speckled texture ⇒ chaos.
 *
 * Takes over the tab's controls when the modern app mounts (idempotent).
 */
export class RqaTab {
  private client = new ChaosClient();
  private plot: number[] = [];
  private plotSize = 0;
  private metrics: { key: string; value: string }[] = [];
  private running = false;

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    setText('rqaStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const { spec, state0 } = readSystem();
    const dimension = Math.max(1, Math.round(num('rqaDim', 2)));
    const delay = Math.max(1, Math.round(num('rqaDelay', 5)));
    try {
      const r = await this.client.rqa(spec, state0, { dimension, delay, targetRecurrenceRate: 0.1 });
      this.plot = r.plot;
      this.plotSize = r.plotSize;
      this.metrics = [
        { key: 'rqa_recurrence_rate', value: r.recurrenceRate.toPrecision(6) },
        { key: 'rqa_determinism', value: r.determinism.toPrecision(6) },
        { key: 'rqa_laminarity', value: r.laminarity.toPrecision(6) },
        { key: 'rqa_longest_diagonal', value: String(r.longestDiagonal) },
        { key: 'rqa_divergence', value: r.divergence.toPrecision(6) },
        { key: 'rqa_entropy', value: r.entropy.toPrecision(6) },
        { key: 'rqa_determinism_std_error', value: r.determinismStdError.toPrecision(6) },
        { key: 'rqa_divergence_std_error', value: r.divergenceStdError.toPrecision(6) }
      ];
      setText('rqaRR', r.recurrenceRate.toFixed(3));
      setText('rqaDET', `${r.determinism.toFixed(3)} ± ${r.determinismStdError.toFixed(3)}`);
      setText('rqaLAM', r.laminarity.toFixed(3));
      setText('rqaLmax', String(r.longestDiagonal));
      setText('rqaDIV', `${r.divergence.toFixed(4)} ± ${r.divergenceStdError.toFixed(4)}`);
      setText('rqaENTR', r.entropy.toFixed(3));
      this.render();
      const verdict = r.determinism > 0.85 && r.divergence < 0.1 ? 'regular/structured' : 'chaotic/stochastic';
      setText('rqaStatus', `done · DET=${r.determinism.toFixed(3)}±${r.determinismStdError.toFixed(3)} · DIV=${r.divergence.toFixed(3)}±${r.divergenceStdError.toFixed(3)} (${r.uncertaintyBlocks} blocks) · ${verdict}`);
    } catch (err) {
      setText('rqaStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = document.getElementById('rqaCanvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      // label 0 = empty (dark), 1 = recurrence point (cyan).
      renderLabelGrid(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.plot, this.plotSize, this.plotSize, {
        colors: ['#070b11', '#18d4f8']
      });
    }
  }

  private exportCsv(): void {
    const csv = ['metric,value', ...this.metrics.map((m) => `${m.key},${m.value}`)].join('\n');
    downloadText('pendulum_rqa.csv', csv, 'text/csv');
  }

  /** Take over the tab's controls. Idempotent. */
  install(): void {
    takeOverButton('rqaStart')?.addEventListener('click', () => void this.run());
    takeOverButton('rqaStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      setText('rqaStatus', 'stopped');
    });
    takeOverButton('rqaExport')?.addEventListener('click', () => this.exportCsv());
  }
}
