import { num } from './systemControls';
import { TabController } from './TabController';
import { LabSimulation, type LabConfig } from './LabSimulation';
import { rotateProjectInto, type Projected } from './phase3d';
import { getCanvasDprCap } from './canvasQuality';
import { Phase3DTrailBuffer, type Phase3DPoint } from './Phase3DTrailBuffer';
import { lerpHexColor, OKABE_ITO } from '../viz';

/**
 * Modern port of the 3D phase-space tab. It evolves the double pendulum and
 * plots the (θ1, θ2, ω2) trajectory as a rotatable orthographic point cloud
 * (pure 2D canvas + the `rotateProject` helper). Drag rotates the camera; depth
 * fades far points. Renders only while the tab is visible.
 */

export class Phase3DTab extends TabController {
  private sim: LabSimulation | null = null;
  private readonly points = new Phase3DTrailBuffer(5000);
  private readonly pointScratch: Phase3DPoint = { x: 0, y: 0, z: 0 };
  private readonly projectionScratch: Projected = { x: 0, y: 0, depth: 0 };
  private yaw = 0.6;
  private pitch = 0.4;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private rafId: number | null = null;
  private lastTimestampMs: number | null = null;
  private physicsRemainderSec = 0;
  private frameCount = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly listeners = new AbortController();

  private config(): LabConfig {
    return {
      system: 'double',
      parameters: { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: num('g', 9.81) },
      gamma: num('gamma', 0),
      method: 'rk4',
      dt: 0.004,
      initialState: [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)]
    };
  }

  private active(): boolean {
    return this.dom.tabActive('tab-phase3d');
  }

  private frame(timestampMs: number): void {
    this.rafId = null;
    if (!this.active()) {
      this.lastTimestampMs = null;
      this.physicsRemainderSec = 0;
      return;
    }
    this.renderFrame(timestampMs, true);
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.rafId === null && this.active()) {
      this.rafId = requestAnimationFrame((timestamp) => this.frame(timestamp));
    }
  }

  private renderFrame(timestampMs = performance.now(), advancePhysics = false): void {
    if (!this.active()) {
      this.lastTimestampMs = null;
      this.physicsRemainderSec = 0;
      return;
    }
    const canvas = this.dom.el<HTMLCanvasElement>('p3dCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!this.sim) this.sim = new LabSimulation(this.config());

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || canvas.width));
    const cssHeight = Math.max(1, Math.round(rect.height || canvas.clientHeight || canvas.height));
    const dpr = Math.min(window.devicePixelRatio || 1, getCanvasDprCap());
    const backingWidth = Math.round(cssWidth * dpr);
    const backingHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cap = Math.max(500, Math.min(100_000, Math.round(num('p3dN', 5000))));
    this.points.resize(cap);
    const elapsedSec =
      !advancePhysics || this.lastTimestampMs === null
        ? 0
        : Math.max(0, Math.min(0.1, (timestampMs - this.lastTimestampMs) / 1000));
    if (advancePhysics) {
      this.lastTimestampMs = timestampMs;
      this.physicsRemainderSec += elapsedSec;
    }
    const dt = this.sim.config.dt;
    let steps = 0;
    while (this.physicsRemainderSec >= dt && steps < 25) {
      this.sim.step(1);
      const st = this.sim.getState();
      this.points.push(st[0]! / Math.PI, st[1]! / Math.PI, Math.max(-1.5, Math.min(1.5, st[3]! / 12)));
      this.physicsRemainderSec -= dt;
      steps += 1;
    }
    // Preserve the fixed-step remainder under a temporary frame spike. Bound
    // it independently so a backgrounded tab never chases unbounded debt.
    if (steps === 25) this.physicsRemainderSec = Math.min(this.physicsRemainderSec, 0.5);
    this.frameCount += 1;

    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    const scale = Math.min(cssWidth, cssHeight) * 0.3;
    const depthFade = this.dom.bool('p3dDepthFade');
    const n = this.points.length;
    for (let i = 0; i < n; i += 1) {
      const point = this.points.read(i, this.pointScratch);
      const p = rotateProjectInto(point, this.yaw, this.pitch, this.projectionScratch);
      const recency = i / n;
      const alpha = depthFade
        ? Math.max(0.05, 0.2 + 0.5 * ((p.depth + 1.5) / 3)) * (0.3 + 0.7 * recency)
        : 0.3 + 0.7 * recency;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = lerpHexColor(OKABE_ITO.blue, OKABE_ITO.vermillion, recency);
      ctx.fillRect(cx + p.x * scale, cy - p.y * scale, 2, 2);
    }
    ctx.globalAlpha = 1;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const tick = reducedMotion ? 120 : Math.floor(performance.now() / 37) % 255;
    ctx.fillStyle = `rgb(${tick},${255 - tick},${(tick * 3) % 255})`;
    ctx.fillRect(0, 0, cssWidth, 8);
  }

  protected bind(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('p3dCanvas');
    const listenerOptions = { signal: this.listeners.signal };
    if (canvas) {
      const instructions = document.createElement('span');
      instructions.id = 'p3dKeyboardInstructions';
      instructions.className = 'v10-sr';
      instructions.textContent = 'Use the arrow keys to rotate the 3D view. Press Home to reset the camera.';
      canvas.parentElement?.append(instructions);
      canvas.setAttribute('aria-describedby', instructions.id);
      canvas.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Home');
      canvas.addEventListener(
        'keydown',
        (event) => {
          const step = event.shiftKey ? 0.2 : 0.08;
          if (event.key === 'ArrowLeft') this.yaw -= step;
          else if (event.key === 'ArrowRight') this.yaw += step;
          else if (event.key === 'ArrowUp') this.pitch -= step;
          else if (event.key === 'ArrowDown') this.pitch += step;
          else if (event.key === 'Home') {
            this.yaw = 0.6;
            this.pitch = 0.4;
          } else return;
          event.preventDefault();
          this.renderFrame();
        },
        listenerOptions
      );
    }
    canvas?.addEventListener(
      'pointerdown',
      (e) => {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      },
      listenerOptions
    );
    canvas?.addEventListener(
      'pointermove',
      (e) => {
        if (!this.dragging) return;
        this.yaw += (e.clientX - this.lastX) * 0.01;
        this.pitch += (e.clientY - this.lastY) * 0.01;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      },
      listenerOptions
    );
    const stop = (e: PointerEvent): void => {
      this.dragging = false;
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    canvas?.addEventListener('pointerup', stop, listenerOptions);
    canvas?.addEventListener('pointercancel', stop, listenerOptions);
    canvas?.addEventListener(
      'lostpointercapture',
      () => {
        this.dragging = false;
      },
      listenerOptions
    );

    this.dom.el('p3dClear')?.addEventListener(
      'click',
      () => {
        this.points.clear();
        this.sim = new LabSimulation(this.config());
        this.lastTimestampMs = null;
        this.physicsRemainderSec = 0;
        this.renderFrame();
      },
      listenerOptions
    );
    this.dom.el('p3dResetCam')?.addEventListener(
      'click',
      () => {
        this.yaw = 0.6;
        this.pitch = 0.4;
        this.renderFrame();
      },
      listenerOptions
    );

    if (canvas && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.renderFrame());
      this.resizeObserver.observe(canvas);
    }
    document.addEventListener(
      'pendulum:tab-activated',
      () => {
        if (this.active()) this.scheduleFrame();
        else this.stop();
      },
      listenerOptions
    );
    this.scheduleFrame();
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.lastTimestampMs = null;
    this.physicsRemainderSec = 0;
  }

  dispose(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.listeners.abort();
  }
}
