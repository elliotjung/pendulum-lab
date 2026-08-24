import { configureCanvas2D, type ManagedCanvas2D } from './canvasQuality';
import { pageDom as dom } from './DomBinder';

export { bobsFromState, bobsFromStateInto } from './pendulumGeometry';

/** Resolve the managed main-canvas context without leaking DOM failures into the frame loop. */
export function mainCanvasContext(): ManagedCanvas2D | null {
  const canvas = dom.el<HTMLCanvasElement>('main');
  if (!canvas) return null;
  try {
    return configureCanvas2D(canvas);
  } catch {
    return null;
  }
}
