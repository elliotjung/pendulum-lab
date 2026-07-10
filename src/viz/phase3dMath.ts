/** Pure yaw/pitch projection shared by browser renderers and headless tests. */
export interface Projected {
  x: number;
  y: number;
  depth: number;
}

export function rotateProject(p: { x: number; y: number; z: number }, yaw: number, pitch: number): Projected {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return {
    x: x1,
    y: p.y * cp - z1 * sp,
    depth: p.y * sp + z1 * cp
  };
}
