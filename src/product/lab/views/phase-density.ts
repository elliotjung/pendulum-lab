import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ContractResult } from '../../contracts/validation';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { PhaseSample } from './native-phase-space';

/** Same angle wrapping, velocity window and pixel mapping as preserved DensityTab.
 * Input is the current recorded native trajectory; no second solver is started. */
export function phaseDensityPoints(samples: readonly PhaseSample[], width = 640, height = 400) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)
    throw new Error('양의 유한한 그림 크기가 필요합니다.');
  const stride = Math.max(1, Math.ceil((samples.length - 1) / 3999));
  let clipped = 0;
  const points = samples.flatMap((sample, index) => {
    const n = sample.state.length / 2,
      theta = sample.state[0],
      omega = sample.state[n];
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      !Number.isFinite(theta) ||
      !Number.isFinite(omega) ||
      !Number.isFinite(sample.time)
    )
      throw new Error('유한한 각도·각속도·시간 기록이 필요합니다.');
    if (index % stride !== 0 && index !== samples.length - 1) return [];
    if (Math.abs(omega!) > 12) clipped++;
    return [
      {
        step: sample.step,
        time: sample.time,
        theta: theta!,
        omega: omega!,
        x: ((Math.atan2(Math.sin(theta!), Math.cos(theta!)) + Math.PI) / (2 * Math.PI)) * width,
        y: height - Math.max(0, Math.min(1, (omega! + 12) / 24)) * height
      }
    ];
  });
  return {
    points,
    sourceSamples: samples.length,
    retained: points.length,
    omitted: samples.length - points.length,
    clippedVelocity: clipped,
    width,
    height
  };
}
export function createPhaseDensity(
  document: Document,
  options: { samples(): readonly PhaseSample[]; sample(): PhaseSample; experiment(): ContractResult<ExperimentStateV1> }
) {
  const root = element(document, 'details', 'lab-details');
  root.id = 'native-phase-density';
  root.append(element(document, 'summary', '', '위상 방문 누적 · θ₁/ω₁'));
  const canvas = element(document, 'canvas', '');
  canvas.width = 640;
  canvas.height = 400;
  canvas.style.width = '100%';
  canvas.style.maxWidth = '640px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '현재 기록의 첫 각도·각속도 방문 누적');
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  root.append(
    canvas,
    status,
    error,
    element(
      document,
      'p',
      'lab-muted',
      '현재 실험에서 기록한 궤적을 누적합니다. θ₁은 −π…π로 접고 ω₁은 −12…12 rad/s 범위에서 표시하며, 범위를 넘은 표본은 경계에 표시합니다. 색의 밝기는 방문 누적이며 정규화된 확률밀도가 아닙니다. 최대4,000점의 표시 축약과 제외 수를 기록하며 전체 궤적 CSV는 유지합니다.'
    )
  );
  let disposed = false,
    last = '',
    timer: ReturnType<typeof setTimeout> | undefined,
    latest: ReturnType<typeof phaseDensityPoints> | undefined;
  const urls = new Set<string>();
  function update(force = false) {
    if (disposed || !root.open) return;
    const sample = options.sample(),
      signature = `${sample.step}:${sample.time}:${sample.state.join(',')}`;
    if (!force && signature === last) return;
    if (!force) {
      if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          update(true);
        }, 100);
      return;
    }
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('이 환경에서 Canvas2D를 사용할 수 없습니다.');
      latest = phaseDensityPoints(options.samples(), canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05080d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(40,170,230,0.04)';
      for (const p of latest.points) ctx.fillRect(p.x, p.y, 2, 2);
      ctx.globalCompositeOperation = 'source-over';
      root.dataset.retained = String(latest.retained);
      status.textContent = `θ₁ (rad) / ω₁ (rad/s) · ${latest.retained}/${latest.sourceSamples}점 · 표시 축약 ${latest.omitted}점 · 각속도 경계 ${latest.clippedVelocity}점`;
      error.textContent = '';
      last = signature;
    } catch (cause) {
      latest = undefined;
      error.textContent = cause instanceof Error ? cause.message : '위상 누적을 그리지 못했습니다.';
    }
  }
  const download = createButton(document, {
    label: '위상 방문 좌표 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        update(true);
        const experiment = options.experiment();
        if (!latest || !experiment.ok) throw new Error('유효한 현재 실험과 기록이 필요합니다.');
        const url = URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                {
                  schema: 'pendulum-phase-visits/v1',
                  experiment: experiment.value,
                  source: 'current-recorded-native-trajectory',
                  angleUnit: 'rad',
                  velocityUnit: 'rad/s',
                  rendering: 'Canvas2D additive; alpha0.04;2px',
                  ...latest
                },
                null,
                2
              )
            ],
            { type: 'application/json' }
          )
        );
        urls.add(url);
        const a = element(document, 'a', '');
        a.href = url;
        a.download = 'pendulum-phase-visits.json';
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        }, 1000);
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : '위상 방문 기록을 내려받지 못했습니다.';
      }
    }
  });
  root.append(download);
  root.addEventListener('toggle', () => update(true));
  return {
    element: root,
    update,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
