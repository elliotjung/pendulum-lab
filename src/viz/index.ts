export type { Ctx2D, CtxGradient, Rect, Padding } from './types';
export {
  OKABE_ITO,
  CATEGORICAL,
  DARK_THEME,
  LIGHT_THEME,
  categorical,
  hexToRgb,
  rgbToHex,
  lerpHexColor
} from './palette';
export type { VizTheme, Rgb } from './palette';
export { makeScale, niceTicks, innerRect, drawFrame, formatTick, DEFAULT_PADDING } from './scales';
export type { Scale } from './scales';
export { renderEnergyPlot, renderDriftGauge } from './energyPlot';
export type { EnergySeries, EnergyPlotOptions, DriftGaugeOptions } from './energyPlot';
export { renderLyapunovConvergence } from './lyapunovPlot';
export type { LyapunovPlotOptions } from './lyapunovPlot';
export { renderPoincareSection, autoViewport, zoomViewport } from './poincare';
export type { Point2D, Viewport, PoincarePlotOptions } from './poincare';
export { renderBifurcation } from './bifurcation';
export type { BifurcationColumnData, BifurcationPlotOptions } from './bifurcation';
export { renderTrajectoryTrace } from './trace';
export type { TraceOptions } from './trace';
