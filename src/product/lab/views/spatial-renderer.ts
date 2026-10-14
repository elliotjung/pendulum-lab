import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';

export interface SpatialVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface SpatialSceneFrame {
  readonly positions: readonly SpatialVector3[];
  readonly velocities?: readonly SpatialVector3[];
  readonly angularMomentum?: SpatialVector3;
  readonly extent: number;
  readonly label?: string;
  readonly time?: number;
}
export interface SpatialCamera {
  readonly yaw: number;
  readonly elevation: number;
  readonly zoom: number;
}
export const DEFAULT_SPATIAL_CAMERA: SpatialCamera = { yaw: 35, elevation: 20, zoom: 1 };
const origin: SpatialVector3 = { x: 0, y: 0, z: 0 };
const NS = 'http://www.w3.org/2000/svg';
let nextSceneId = 0;

export function normalizeSpatialCamera(camera: SpatialCamera): SpatialCamera {
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  const yaw = finite(camera.yaw, DEFAULT_SPATIAL_CAMERA.yaw);
  return {
    yaw: ((yaw % 360) + 360) % 360,
    elevation: Math.max(-80, Math.min(80, finite(camera.elevation, DEFAULT_SPATIAL_CAMERA.elevation))),
    zoom: Math.max(0.5, Math.min(2.5, finite(camera.zoom, DEFAULT_SPATIAL_CAMERA.zoom)))
  };
}

/** Orthographic projection with +y up. Camera movement never changes physical state. */
export function projectSpatialPoint(point: SpatialVector3, camera: SpatialCamera, extent: number) {
  const view = normalizeSpatialCamera(camera);
  const yaw = (view.yaw * Math.PI) / 180,
    elevation = (view.elevation * Math.PI) / 180;
  const horizontal = Math.cos(yaw) * point.x + Math.sin(yaw) * point.z;
  const away = -Math.sin(yaw) * point.x + Math.cos(yaw) * point.z;
  const vertical = Math.cos(elevation) * point.y - Math.sin(elevation) * away;
  const depth = Math.sin(elevation) * point.y + Math.cos(elevation) * away;
  const scale = (160 * view.zoom) / Math.max(0.1, Number.isFinite(extent) ? extent : 1);
  return { x: horizontal * scale, y: -vertical * scale, depth: depth * scale };
}

function svgNode(document: Document, name: string, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** WebGL is optional: the same projected geometry is retained in the SVG fallback. */
function createGpu(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: false });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  function dispose() {
    if (buffer) gl!.deleteBuffer(buffer);
    if (program) gl!.deleteProgram(program);
    for (const shader of shaders) gl!.deleteShader(shader);
    buffer = null;
    program = null;
    shaders.length = 0;
  }
  try {
    for (const [type, source] of [
      [
        gl.VERTEX_SHADER,
        'attribute vec3 a_position; uniform float u_size; void main(){gl_Position=vec4(a_position,1.0); gl_PointSize=u_size;}'
      ],
      [
        gl.FRAGMENT_SHADER,
        'precision mediump float; uniform vec4 u_color; uniform bool u_point; void main(){if(u_point && distance(gl_PointCoord,vec2(0.5))>0.5) discard; gl_FragColor=u_color;}'
      ]
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader compilation failed');
    }
    program = gl.createProgram();
    buffer = gl.createBuffer();
    if (!program || !buffer) throw new Error('WebGL resources unavailable');
    shaders.forEach((shader) => gl.attachShader(program!, shader));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('shader linking failed');
    const position = gl.getAttribLocation(program, 'a_position');
    const color = gl.getUniformLocation(program, 'u_color');
    const size = gl.getUniformLocation(program, 'u_size');
    const pointMode = gl.getUniformLocation(program, 'u_point');
    return {
      draw(points: ReturnType<typeof projectSpatialPoint>[]) {
        if (gl.isContextLost()) throw new Error('WebGL context lost');
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array(points.flatMap((p) => [p.x / 300, -p.y / 215, -p.depth / 1000])),
          gl.DYNAMIC_DRAW
        );
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
        gl.uniform4f(color, 0.15, 0.39, 0.85, 1);
        gl.uniform1i(pointMode, 0);
        gl.lineWidth(2);
        gl.drawArrays(gl.LINE_STRIP, 0, points.length);
        gl.uniform4f(color, 0.72, 0.22, 0.05, 1);
        gl.uniform1i(pointMode, 1);
        gl.uniform1f(size, (18 * canvas.width) / 600);
        gl.depthFunc(gl.LEQUAL);
        gl.drawArrays(gl.POINTS, 1, points.length - 1);
        gl.uniform1f(size, (10 * canvas.width) / 600);
        gl.drawArrays(gl.POINTS, 0, 1);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL draw failed');
      },
      dispose
    };
  } catch {
    dispose();
    return null;
  }
}

export function createSpatialRenderer(host: HTMLElement) {
  const document = host.ownerDocument;
  const sceneId = `spatial-scene-${++nextSceneId}`;
  const wrapper = element(document, 'div', 'spatial-renderer');
  const stage = element(document, 'div', 'spatial-renderer-stage');
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 860;
  // Match the SVG viewBox's centered fit when max-height changes the stage ratio.
  canvas.style.objectFit = 'contain';
  canvas.style.objectPosition = 'center';
  canvas.setAttribute('aria-hidden', 'true');
  const svg = svgNode(document, 'svg', {
    viewBox: '-300 -215 600 430',
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    tabindex: '0',
    'aria-label': '3차원 진자 장면',
    'aria-describedby': `${sceneId}-help`
  });
  // Limit gesture interception to the scene; the rest of the page remains scrollable.
  svg.style.touchAction = 'none';
  const planes = svgNode(document, 'g', { 'data-spatial-overlay': 'plane' });
  const fallback = svgNode(document, 'g', { 'data-spatial-fallback': 'geometry' });
  const overlays = svgNode(document, 'g', { 'data-spatial-overlay': 'vectors' });
  svg.append(planes, fallback, overlays);
  stage.append(canvas, svg);
  const status = element(document, 'p', 'spatial-renderer-status lab-muted');
  status.setAttribute('role', 'status');
  const cameraStatus = element(document, 'p', 'spatial-camera-status lab-muted');
  const help = element(
    document,
    'p',
    'spatial-renderer-help lab-muted',
    '장면에 초점을 맞춘 뒤 방향키로 회전, +/−로 확대·축소, Home으로 시점을 초기화합니다. 마우스 또는 한 손가락으로 드래그하거나 아래 버튼을 누를 수 있습니다. 직교 투영 · 오른손 좌표계 · +y 위쪽 · xz 수평면 · 위치 m · 속도 m/s · 각운동량 kg·m²/s.'
  );
  help.id = `${sceneId}-help`;
  const description = element(document, 'p', 'spatial-renderer-description lab-muted');
  const actions = element(document, 'div', 'spatial-camera-actions');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', '3차원 카메라');
  const options = element(document, 'div', 'spatial-overlay-actions');
  const removers: (() => void)[] = [];
  let camera = { ...DEFAULT_SPATIAL_CAMERA };
  let frame: SpatialSceneFrame = { positions: [], extent: 1 };
  let showPlane = true,
    showVelocity = false,
    showMomentum = false,
    destroyed = false;
  let gpu: ReturnType<typeof createGpu> = null;
  type SceneEventMap = HTMLElementEventMap & { webglcontextlost: Event; webglcontextrestored: Event };
  const listen = <K extends keyof SceneEventMap>(
    target: EventTarget,
    name: K,
    callback: (event: SceneEventMap[K]) => void
  ) => {
    const listener = callback as EventListener;
    target.addEventListener(name, listener);
    removers.push(() => target.removeEventListener(name, listener));
  };
  const rendererState = (available: boolean, reason = '') => {
    wrapper.dataset.renderer = available ? 'webgl' : 'svg';
    canvas.hidden = !available;
    fallback.setAttribute('display', available ? 'none' : 'inline');
    status.textContent = available
      ? '3D WebGL 표시 · 계산 결과는 아래 수치 표에서도 확인할 수 있습니다.'
      : `${reason} SVG 3D 투영으로 표시합니다. 계산과 수치 결과는 계속 사용할 수 있습니다.`;
  };
  function initializeGpu() {
    gpu?.dispose();
    try {
      gpu = createGpu(canvas);
    } catch {
      gpu = null;
    }
    rendererState(Boolean(gpu), 'WebGL을 사용할 수 없어');
  }
  function draw() {
    if (destroyed) return;
    const extent = Math.max(0.1, frame.extent, ...frame.positions.map((p) => Math.hypot(p.x, p.y, p.z)));
    const project = (point: SpatialVector3) => projectSpatialPoint(point, camera, extent);
    const line = (from: SpatialVector3, to: SpatialVector3, color: string, width = 2) => {
      const a = project(from),
        b = project(to);
      return svgNode(document, 'line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': width });
    };
    planes.replaceChildren();
    if (showPlane) {
      const radius = extent * 0.65;
      const points = [
        { x: -radius, y: 0, z: -radius },
        { x: radius, y: 0, z: -radius },
        { x: radius, y: 0, z: radius },
        { x: -radius, y: 0, z: radius }
      ];
      planes.append(
        svgNode(document, 'polygon', {
          points: points
            .map(project)
            .map((p) => `${p.x},${p.y}`)
            .join(' '),
          fill: 'var(--spatial-grid, #64748b)',
          'fill-opacity': 0.07,
          stroke: 'var(--spatial-grid, #64748b)',
          'stroke-dasharray': '5 5'
        })
      );
      for (const fraction of [-0.5, 0, 0.5]) {
        planes.append(
          line(
            { x: -radius, y: 0, z: radius * fraction },
            { x: radius, y: 0, z: radius * fraction },
            'var(--spatial-grid, #64748b)',
            0.7
          ),
          line(
            { x: radius * fraction, y: 0, z: -radius },
            { x: radius * fraction, y: 0, z: radius },
            'var(--spatial-grid, #64748b)',
            0.7
          )
        );
      }
    }
    const points = [origin, ...frame.positions].map(project);
    fallback.replaceChildren();
    for (let i = 1; i < points.length; i++)
      fallback.append(
        line(i === 1 ? origin : frame.positions[i - 2]!, frame.positions[i - 1]!, 'var(--spatial-rod, #2563eb)', 3)
      );
    [...points]
      .sort((a, b) => a.depth - b.depth)
      .forEach((point) =>
        fallback.append(
          svgNode(document, 'circle', {
            cx: point.x,
            cy: point.y,
            r: point === points[0] ? 5 : 9,
            fill: 'var(--spatial-bob, #b8380d)'
          })
        )
      );
    if (gpu) {
      try {
        gpu.draw(points);
      } catch {
        gpu.dispose();
        gpu = null;
        rendererState(false, 'WebGL 표시가 중단되어');
      }
    }
    overlays.replaceChildren();
    for (const [name, endpoint, color] of [
      ['x', { x: extent * 0.7, y: 0, z: 0 }, 'var(--spatial-x, #b91c1c)'],
      ['y', { x: 0, y: extent * 0.7, z: 0 }, 'var(--spatial-y, #15803d)'],
      ['z', { x: 0, y: 0, z: extent * 0.7 }, 'var(--spatial-z, #1d4ed8)']
    ] as const) {
      const p = project(endpoint);
      const label = svgNode(document, 'text', { x: p.x + 7, y: p.y - 7, fill: color, 'font-size': 16 });
      label.textContent = name;
      overlays.append(line(origin, endpoint, color, 1.5), label);
    }
    function arrow(start: SpatialVector3, vector: SpatialVector3, color: string, label: string) {
      const norm = Math.hypot(vector.x, vector.y, vector.z);
      if (norm < 1e-12) return;
      const scale = Math.min(extent * 0.5, norm * 0.2) / norm;
      const end = { x: start.x + vector.x * scale, y: start.y + vector.y * scale, z: start.z + vector.z * scale };
      const a = project(start),
        b = project(end),
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = svgNode(document, 'path', {
        d: `M${b.x - 9 * Math.cos(angle - 0.45)} ${b.y - 9 * Math.sin(angle - 0.45)} L${b.x} ${b.y} L${b.x - 9 * Math.cos(angle + 0.45)} ${b.y - 9 * Math.sin(angle + 0.45)}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 2
      });
      const text = svgNode(document, 'text', { x: b.x + 8, y: b.y, fill: color, 'font-size': 13 });
      text.textContent = label;
      const vectorGroup = svgNode(document, 'g', { 'data-spatial-vector': label });
      vectorGroup.append(line(start, end, color), head, text);
      overlays.append(vectorGroup);
    }
    if (showVelocity)
      frame.velocities?.forEach((velocity, index) => {
        if (frame.positions[index])
          arrow(frame.positions[index]!, velocity, 'var(--spatial-velocity, #0f766e)', `v${index + 1}`);
      });
    if (showMomentum && frame.angularMomentum)
      arrow(origin, frame.angularMomentum, 'var(--spatial-momentum, #7e22ce)', 'L');
    const coordinates = frame.positions
      .map(
        (p, index) => `질점 ${index + 1}: x ${p.x.toPrecision(4)}, y ${p.y.toPrecision(4)}, z ${p.z.toPrecision(4)} m`
      )
      .join('; ');
    svg.setAttribute('aria-label', `${frame.label ?? '3차원 진자'}. ${coordinates}`);
    description.textContent = `${coordinates}. 벡터는 방향을 보여 주며 길이는 표시 범위에 맞게 축척·제한됩니다.`;
    wrapper.dataset.cameraYaw = String(camera.yaw);
    wrapper.dataset.cameraElevation = String(camera.elevation);
    wrapper.dataset.cameraZoom = String(camera.zoom);
    cameraStatus.textContent = `카메라 방위 ${camera.yaw.toFixed(0)}° · 고도 ${camera.elevation.toFixed(0)}° · 확대 ${camera.zoom.toFixed(2)}배`;
  }
  function move(yaw = 0, elevation = 0, zoom = 0) {
    if (destroyed) return;
    camera = normalizeSpatialCamera({
      yaw: camera.yaw + yaw,
      elevation: camera.elevation + elevation,
      zoom: camera.zoom + zoom
    });
    draw();
  }
  function reset() {
    if (destroyed) return;
    camera = { ...DEFAULT_SPATIAL_CAMERA };
    draw();
  }
  for (const [label, action] of [
    ['왼쪽 회전', () => move(-15)],
    ['오른쪽 회전', () => move(15)],
    ['위에서 보기', () => move(0, 10)],
    ['아래에서 보기', () => move(0, -10)],
    ['확대', () => move(0, 0, 0.15)],
    ['축소', () => move(0, 0, -0.15)],
    ['시점 초기화', reset]
  ] as const) {
    const button = createButton(document, { label, variant: 'secondary' });
    listen(button, 'click', action);
    actions.append(button);
  }
  for (const [label, checked, change] of [
    [
      'xz 평면',
      true,
      (value: boolean) => {
        showPlane = value;
      }
    ],
    [
      '속도 벡터',
      false,
      (value: boolean) => {
        showVelocity = value;
      }
    ],
    [
      '각운동량 방향',
      false,
      (value: boolean) => {
        showMomentum = value;
      }
    ]
  ] as const) {
    const control = element(document, 'label', 'spatial-overlay-option');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    listen(input, 'change', () => {
      change(input.checked);
      draw();
    });
    control.append(input, document.createTextNode(` ${label}`));
    options.append(control);
  }
  listen(svg, 'keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(-15),
      ArrowRight: () => move(15),
      ArrowUp: () => move(0, 10),
      ArrowDown: () => move(0, -10),
      '+': () => move(0, 0, 0.15),
      '=': () => move(0, 0, 0.15),
      '-': () => move(0, 0, -0.15),
      Home: reset
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]!();
    }
  });
  let drag: { id: number; x: number; y: number } | null = null;
  listen(svg, 'pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    (svg as SVGSVGElement).focus();
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture may be absent in older browsers. */
    }
  });
  listen(svg, 'pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    move((event.clientX - drag.x) * 0.4, (event.clientY - drag.y) * 0.4);
    drag = { ...drag, x: event.clientX, y: event.clientY };
  });
  function finishDrag() {
    const active = drag;
    drag = null;
    if (active) {
      try {
        if (svg.hasPointerCapture(active.id)) svg.releasePointerCapture(active.id);
      } catch {
        /* Older browsers may not implement pointer capture. */
      }
    }
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    listen(svg, name, (event) => {
      if (event.pointerId === drag?.id) finishDrag();
    });
  listen(canvas, 'webglcontextlost', (event) => {
    event.preventDefault();
    gpu?.dispose();
    gpu = null;
    rendererState(false, 'WebGL 컨텍스트가 중단되어');
    draw();
  });
  listen(canvas, 'webglcontextrestored', () => {
    initializeGpu();
    draw();
  });
  wrapper.append(stage, status, cameraStatus, actions, options, help, description);
  host.append(wrapper);
  initializeGpu();
  draw();
  return {
    update(next: SpatialSceneFrame) {
      if (destroyed) return;
      frame = next;
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      finishDrag();
      removers.forEach((remove) => remove());
      gpu?.dispose();
      gpu = null;
      wrapper.remove();
    }
  };
}
