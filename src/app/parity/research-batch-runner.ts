import type { RuntimeSnapshot } from '../../types/domain';
import type { SystemSpec } from '../../physics/systemSpec';
import type { ParameterStudyPlan, ParameterStudyPoint } from './shared';

export const studyBatch = {
  running: false,
  cancelled: false,
  current: 0,
  total: 0,
  completed: 0,
  failed: 0,
  timeoutMs: 45_000,
  poolSize: 2,
  cancelInFlight: null as (() => void) | null
};

export type StudyBatchMode = { failedOnly?: boolean; resume?: boolean };
export type StudyBatchTarget = { point: ParameterStudyPoint; index: number };

export function studyBatchTargets(plan: ParameterStudyPlan, options: StudyBatchMode = {}): StudyBatchTarget[] {
  return plan.experiments
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => (options.failedOnly ? Boolean(point.error) : !point.results));
}

/** Map a study-point snapshot onto the declarative chaos-job system spec. */
export function studySpecFromSnapshot(snapshot: RuntimeSnapshot): { spec: SystemSpec; state0: number[] } {
  const p = snapshot.parameters;
  if (snapshot.systemType === 'triple') {
    const spec: SystemSpec = {
      kind: 'triple',
      m1: p.m1,
      m2: p.m2,
      m3: p.m3 ?? 1,
      l1: p.l1,
      l2: p.l2,
      l3: p.l3 ?? 0.8,
      g: p.g
    };
    return { spec, state0: snapshot.state.slice(0, 6) };
  }
  const spec: SystemSpec = { kind: 'double', m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
  return { spec, state0: snapshot.state.slice(0, 4) };
}
