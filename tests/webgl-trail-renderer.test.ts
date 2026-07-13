import { describe, expect, it } from 'vitest';
import {
  buildTrailInstances,
  orderedTrailPoints,
  tryCreateWebGLTrailRenderer,
  webGLTrailRequested
} from '../src/render/webglTrailRenderer';

describe('WebGL2 batched trail renderer', () => {
  it('packs one age-graded instance per finite segment', () => {
    const batch = buildTrailInstances(new Float32Array([0, 1, 2, 3, 4, 5]));
    expect(batch.segmentCount).toBe(2);
    expect(Array.from(batch.instances)).toEqual([0, 1, 2, 3, 0, 2, 3, 4, 5, 1]);
  });

  it('treats non-finite points as line breaks', () => {
    const batch = buildTrailInstances([0, 0, 1, 1, Number.NaN, 2, 3, 3]);
    expect(batch.segmentCount).toBe(1);
    expect(Array.from(batch.instances.slice(0, 4))).toEqual([0, 0, 1, 1]);
  });

  it('unwraps a circular trail in chronological order', () => {
    const ring = new Float32Array([30, 31, 40, 41, 10, 11, 20, 21]);
    expect(Array.from(orderedTrailPoints(ring, 2, 4))).toEqual([10, 11, 20, 21, 30, 31, 40, 41]);
  });

  it('requires the explicit query flag', () => {
    expect(webGLTrailRequested('?webglTrail=1')).toBe(true);
    expect(webGLTrailRequested('?webglTrail=0')).toBe(false);
    expect(webGLTrailRequested('?other=1')).toBe(false);
  });

  it('returns null instead of throwing when WebGL2 is unavailable', () => {
    const canvas = { width: 1, height: 1, getContext: () => null };
    expect(tryCreateWebGLTrailRenderer(canvas)).toBeNull();
  });
});
