import type { CanvasQualityEvent } from './canvasQuality';
import type { QualityMode } from './LabQualityBudget';
import type { SimulationTimingMode } from './SimulationClock';

/** Stable tooling/automation contract returned by LabApp.diagnostics(). */
export interface LabDiagnostics {
  time: number;
  drift: number;
  poincarePoints: number;
  lambdaMax: number;
  fps: number;
  physicsMsPerFrame: number;
  renderMsPerFrame: number;
  sidePlotMsPerFrame: number;
  trailPoints: number;
  qualityMode: QualityMode;
  qualityReason: string;
  dprCap: number;
  stepsPerFrame: number;
  stepsAdvanced: number;
  timingMode: SimulationTimingMode;
  requestedStepsPerFrame: number;
  trailQualityScale: number;
  sidePlotBackend: 'offscreen' | 'main';
  mainCanvasBackend: 'offscreen' | 'main';
  mainTrailBackend: 'webgl2' | 'canvas2d' | 'worker';
  pendingUiTasks: number;
  longTaskCount: number;
  longTaskMs: number;
  longestTaskMs: number;
  timingDebtSeconds: number;
  droppedSimulationSeconds: number;
  backgroundPolicy: 'pause-when-hidden' | 'continue-when-hidden';
  decorativeEffects: boolean;
  canvasQualityEvents: readonly CanvasQualityEvent[];
}
