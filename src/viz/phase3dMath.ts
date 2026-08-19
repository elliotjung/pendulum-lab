/** Pure yaw/pitch projection shared by browser renderers and headless tests. */
export interface Projected {
  x: number;
  y: number;
  depth: number;
}

export function rotateProject(p: { x: number; y: number; z: number }, yaw: number, pitch: number): Projected {
  return rotateProjectInto(p, yaw, pitch, { x: 0, y: 0, depth: 0 });
}

/** Allocation-free projection for render loops with reusable scratch objects. */
export function rotateProjectInto(
  p: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  out: Projected
): Projected {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  out.x = x1;
  out.y = p.y * cp - z1 * sp;
  out.depth = p.y * sp + z1 * cp;
  return out;
}
