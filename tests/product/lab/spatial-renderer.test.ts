import { describe, expect, test, vi } from 'vitest';
import {
  createSpatialRenderer,
  DEFAULT_SPATIAL_CAMERA,
  normalizeSpatialCamera,
  projectSpatialPoint,
  type SpatialSceneFrame
} from '../../../src/product/lab/views/spatial-renderer';

// A small event-capable DOM stand-in allows deterministic GPU lifecycle failures.
// Actual rendering, focus, keyboard/touch and layout are covered by the S12 browser journey.
class SceneNode extends EventTarget {
  readonly children: SceneNode[] = [];
  readonly attrs = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly captures = new Set<number>();
  parent: SceneNode | null = null;
  textContent = '';
  className = '';
  checked = false;
  hidden = false;
  width = 0;
  height = 0;
  readonly focus = vi.fn();
  readonly releasePointerCapture = vi.fn((id: number) => this.captures.delete(id));
  constructor(
    readonly ownerDocument: SceneDocument,
    readonly tag: string
  ) {
    super();
  }
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
  }
  append(...nodes: SceneNode[]) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: SceneNode[]) {
    this.children.forEach((node) => {
      node.parent = null;
    });
    this.children.length = 0;
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  getContext() {
    return this.ownerDocument.context();
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
}
class SceneDocument {
  constructor(readonly context: () => unknown = () => null) {}
  createElement(tag: string) {
    return new SceneNode(this, tag);
  }
  createElementNS(_namespace: string, tag: string) {
    return this.createElement(tag);
  }
  createTextNode(text: string) {
    const node = this.createElement('#text');
    node.textContent = text;
    return node;
  }
}
function descendants(node: SceneNode): SceneNode[] {
  return [node, ...node.children.flatMap(descendants)];
}
function find(node: SceneNode, predicate: (entry: SceneNode) => boolean) {
  const found = descendants(node).find(predicate);
  if (!found) throw new Error('Missing scene element');
  return found;
}
function fire(node: SceneNode, name: string, fields: Record<string, unknown> = {}) {
  const event = Object.assign(new Event(name, { cancelable: true }), fields);
  node.dispatchEvent(event);
  return event;
}
function webgl() {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    COLOR_BUFFER_BIT: 8,
    DEPTH_BUFFER_BIT: 16,
    DEPTH_TEST: 17,
    ARRAY_BUFFER: 18,
    DYNAMIC_DRAW: 19,
    FLOAT: 20,
    LINE_STRIP: 21,
    POINTS: 22,
    LEQUAL: 23,
    NO_ERROR: 0,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    isContextLost: vi.fn(() => false),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform4f: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    lineWidth: vi.fn(),
    drawArrays: vi.fn(),
    depthFunc: vi.fn(),
    getError: vi.fn(() => 0),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn()
  };
}
function scene(context?: () => unknown) {
  const document = new SceneDocument(context);
  const host = document.createElement('div');
  const renderer = createSpatialRenderer(host as unknown as HTMLElement);
  const wrapper = host.children[0]!;
  const svg = find(host, (node) => node.tag === 'svg');
  const canvas = find(host, (node) => node.tag === 'canvas');
  return { host, wrapper, svg, canvas, renderer };
}
const frame: SpatialSceneFrame = {
  positions: [
    { x: 1, y: -2, z: 0.5 },
    { x: -0.5, y: -3, z: 0.25 }
  ],
  velocities: [
    { x: 0.1, y: 0, z: 1 },
    { x: 0, y: 0, z: 0 }
  ],
  angularMomentum: { x: 0, y: 0.7, z: 0 },
  extent: 4,
  label: '구면 사슬'
};

describe('S12 spatial camera geometry', () => {
  test('normalizes periodic yaw, bounded elevation and zoom without changing the input', () => {
    const input = { yaw: -725, elevation: 110, zoom: 9 };
    expect(normalizeSpatialCamera(input)).toEqual({ yaw: 355, elevation: 80, zoom: 2.5 });
    expect(input).toEqual({ yaw: -725, elevation: 110, zoom: 9 });
    expect(normalizeSpatialCamera({ yaw: 720, elevation: -100, zoom: 0 })).toEqual({
      yaw: 0,
      elevation: -80,
      zoom: 0.5
    });
    expect(normalizeSpatialCamera({ yaw: NaN, elevation: Infinity, zoom: -Infinity })).toEqual(DEFAULT_SPATIAL_CAMERA);
  });

  test('uses metres with positive y up and a right-handed 3D basis', () => {
    const camera = { yaw: 0, elevation: 0, zoom: 1 };
    expect(projectSpatialPoint({ x: 1, y: 0, z: 0 }, camera, 2).x).toBe(80);
    expect(projectSpatialPoint({ x: 0, y: 1, z: 0 }, camera, 2).y).toBe(-80);
    expect(projectSpatialPoint({ x: 0, y: 0, z: 1 }, camera, 2).depth).toBe(80);
    const rotated = { yaw: 47, elevation: 31, zoom: 1 };
    const basis = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 }
    ].map((p) => {
      const q = projectSpatialPoint(p, rotated, 160);
      return [q.x, -q.y, q.depth];
    });
    const [x, y, z] = basis as [number[], number[], number[]];
    const cross = [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!];
    cross.forEach((component, i) => expect(component).toBeCloseTo(z[i]!, 14));
  });

  test('changes actual depth under yaw and preserves 3D length under camera rotation', () => {
    const quarterTurn = projectSpatialPoint({ x: 1, y: 0, z: 0 }, { yaw: 90, elevation: 0, zoom: 1 }, 1);
    expect(quarterTurn.x).toBeCloseTo(0, 12);
    expect(quarterTurn.depth).toBeCloseTo(-160, 12);
    for (const yaw of [0, 35, 90, 173, 270]) {
      const point = projectSpatialPoint({ x: 0.3, y: -0.4, z: 0.5 }, { yaw, elevation: 63, zoom: 1.2 }, 2);
      expect(Math.hypot(point.x, point.y, point.depth)).toBeCloseTo(Math.sqrt(0.5) * 96, 12);
    }
  });

  test('scale changes are linear and invalid extents still produce finite screen coordinates', () => {
    const point = { x: 1, y: -1, z: 2 };
    const original = projectSpatialPoint(point, DEFAULT_SPATIAL_CAMERA, 2);
    const large = projectSpatialPoint(point, { ...DEFAULT_SPATIAL_CAMERA, zoom: 2 }, 2);
    expect(large).toEqual({ x: original.x * 2, y: original.y * 2, depth: original.depth * 2 });
    for (const extent of [0, -1, NaN, Infinity]) {
      expect(Object.values(projectSpatialPoint(point, DEFAULT_SPATIAL_CAMERA, extent)).every(Number.isFinite)).toBe(
        true
      );
    }
  });
});

describe('S12 renderer fallback and interaction lifecycle', () => {
  test('fits WebGL and SVG to the same centered viewport and projects the same geometry', () => {
    const gl = webgl();
    const { host, canvas, svg, renderer } = scene(() => gl);
    renderer.update(frame);
    expect(canvas.width / canvas.height).toBe(600 / 430);
    expect(canvas.style.objectFit).toBe('contain');
    expect(canvas.style.objectPosition).toBe('center');
    expect(svg.attrs.get('preserveAspectRatio')).toBe('xMidYMid meet');
    for (const key of ['ArrowRight', 'ArrowUp', '+']) {
      fire(svg, 'keydown', { key });
      const upload = gl.bufferData.mock.calls.at(-1) as unknown as [number, Float32Array, number];
      const data = upload[1];
      const circles = find(host, (node) => node.attrs.get('data-spatial-fallback') === 'geometry').children.filter(
        (node) => node.tag === 'circle'
      );
      // The GPU uploads clip coordinates; the fallback retains viewBox coordinates.
      for (let i = 0; i < data.length; i += 3) {
        const x = data[i]! * 300,
          y = -data[i + 1]! * 215;
        expect(
          circles.some(
            (circle) =>
              Math.abs(Number(circle.attrs.get('cx')) - x) < 1e-5 && Math.abs(Number(circle.attrs.get('cy')) - y) < 1e-5
          )
        ).toBe(true);
      }
    }
    renderer.destroy();
  });

  test('retains geometry, explicit coordinates and SI units without WebGL', () => {
    const { host, wrapper, canvas, svg, renderer } = scene();
    renderer.update(frame);
    expect(wrapper.dataset.renderer).toBe('svg');
    expect(canvas.hidden).toBe(true);
    expect(svg.attrs.get('aria-label')).toContain('구면 사슬. 질점 1: x 1.000, y -2.000, z 0.5000 m');
    expect(
      descendants(host)
        .map((node) => node.textContent)
        .join(' ')
    ).toContain('각운동량 kg·m²/s');
    expect(find(host, (node) => node.attrs.get('data-spatial-fallback') === 'geometry').children).toHaveLength(5);
    renderer.destroy();
  });

  test('plane and vector overlays are optional and leave the physical frame unchanged', () => {
    const { host, renderer } = scene();
    const input = structuredClone(frame);
    renderer.update(input);
    const controls = descendants(host).filter((node) => node.tag === 'input');
    controls[0]!.checked = false;
    fire(controls[0]!, 'change');
    expect(find(host, (node) => node.attrs.get('data-spatial-overlay') === 'plane').children).toHaveLength(0);
    for (const control of controls.slice(1)) {
      control.checked = true;
      fire(control, 'change');
    }
    expect(
      descendants(host)
        .filter((node) => node.attrs.has('data-spatial-vector'))
        .map((node) => node.attrs.get('data-spatial-vector'))
    ).toEqual(['v1', 'L']);
    expect(input).toEqual(frame);
    renderer.destroy();
  });

  test('keyboard and native camera buttons change only the projection and Home resets the view', () => {
    const { host, wrapper, svg, renderer } = scene();
    renderer.update(frame);
    const coordinates = svg.attrs.get('aria-label');
    expect(fire(svg, 'keydown', { key: 'ArrowRight' }).defaultPrevented).toBe(true);
    expect(wrapper.dataset.cameraYaw).toBe('50');
    fire(svg, 'keydown', { key: 'ArrowUp' });
    expect(wrapper.dataset.cameraElevation).toBe('30');
    fire(svg, 'keydown', { key: '+' });
    expect(Number(wrapper.dataset.cameraZoom)).toBeCloseTo(1.15);
    fire(svg, 'keydown', { key: 'ArrowRight', ctrlKey: true });
    expect(wrapper.dataset.cameraYaw).toBe('50');
    fire(
      find(host, (node) => node.tag === 'button' && node.textContent === '왼쪽 회전'),
      'click'
    );
    expect(wrapper.dataset.cameraYaw).toBe('35');
    fire(svg, 'keydown', { key: 'Home' });
    expect(wrapper.dataset.cameraElevation).toBe('20');
    expect(wrapper.dataset.cameraZoom).toBe('1');
    expect(svg.attrs.get('aria-label')).toBe(coordinates);
    renderer.destroy();
  });

  test('touch drag tracks one pointer and releases capture when cancelled or disposed', () => {
    const { wrapper, svg, renderer } = scene();
    fire(svg, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fire(svg, 'pointermove', { pointerId: 1, clientX: 60, clientY: 35 });
    expect(wrapper.dataset.cameraYaw).toBe('55');
    expect(wrapper.dataset.cameraElevation).toBe('30');
    fire(svg, 'pointerup', { pointerId: 2 });
    fire(svg, 'pointermove', { pointerId: 1, clientX: 85, clientY: 35 });
    expect(wrapper.dataset.cameraYaw).toBe('65');
    fire(svg, 'pointercancel', { pointerId: 1 });
    expect(svg.releasePointerCapture).toHaveBeenCalledWith(1);
    fire(svg, 'pointermove', { pointerId: 1, clientX: 110, clientY: 60 });
    expect(wrapper.dataset.cameraYaw).toBe('65');
    fire(svg, 'pointerdown', { pointerId: 3, button: 0, clientX: 10, clientY: 10 });
    renderer.destroy();
    expect(svg.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(svg.captures.size).toBe(0);
  });

  test('WebGL initialization exceptions and partial shader failures leave a usable SVG scene', () => {
    const unavailable = scene(() => {
      throw new Error('GPU disabled');
    });
    unavailable.renderer.update(frame);
    expect(unavailable.wrapper.dataset.renderer).toBe('svg');
    unavailable.renderer.destroy();
    const gl = webgl();
    gl.getShaderParameter.mockReturnValue(false);
    const broken = scene(() => gl);
    expect(broken.wrapper.dataset.renderer).toBe('svg');
    expect(gl.deleteShader).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).not.toHaveBeenCalled();
    broken.renderer.destroy();
  });

  test('context loss preserves camera and numerical accessibility, then recreates GPU resources', () => {
    const gl = webgl();
    const { wrapper, canvas, svg, renderer } = scene(() => gl);
    renderer.update(frame);
    fire(svg, 'keydown', { key: 'ArrowRight' });
    const description = svg.attrs.get('aria-label');
    expect(wrapper.dataset.renderer).toBe('webgl');
    expect(fire(canvas, 'webglcontextlost').defaultPrevented).toBe(true);
    expect(wrapper.dataset.renderer).toBe('svg');
    expect(canvas.hidden).toBe(true);
    expect(wrapper.dataset.cameraYaw).toBe('50');
    expect(svg.attrs.get('aria-label')).toBe(description);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    fire(canvas, 'webglcontextrestored');
    expect(wrapper.dataset.renderer).toBe('webgl');
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    renderer.destroy();
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(4);
  });

  test('GPU draw failure switches to the current SVG frame and disposal removes all active listeners', () => {
    const gl = webgl();
    const { host, wrapper, canvas, svg, renderer } = scene(() => gl);
    gl.getError.mockReturnValue(1282);
    renderer.update(frame);
    expect(wrapper.dataset.renderer).toBe('svg');
    expect(find(host, (node) => node.attrs.get('data-spatial-fallback') === 'geometry').attrs.get('display')).toBe(
      'inline'
    );
    const description = svg.attrs.get('aria-label');
    const button = find(host, (node) => node.tag === 'button' && node.textContent === '오른쪽 회전');
    renderer.destroy();
    renderer.destroy();
    fire(svg, 'keydown', { key: 'ArrowRight' });
    fire(button, 'click');
    fire(canvas, 'webglcontextrestored');
    renderer.update({ positions: [], extent: 1 });
    expect(wrapper.dataset.cameraYaw).toBe('35');
    expect(svg.attrs.get('aria-label')).toBe(description);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(host.children).toHaveLength(0);
  });
});
