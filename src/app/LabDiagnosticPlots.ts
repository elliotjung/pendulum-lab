import { configureCanvas2D } from './canvasQuality';
import { pageDom as dom } from './DomBinder';
import type { LabHistory } from './LabHistory';
import type { LabSidePlotCoordinator } from './LabSidePlotCoordinator';
import { renderAngleProjection, renderAngleTimeSeries } from './studentAnglePlots';

export const LAB_DIAGNOSTIC_PLOT_COUNT = 7;
const WORKER_PLOT_COUNT = 5;

/** Staggers worker plots and the two student-facing angle plots on one cadence. */
export class LabDiagnosticPlots {
  constructor(
    private readonly workerPlots: LabSidePlotCoordinator,
    private readonly history: LabHistory
  ) {}

  draw(plotIndex: number): void {
    if (plotIndex < WORKER_PLOT_COUNT) {
      this.workerPlots.drawSlice(plotIndex);
      return;
    }
    if (document.body.classList.contains('audience-beginner')) return;

    const canvasId = plotIndex === WORKER_PLOT_COUNT ? 'thetaProjection' : 'angleTime';
    const canvas = dom.el<HTMLCanvasElement>(canvasId);
    if (!canvas) return;
    try {
      const target = configureCanvas2D(canvas);
      if (!target) return;
      const rect = { x: 0, y: 0, width: target.width, height: target.height };
      if (canvasId === 'thetaProjection') {
        const angles = this.history.angleProjection();
        renderAngleProjection(target.ctx, rect, angles.theta1, angles.theta2);
      } else {
        const angles = this.history.angleTime();
        renderAngleTimeSeries(target.ctx, rect, angles.time, angles.theta1, angles.theta2);
      }
    } catch {
      // A missing or tainted 2D context must not stop simulation progress.
    }
  }
}
