export interface EnergyBenchmarkSeries {
  id: string;
  name: string;
  maxRelDrift: number;
  time: number[];
  drift: number[];
}

export interface EnergyBenchmarkViewModel {
  generatedAt: string;
  dt: number;
  steps: number;
  series: EnergyBenchmarkSeries[];
}

function finiteArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
}

/** Sanitize the committed benchmark report before handing it to the canvas. */
export function normalizeEnergyBenchmark(value: unknown): EnergyBenchmarkViewModel {
  const report = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const series: EnergyBenchmarkSeries[] = [];
  for (const candidate of rows) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const row = candidate as Record<string, unknown>;
    const curve = typeof row.curve === 'object' && row.curve !== null ? row.curve as Record<string, unknown> : {};
    const time = finiteArray(curve.time);
    const drift = finiteArray(curve.relDrift ?? curve.drift);
    const length = Math.min(time.length, drift.length);
    if (length < 2 || typeof row.id !== 'string') continue;
    series.push({
      id: row.id,
      name: typeof row.name === 'string' ? row.name : row.id,
      maxRelDrift: typeof row.maxRelDrift === 'number' && Number.isFinite(row.maxRelDrift) ? row.maxRelDrift : Math.max(...drift),
      time: time.slice(0, length),
      drift: drift.slice(0, length).map((entry) => Math.max(1e-18, Math.abs(entry)))
    });
  }
  return {
    generatedAt: typeof report.generatedAt === 'string' ? report.generatedAt : '',
    dt: typeof report.dt === 'number' && Number.isFinite(report.dt) ? report.dt : 0,
    steps: typeof report.steps === 'number' && Number.isFinite(report.steps) ? report.steps : 0,
    series
  };
}

const COLORS = ['#4fd9ff', '#e7c887', '#ff7a6b', '#70df9b', '#a98bff', '#f06eb4', '#6f9cff', '#f5c842'];

export function renderEnergyBenchmarkCanvas(canvas: HTMLCanvasElement, model: EnergyBenchmarkViewModel): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#080d18';
  context.fillRect(0, 0, width, height);
  if (model.series.length === 0) return;
  const left = 70;
  const right = 18;
  const top = 18;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxTime = Math.max(...model.series.flatMap((series) => series.time));
  const logs = model.series.flatMap((series) => series.drift.map((drift) => Math.log10(drift)));
  const minLog = Math.floor(Math.max(-18, Math.min(...logs)));
  const maxLog = Math.ceil(Math.min(2, Math.max(...logs)));
  const span = Math.max(1, maxLog - minLog);
  const x = (time: number): number => left + (time / (maxTime || 1)) * plotWidth;
  const y = (drift: number): number => top + (maxLog - Math.log10(Math.max(1e-18, drift))) / span * plotHeight;

  context.font = '11px ui-monospace, monospace';
  context.lineWidth = 1;
  for (let power = minLog; power <= maxLog; power += 2) {
    const py = top + (maxLog - power) / span * plotHeight;
    context.strokeStyle = 'rgba(160,190,220,.14)';
    context.beginPath(); context.moveTo(left, py); context.lineTo(width - right, py); context.stroke();
    context.fillStyle = '#91a4bb';
    context.textAlign = 'right';
    context.fillText(`10^${power}`, left - 8, py + 4);
  }
  for (let fraction = 0; fraction <= 4; fraction += 1) {
    const time = maxTime * fraction / 4;
    const px = x(time);
    context.strokeStyle = 'rgba(160,190,220,.1)';
    context.beginPath(); context.moveTo(px, top); context.lineTo(px, top + plotHeight); context.stroke();
    context.fillStyle = '#91a4bb';
    context.textAlign = 'center';
    context.fillText(`${time.toFixed(0)} s`, px, height - 25);
  }
  context.save();
  context.translate(16, top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.fillStyle = '#b9c7d8';
  context.textAlign = 'center';
  context.fillText('|ΔE/E₀| (log)', 0, 0);
  context.restore();

  model.series.forEach((series, index) => {
    context.strokeStyle = COLORS[index % COLORS.length]!;
    context.lineWidth = index < 8 ? 1.6 : 1;
    context.globalAlpha = index < 8 ? .95 : .48;
    context.beginPath();
    series.time.forEach((time, pointIndex) => {
      const px = x(time);
      const py = y(series.drift[pointIndex] ?? 1e-18);
      if (pointIndex === 0) context.moveTo(px, py); else context.lineTo(px, py);
    });
    context.stroke();
  });
  context.globalAlpha = 1;
}

export function renderEnergyBenchmarkLegend(container: HTMLElement, model: EnergyBenchmarkViewModel): void {
  container.replaceChildren();
  const list = document.createElement('ol');
  list.className = 'energy-benchmark-legend';
  model.series.forEach((series, index) => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'energy-benchmark-swatch';
    swatch.style.backgroundColor = COLORS[index % COLORS.length]!;
    const name = document.createElement('span');
    name.textContent = series.name;
    const value = document.createElement('code');
    value.textContent = `max ${series.maxRelDrift.toExponential(2)}`;
    item.append(swatch, name, value);
    list.append(item);
  });
  container.append(list);
}
