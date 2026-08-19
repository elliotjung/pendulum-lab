import { describe, expect, it } from 'vitest';
import { rotateProject, rotateProjectInto } from '../src/app/phase3d';
import { Phase3DTrailBuffer } from '../src/app/Phase3DTrailBuffer';

describe('rotateProject', () => {
  it('is the identity projection with no rotation', () => {
    const p = rotateProject({ x: 0.5, y: -0.3, z: 0.8 }, 0, 0);
    expect(p.x).toBeCloseTo(0.5, 12);
    expect(p.y).toBeCloseTo(-0.3, 12);
    expect(p.depth).toBeCloseTo(0.8, 12);
  });

  it('a 90° yaw swaps the x and z axes', () => {
    const p = rotateProject({ x: 1, y: 0, z: 0 }, Math.PI / 2, 0);
    expect(p.x).toBeCloseTo(0, 12); // x maps toward the old z (which was 0)
    expect(p.depth).toBeCloseTo(-1, 12); // z' = -x
  });

  it('a 90° pitch maps the y axis into depth', () => {
    const p = rotateProject({ x: 0, y: 1, z: 0 }, 0, Math.PI / 2);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(1, 12);
  });

  it('preserves the vector norm (rotation is rigid)', () => {
    const v = { x: 0.4, y: -0.7, z: 0.5 };
    const p = rotateProject(v, 0.9, -0.4);
    const before = Math.hypot(v.x, v.y, v.z);
    const after = Math.hypot(p.x, p.y, p.depth);
    expect(after).toBeCloseTo(before, 12);
  });

  it('projects into caller-owned scratch storage without allocation', () => {
    const scratch = { x: 0, y: 0, depth: 0 };
    const result = rotateProjectInto({ x: 1, y: 2, z: 3 }, 0.2, -0.4, scratch);
    expect(result).toBe(scratch);
    expect(result).toEqual(rotateProject({ x: 1, y: 2, z: 3 }, 0.2, -0.4));
  });
});

describe('Phase3DTrailBuffer', () => {
  it('retains chronological newest points through wrap and resize', () => {
    const trail = new Phase3DTrailBuffer(3);
    for (let value = 1; value <= 5; value += 1) trail.push(value, value + 10, value + 20);
    const scratch = { x: 0, y: 0, z: 0 };
    expect([0, 1, 2].map((index) => trail.read(index, scratch).x)).toEqual([3, 4, 5]);
    trail.resize(2);
    expect([0, 1].map((index) => trail.read(index, scratch).x)).toEqual([4, 5]);
    trail.resize(5);
    trail.push(6, 16, 26);
    expect([0, 1, 2].map((index) => trail.read(index, scratch).x)).toEqual([4, 5, 6]);
  });
});
