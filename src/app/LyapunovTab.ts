import { num, readSystem } from './systemControls';
import { TabController } from './TabController';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderSpectrumBars } from './labPlots';
import { downloadText } from './labExport';

/**
 * Modern port of the Lyapunov-spectrum analysis tab. It takes over the tab's
 * controls (cloning the buttons to strip the legacy handlers), reads the current
 * system from the on-page controls, and computes the full spectrum on the chaos
 * worker (`lyapunovSpectrum`, with a transparent main-thread fallback). Results
 * fill the existing #L1…#KY fields and a spectrum bar chart on #lyapSpecCanvas.
 *
 * It takes over the tab controls when the modern app mounts.
 */

export class LyapunovTab extends TabController {
  private client = new ChaosClient();
  private spectrum: number[] = [];
  private stdError: number[] = [];
  private blockStdError: number[] = [];

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.dom.setText('lyapStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const { spec, state0, count } = readSystem();
    const dt = 0.005;
    const renormEvery = Math.max(1, Math.round(num('lyapDt', 0.5) / dt));
    const steps = Math.max(2000, Math.round(num('lyapT', 120) / dt));
    try {
      const result = await this.client.lyapunovSpectrum(spec, state0, count, {
        dt,
        steps,
        renormEvery,
        transientSteps: Math.min(2000, Math.round(steps / 10))
      });
      this.spectrum = result.spectrum;
      this.stdError = result.stdError ?? [];
      this.blockStdError = result.blockStdError ?? [];
      result.spectrum.slice(0, 4).forEach((v, i) => {
        const se = this.stdError[i];
        this.dom.setText(`L${i + 1}`, se !== undefined ? `${v.toFixed(4)} ± ${se.toFixed(4)}` : v.toFixed(4));
      });
      this.dom.setText('LSum', result.sum.toExponential(2));
      this.dom.setText('KY', result.kaplanYorkeDimension.toFixed(3));
      this.render();
      // Surface the Hamiltonian self-consistency gate alongside the result so the
      // estimate is reported with its own validation, not as a bare number.
      const c = result.consistency;
      const verdict = c ? (c.symplectic ? 'symplectic ✓' : 'pairing ✗') : '';
      const pairing = c ? `, pairErr=${c.pairingError.toExponential(1)}` : '';
      this.dom.setText(
        'lyapStatus',
        `done · Σλ=${result.sum.toExponential(1)}${pairing}${verdict ? ` · ${verdict}` : ''}`
      );
      this.badge(
        'lyapStatus',
        'finite-time-estimate',
        'Lyapunov spectrum: finite-time Benettin/QR estimate with block std errors.',
        {
          title: 'Lyapunov Spectrum Trust',
          source: 'Lyapunov tab -> ChaosClient.lyapunovSpectrum',
          parameters: { system: spec.kind, dimensions: count, dt, steps, renormEvery },
          uncertainty:
            'Per-exponent standard errors plus block standard errors from the finite renormalization sequence.',
          externalValidation: c
            ? `Hamiltonian spectrum consistency gate: symplectic=${c.symplectic}, pairingError=${c.pairingError.toExponential(2)}`
            : 'Spectrum consistency is reported when the selected system exposes the required structure.',
          reproduce: 'npm test -- tests/lyapunov-spectrum-job.test.ts tests/spectrum-consistency.test.ts',
          caveat:
            'Finite-time exponents depend on integration horizon, transient trimming, and tangent-space conditioning.',
          artifact: 'CSV export: pendulum_lyapunov_spectrum.csv'
        }
      );
    } catch (err) {
      this.dom.setText('lyapStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('lyapSpecCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx)
      renderSpectrumBars(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.spectrum);
  }

  private exportCsv(): void {
    const csv = [
      'index,lambda,std_error,block_std_error',
      ...this.spectrum.map(
        (v, i) =>
          `${i + 1},${v.toPrecision(10)},${(this.stdError[i] ?? 0).toPrecision(6)},${(this.blockStdError[i] ?? 0).toPrecision(6)}`
      )
    ].join('\n');
    downloadText('pendulum_lyapunov_spectrum.csv', csv, 'text/csv');
  }

  protected bind(): void {
    this.dom.takeOver('lyapStart')?.addEventListener('click', () => void this.run());
    this.dom.takeOver('lyapStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      this.dom.setText('lyapStatus', 'stopped');
    });
    this.dom.takeOver('lyapExport')?.addEventListener('click', () => this.exportCsv());
  }
}
