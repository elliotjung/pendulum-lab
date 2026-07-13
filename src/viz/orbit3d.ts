import { rotateProject, type Projected } from './phase3dMath';

/**
 * Orbit-style 3D camera over the existing pure rotate/project core
 * (`rotateProject`): drag to rotate (yaw/pitch), wheel to zoom, with
 * perspective foreshortening on top of the orthographic rotation. Pure state +
 * small DOM binding so the math is unit-testable without a canvas.
 */

export interface OrbitCameraState {
  yaw: number;
  pitch: number;
  zoom: number;
}

export class OrbitCamera {
  yaw: number;
  pitch: number;
  zoom: number;
  /** Perspective strength: 0 = orthographic. */
  perspective = 0.35;

  constructor(initial: Partial<OrbitCameraState> = {}) {
    this.yaw = initial.yaw ?? 0.7;
    this.pitch = initial.pitch ?? 0.35;
    this.zoom = initial.zoom ?? 1;
  }

  rotateBy(deltaYaw: number, deltaPitch: number): void {
    this.yaw += deltaYaw;
    // Clamp pitch short of the poles so "up" never flips.
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + deltaPitch));
  }

  zoomBy(factor: number): void {
    this.zoom = Math.max(0.2, Math.min(8, this.zoom * factor));
  }

  /** Project a world point (y up) to canvas pixels. `scale` is px per world unit. */
  project(
    point: { x: number; y: number; z: number },
    width: number,
    height: number,
    scale: number
  ): Projected & { screenX: number; screenY: number } {
    const rotated = rotateProject(point, this.yaw, this.pitch);
    // Perspective: shrink with depth (depth > 0 is away from the viewer).
    const denom = 1 + this.perspective * Math.max(-0.9, rotated.depth * 0.25);
    const s = (scale * this.zoom) / denom;
    return {
      ...rotated,
      screenX: width / 2 + rotated.x * s,
      screenY: height / 2 - rotated.y * s
    };
  }

  state(): OrbitCameraState {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom };
  }
}

/** Bind pointer-drag rotation and wheel zoom to a canvas. Returns an unbind function. */
export function bindOrbitControls(canvas: HTMLCanvasElement, camera: OrbitCamera, onChange: () => void): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const down = (event: PointerEvent): void => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent): void => {
    if (!dragging) return;
    camera.rotateBy((event.clientX - lastX) * 0.01, (event.clientY - lastY) * 0.01);
    lastX = event.clientX;
    lastY = event.clientY;
    onChange();
  };
  const up = (): void => {
    dragging = false;
  };
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    camera.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    onChange();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointerleave', up);
    canvas.removeEventListener('wheel', wheel);
  };
}

export interface PolylinePoint3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Painter's-algorithm ordering for projected scene elements: indices sorted
 * far-to-near (ascending screen proximity), so drawing in the returned order
 * lets near elements correctly overlap far ones. Depth convention follows
 * `rotateProject`: larger depth = further from the viewer… and the camera
 * looks down −depth, so far elements (large depth) must be drawn first.
 */
export function depthSortIndices(items: ReadonlyArray<{ depth: number }>): number[] {
  return items
    .map((item, index) => ({ depth: item.depth, index }))
    .sort((a, b) => b.depth - a.depth)
    .map((entry) => entry.index);
}

/** Draw a depth-faded 3D polyline through the camera. */
export function drawPolyline3D(
  ctx: CanvasRenderingContext2D,
  camera: OrbitCamera,
  points: readonly PolylinePoint3[],
  scale: number,
  color: { r: number; g: number; b: number },
  lineWidth = 1.2
): void {
  const { width, height } = ctx.canvas;
  let previous: { screenX: number; screenY: number; depth: number } | null = null;
  for (const point of points) {
    const projected = camera.project(point, width, height, scale);
    if (previous) {
      const fade = Math.max(0.15, Math.min(1, 0.75 - projected.depth * 0.25));
      ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${fade.toFixed(3)})`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(previous.screenX, previous.screenY);
      ctx.lineTo(projected.screenX, projected.screenY);
      ctx.stroke();
    }
    previous = projected;
  }
}

/** Draw the reference frame: axes plus a latitude/longitude sphere wireframe of radius r. */
export function drawSphereWireframe(
  ctx: CanvasRenderingContext2D,
  camera: OrbitCamera,
  radius: number,
  scale: number,
  color = 'rgba(110,130,170,0.35)'
): void {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  const ring = (makePoint: (angle: number) => PolylinePoint3): void => {
    ctx.beginPath();
    for (let i = 0; i <= 48; i += 1) {
      const angle = (i / 48) * 2 * Math.PI;
      const projected = camera.project(makePoint(angle), width, height, scale);
      if (i === 0) ctx.moveTo(projected.screenX, projected.screenY);
      else ctx.lineTo(projected.screenX, projected.screenY);
    }
    ctx.stroke();
  };
  for (const latitude of [-0.66, -0.33, 0, 0.33, 0.66]) {
    const y = radius * latitude;
    const r = Math.sqrt(Math.max(0, radius * radius - y * y));
    ring((angle) => ({ x: r * Math.cos(angle), y, z: r * Math.sin(angle) }));
  }
  for (const longitude of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    ring((angle) => ({
      x: radius * Math.cos(angle) * Math.cos(longitude),
      y: radius * Math.sin(angle),
      z: radius * Math.cos(angle) * Math.sin(longitude)
    }));
  }
}
