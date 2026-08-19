import type { DomBinder } from './DomBinder';
import { expansionElement, expansionTextCell } from './expansionLabUi';
import type {
  ExpansionBifurcationColumn,
  ExpansionGhostFrame,
  ExpansionHeatmap,
  ExpansionLyapunovProfile,
  ExpansionMethodResult,
  ExpansionModelDefinition,
  ExpansionPoint,
  ExpansionSuiteResult
} from '../physics/expandedModels';

export function formatExpansionValue(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) return value.toExponential(2);
  return value.toFixed(digits);
}

/**
 * Owns the presentation-only half of Expansion Lab.  It deliberately accepts
 * a DomBinder rather than a controller so rendering cannot mutate experiment
 * state or start jobs.
 */
export class ExpansionLabRenderer {
  constructor(private readonly dom: DomBinder) {}

  renderModelDoc(definition: ExpansionModelDefinition): void {
    const box = this.dom.el('expModelDoc');
    if (!box) return;
    box.replaceChildren(
      expansionElement('div', { className: 'exp-doc-title', text: `${definition.label} model contract` }),
      expansionElement('p', { text: definition.equation }),
      expansionElement('p', { text: definition.energyNote }),
      expansionElement('p', { text: definition.caveat })
    );
  }

  renderResult(result: ExpansionSuiteResult): void {
    this.dom.setText('expHash', result.manifest.hash);
    this.dom.setText('expBest', `${result.summary.bestMethod} · ${formatExpansionValue(result.summary.bestScore, 1)}`);
    this.renderTable(result.rows);
    this.renderLyapunov(result.lyapunov);
    this.drawReplay(result.replay);
    this.drawHeatmap(result.phaseHeatmap);
    this.drawGhost(result.ghost);
    this.drawBifurcation(result.bifurcation);
  }

  renderLyapunov(profile: ExpansionLyapunovProfile | undefined): void {
    const box = this.dom.el('expLyapReadout');
    if (!box) return;
    if (!profile) {
      box.replaceChildren();
      return;
    }
    const spectrum = profile.spectrum.map((value) => formatExpansionValue(value, 3)).join(',  ');
    const leadingSe = profile.blockStdError[0] ?? 0;
    const consistency = profile.consistency;
    const verdict = consistency.symplectic ? 'symplectic ✓' : 'pairing ✗';
    box.replaceChildren(
      expansionElement('div', {
        className: 'exp-doc-title',
        text: 'Lyapunov spectrum — variational equation + Gram–Schmidt (QR)'
      }),
      expansionElement('p', { className: 'exp-lyap-spectrum', text: `λ = [ ${spectrum} ]` }),
      expansionElement(
        'p',
        {},
        expansionElement('strong', {
          text: `λ₁ = ${formatExpansionValue(profile.leadingExponent, 4)} ± ${formatExpansionValue(leadingSe, 4)}`
        }),
        document.createTextNode(
          `   ·   Σλ = ${formatExpansionValue(profile.sum, 4)}   ·   D_KY = ${formatExpansionValue(profile.kaplanYorkeDimension, 3)}   ·   `
        ),
        expansionElement('span', {
          className: consistency.symplectic ? 'exp-lyap-ok' : 'exp-lyap-warn',
          text: `${verdict} (pair err ${formatExpansionValue(consistency.pairingError, 4)})`
        })
      ),
      expansionElement('p', {
        className: 'exp-sub',
        text: `${profile.spectrum.length} finite-time exponents (± block-bootstrap SE), every direction reorthonormalized every ${profile.settings.renormEvery} steps, ${profile.settings.jacobian} Jacobian — the research-grade estimate the single-perturbation ghost divergence above only approximates for λ₁.`
      })
    );
  }

  renderTable(rows: readonly ExpansionMethodResult[]): void {
    const body = this.dom.el<HTMLTableSectionElement>('expMethodTable');
    if (!body) return;
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.stable ? 'good' : 'bad';
      tr.append(
        expansionTextCell(row.method),
        expansionTextCell(row.stable ? 'yes' : 'no'),
        expansionTextCell(formatExpansionValue(row.energyDrift, 3)),
        expansionTextCell(formatExpansionValue(row.referenceDivergence, 3)),
        expansionTextCell(formatExpansionValue(row.stepsPerMs, 1)),
        expansionTextCell(formatExpansionValue(row.maxAbsState, 2))
      );
      body.append(tr);
    }
  }

  renderBatchLike(title: string, rows: readonly { label: string; status: string; detail: string }[]): void {
    const box = this.dom.el('expBatchResults');
    if (!box) return;
    box.replaceChildren(expansionElement('div', { className: 'exp-doc-title', text: title }));
    for (const row of rows) {
      box.append(
        expansionElement(
          'div',
          { className: 'exp-batch-row' },
          expansionElement('strong', { text: row.label }),
          expansionElement('span', { text: row.status }),
          expansionElement('em', { text: row.detail })
        )
      );
    }
  }

  private drawReplay(replay: readonly ExpansionPoint[][]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expReplayCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    if (replay.length === 0) return;
    const bounds = this.bounds(replay.flat(), 0.35);
    const map = (point: ExpansionPoint): ExpansionPoint => ({
      x: ((point.x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * canvas.width,
      y: canvas.height - ((point.y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * canvas.height
    });
    const stride = Math.max(1, Math.floor(replay.length / 72));
    for (let index = 0; index < replay.length; index += stride) {
      const chain = replay[index] ?? [];
      const alpha = 0.12 + 0.72 * (index / replay.length);
      ctx.strokeStyle = `rgba(24,212,248,${alpha.toFixed(3)})`;
      ctx.fillStyle = `rgba(255,122,44,${Math.min(0.95, alpha + 0.08).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const pivot = map({ x: 0, y: 0 });
      ctx.moveTo(pivot.x, pivot.y);
      for (const point of chain) {
        const mapped = map(point);
        ctx.lineTo(mapped.x, mapped.y);
      }
      ctx.stroke();
      const tip = chain[chain.length - 1];
      if (tip) {
        const mapped = map(tip);
        ctx.beginPath();
        ctx.arc(mapped.x, mapped.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHeatmap(heatmap: ExpansionHeatmap): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expHeatmapCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    const cellWidth = canvas.width / heatmap.bins;
    const cellHeight = canvas.height / heatmap.bins;
    for (let y = 0; y < heatmap.bins; y += 1) {
      for (let x = 0; x < heatmap.bins; x += 1) {
        const count = heatmap.counts[y]?.[x] ?? 0;
        const t = heatmap.maxCount > 0 ? Math.log1p(count) / Math.log1p(heatmap.maxCount) : 0;
        ctx.fillStyle = `rgb(${Math.round(14 + 230 * t)},${Math.round(24 + 120 * t)},${Math.round(54 + 30 * (1 - t))})`;
        ctx.fillRect(x * cellWidth, canvas.height - (y + 1) * cellHeight, cellWidth + 1, cellHeight + 1);
      }
    }
  }

  private drawGhost(frames: readonly ExpansionGhostFrame[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expGhostCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    if (frames.length < 2) return;
    const max = Math.max(1e-12, ...frames.map((frame) => frame.divergence));
    ctx.strokeStyle = 'rgba(255,122,44,.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    frames.forEach((frame, index) => {
      const x = (index / (frames.length - 1)) * canvas.width;
      const y =
        canvas.height - (Math.log10(frame.divergence + 1e-12) / Math.log10(max + 1e-12)) * (canvas.height - 16) - 8;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = frames[frames.length - 1]!;
    this.drawTinyChain(ctx, last.base, canvas.width - 76, 28, '#18d4f8');
    this.drawTinyChain(ctx, last.ghost, canvas.width - 38, 28, '#ff7a2c');
  }

  private drawBifurcation(columns: readonly ExpansionBifurcationColumn[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expBifCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    if (columns.length === 0) return;
    const values = columns.flatMap((column) => column.values);
    const min = Math.min(-Math.PI, ...values);
    const max = Math.max(Math.PI, ...values);
    columns.forEach((column, index) => {
      const x = (index / Math.max(1, columns.length - 1)) * canvas.width;
      ctx.fillStyle = 'rgba(24,212,248,.72)';
      for (const value of column.values) {
        const y = canvas.height - ((value - min) / (max - min || 1)) * canvas.height;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    });
  }

  private clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  }

  private drawTinyChain(
    ctx: CanvasRenderingContext2D,
    points: readonly ExpansionPoint[],
    x: number,
    y: number,
    color: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const point of points) ctx.lineTo(point.x * 18, -point.y * 18);
    ctx.stroke();
    const tip = points[points.length - 1];
    if (tip) {
      ctx.beginPath();
      ctx.arc(tip.x * 18, -tip.y * 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private bounds(
    points: readonly ExpansionPoint[],
    pad: number
  ): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = -1;
    let xMax = 1;
    let yMin = -1;
    let yMax = 1;
    if (points.length > 0) {
      xMin = Math.min(...points.map((point) => point.x));
      xMax = Math.max(...points.map((point) => point.x));
      yMin = Math.min(...points.map((point) => point.y));
      yMax = Math.max(...points.map((point) => point.y));
    }
    const span = Math.max(xMax - xMin, yMax - yMin, 1e-6);
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const half = span * (0.5 + pad);
    return { xMin: cx - half, xMax: cx + half, yMin: cy - half, yMax: cy + half };
  }
}
