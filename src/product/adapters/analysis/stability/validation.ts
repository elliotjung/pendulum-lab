import { validateExperimentState } from '../../../contracts/experiment-validation';
import { closedRecord, validateArtifactData } from '../core/artifact-validation';
import { validateDiagnosticExperiment } from '../core/source';
import { STABILITY_LIMITS, type StabilityRequest } from './contracts';
import { numeric, validateStabilitySettings } from './settings';
import { assertStabilityStep, readStabilityDriven, varyDriven } from './source';

const IDS = /^[A-Za-z0-9_-]{1,128}$/;
export const RESTARTABLE_STABILITY_KINDS = [
  'fixed-point',
  'periodic-shooting',
  'floquet',
  'continuation',
  'pseudo-arclength',
  'branch-switch',
  'neimark-sacker'
] as const;
export function validateStabilityRequest(request: StabilityRequest): void {
  // Never invoke accessors while examining an untrusted imported or worker request.
  validateArtifactData(request);
  closedRecord(request, ['id', 'kind', 'experiment', 'settings'], ['restart'], '안정성 요청');
  if (typeof request.id !== 'string' || !IDS.test(request.id))
    throw new RangeError('안정성 작업 ID가 유효하지 않습니다.');
  validateStabilitySettings(request.kind, request.settings);
  const checked = validateExperimentState(request.experiment);
  if (!checked.ok)
    throw new RangeError(`실험 설정이 유효하지 않습니다: ${checked.issues.map((v) => v.message).join(' ')}`);
  validateDiagnosticExperiment(request.experiment);
  const s = request.settings;
  if (request.restart !== undefined) {
    closedRecord(
      request.restart,
      ['artifactId', 'inputRunId', 'source', 'state', 'parameter', 'direction'],
      [],
      '재시작 지점'
    );
    const r = request.restart;
    if (
      !(RESTARTABLE_STABILITY_KINDS as readonly string[]).includes(request.kind) ||
      (request.kind === 'branch-switch' && s.source !== 'pitchfork-normal-form') ||
      (['fixed-point', 'periodic-shooting', 'floquet'].includes(request.kind) &&
        (s.source !== 'current-driven' || s.period !== 1))
    )
      throw new RangeError('선택한 도구는 저장된 끝점에서 재시작을 지원하지 않습니다.');
    if (
      !IDS.test(r.artifactId) ||
      !IDS.test(r.inputRunId) ||
      r.source !== s.source ||
      !Array.isArray(r.state) ||
      r.state.length !== (request.kind === 'pseudo-arclength' || s.source === 'pitchfork-normal-form' ? 1 : 2) ||
      r.state.some((v) => !Number.isFinite(v) || Math.abs(v) > 100) ||
      !Number.isFinite(r.parameter) ||
      Math.abs(r.parameter) > 100 ||
      (r.direction !== 1 && r.direction !== -1)
    )
      throw new RangeError('재시작 지점의 source·상태·매개변수·방향이 유효하지 않습니다.');
    if (['continuation', 'branch-switch', 'neimark-sacker'].includes(request.kind) && r.parameter === numeric(s, 'end'))
      throw new RangeError('재시작 끝점과 새 종료 매개변수는 서로 달라야 합니다.');
    if (request.kind === 'pseudo-arclength' && Math.abs(r.state[0]!) < 1e-6)
      throw new RangeError('정확한 fold에서 접선은 재구성할 수 없습니다. 인접한 비특이 끝점을 사용하세요.');
  }
  let work = 0;
  const iterations = typeof s.maxIterations === 'number' ? s.maxIterations : 1;
  const points = typeof s.points === 'number' ? s.points : 1;
  const period = typeof s.period === 'number' ? s.period : 1;
  if (s.source === 'current-driven') {
    const { parameters: p } = readStabilityDriven(request.experiment);
    if (
      request.restart &&
      ['fixed-point', 'periodic-shooting', 'floquet'].includes(request.kind) &&
      request.restart.parameter !== p.driveAmplitude
    )
      throw new RangeError('해 전달 지점의 진폭이 원 실험과 다릅니다. 원 실험 snapshot을 보존하세요.');
    if (request.kind === 'melnikov') {
      const omega = p.driveFrequency / Math.sqrt(p.g / p.length);
      if (omega > 100) throw new RangeError('Melnikov의 무차원 주파수 범위를 초과했습니다.');
      work = numeric(s, 'phaseCount') * (numeric(s, 'intervals') + 1);
    } else if (request.kind === 'codim-two') {
      for (const [key, low, high] of [
        [s.xParameter, s.xLow, s.xHigh],
        [s.yParameter, s.yLow, s.yHigh]
      ])
        if (
          typeof key !== 'string' ||
          typeof low !== 'number' ||
          typeof high !== 'number' ||
          low < (key === 'forcingFrequency' ? 0.05 : 0) ||
          high > 1000
        )
          throw new RangeError('2매개변수 지도 범위가 원래 물리 모델 범위를 벗어났습니다.');
      const scaled = varyDriven(
        varyDriven(p, String(s.xParameter), Math.max(numeric(s, 'xLow'), numeric(s, 'xHigh'))),
        String(s.yParameter),
        Math.max(numeric(s, 'yLow'), numeric(s, 'yHigh'))
      );
      if (
        numeric(s, 'dt') *
          Math.max(Math.sqrt(p.g / p.length), scaled.damping, scaled.driveFrequency, Math.sqrt(scaled.driveAmplitude)) >
        0.15
      )
        throw new RangeError('2매개변수 지도의 무차원 step 안전 상한을 초과했습니다. dt를 줄이세요.');
      // Native maximalLyapunov includes a 2000-step reference transient, then two trajectories.
      work = numeric(s, 'resolution') ** 2 * (2000 + 2 * numeric(s, 'lyapunovSteps')) * 4;
    } else {
      const steps = numeric(s, 'stepsPerPeriod');
      assertStabilityStep(p, steps);
      if (request.kind === 'continuation') {
        const start = request.restart?.parameter ?? numeric(s, 'start'),
          end = numeric(s, 'end');
        if (Math.min(start, end) < (s.parameter === 'forcingFrequency' ? 0.05 : 0) || Math.max(start, end) > 1000)
          throw new RangeError('continuation 범위가 원래 물리 모델 범위를 벗어났습니다.');
        assertStabilityStep(varyDriven(p, String(s.parameter), start), steps);
        assertStabilityStep(varyDriven(p, String(s.parameter), end), steps);
        work = points * (iterations * 5 + 8) * period * steps * 4;
      } else if (request.kind === 'branch-switch') {
        work = (iterations * 48 + 300) * steps * 4;
      } else {
        const databaseMultiplier = request.kind === 'periodic-shooting' ? 4 : 1;
        work = databaseMultiplier * (iterations * 5 + 8) * period * steps * 4;
      }
    }
  } else if (s.source === 'linear-oscillator') {
    if (
      (numeric(s, 'period') / numeric(s, 'stepsPerPeriod')) *
        Math.max(numeric(s, 'linearFrequency'), numeric(s, 'linearDamping')) >
      0.15
    )
      throw new RangeError('선형 Floquet step이 너무 큽니다. stepsPerPeriod를 늘리세요.');
    work = numeric(s, 'stepsPerPeriod') * 24;
  } else if (request.kind === 'torus') {
    // Dense Newton/collocation work, including finite differences and off-grid checks.
    work = (points * iterations * (2 * numeric(s, 'collocation') + 1) ** 3) / 8;
  } else if (request.kind === 'arnold-tongue') {
    work = points * (numeric(s, 'iterations') + numeric(s, 'transient'));
  } else if (request.kind === 'pseudo-arclength') {
    const x = request.restart?.state[0] ?? numeric(s, 'guess0'),
      lambda = request.restart?.parameter ?? numeric(s, 'start');
    if (Math.abs(x * x - lambda) > numeric(s, 'tolerance') * 10 || Math.abs(x) < 1e-6)
      throw new RangeError('fold 기준 잔차 x²−λ=0을 만족하는 비특이 시작 해가 필요합니다.');
    work = numeric(s, 'steps') * iterations * 64;
  } else work = points * iterations * 100;
  if (
    request.restart &&
    request.kind === 'neimark-sacker' &&
    (request.restart.parameter < 1.5 || request.restart.parameter > 2.1)
  )
    throw new RangeError('NS 재시작 매개변수는 1.5≤a≤2.1 범위입니다.');
  if (
    request.restart &&
    request.settings.source === 'pitchfork-normal-form' &&
    (request.restart.parameter <= 0 ||
      request.restart.parameter > 1 ||
      Math.abs(request.restart.state[0]!) <= 1e-4 ||
      Math.abs(request.restart.state[0]! * (request.restart.parameter - request.restart.state[0]! ** 2)) >
        numeric(s, 'tolerance') * 10)
  )
    throw new RangeError('pitchfork 재시작은 잔차를 만족하는 양의 매개변수의 비영 가지 끝점이 필요합니다.');
  if (!Number.isFinite(work) || work > STABILITY_LIMITS.work)
    throw new RangeError(
      `안정성 계산 예산 ${STABILITY_LIMITS.work} work를 초과했습니다. 표본 수·해상도·반복 수를 줄이세요.`
    );
}
