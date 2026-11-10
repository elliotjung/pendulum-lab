import { element } from '../../app/dom';
import { DEFAULT_PLAYBACK, type PlaybackSettings } from './playback-clock';

export function createPlaybackControls(
  document: Document,
  model: {
    readonly state: {
      readonly playback: PlaybackSettings | null;
      readonly speed: number;
      readonly physicsMs: number;
      readonly effectiveStepsPerFrame: number | null;
      readonly timingDiagnostics: { timingDebtSeconds: number; droppedSimulationSeconds: number };
    };
    setPlayback(value: PlaybackSettings): void;
  }
) {
  const section = element(document, 'details', 'lab-details');
  section.id = 'legacy-playback';
  section.append(element(document, 'summary', '', '실행 시계 · 프레임 예산'));
  const timing = element(document, 'select', 'ds-field__control');
  timing.id = 'playback-timing';
  for (const [value, label] of [
    ['wall-clock', '실제 시간에 맞추기'],
    ['deterministic', '프레임마다 정해진 단계 실행']
  ]) {
    const option = element(document, 'option', '', label);
    option.value = value!;
    timing.append(option);
  }
  const mode = element(document, 'select', 'ds-field__control');
  mode.id = 'playback-mode';
  for (const value of ['demo', 'education', 'research', 'benchmark', 'performance', 'recovery']) {
    const option = element(document, 'option', '', value);
    option.value = value;
    mode.append(option);
  }
  const speed = element(document, 'input', 'ds-field__control');
  Object.assign(speed, { id: 'playback-speed', type: 'number', min: '0.1', max: '4', step: 'any' });
  const budget = element(document, 'input', 'ds-field__control');
  Object.assign(budget, { id: 'playback-budget', type: 'number', min: '1', max: '60', step: '1' });
  for (const [control, title] of [
    [timing, '시간 전진 방식'],
    [mode, '실행 용도'],
    [speed, '실행 시계 속도'],
    [budget, '프레임당 단계 예산']
  ] as const) {
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = control.id;
    section.append(label, control);
  }
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  const diagnostics = element(document, 'p', 'lab-muted');
  diagnostics.id = 'playback-diagnostics';
  section.append(
    element(
      document,
      'p',
      'lab-muted',
      '기존 SimulationClock의 시간 누적·예산 규칙을 사용합니다. 용도는 실행 메타데이터이며 운동방정식을 바꾸지 않습니다.'
    ),
    error,
    diagnostics
  );
  function update() {
    const state = model.state;
    const settings = state.playback ?? { ...DEFAULT_PLAYBACK, speed: state.speed };
    if (document.activeElement !== timing) timing.value = settings.timingMode;
    if (document.activeElement !== mode) mode.value = settings.mode;
    if (document.activeElement !== speed) speed.value = String(settings.speed);
    if (document.activeElement !== budget) budget.value = String(settings.stepsPerFrame);
    diagnostics.dataset.physicsMs = String(state.physicsMs);
    diagnostics.dataset.requestedSteps = String(settings.stepsPerFrame);
    diagnostics.dataset.effectiveSteps = String(state.effectiveStepsPerFrame ?? settings.stepsPerFrame);
    diagnostics.dataset.timingDebtSeconds = String(state.timingDiagnostics.timingDebtSeconds);
    diagnostics.dataset.droppedSimulationSeconds = String(state.timingDiagnostics.droppedSimulationSeconds);
    diagnostics.textContent = `최근 물리 계산 ${state.physicsMs.toPrecision(5)} ms · 프레임 예산 ${state.effectiveStepsPerFrame ?? settings.stepsPerFrame}/${settings.stepsPerFrame}단계 · 대기 중인 물리 시간 ${state.timingDiagnostics.timingDebtSeconds.toPrecision(5)} s · 예산 초과로 제외한 시간 ${state.timingDiagnostics.droppedSimulationSeconds.toPrecision(5)} s`;
  }
  const change = () => {
    try {
      model.setPlayback({
        timingMode: timing.value as PlaybackSettings['timingMode'],
        mode: mode.value as PlaybackSettings['mode'],
        speed: Number(speed.value),
        stepsPerFrame: Number(budget.value)
      });
      error.textContent = '';
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : '실행 시계 설정을 확인하세요.';
    }
  };
  for (const control of [timing, mode, speed, budget]) control.addEventListener('change', change);
  // The selected controls describe the actual scheduler from the first run.
  if (!model.state.playback) model.setPlayback({ ...DEFAULT_PLAYBACK, speed: model.state.speed });
  update();
  return { element: section, update };
}
