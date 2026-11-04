import { batchData, stableBatchJson } from '../lab/experiments/safe';
import { validateResearchCanonical } from './research-focus-config';
import { validateResearchFields } from './research-focus-definitions';
import type { ResearchFocusResult } from './research-focus-contracts';
import type { ResearchRequest } from './research-focus-worker';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === keys.sort().join(',');
const unique = (values: readonly string[]) => new Set(values).size === values.length;
/** Worker output is bounded display data with exact canonical and input lineage. */
export function validateResearchResult(input: unknown, request: ResearchRequest): ResearchFocusResult {
  const value = batchData(input);
  if (
    !object(value) ||
    !only(value, ['schema', 'unitId', 'fields', 'canonical', 'metrics', 'tables', 'charts', 'warnings']) ||
    value.schema !== 'pendulum-research-focus/v1' ||
    value.unitId !== request.unitId ||
    stableBatchJson(value.fields) !== stableBatchJson(validateResearchFields(request.unitId, request.fields))
  )
    throw new Error('전용 실험 결과의 입력 계보가 다릅니다.');
  validateResearchCanonical(
    { id: request.unitId, courseId: `course-${request.unitId.split('.')[0]}`, contentVersion: 1 },
    request.fields,
    value.canonical
  );
  if (
    !Array.isArray(value.metrics) ||
    value.metrics.length < 1 ||
    value.metrics.length > 128 ||
    !Array.isArray(value.tables) ||
    value.tables.length > 24 ||
    !Array.isArray(value.charts) ||
    value.charts.length > 24 ||
    !Array.isArray(value.warnings) ||
    value.warnings.length > 100 ||
    value.warnings.some((w) => !text(w, 2000))
  )
    throw new Error('전용 실험 결과 배열의 한도가 다릅니다.');
  for (const m of value.metrics)
    if (
      !object(m) ||
      !only(m, ['id', 'label', 'value', 'unit']) ||
      !text(m.id, 100) ||
      !text(m.label) ||
      !text(m.unit, 80) ||
      !finite(m.value)
    )
      throw new Error('진단값과 단위를 확인하세요.');
  let cells = 0,
    points = 0;
  for (const t of value.tables) {
    if (
      !object(t) ||
      !only(t, ['id', 'title', 'columns', 'rows']) ||
      !text(t.id, 100) ||
      !text(t.title) ||
      !Array.isArray(t.columns) ||
      t.columns.length < 1 ||
      t.columns.length > 24 ||
      t.columns.some((c) => !text(c)) ||
      !Array.isArray(t.rows) ||
      t.rows.length > 1200
    )
      throw new Error('결과 표의 형식을 확인하세요.');
    for (const row of t.rows) {
      if (
        !Array.isArray(row) ||
        row.length !== t.columns.length ||
        row.some((v) => !finite(v) && !(typeof v === 'string' && v.length <= 2000))
      )
        throw new Error('결과 표에는 유한한 수치와 제한된 텍스트가 필요합니다.');
      cells += row.length;
    }
  }
  for (const c of value.charts) {
    if (
      !object(c) ||
      !only(c, ['id', 'title', 'xLabel', 'yLabel', 'series', ...('mode' in c ? ['mode'] : [])]) ||
      ('mode' in c && c.mode !== 'line' && c.mode !== 'scatter') ||
      !text(c.id, 100) ||
      !text(c.title) ||
      !text(c.xLabel) ||
      !text(c.yLabel) ||
      !Array.isArray(c.series) ||
      c.series.length < 1 ||
      c.series.length > 12
    )
      throw new Error('그래프의 축과 계열을 확인하세요.');
    for (const s of c.series) {
      if (
        !object(s) ||
        !only(s, ['label', 'points']) ||
        !text(s.label) ||
        !Array.isArray(s.points) ||
        s.points.length > 2500
      )
        throw new Error('그래프 표본 한도를 넘었습니다.');
      for (const p of s.points)
        if (!object(p) || !only(p, ['x', 'y']) || !finite(p.x) || !finite(p.y))
          throw new Error('그래프 표본은 유한한 숫자여야 합니다.');
      points += s.points.length;
    }
  }
  if (
    cells > 60000 ||
    points > 30000 ||
    !unique(value.metrics.map((m) => (m as Record<string, string>).id!)) ||
    !unique(value.tables.map((t) => (t as Record<string, string>).id!)) ||
    !unique(value.charts.map((c) => (c as Record<string, string>).id!))
  )
    throw new Error('결과의 전체 한도 또는 고유 ID를 확인하세요.');
  return value as unknown as ResearchFocusResult;
}
