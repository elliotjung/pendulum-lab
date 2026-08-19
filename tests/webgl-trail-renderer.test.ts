import { describe, expect, it, vi } from 'vitest';
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

  it('stops drawing on context loss and rebuilds resources after restoration', () => {
    const listeners = new Map<string, EventListener>();
    const gl = fakeWebGl2();
    const canvas = {
      width: 320,
      height: 180,
      getContext: () => gl,
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type)
    };
    const renderer = tryCreateWebGLTrailRenderer(canvas);
    expect(renderer).not.toBeNull();
    const preventDefault = vi.fn();
    listeners.get('webglcontextlost')?.({ preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(renderer!.isContextLost()).toBe(true);
    expect(
      renderer!.draw([0, 0, 1, 1], {
        width: 320,
        height: 180,
        lineWidth: 1,
        oldColor: [1, 1, 1, 0.1],
        newColor: [1, 1, 1, 1]
      })
    ).toBe(false);
    listeners.get('webglcontextrestored')?.(new Event('webglcontextrestored'));
    expect(renderer!.isContextLost()).toBe(false);
    renderer!.dispose();
    expect(listeners.size).toBe(0);
  });
});

function fakeWebGl2(): WebGL2RenderingContext {
  const noop = () => undefined;
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    DYNAMIC_DRAW: 7,
    FLOAT: 8,
    COLOR_BUFFER_BIT: 9,
    BLEND: 10,
    SRC_ALPHA: 11,
    ONE_MINUS_SRC_ALPHA: 12,
    TRIANGLES: 13,
    ONE: 14,
    NO_ERROR: 0,
    createShader: () => ({}),
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({}),
    attachShader: noop,
    linkProgram: noop,
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteShader: noop,
    createVertexArray: () => ({}),
    createBuffer: () => ({}),
    bindVertexArray: noop,
    bindBuffer: noop,
    bufferData: noop,
    enableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    vertexAttribDivisor: noop,
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    viewport: noop,
    clearColor: noop,
    clear: noop,
    enable: noop,
    blendFunc: noop,
    useProgram: noop,
    uniform2f: noop,
    uniform1f: noop,
    uniform4fv: noop,
    drawArraysInstanced: noop,
    deleteBuffer: noop,
    deleteVertexArray: noop,
    deleteProgram: noop,
    isContextLost: () => false,
    getError: () => 0
  } as unknown as WebGL2RenderingContext;
}
