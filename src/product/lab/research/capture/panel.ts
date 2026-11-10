import { element } from '../../../app/dom';
import { createButton } from '../../../design-system/primitives';
import type { ObservationPreview } from '../../../observations/types';
import { numberField, readNumber, selectField, textField } from '../controls';
import { createImuSession } from './imu';
import { createCameraSession } from './camera';
import { previewLiveCapture } from './artifact';
import type { CaptureState, LiveCaptureSession, NativeCaptureBundle } from './contracts';

export function createCapturePanel(document: Document, options: { onPreview(preview: ObservationPreview): void }) {
  const root = element(document, 'div', 'research-output');
  root.dataset.captureState = 'idle';
  const status = element(
    document,
    'p',
    'lab-preview-note',
    '장치를 선택하고 직접 시작하세요. 아직 권한을 요청하지 않았습니다.'
  );
  status.id = 'research-capture-status';
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const countView = element(document, 'p', 'lab-muted', '현재 채집 0표본');
  countView.id = 'research-capture-count';
  const fields = element(document, 'fieldset', 'research-grid');
  fields.append(element(document, 'legend', '', '장치·기록 중 고정되는 보정'));
  const kind = selectField(document, fields, 'capture-kind', '실시간 채집 장치', [
    ['imu', 'DeviceMotion · 단일 기기 축'],
    ['camera', '카메라 · 두 색상 표식']
  ]);
  const imuFields = element(document, 'div', 'research-grid');
  const axis = selectField(document, imuFields, 'capture-axis', 'IMU 회전 축', [
    ['beta', 'beta'],
    ['gamma', 'gamma']
  ]);
  const direction = selectField(document, imuFields, 'capture-direction', 'IMU 양의 회전 방향', [
    ['1', '+1'],
    ['-1', '−1']
  ]);
  const cameraFields = element(document, 'div', 'research-grid');
  const pivotX = numberField(document, cameraFields, 'capture-pivot-x', '실시간 화면 고정점 x (pixel)', 320);
  const pivotY = numberField(document, cameraFields, 'capture-pivot-y', '실시간 화면 고정점 y (pixel)', 40);
  const first = textField(document, cameraFields, 'capture-color-first', '실시간 첫 표식 RGB · #RRGGBB', '#ff0000');
  const second = textField(document, cameraFields, 'capture-color-second', '실시간 둘째 표식 RGB · #RRGGBB', '#00ffff');
  const tolerance = numberField(document, cameraFields, 'capture-tolerance', '실시간 RGB 거리 허용오차', 80);
  const scale = numberField(document, cameraFields, 'capture-scale', '실시간 길이 보정 (pixel/m)', 100);
  cameraFields.hidden = true;
  kind.addEventListener('change', () => {
    imuFields.hidden = kind.value !== 'imu';
    cameraFields.hidden = kind.value !== 'camera';
  });
  fields.append(imuFields, cameraFields);
  const video = element(document, 'video', 'research-video');
  video.setAttribute('aria-label', '허용 후 표시되는 실시간 표식 보정 화면');
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  const canvas = element(document, 'canvas', '');
  canvas.width = 640;
  canvas.height = 480;
  canvas.hidden = true;
  const buttons = element(document, 'div', 'lab-inline-actions');
  const start = createButton(document, { label: '새 채집 시작 · 이전 채집 교체', onClick: () => void begin() });
  const stop = createButton(document, {
    label: '장치 채집 중지 · 권한 대기 취소',
    variant: 'secondary',
    onClick: stopWork
  });
  const calibrate = createButton(document, {
    label: 'IMU 정지 자세 보정 · 이전 표본 제외',
    variant: 'secondary',
    onClick: () => void calibrateImu()
  });
  const preview = createButton(document, { label: '채집 관측 미리보기', onClick: () => void previewCapture() });
  const download = createButton(document, {
    label: '채집 원본 CSV·보정 JSON 다운로드',
    variant: 'secondary',
    onClick: save
  });
  buttons.append(start, stop, calibrate, preview, download);
  root.append(
    element(
      document,
      'p',
      'lab-muted',
      'HTTPS/localhost에서 시작 버튼을 눌러야 장치 권한을 요청합니다. 30초·IMU 4096표본·카메라 256표본·640×480 pixel로 제한하며 중지·숨김·도구 닫기·화면 이동 시 센서와 카메라를 해제합니다. 채집 자료는 이 브라우저 메모리에만 있습니다.'
    ),
    fields,
    video,
    canvas,
    buttons,
    status,
    error,
    countView,
    element(
      document,
      'p',
      'lab-muted',
      '시간은 첫 유효 표본 기준 s, 각도는 rad입니다. IMU는 기기 경사각 한 축이며 동적 가속도 오차가 있고 이중진자의 두 관절각을 대신하지 않습니다. 기본 영점·gyro 편향은 0입니다. 정지 자세 보정은 현재 경사와 최근 최대 32 gyro 표본을 사용하고 이전 표본을 버린 새 기록을 시작합니다. 카메라는 실제 표시된 pixel 좌표·두 색상·길이 배율을 고정하며 y가 아래쪽인 좌표계에서 추적합니다. 가림·조명·가속도와 보정 오차를 확인하세요. 카메라 원본 영상·오디오는 녹화하지 않으며 파생 CSV와 native 메타데이터를 보존합니다. 미리보기 뒤 별도 확정해야 연구 입력으로 채택됩니다.'
    )
  );
  let session: LiveCaptureSession | undefined;
  let retained: NativeCaptureBundle | undefined;
  let state: CaptureState = 'idle';
  let count = 0,
    generation = 0;
  let busy = false,
    pending = false,
    disabled = false,
    disposed = false;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function fail(cause: unknown) {
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : String(cause);
  }
  function update() {
    fields.disabled = disabled || busy || pending;
    start.disabled = disabled || busy || pending;
    stop.disabled = !busy && !pending;
    calibrate.hidden = kind.value !== 'imu';
    calibrate.disabled = disabled || pending || state !== 'streaming' || count < 1;
    preview.disabled = download.disabled = disabled || busy || pending || !retained;
    countView.textContent = `현재 채집 ${count}표본${retained ? ` · 저장 가능한 원본 ${retained.source}` : ''}`;
  }
  const callbacks = {
    onState(next: CaptureState, message: string) {
      if (disposed) return;
      state = next;
      root.dataset.captureState = next;
      busy = ['requesting', 'streaming', 'tracking-lost'].includes(next);
      status.textContent = message;
      if (next === 'stopped') {
        try {
          retained = structuredClone(session!.bundle());
        } catch {
          status.textContent += ' 새 미리보기에는 유효한 표본 2개 이상이 필요합니다. 이전 저장 원본은 보존합니다.';
        }
      }
      update();
    },
    onCount(value: number) {
      if (!disposed) {
        count = value;
        update();
      }
    }
  };
  function color(input: HTMLInputElement) {
    if (!/^#[0-9a-f]{6}$/i.test(input.value)) throw new Error('표식 색상은 #RRGGBB로 입력하세요.');
    return {
      red: parseInt(input.value.slice(1, 3), 16),
      green: parseInt(input.value.slice(3, 5), 16),
      blue: parseInt(input.value.slice(5, 7), 16),
      tolerance: readNumber(tolerance),
      minPixels: 2
    };
  }
  async function begin() {
    if (disposed || disabled || busy || pending) return;
    session?.dispose();
    const current = ++generation;
    error.hidden = true;
    try {
      session =
        kind.value === 'imu'
          ? createImuSession(
              { axis: axis.value as 'beta' | 'gamma', axisDirection: Number(direction.value) as 1 | -1 },
              callbacks
            )
          : createCameraSession(
              {
                video,
                canvas,
                tracking: {
                  pivot: { x: readNumber(pivotX), y: readNumber(pivotY) },
                  first: color(first),
                  second: color(second),
                  yAxis: 'down'
                },
                calibration: {
                  pixelsPerMeter: readNumber(scale),
                  note: 'User-entered pixel/m; native angular tracking does not fit rod lengths.'
                }
              },
              callbacks
            );
      video.hidden = kind.value !== 'camera';
      pending = true;
      count = 0;
      update();
      await session.start();
    } catch (cause) {
      if (!disposed && current === generation) {
        busy = false;
        fail(cause);
      }
    } finally {
      if (!disposed && current === generation) {
        pending = false;
        update();
      }
    }
  }
  function stopWork() {
    generation++;
    pending = false;
    session?.stop();
    busy = false;
    update();
  }
  async function calibrateImu() {
    if (disposed || disabled || pending || !session?.calibrate) return;
    const current = ++generation;
    pending = true;
    error.hidden = true;
    update();
    try {
      await session.calibrate();
    } catch (cause) {
      if (!disposed && current === generation) fail(cause);
    } finally {
      if (!disposed && current === generation) {
        pending = false;
        update();
      }
    }
  }
  async function previewCapture() {
    if (disposed || disabled || busy || pending || !retained) return;
    const current = ++generation;
    pending = true;
    error.hidden = true;
    update();
    try {
      const next = await previewLiveCapture(structuredClone(retained));
      if (!disposed && current === generation) {
        options.onPreview(next);
        status.textContent = '기존 관측 미리보기로 보냈습니다. 원본·보정·시간축 확인 후 가져오기 확정을 누르세요.';
      }
    } catch (cause) {
      if (!disposed && current === generation) fail(cause);
    } finally {
      if (!disposed && current === generation) {
        pending = false;
        update();
      }
    }
  }
  function save() {
    if (!retained || disabled || busy || pending || disposed) return;
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(retained, null, 2)], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-${retained.source}-original.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
    } catch (cause) {
      fail(cause);
    }
  }
  function visibility() {
    if (document.hidden) stopWork();
  }
  document.addEventListener('visibilitychange', visibility);
  kind.addEventListener('change', update);
  update();
  return {
    element: root,
    stop: stopWork,
    setDisabled(value: boolean) {
      disabled = value;
      if (disabled) stopWork();
      update();
    },
    dispose() {
      disposed = true;
      generation++;
      session?.dispose();
      document.removeEventListener('visibilitychange', visibility);
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
