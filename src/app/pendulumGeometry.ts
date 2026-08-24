import type { BobPosition, LabConfig } from './LabSimulation';

/** Cartesian bob positions in metres for live, scrub, and drag rendering. */
export function bobsFromState(config: LabConfig, state: ArrayLike<number>): BobPosition[] {
  return bobsFromStateInto(config, state, []);
}

/** Allocation-free Cartesian projection for the animation-frame path. */
export function bobsFromStateInto(config: LabConfig, state: ArrayLike<number>, out: BobPosition[]): BobPosition[] {
  const { l1, l2, l3 } = config.parameters;
  const x1 = l1 * Math.sin(state[0]!);
  const y1 = l1 * Math.cos(state[0]!);
  const x2 = x1 + l2 * Math.sin(state[1]!);
  const y2 = y1 + l2 * Math.cos(state[1]!);
  const count = config.system === 'triple' ? 3 : 2;
  while (out.length < count) out.push({ x: 0, y: 0 });
  out.length = count;
  out[0]!.x = x1;
  out[0]!.y = y1;
  out[1]!.x = x2;
  out[1]!.y = y2;
  if (config.system === 'triple') {
    const ell3 = l3 ?? 1;
    out[2]!.x = x2 + ell3 * Math.sin(state[2]!);
    out[2]!.y = y2 + ell3 * Math.cos(state[2]!);
  }
  return out;
}
