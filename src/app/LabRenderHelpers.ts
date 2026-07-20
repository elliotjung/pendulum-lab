import { configureCanvas2D, type ManagedCanvas2D } from './canvasQuality';
import { pageDom as dom } from './DomBinder';
import type { BobPosition, LabConfig } from './LabSimulation';

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

/** Cartesian bob positions in metres for live, scrub, and drag rendering. */
export function bobsFromState(config: LabConfig, state: ArrayLike<number>): BobPosition[] {
  const { l1, l2, l3 } = config.parameters;
  const x1 = l1 * Math.sin(state[0]!);
  const y1 = l1 * Math.cos(state[0]!);
  const x2 = x1 + l2 * Math.sin(state[1]!);
  const y2 = y1 + l2 * Math.cos(state[1]!);
  if (config.system === 'triple') {
    const ell3 = l3 ?? 1;
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      { x: x2 + ell3 * Math.sin(state[2]!), y: y2 + ell3 * Math.cos(state[2]!) }
    ];
  }
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 }
  ];
}
