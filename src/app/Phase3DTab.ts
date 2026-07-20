import { num } from './systemControls';
import { TabController } from './TabController';
import { LabSimulation, type LabConfig } from './LabSimulation';
import { rotateProject } from './phase3d';
import { lerpHexColor, OKABE_ITO } from '../viz';

/**
 * Modern port of the 3D phase-space tab. It evolves the double pendulum and
 * plots the (θ1, θ2, ω2) trajectory as a rotatable orthographic point cloud
 * (pure 2D canvas + the `rotateProject` helper). Drag rotates the camera; depth
 * fades far points. Renders only while the tab is visible.
 */

export class Phase3DTab extends TabController {
  private sim: LabSimulation | null = null;
  private points: Array<{ x: number; y: number; z: number }> = [];
  private yaw = 0.6;
  private pitch = 0.4;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private rafId: number | null = null;
  private intervalId: number | null = null;
  private frameCount = 0;

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

  private frame(): void {
    this.rafId = requestAnimationFrame(() => this.frame());
    this.renderFrame();
  }

  private renderFrame(): void {
    if (!this.active()) return;
    const canvas = this.dom.el<HTMLCanvasElement>('p3dCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!this.sim) this.sim = new LabSimulation(this.config());

    const cap = Math.max(500, Math.round(num('p3dN', 5000)));
    for (let s = 0; s < 6; s += 1) {
      this.sim.step(1);
      const st = this.sim.getState();
      this.points.push({ x: st[0]! / Math.PI, y: st[1]! / Math.PI, z: Math.max(-1.5, Math.min(1.5, st[3]! / 12)) });
    }
    if (this.points.length > cap) this.points.splice(0, this.points.length - cap);
    this.frameCount += 1;

    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = Math.min(canvas.width, canvas.height) * 0.3;
    const depthFade = this.dom.bool('p3dDepthFade');
    const n = this.points.length;
    for (let i = 0; i < n; i += 1) {
      const p = rotateProject(this.points[i]!, this.yaw, this.pitch);
      const recency = i / n;
      const alpha = depthFade
        ? Math.max(0.05, 0.2 + 0.5 * ((p.depth + 1.5) / 3)) * (0.3 + 0.7 * recency)
        : 0.3 + 0.7 * recency;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = lerpHexColor(OKABE_ITO.blue, OKABE_ITO.vermillion, recency);
      ctx.fillRect(cx + p.x * scale, cy - p.y * scale, 2, 2);
    }
    ctx.globalAlpha = 1;
    const tick = Math.floor(performance.now() / 37) % 255;
    ctx.fillStyle = `rgb(${tick},${255 - tick},${(tick * 3) % 255})`;
    ctx.fillRect(0, 0, canvas.width, 8);
  }

  protected bind(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('p3dCanvas');
    if (canvas) {
      const instructions = document.createElement('span');
      instructions.id = 'p3dKeyboardInstructions';
      instructions.className = 'v10-sr';
      instructions.textContent = 'Use the arrow keys to rotate the 3D view. Press Home to reset the camera.';
      canvas.parentElement?.append(instructions);
      canvas.setAttribute('aria-describedby', instructions.id);
      canvas.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Home');
      canvas.addEventListener('keydown', (event) => {
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
      });
    }
    canvas?.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas?.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.01;
      this.pitch += (e.clientY - this.lastY) * 0.01;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const stop = (e: PointerEvent): void => {
      this.dragging = false;
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    canvas?.addEventListener('pointerup', stop);
    canvas?.addEventListener('pointercancel', stop);
    canvas?.addEventListener('lostpointercapture', () => {
      this.dragging = false;
    });

    this.dom.el('p3dClear')?.addEventListener('click', () => {
      this.points = [];
      this.sim = new LabSimulation(this.config());
    });
    this.dom.el('p3dResetCam')?.addEventListener('click', () => {
      this.yaw = 0.6;
      this.pitch = 0.4;
    });

    this.rafId = requestAnimationFrame(() => this.frame());
    this.intervalId = window.setInterval(() => this.renderFrame(), 250);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
