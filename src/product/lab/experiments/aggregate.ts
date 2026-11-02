import type { BatchAggregate, BatchPlan, BatchRunState } from './contracts';
/** Original plan order defines every aggregate, independent of worker completion order. */
export function aggregateBatch(plan: BatchPlan, runs: readonly BatchRunState[]): BatchAggregate {
  const completed = runs.filter((run) => run.status === 'completed'),
    baseline = runs[0]?.result?.summary;
  const metrics =
    completed[0]?.result?.summary.metrics.map((metric, i) => {
      const values = completed
        .map((run) => run.result!.summary.metrics[i]!)
        .filter((m) => m.key === metric.key && m.unit === metric.unit)
        .map((m) => m.final);
      let mean = 0,
        m2 = 0;
      values.forEach((value, index) => {
        const delta = value - mean;
        mean += delta / (index + 1);
        m2 += delta * (value - mean);
      });
      return {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        mean,
        standardDeviation: values.length > 1 ? Math.sqrt(Math.max(0, m2 / (values.length - 1))) : 0
      };
    }) ?? [];
  const compared = plan.settings.kind === 'paired' ? runs[1]?.result?.summary : undefined;
  const pairedDifference =
    baseline && compared
      ? baseline.metrics.map((m, i) => ({
          key: m.key,
          label: m.label,
          unit: m.unit,
          value: compared.metrics[i]!.final - m.final
        }))
      : undefined;
  const comparisons =
    plan.settings.kind === 'integrators' && baseline
      ? completed
          .filter((run) => run.index !== 0)
          .map((run) => ({
            referenceRunId: runs[0]!.id,
            runId: run.id,
            metrics: baseline.metrics.map((m, i) => ({
              key: m.key,
              label: m.label,
              unit: m.unit,
              value: run.result!.summary.metrics[i]!.final - m.final
            }))
          }))
      : undefined;
  return {
    artifactId: `${plan.id}-aggregate`,
    sourceInputId: plan.sourceInputId,
    childRunIds: completed.map((run) => run.id),
    completed: completed.length,
    failed: runs.filter((run) => run.status === 'failed').length,
    pending: runs.filter((run) => run.status === 'pending' || run.status === 'running').length,
    metrics,
    ...(pairedDifference ? { pairedDifference } : {}),
    ...(comparisons ? { comparisons } : {}),
    warnings: [
      '집계는 성공한 run만 포함합니다. 실패·대기 run 수와 개별 설정을 함께 확인하세요.',
      '표준편차는 run 사이 endpoint의 n−1 표본 표준편차이며 신뢰구간이나 추정 오차가 아닙니다.',
      ...plan.warnings
    ]
  };
}
