import { rotateProject } from '../../../viz/phase3dMath';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';

export interface PhaseSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
}
export const PHASE_SPACE_LIMIT = 4000;
export function projectPhaseSamples(
  samples: readonly PhaseSample[],
  axes: readonly [number, number, number],
  yaw: number,
  pitch: number,
  wrapAngles: boolean
) {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || axes.some((i) => !Number.isSafeInteger(i) || i < 0))
    throw new Error('유한한 회전 각도와 좌표 index가 필요합니다.');
  for (const sample of samples) {
    const n = sample.state.length / 2;
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      axes.some((i) => i >= sample.state.length || !Number.isFinite(sample.state[i])) ||
      !Number.isFinite(sample.time)
    )
      throw new Error('표시에서 축약하는 표본도 유한한 올바른 차원이어야 합니다.');
  }
  const stride = Math.max(1, Math.ceil((samples.length - 1) / (PHASE_SPACE_LIMIT - 1)));
  const retained = samples.filter((_s, i) => i % stride === 0 || i === samples.length - 1);
  const raw = retained.map((sample) => {
    const n = sample.state.length / 2;
    if (!Number.isInteger(n) || n < 1 || axes.some((i) => i >= sample.state.length) || !Number.isFinite(sample.time))
      throw new Error('현재 진자 기록의 차원·시간을 확인하세요.');
    const values = axes.map((i) => sample.state[i]!);
    if (!values.every(Number.isFinite)) throw new Error('유한하지 않은 기록을 숨겨서 그리지 않습니다.');
    const displayed = values.map((value, j) =>
      wrapAngles && axes[j]! < n ? Math.atan2(Math.sin(value), Math.cos(value)) : value
    );
    return { step: sample.step, time: sample.time, raw: values, displayed };
  });
  const bounds = [0, 1, 2].map((i) => {
    let min = Infinity,
      max = -Infinity;
    for (const p of raw) {
      min = Math.min(min, p.displayed[i]!);
      max = Math.max(max, p.displayed[i]!);
    }
    const halfRange = max / 2 - min / 2;
    return raw.length
      ? { center: min / 2 + max / 2, halfRange: halfRange > 0 ? halfRange : 1 }
      : { center: 0, halfRange: 1 };
  });
  const points = raw.map((point) => {
    const v = point.displayed.map((value, i) => (value - bounds[i]!.center) / bounds[i]!.halfRange);
    return { ...point, projected: rotateProject({ x: v[0]!, y: v[1]!, z: v[2]! }, yaw, pitch) };
  });
  return {
    points,
    bounds,
    sourceSamples: samples.length,
    retained: points.length,
    omitted: samples.length - points.length
  };
}

/** Three-dimensional phase coordinates use the unchanged native yaw/pitch
 * projection. Normalization and angle wrapping affect this figure only. */
export function createPhaseSpace3D(
  document: Document,
  options: { samples(): readonly PhaseSample[]; sample(): PhaseSample; experiment(): ContractResult<ExperimentStateV1> }
) {
  const root = element(document, 'details', 'lab-details');
  root.id = 'native-phase-space';
  root.append(element(document, 'summary', '', '3D 위상공간 · 회전·좌표 선택'));
  const fields = element(document, 'div', 'lab-inspector-grid');
  const axes = [0, 1, 2].map((value, i) => {
    const label = element(document, 'label', 'ds-field__label', `${['X', 'Y', 'Z'][i]} 위상 좌표`);
    const select = element(document, 'select', 'ds-field__control');
    select.id = `phase3d-axis-${i}`;
    label.htmlFor = select.id;
    fields.append(label, select);
    return { control: select, value };
  });
  function range(id: string, title: string, value: number) {
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = id;
    const input = element(document, 'input', 'ds-field__control');
    Object.assign(input, {
      id,
      type: 'range',
      min: String(-Math.PI),
      max: String(Math.PI),
      step: '0.01',
      value: String(value)
    });
    fields.append(label, input);
    return input;
  }
  const yaw = range('phase3d-yaw', '3D 좌우 회전 (rad)', 0.6),
    pitch = range('phase3d-pitch', '3D 상하 회전 (rad)', 0.3);
  const wrapLabel = element(document, 'label', 'ds-field__label'),
    wrap = element(document, 'input', '');
  wrap.type = 'checkbox';
  wrap.id = 'phase3d-wrap';
  wrapLabel.htmlFor = wrap.id;
  wrapLabel.append(wrap, document.createTextNode(' 각도 표시만 −π…π로 접기'));
  fields.append(wrapLabel);
  const plot = element(document, 'div', 'core-plot-frame'),
    status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  root.append(
    fields,
    plot,
    status,
    error,
    element(
      document,
      'p',
      'lab-muted',
      '선택한 세 좌표를 각 축의 기록 범위로 정규화해 회전하여 표시합니다. 최대4,000개 점으로 표시를 축약하며 원래 SI 상태·시간·전체 궤적 CSV는 바꾸지 않습니다.'
    )
  );
  let dimension = 0,
    lastSignature = '',
    lastAt = 0,
    disposed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let result: ReturnType<typeof projectPhaseSamples> | undefined;
  const urls = new Set<string>();
  function update(force = false) {
    if (disposed || !root.open) return;
    const sample = options.sample(),
      signature = `${sample.step}:${sample.time}:${sample.state.join(',')}`;
    if (!force && signature === lastSignature) return;
    if (!force && performance.now() - lastAt < 100) {
      if (pending === undefined)
        pending = setTimeout(
          () => {
            pending = undefined;
            update(true);
          },
          100 - (performance.now() - lastAt)
        );
      return;
    }
    try {
      if (dimension !== sample.state.length) {
        dimension = sample.state.length;
        const n = dimension / 2;
        for (const [i, axis] of axes.entries()) {
          axis.control.replaceChildren();
          for (let j = 0; j < dimension; j++) {
            const option = element(document, 'option', '', j < n ? `θ${j + 1} (rad)` : `ω${j - n + 1} (rad/s)`);
            option.value = String(j);
            axis.control.append(option);
          }
          axis.control.value = String(Math.min(i, dimension - 1));
        }
      }
      result = projectPhaseSamples(
        options.samples(),
        axes.map((a) => Number(a.control.value)) as [number, number, number],
        Number(yaw.value),
        Number(pitch.value),
        wrap.checked
      );
      const ns = 'http://www.w3.org/2000/svg',
        svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '-1.7 -1.7 3.4 3.4');
      svg.classList.add('core-plot');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', '현재 기록의 3D 위상공간. 원본 수치는 JSON 내보내기에서 확인하세요.');
      const curve = document.createElementNS(ns, 'path');
      curve.setAttribute(
        'd',
        result.points
          .map((p, i) => `${i ? 'L' : 'M'}${p.projected.x.toFixed(6)} ${(-p.projected.y).toFixed(6)}`)
          .join(' ')
      );
      curve.setAttribute('stroke', '#075985');
      curve.setAttribute('stroke-width', '.012');
      curve.setAttribute('fill', 'none');
      svg.append(curve);
      const last = result.points.at(-1);
      if (last) {
        const marker = document.createElementNS(ns, 'circle');
        marker.setAttribute('cx', String(last.projected.x));
        marker.setAttribute('cy', String(-last.projected.y));
        marker.setAttribute('r', '.035');
        marker.setAttribute('fill', '#9a3412');
        svg.append(marker);
      }
      plot.replaceChildren(svg);
      status.textContent = `${axes.map((a) => a.control.selectedOptions[0]?.textContent).join(' / ')} · ${result.retained}/${result.sourceSamples}점 · 표시에서 제외 ${result.omitted}점`;
      root.dataset.retained = String(result.retained);
      lastSignature = signature;
      lastAt = performance.now();
      error.textContent = '';
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : '위상공간을 그리지 못했습니다.';
      result = undefined;
    }
  }
  const download = createButton(document, {
    label: '3D 위상 좌표·회전 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        update(true);
        const experiment = options.experiment();
        if (!result || !experiment.ok) throw new Error('유효한 현재 실험과 기록이 필요합니다.');
        const text = JSON.stringify(
          {
            schema: 'pendulum-phase-space-3d/v1',
            experiment: experiment.value,
            axes: axes.map((a) => ({
              index: Number(a.control.value),
              label: a.control.selectedOptions[0]!.textContent
            })),
            yawRad: Number(yaw.value),
            pitchRad: Number(pitch.value),
            wrapAngles: wrap.checked,
            ...result
          },
          null,
          2
        );
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        urls.add(url);
        const a = element(document, 'a', '');
        a.href = url;
        a.download = 'pendulum-phase-space-3d.json';
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        }, 1000);
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : '위상공간 파일을 만들지 못했습니다.';
      }
    }
  });
  root.append(download);
  for (const control of [...axes.map((a) => a.control), yaw, pitch, wrap])
    control.addEventListener('input', () => update(true));
  root.addEventListener('toggle', () => update(true));
  return {
    element: root,
    update,
    dispose() {
      disposed = true;
      clearTimeout(pending);
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
