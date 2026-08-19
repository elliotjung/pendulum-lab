import type {
  ExpansionEnergyCell,
  ExpansionMatrixCell,
  ExpansionPoint,
  ExpansionResearchMatrixResult,
  ResearchComparisonRun
} from '../physics/expandedModels';
import type { DomBinder } from './DomBinder';
import { matrixCell, matrixElement } from './researchMatrixUi';

export function formatMatrixValue(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) return value.toExponential(2);
  return value.toFixed(digits);
}

/**
 * Read-only visual projection of a completed Research Matrix run.  Keeping
 * it separate from the controller protects golden-run state from chart/table
 * implementation detail.
 */
export class ResearchMatrixRenderer {
  constructor(private readonly dom: DomBinder) {}

  render(result: ExpansionResearchMatrixResult): void {
    this.dom.setText('matrixHash', result.manifest.hash);
    this.dom.setText('matrixStable', `${result.summary.stableComparisons}/${result.comparison.length}`);
    this.dom.setText('matrixLyap', formatMatrixValue(result.summary.maxLyapunovEstimate, 3));
    this.dom.setText(
      'matrixSummary',
      `${result.base.modelLabel}: ${result.summary.bestComparison}, sweep stable ${(result.summary.sweepStableRatio * 100).toFixed(0)}%`
    );
    this.renderMetrics(result);
    this.renderComparison(result.comparison);
    this.drawSweep(
      result.sweep2d.cells,
      result.sweep2d.size,
      'matrixSweepCanvas',
      result.sweep2d.xAxis.label,
      result.sweep2d.yAxis.label
    );
    this.drawPoincare(result.diagnostics.poincare);
    this.drawLyapunov(result.diagnostics.lyapunovTimeline);
    this.drawBasin(result.diagnostics.basin.cells, result.diagnostics.basin.size);
    this.drawEnergy(
      result.diagnostics.energyLandscape.cells,
      result.diagnostics.energyLandscape.size,
      result.diagnostics.energyLandscape.note
    );
  }

  private renderMetrics(result: ExpansionResearchMatrixResult): void {
    const box = this.dom.el('matrixMetrics');
    if (!box) return;
    box.replaceChildren();
    const spectrum = result.diagnostics.lyapunovSpectrum;
    if (spectrum.length > 0) {
      const consistency = result.diagnostics.lyapunovConsistency;
      const verdict = consistency.symplectic ? 'symplectic ✓' : 'pairing ✗';
      box.append(
        matrixElement(
          'div',
          { className: 'matrix-metric matrix-metric-wide' },
          matrixElement('strong', { text: 'Lyapunov spectrum (variational/QR)' }),
          matrixElement('span', {
            text: `λ = [ ${spectrum.map((value) => formatMatrixValue(value, 3)).join(',  ')} ]`
          }),
          matrixElement('em', {
            text: `Σλ = ${formatMatrixValue(
              spectrum.reduce((a, b) => a + b, 0),
              4
            )} · D_KY = ${formatMatrixValue(result.diagnostics.kaplanYorkeDimension, 3)} · ${verdict} (pair err ${formatMatrixValue(consistency.pairingError, 4)})`
          })
        )
      );
    }
    for (const metric of result.physicalMetrics) {
      box.append(
        matrixElement(
          'div',
          { className: 'matrix-metric' },
          matrixElement('strong', { text: metric.label }),
          matrixElement('span', { text: `${formatMatrixValue(metric.value, 4)} ${metric.unit}` }),
          matrixElement('em', { text: metric.note })
        )
      );
    }
  }

  private renderComparison(rows: readonly ResearchComparisonRun[]): void {
    const body = this.dom.el<HTMLTableSectionElement>('matrixComparisonBody');
    if (!body) return;
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.stable ? 'good' : 'bad';
      const sparkCell = document.createElement('td');
      const spark = matrixElement('canvas', { className: 'matrix-spark', attrs: { width: '96', height: '28' } });
      sparkCell.append(spark);
      tr.append(
        matrixCell(row.label),
        matrixCell(row.kind),
        matrixCell(row.method),
        matrixCell(row.hash),
        matrixCell(formatMatrixValue(row.stabilityScore, 1)),
        matrixCell(formatMatrixValue(row.energyDrift, 3)),
        matrixCell(`${formatMatrixValue(row.runtimeMs, 1)} ms`),
        sparkCell
      );
      body.append(tr);
      this.drawSpark(spark, row.miniGraph, row.stable);
    }
  }

  private clear(canvas: HTMLCanvasElement, fill = '#05080d'): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    return ctx;
  }

  private drawSpark(canvas: HTMLCanvasElement, values: readonly number[], stable: boolean): void {
    const ctx = this.clear(canvas, 'transparent');
    if (!ctx || values.length < 2) return;
    ctx.strokeStyle = stable ? '#34e88a' : '#ff4565';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * canvas.width;
      const y = canvas.height - value * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawSweep(
    cells: readonly ExpansionMatrixCell[],
    size: number,
    canvasId: string,
    xLabel: string,
    yLabel: string
  ): void {
    const canvas = this.dom.el<HTMLCanvasElement>(canvasId);
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const max = Math.max(1, ...cells.map((item) => item.score));
    const cellWidth = canvas.width / size;
    const cellHeight = canvas.height / size;
    cells.forEach((item, index) => {
      const xi = index % size;
      const yi = Math.floor(index / size);
      const t = Math.max(0, Math.min(1, item.score / max));
      ctx.fillStyle = item.stable
        ? `rgb(${Math.round(20 + 20 * t)},${Math.round(70 + 170 * t)},${Math.round(90 + 80 * (1 - t))})`
        : '#451827';
      ctx.fillRect(xi * cellWidth, canvas.height - (yi + 1) * cellHeight, cellWidth + 1, cellHeight + 1);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    for (const level of [0.35, 0.55, 0.75]) {
      ctx.beginPath();
      for (let xi = 0; xi < size; xi += 1) {
        const column = Array.from({ length: size }, (_, yi) => cells[yi * size + xi]?.score ?? 0);
        let yi = column.findIndex((score) => score / max >= level);
        if (yi < 0) yi = size - 1;
        const x = (xi + 0.5) * cellWidth;
        const y = canvas.height - (yi + 0.5) * cellHeight;
        if (xi === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.drawCanvasLegend(ctx, canvas, `${xLabel} x ${yLabel}`, 'score/stability');
  }

  private drawPoincare(points: readonly ExpansionPoint[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixPoincareCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const yMax = Math.max(2, ...points.map((point) => Math.abs(point.y)));
    ctx.fillStyle = '#18d4f8';
    for (const point of points) {
      const x = ((point.x + Math.PI) / (Math.PI * 2)) * canvas.width;
      const y = canvas.height - ((point.y + yMax) / (2 * yMax)) * canvas.height;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  private drawLyapunov(points: readonly { time: number; leading: number; secondary: number }[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixLyapCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx || points.length < 2) return;
    const all = points.flatMap((point) => [point.leading, point.secondary]);
    const min = Math.min(...all, -1e-6);
    const max = Math.max(...all, 1e-6);
    const draw = (field: 'leading' | 'secondary', color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = (index / (points.length - 1)) * canvas.width;
        const y = canvas.height - ((point[field] - min) / (max - min || 1)) * canvas.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    draw('leading', '#ff7a2c');
    draw('secondary', '#18d4f8');
  }

  private drawBasin(cells: readonly { basin: number; stable: boolean }[], size: number): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixBasinCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const colors = ['#18d4f8', '#ff7a2c', '#34e88a', '#ff4565'];
    const cellWidth = canvas.width / size;
    const cellHeight = canvas.height / size;
    cells.forEach((item, index) => {
      const xi = index % size;
      const yi = Math.floor(index / size);
      ctx.fillStyle = item.stable ? (colors[item.basin] ?? '#6b7686') : '#34121b';
      ctx.fillRect(xi * cellWidth, canvas.height - (yi + 1) * cellHeight, cellWidth + 1, cellHeight + 1);
    });
  }

  private drawEnergy(cells: readonly ExpansionEnergyCell[], size: number, note: string): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixEnergyCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const finite = cells.map((item) => item.energy).filter(Number.isFinite);
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const cellWidth = canvas.width / size;
    const cellHeight = canvas.height / size;
    cells.forEach((item, index) => {
      const xi = index % size;
      const yi = Math.floor(index / size);
      const t = (item.energy - min) / (max - min || 1);
      ctx.fillStyle = `rgb(${Math.round(12 + 190 * t)},${Math.round(30 + 105 * (1 - t))},${Math.round(70 + 80 * t)})`;
      ctx.fillRect(xi * cellWidth, canvas.height - (yi + 1) * cellHeight, cellWidth + 1, cellHeight + 1);
      if (item.separatrix) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          xi * cellWidth + cellWidth * 0.35,
          canvas.height - (yi + 1) * cellHeight + cellHeight * 0.35,
          Math.max(1, cellWidth * 0.3),
          Math.max(1, cellHeight * 0.3)
        );
      }
    });
    this.drawCanvasLegend(ctx, canvas, 'phase energy shell', note);
  }

  private drawCanvasLegend(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    title: string,
    detail: string
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(5,8,13,.78)';
    ctx.fillRect(8, 8, Math.min(canvas.width - 16, 300), 38);
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.strokeRect(8.5, 8.5, Math.min(canvas.width - 16, 300), 38);
    ctx.fillStyle = '#dbe8ff';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(title, 16, 23);
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText(detail.slice(0, 54), 16, 39);
    ctx.restore();
  }
}
