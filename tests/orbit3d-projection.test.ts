import { describe, expect, it } from 'vitest';
import { OrbitCamera, depthSortIndices } from '../src/viz/orbit3d';
import { rotateProject } from '../src/app/phase3d';

/**
 * Golden tests for the 3D projection pipeline (rotateProject → OrbitCamera)
 * and the painter's-algorithm depth ordering used by the 3D lab renderer.
 * The golden numbers are hand-derived from the projection definitions:
 *
 *   yaw about y:   x₁ = x·cos(yaw) + z·sin(yaw); z₁ = −x·sin(yaw) + z·cos(yaw)
 *   pitch about x: y₂ = y·cos(p) − z₁·sin(p);    depth = y·sin(p) + z₁·cos(p)
 *   screen:        sx = w/2 + x₁·s′, sy = h/2 − y₂·s′,
 *                  s′ = scale·zoom / (1 + 0.35·max(−0.9, depth·0.25))
 */
describe('rotateProject golden values', () => {
  it('identity camera (yaw = pitch = 0) is the trivial projection', () => {
    const p = rotateProject({ x: 1.5, y: -0.25, z: 0.75 }, 0, 0);
    expect(p.x).toBeCloseTo(1.5, 12);
    expect(p.y).toBeCloseTo(-0.25, 12);
    expect(p.depth).toBeCloseTo(0.75, 12);
  });

  it('yaw = π/2 maps +z onto +x (and +x onto −depth)', () => {
    const p = rotateProject({ x: 1, y: 0, z: 0 }, Math.PI / 2, 0);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(-1, 12);
    const q = rotateProject({ x: 0, y: 0, z: 1 }, Math.PI / 2, 0);
    expect(q.x).toBeCloseTo(1, 12);
    expect(q.depth).toBeCloseTo(0, 12);
  });

  it('pitch = π/2 maps +y onto depth and −z onto y', () => {
    const p = rotateProject({ x: 0, y: 1, z: 0 }, 0, Math.PI / 2);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(1, 12);
    const q = rotateProject({ x: 0, y: 0, z: 1 }, 0, Math.PI / 2);
    expect(q.y).toBeCloseTo(-1, 12);
    expect(q.depth).toBeCloseTo(0, 12);
  });

  it('rotation preserves length (orthogonality golden check)', () => {
    const p = rotateProject({ x: 0.3, y: -0.8, z: 0.5 }, 0.7, 0.35);
    const before = Math.hypot(0.3, -0.8, 0.5);
    const after = Math.hypot(p.x, p.y, p.depth);
    expect(after).toBeCloseTo(before, 12);
  });
});

describe('OrbitCamera.project golden values', () => {
  it('projects a known point at the default-perspective identity camera', () => {
    const camera = new OrbitCamera({ yaw: 0, pitch: 0, zoom: 1 });
    // depth = 0.5 ⇒ s′ = 100 / (1 + 0.35·0.125) = 100/1.04375
    const projected = camera.project({ x: 1, y: 1, z: 0.5 }, 400, 300, 100);
    const sPrime = 100 / (1 + 0.35 * (0.5 * 0.25));
    expect(projected.screenX).toBeCloseTo(200 + 1 * sPrime, 10);
    expect(projected.screenY).toBeCloseTo(150 - 1 * sPrime, 10);
    expect(projected.depth).toBeCloseTo(0.5, 12);
  });

  it('perspective shrinks far points and enlarges near points', () => {
    const camera = new OrbitCamera({ yaw: 0, pitch: 0, zoom: 1 });
    const near = camera.project({ x: 1, y: 0, z: -1 }, 400, 300, 100);
    const far = camera.project({ x: 1, y: 0, z: 1 }, 400, 300, 100);
    const nearOffset = near.screenX - 200;
    const farOffset = far.screenX - 200;
    expect(nearOffset).toBeGreaterThan(farOffset); // same world x, nearer = larger
  });

  it('zoom scales screen offsets linearly', () => {
    const base = new OrbitCamera({ yaw: 0.4, pitch: 0.2, zoom: 1 });
    const zoomed = new OrbitCamera({ yaw: 0.4, pitch: 0.2, zoom: 2 });
    const a = base.project({ x: 0.8, y: 0.3, z: -0.2 }, 400, 300, 100);
    const b = zoomed.project({ x: 0.8, y: 0.3, z: -0.2 }, 400, 300, 100);
    expect(b.screenX - 200).toBeCloseTo(2 * (a.screenX - 200), 10);
    expect(b.screenY - 150).toBeCloseTo(2 * (a.screenY - 150), 10);
  });

  it('pitch clamp keeps the camera short of the poles', () => {
    const camera = new OrbitCamera({ yaw: 0, pitch: 0, zoom: 1 });
    camera.rotateBy(0, 99);
    expect(camera.pitch).toBeLessThanOrEqual(1.45);
    camera.rotateBy(0, -99);
    expect(camera.pitch).toBeGreaterThanOrEqual(-1.45);
  });
});

describe("bob depth ordering (painter's algorithm)", () => {
  it('orders indices far-to-near so near bobs draw last (on top)', () => {
    const order = depthSortIndices([
      { depth: -0.5 }, // nearest
      { depth: 1.2 }, // farthest
      { depth: 0.3 }
    ]);
    expect(order).toEqual([1, 2, 0]);
  });

  it('matches the camera depth convention: larger depth = drawn first', () => {
    const camera = new OrbitCamera({ yaw: 0, pitch: 0, zoom: 1 });
    const front = camera.project({ x: 0, y: 0, z: -1 }, 400, 300, 100);
    const back = camera.project({ x: 0, y: 0, z: 1 }, 400, 300, 100);
    const order = depthSortIndices([front, back]);
    // back (index 1) first, front (index 0) last.
    expect(order).toEqual([1, 0]);
  });

  it('is stable for equal depths (no flicker between frames)', () => {
    const order = depthSortIndices([{ depth: 0.5 }, { depth: 0.5 }, { depth: 0.5 }]);
    expect(order).toEqual([0, 1, 2]);
  });
});
