import type { DesignPoint, StudyVariable } from '../../research/experimentDesign';
import { $ } from './shared';
import { renderResearchTable } from './research-renderers';
import type { DesignStudyPointState, DesignStudyState } from './research-design-types';

export const DESIGN_ORIGIN_COLORS: Record<DesignPoint['origin'], string> = {
  design: '#4cc9f0',
  replicate: '#a3b3c9',
  adaptive: '#f4a261',
  boundary: '#e63946',
  uncertainty: '#b388eb'
};

export function designPointCanvasPosition(
  point: DesignStudyPointState,
  vx: StudyVariable,
  vy: StudyVariable,
  width: number,
  height: number,
  pad = 18
): { x: number; y: number } {
  const sx = (value: number): number => pad + ((value - vx.min) / (vx.max - vx.min || 1)) * (width - 2 * pad);
  const sy = (value: number): number => height - pad - ((value - vy.min) / (vy.max - vy.min || 1)) * (height - 2 * pad);
  return {
    x: sx(point.values[vx.key] ?? vx.min),
    y: sy(point.values[vy.key] ?? vy.min)
  };
}

export function designSummaryText(design: DesignStudyState): string {
  const done = design.points.filter((point) => point.results).length;
  const failed = design.points.filter((point) => point.error && !point.results).length;
  return `${design.strategy} design over ${design.variables.map((variable) => variable.key).join(', ')} - ${design.points.length} points (${done} complete, ${failed} failed). Status: ${design.status}. ${design.message}`;
}

export function designTableRows(design: DesignStudyState): string[][] {
  return design.points.slice(0, 40).map((point) => [
    point.origin,
    design.variables.map((variable) => `${variable.key}=${(point.values[variable.key] ?? 0).toFixed(3)}`).join(' '),
    point.results ? point.results.lambdaMax.toFixed(4) : '-',
    point.results ? `+/-${point.results.lambdaBlockStdError.toFixed(4)}` : '-',
    point.results ? point.results.ftle.toFixed(3) : '-',
    point.error ?? ''
  ]);
}

export function drawDesignPreview(design: DesignStudyState): void {
  const canvas = $('rwDesignPreview');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const [vx, vy] = [design.variables[0], design.variables[1] ?? design.variables[0]];
  if (!vx || !vy) return;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pad = 18;
  ctx.strokeStyle = '#2a3550';
  ctx.strokeRect(pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
  for (const point of design.points) {
    const { x, y } = designPointCanvasPosition(point, vx, vy, canvas.width, canvas.height, pad);
    ctx.fillStyle = DESIGN_ORIGIN_COLORS[point.origin];
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText(`${vx.key} ->`, canvas.width - pad - 52, canvas.height - 4);
  ctx.fillText(`${vy.key} ^`, 2, pad - 6);
}

export function drawDesignHeatmap(design: DesignStudyState): void {
  const canvas = $('rwDesignHeatmap');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const evaluated = design.points.filter((point) => point.results);
  const [vx, vy] = [design.variables[0], design.variables[1] ?? design.variables[0]];
  if (!vx || !vy || evaluated.length === 0) {
    ctx.fillStyle = '#8fa3c2';
    ctx.font = '11px system-ui';
    ctx.fillText('Heatmap appears after the design batch runs.', 12, canvas.height / 2);
    return;
  }
  const lambdas = evaluated.map((point) => point.results!.lambdaMax).filter(Number.isFinite);
  const maxAbs = Math.max(0.1, ...lambdas.map((lambda) => Math.abs(lambda)));
  const pad = 18;
  for (const point of evaluated) {
    const lambda = point.results!.lambdaMax;
    const t = Math.max(-1, Math.min(1, lambda / maxAbs));
    const r = t > 0 ? 255 : Math.round(255 * (1 + t));
    const b = t < 0 ? 255 : Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - Math.abs(t)));
    const { x, y } = designPointCanvasPosition(point, vx, vy, canvas.width, canvas.height, pad);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#2a3550';
  ctx.strokeRect(pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText(`lambda heatmap: blue regular, red chaotic (|lambda|max ${maxAbs.toFixed(2)})`, pad, 12);
}

export function renderDesignStudyState(design: DesignStudyState | null): void {
  const summary = $('rwDesignSummary');
  if (!summary) return;
  if (!design) {
    summary.textContent = 'No design generated. Define variables and generate a multi-dimensional design.';
    return;
  }
  summary.textContent = designSummaryText(design);
  drawDesignPreview(design);
  drawDesignHeatmap(design);
  renderResearchTable('rwDesignResults', ['origin', 'point', 'lambda max', 'SE', 'FTLE', 'error'], designTableRows(design), 'Design points appear here.');
}
