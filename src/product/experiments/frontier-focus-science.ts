import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
import { frontierFocusCanonical, frontierFocusConfig } from './frontier-focus-config';
import { executeFrontierNetwork } from './frontier-focus-network';
import { executeFrontierField } from './frontier-focus-field';
import { executeFrontierDiscrete } from './frontier-focus-discrete';
export type FrontierParts = Pick<ResearchFocusResult, 'metrics' | 'tables' | 'charts' | 'warnings'>;
export const frontierMetric = (id: string, label: string, value: number, unit = '1') => ({ id, label, value, unit });
export const frontierLine = (
  id: string,
  title: string,
  xLabel: string,
  yLabel: string,
  series: ResearchFocusResult['charts'][number]['series']
): ResearchFocusResult['charts'][number] => ({ id, title, xLabel, yLabel, series });

/** Native simulation/analysis orchestration; no alternative equations of motion or steppers. */
export function executeFrontierFocus(
  id: string,
  fields: ResearchFields,
  progress?: (fraction: number) => void
): ResearchFocusResult {
  const source = frontierFocusConfig(id, fields);
  progress?.(0);
  const parts =
    source.family === 'network'
      ? executeFrontierNetwork(id, fields, source.config, progress)
      : source.family === 'field'
        ? executeFrontierField(id, fields, source.config, progress)
        : executeFrontierDiscrete(id, fields, source.config, progress);
  progress?.(1);
  return {
    schema: 'pendulum-research-focus/v1',
    unitId: id,
    fields: { ...fields },
    canonical: frontierFocusCanonical(id, fields),
    ...parts,
    warnings: [
      ...parts.warnings,
      'Lab에는 기준 실험의 초기 설정·좌표·단위·seed/stepper만 정확히 전달합니다. 동반 sweep·근사 밀도·PN/비교 계산은 이 단원의 결과 JSON에 보존됩니다.'
    ]
  };
}
