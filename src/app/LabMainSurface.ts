import type { Point2D } from '../viz/poincare';
import { downloadDataUrl } from './labExport';
import type { LabEnsembleController } from './LabEnsembleController';
import { bobsFromState, mainCanvasContext } from './LabRenderHelpers';
import { labChainLength, labMainFrameStyle } from './LabRenderPolicy';
import { LabRenderer } from './LabRenderer';
import type { BobPosition, LabConfig } from './LabSimulation';
import type { LabQualityBudget } from './LabQualityBudget';
import {
  mainCanvasWorkerRequested,
  tryCreateMainCanvasWorkerClient,
  type MainCanvasWorkerClient
} from './MainCanvasWorkerClient';

export interface LabMainSurfaceHooks {
  rebindDrag(): void;
  refreshCanvasLifecycle(): void;
}

interface LiveFrame {
  bobs: BobPosition[];
  config: LabConfig;
  quality: LabQualityBudget;
  frameCount: number;
  ensemble: LabEnsembleController;
  preserveTrail?: boolean;
}

/** Owns Canvas2D/OffscreenCanvas selection, recovery, and main-view drawing. */
export class LabMainSurface {
  private renderer: LabRenderer | null = null;
  private worker: MainCanvasWorkerClient | null = null;

  constructor(private readonly hooks: LabMainSurfaceHooks) {}

  invalidateRenderer(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  configure(config: LabConfig, quality: LabQualityBudget): void {
    if (this.worker?.isActive()) {
      this.worker.clear();
      this.worker.resize();
      this.invalidateRenderer();
      return;
    }

    const canvas = document.getElementById('main');
    if (canvas instanceof HTMLCanvasElement && mainCanvasWorkerRequested()) {
      const client = tryCreateMainCanvasWorkerClient(canvas, {
        dprCap: quality.dprCap,
        onFallback: () => {
          this.worker = null;
          this.invalidateRenderer();
          this.hooks.rebindDrag();
          this.hooks.refreshCanvasLifecycle();
        }
      });
      if (client) {
        this.worker = client;
        this.invalidateRenderer();
        return;
      }
    }

    this.worker = null;
    this.ensureRenderer(config)?.clear();
  }

  drawLive(frame: LiveFrame): void {
    const style = labMainFrameStyle(frame.config, frame.quality, frame.frameCount);
    if (this.worker?.isActive()) {
      this.worker.draw({
        bobs: frame.bobs,
        ensembleBobs: frame.ensemble.tipPositionsMeters(frame.config),
        style
      });
      return;
    }
    const renderer = !this.renderer || frame.frameCount % 30 === 0 ? this.ensureRenderer(frame.config) : this.renderer;
    if (!renderer) return;
    renderer.draw(frame.bobs, {
      ensembleTips: frame.ensemble.tips(frame.config, renderer),
      ...style,
      ...(frame.preserveTrail ? { preserveTrail: true } : {})
    });
  }

  drawReplay(bobs: BobPosition[], config: LabConfig, quality: LabQualityBudget, frameCount: number): void {
    if (this.worker?.isActive()) {
      this.worker.draw({
        bobs,
        ensembleBobs: [],
        style: { ...labMainFrameStyle(config, quality, frameCount), skipTrail: true }
      });
    } else {
      this.ensureRenderer(config)?.draw(bobs, { ...labMainFrameStyle(config, quality, frameCount), skipTrail: true });
    }
  }

  repaintAfterResize(frame: LiveFrame): void {
    if (this.worker?.isActive()) {
      this.worker.resize();
      return;
    }
    this.drawLive({ ...frame, preserveTrail: true });
  }

  clear(): void {
    this.renderer?.clear();
    this.worker?.clear();
  }

  exportPng(): void {
    const canvas = document.getElementById('main');
    if (canvas instanceof HTMLCanvasElement && !this.worker?.isActive()) {
      downloadDataUrl('pendulum_modern.png', canvas.toDataURL('image/png'));
    }
  }

  rendererSize(): { width: number; height: number } | null {
    return this.renderer?.size() ?? null;
  }

  bobPixels(config: LabConfig, state: ArrayLike<number>): Point2D[] {
    const renderer = this.renderer;
    return renderer ? bobsFromState(config, state).map((bob) => renderer.toPixels(bob)) : [];
  }

  pivot(): Point2D | null {
    return this.renderer?.pivot() ?? null;
  }

  trailPointCount(): number {
    return this.renderer?.trailPointCount() ?? 0;
  }

  canvasBackend(): 'offscreen' | 'main' {
    return this.worker?.isActive() ? 'offscreen' : 'main';
  }

  trailBackend(): 'webgl2' | 'canvas2d' | 'worker' {
    return this.worker?.isActive() ? 'worker' : (this.renderer?.activeTrailBackend() ?? 'canvas2d');
  }

  dispose(): void {
    this.worker?.dispose();
    this.worker = null;
    this.invalidateRenderer();
  }

  private ensureRenderer(config: LabConfig): LabRenderer | null {
    if (this.worker?.isActive()) return null;
    const main = mainCanvasContext();
    if (!main) return null;
    const size = this.renderer?.size();
    if (!this.renderer) {
      this.renderer = new LabRenderer(main.ctx, {
        width: main.width,
        height: main.height,
        worldRadius: labChainLength(config)
      });
      this.renderer.clear();
    } else if (size?.width !== main.width || size?.height !== main.height) {
      this.renderer.resize({ width: main.width, height: main.height });
    }
    return this.renderer;
  }
}
