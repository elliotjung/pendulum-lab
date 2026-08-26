import { webGLTrailRequested } from '../render/webglTrailRenderer';
import { pageDom as dom } from './DomBinder';
import type { LabConfig } from './LabSimulation';
import { compactViewport, type LabQualityBudget } from './LabQualityBudget';

export interface LabMainFrameStyle {
  fade: number;
  trailColor: string;
  trailMode: string;
  trailLength: number;
  glow: boolean;
  uniformRods: boolean;
  trailBackend: 'canvas2d' | 'webgl2';
  worldRadius: number;
}

/** User controls + adaptive quality resolved into one renderer policy. */
export function labMainFrameStyle(config: LabConfig, quality: LabQualityBudget, frameCount: number): LabMainFrameStyle {
  const trailMode = dom.str('trailMode', 'rainbow');
  return {
    fade: trailFade(quality),
    trailColor: trailColor(trailMode, frameCount),
    trailMode,
    trailLength: quality.effectiveTrailLength(),
    glow: dom.bool('glowMode') && quality.profile().glow && quality.allowDecorativeEffects,
    uniformRods: config.system === 'compound-double',
    trailBackend:
      quality.mode === 'cinematic' && quality.allowDecorativeEffects && webGLTrailRequested() ? 'webgl2' : 'canvas2d',
    worldRadius: labChainLength(config)
  };
}

export function labChainLength(config: LabConfig): number {
  const p = config.parameters;
  return p.l1 + p.l2 + (config.system === 'triple' ? (p.l3 ?? 0) : 0);
}

function trailColor(mode: string, frameCount: number): string {
  if (mode === 'rainbow') return `hsl(${(frameCount * 2) % 360}, 90%, 60%)`;
  const fixed: Record<string, string> = {
    heat: '#ff7a1a',
    ice: '#7fdfff',
    plasma: '#f0c419',
    white: '#ffffff',
    green: '#3bff7a'
  };
  return fixed[mode] ?? '#56b4e9';
}

function trailFade(quality: LabQualityBudget): number {
  const compact = compactViewport();
  if (quality.mode === 'performance') return compact ? 0.22 : 0.16;
  if (dom.bool('longExpose')) return compact ? 0.018 : 0.008;
  if (dom.bool('glowMode')) return compact ? 0.07 : 0.04;
  return compact ? 0.18 : 0.12;
}
