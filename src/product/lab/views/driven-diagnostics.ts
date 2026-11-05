/** UI metadata adapter. The preserved native driven API continues to reject nonphysical analysis inputs. */
export * from '../../adapters/physics/driven';
import * as native from '../../adapters/physics/driven';
import type { DrivenConfig } from '../../adapters/physics/driven';
import { fromStabilityAnalysis } from '../../adapters/analysis/stability/state';
import type { AnalysisState, ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { inspectSafeData } from '../../persistence/safe-data';
import { issue, success, type ContractResult } from '../../contracts/validation';

export function validateDrivenConfig(input: unknown): ContractResult<DrivenConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const value = safe.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return native.validateDrivenConfig(value);
  const entries = value.analyses;
  if (entries !== undefined) {
    try {
      if (!Array.isArray(entries) || entries.length > 32) throw new Error('안정성 설정 배열이 필요합니다.');
      for (const entry of entries) fromStabilityAnalysis(entry as unknown as AnalysisState);
    } catch {
      return {
        ok: false,
        issues: [
          issue(
            'unsupported-analysis',
            '$.analyses',
            '지원 버전의 안정성 분석 설정만 복원할 수 있습니다. 원본을 보존하세요.',
            'keep-original'
          )
        ]
      };
    }
  }
  const checked = native.validateDrivenConfig({ ...value, analyses: [] });
  if (!checked.ok) return checked;
  const config = {
    ...checked.value,
    ...(entries === undefined ? {} : { analyses: entries as unknown as readonly AnalysisState[] })
  };
  const physical = native.toCanonicalDriven(checked.value);
  if (!physical.ok) return physical;
  const combined = validateExperimentState({ ...physical.value, analyses: config.analyses ?? [] });
  return combined.ok ? success(config) : combined;
}
export function toCanonicalDriven(config: DrivenConfig): ContractResult<ExperimentStateV1> {
  const checked = validateDrivenConfig(config);
  if (!checked.ok) return checked;
  const physical = native.toCanonicalDriven({ ...checked.value, analyses: [] });
  return physical.ok
    ? validateExperimentState({ ...physical.value, analyses: checked.value.analyses ?? [] })
    : physical;
}
export function fromCanonicalDriven(input: unknown): ContractResult<DrivenConfig> {
  const canonical = validateExperimentState(input);
  if (!canonical.ok) return canonical;
  const physical = native.fromCanonicalDriven({ ...canonical.value, analyses: [] });
  return physical.ok ? validateDrivenConfig({ ...physical.value, analyses: canonical.value.analyses }) : physical;
}
export function createDrivenSimulation(input: DrivenConfig) {
  const checked = validateDrivenConfig(input);
  if (!checked.ok) throw new Error(checked.issues.map((i) => i.message).join(' '));
  const simulation = native.createDrivenSimulation({ ...checked.value, analyses: [] });
  return {
    get config() {
      return structuredClone(checked.value);
    },
    get done() {
      return simulation.done;
    },
    snapshot: simulation.snapshot,
    step: simulation.step
  };
}
