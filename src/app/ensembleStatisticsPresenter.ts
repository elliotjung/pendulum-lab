import type { LabEnsembleController } from './LabEnsembleController';
import type { EnsembleSeparationSample } from './ensembleSeparationStatistics';
import { perturbationVariableLabel } from './ensemblePerturbation';

function formatDistance(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toExponential(3)} m`;
}

function presentBand(plot: SVGSVGElement, sample: EnsembleSeparationSample | null, label: string): void {
  const range = plot.querySelector<SVGRectElement>('[data-ensemble-band]');
  const median = plot.querySelector<SVGLineElement>('[data-ensemble-median]');
  if (!range || !median) return;
  const maximum = Math.max(sample?.p95 ?? 0, Number.EPSILON);
  const x = (value: number | null): number => 5 + ((value ?? 0) / maximum) * 90;
  const p05 = x(sample?.p05 ?? null);
  const p50 = x(sample?.p50 ?? null);
  const p95 = x(sample?.p95 ?? null);
  range.setAttribute('x', String(p05));
  range.setAttribute('width', String(Math.max(0, p95 - p05)));
  median.setAttribute('x1', String(p50));
  median.setAttribute('x2', String(p50));
  plot.setAttribute('aria-label', label);
}

/** Present the latest physical separation distribution in the guided result surface. */
export function presentEnsembleStatistics(controller: LabEnsembleController): void {
  const summary = document.getElementById('ensembleStatisticsSummary');
  const plot = document.getElementById('ensembleStatisticsPlot');
  if (!summary && !(plot instanceof SVGSVGElement)) return;
  const statistics = controller.statistics();
  const latest = statistics.latest;
  const korean = document.documentElement.lang === 'ko';
  if (!latest) {
    const empty = korean
      ? '앙상블을 실행하면 p05 / 중앙값 / p95 끝점 분리를 측정합니다.'
      : 'Run the ensemble to measure p05 / median / p95 endpoint separation.';
    if (summary) summary.textContent = empty;
    if (plot instanceof SVGSVGElement) presentBand(plot, null, empty);
    return;
  }

  const warning =
    latest.warning === 'insufficient-sample'
      ? korean
        ? ' · n<3: 구간 해석 불가'
        : ' · n<3: interval unavailable'
      : latest.warning === 'small-sample'
        ? korean
          ? ' · n<10: 불안정 가능'
          : ' · n<10: interval may be unstable'
        : '';
  const cap =
    statistics.memberCount < statistics.requestedCount
      ? ` · n ${statistics.memberCount}/${statistics.requestedCount}`
      : '';
  const rule = `${perturbationVariableLabel(statistics.spec.variable)} · ${statistics.spec.pattern} · ε=${statistics.spec.epsilon.toExponential(3)} · seed ${statistics.spec.seed}`;
  const endpoint = statistics.endpointIndex === 3 ? 'Δr₃' : 'Δr₂';
  const count = korean
    ? `유효 n=${latest.validCount}, 제외 ${latest.excludedCount}`
    : `valid n=${latest.validCount}, excluded ${latest.excludedCount}`;
  const text = `t=${latest.time.toFixed(2)} s · ${endpoint}: p05 ${formatDistance(latest.p05)} · p50 ${formatDistance(latest.p50)} · p95 ${formatDistance(latest.p95)} · ${count} · ${rule}${cap}${warning}`;
  if (summary) summary.textContent = text;
  if (plot instanceof SVGSVGElement) presentBand(plot, latest, text);
}
