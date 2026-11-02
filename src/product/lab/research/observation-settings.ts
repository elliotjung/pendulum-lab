import { element } from '../../app/dom';
import { createInput } from '../../design-system/primitives';
import { previewObservationImport, previewRecordedVideo } from '../../observations';
import { OBSERVATION_LIMITS } from '../../observations/types';
import { numberField, readNumber, selectField, textField } from './controls';

export function createObservationSettings(document: Document, changed: () => void) {
  const root = element(document, 'fieldset', 'research-import');
  root.append(element(document, 'legend', '', '1. 원본과 변환 조건'));
  const kind = selectField(document, root, 'source-kind', '관측 원본 유형', [
    ['csv', 'CSV 관측'],
    ['sensor', '센서 CSV'],
    ['video', '녹화 영상 · 두 색상 표식']
  ]);
  const fileLabel = element(document, 'label', 'ds-field__label', '관측 원본 파일');
  const file = element(document, 'input', 'ds-field__control');
  file.type = 'file';
  file.id = 'research-source-file';
  fileLabel.htmlFor = file.id;
  file.accept = '.csv,.txt,text/csv,text/plain';
  const rawLabel = element(document, 'label', 'ds-field__label', '붙여넣을 CSV 원본');
  const raw = element(document, 'textarea', 'ds-field__control');
  raw.id = 'research-source-text';
  rawLabel.htmlFor = raw.id;
  raw.placeholder = 'time,theta1,theta2\n0,0.2,0.3\n0.1,0.18,0.28';
  raw.spellcheck = false;
  const note = element(
    document,
    'p',
    'lab-preview-note',
    '파일을 선택하면 붙여넣기보다 우선합니다. 두 각도는 각 막대와 아래쪽 수직선 사이의 절대각입니다. 실제 길이·중력·초기 각속도는 실험 조건에서 별도로 정하세요. 원본은 외부로 전송하지 않습니다.'
  );
  root.append(fileLabel, file, rawLabel, raw, note);
  const mapping = element(document, 'div', 'research-grid');
  const representation = selectField(document, mapping, 'representation', 'CSV 관측 좌표 표현', [
    ['angles', '두 막대의 절대각'],
    ['coordinates', '두 표식의 x/y 위치']
  ]);
  const time = textField(document, mapping, 'time-column', '시간 열 이름', 'time');
  const first = textField(document, mapping, 'first-column', '첫 각도 열 이름', 'theta1');
  const second = textField(document, mapping, 'second-column', '둘째 각도 열 이름 · 없으면 비우기', 'theta2');
  const coordinates = element(document, 'fieldset', 'research-grid');
  coordinates.append(element(document, 'legend', '', '좌표 열과 고정점 보정'));
  const x1 = textField(document, coordinates, 'x1-column', '첫 표식 가로 열 이름', 'x1');
  const y1 = textField(document, coordinates, 'y1-column', '첫 표식 세로 열 이름', 'y1');
  const x2 = textField(document, coordinates, 'x2-column', '둘째 표식 가로 열 이름', 'x2');
  const y2 = textField(document, coordinates, 'y2-column', '둘째 표식 세로 열 이름', 'y2');
  const coordinateUnit = selectField(document, coordinates, 'coordinate-unit', '원본 위치 단위', [
    ['px', 'pixel'],
    ['m', '미터 (m)'],
    ['cm', '센티미터 (cm)']
  ]);
  const pixelsPerMeter = numberField(
    document,
    coordinates,
    'pixels-per-meter',
    '영상 위치 보정 (pixel/m)',
    100,
    'pixel 좌표에서만 사용합니다. 각도는 벡터 방향에서 계산하며 실제 막대 길이를 추정하지 않습니다.'
  );
  const pivotX = numberField(document, coordinates, 'coordinate-pivot-x', '고정점 가로 좌표 · 원본 위치 단위', 0);
  const pivotY = numberField(document, coordinates, 'coordinate-pivot-y', '고정점 세로 좌표 · 원본 위치 단위', 0);
  const yAxis = selectField(document, coordinates, 'y-axis', '원본 세로축 방향', [
    ['down', '아래쪽 양수 · 영상 좌표'],
    ['up', '위쪽 양수 · Cartesian 좌표']
  ]);
  coordinates.hidden = true;
  mapping.append(coordinates);
  root.append(mapping);
  const transforms = element(document, 'details', 'lab-details');
  transforms.append(element(document, 'summary', '', '단위 · 보정 · 시간 정렬 · 결측값'));
  const grid = element(document, 'div', 'research-grid');
  const timeUnit = selectField(document, grid, 'time-unit', '원본 시간 단위', [
    ['s', '초 (s)'],
    ['ms', '밀리초 (ms)']
  ]);
  const angleUnit = selectField(document, grid, 'angle-unit', '원본 각도 단위', [
    ['rad', '라디안 (rad)'],
    ['deg', '도 (°)']
  ]);
  const timeScale = numberField(
    document,
    grid,
    'time-scale',
    '시간 보정 배율',
    1,
    '단위 변환 후 t′ = 배율 × t + 이동. 배율 > 0.'
  );
  const timeOffset = numberField(document, grid, 'time-offset', '시간축 이동 (s)', 0);
  const firstScale = numberField(document, grid, 'first-scale', '첫 각도 보정 배율', 1);
  const secondScale = numberField(document, grid, 'second-scale', '둘째 각도 보정 배율', 1);
  const firstOffset = numberField(document, grid, 'first-offset', '첫 각도 영점 이동 (rad)', 0);
  const secondOffset = numberField(document, grid, 'second-offset', '둘째 각도 영점 이동 (rad)', 0);
  const missing = selectField(document, grid, 'missing', '결측값 처리', [
    ['reject', '거부 · 원본 보존'],
    ['drop', '결측 행 제외'],
    ['interpolate', '시간 선형 보간 · 최대 간격 제한']
  ]);
  const gap = numberField(
    document,
    grid,
    'max-gap',
    '보간 가능한 최대 시간 간격 (s)',
    0.5,
    '양 끝 관측값이 있어야 합니다. 빠른 회전의 각도 wrap은 자동으로 풀지 않습니다.'
  );
  transforms.append(grid);
  root.append(transforms);
  const video = element(document, 'fieldset', 'research-grid');
  video.append(element(document, 'legend', '', '영상 표식 설정'));
  const x = numberField(document, video, 'pivot-x', '축소 추출 화면의 고정점 가로 좌표 (pixel)', 320);
  const y = numberField(document, video, 'pivot-y', '축소 추출 화면의 고정점 세로 좌표 (pixel)', 40);
  const color1 = createInput(document, {
    id: 'research-color-first',
    label: '첫 표식 RGB · #RRGGBB',
    value: '#ff0000'
  });
  const color2 = createInput(document, {
    id: 'research-color-second',
    label: '둘째 표식 RGB · #RRGGBB',
    value: '#00ffff'
  });
  video.append(color1.element, color2.element);
  const tolerance = numberField(document, video, 'color-tolerance', 'RGB 거리 허용오차', 80);
  const frames = numberField(document, video, 'video-samples', '영상 추출 프레임 수', 24);
  const videoPreview = element(document, 'video', 'research-video');
  videoPreview.controls = true;
  videoPreview.preload = 'metadata';
  videoPreview.muted = true;
  videoPreview.playsInline = true;
  videoPreview.setAttribute('aria-label', '고정점 보정을 위한 로컬 영상 미리보기');
  const dimensions = element(
    document,
    'p',
    'lab-preview-note',
    '영상을 선택하면 원본 크기와 추출 화면 크기를 표시합니다. 고정점은 추출 화면의 pixel 좌표로 입력하세요.'
  );
  let videoUrl: string | undefined;
  videoPreview.addEventListener('loadedmetadata', () => {
    const widthValue = videoPreview.videoWidth,
      heightValue = videoPreview.videoHeight;
    if (
      ![widthValue, heightValue].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= OBSERVATION_LIMITS.videoSourceEdge
      ) ||
      widthValue * heightValue > OBSERVATION_LIMITS.videoSourcePixels
    ) {
      dimensions.textContent =
        '원본 영상은 한 변 8192 pixel · 전체 8 Mi pixel 이하여야 합니다. 해상도를 줄여 다시 가져오세요.';
      releaseVideo();
      return;
    }
    const factor = Math.min(1, 640 / videoPreview.videoWidth, 480 / videoPreview.videoHeight);
    const width = Math.max(1, Math.floor(videoPreview.videoWidth * factor));
    const height = Math.max(1, Math.floor(videoPreview.videoHeight * factor));
    dimensions.textContent = `원본 ${videoPreview.videoWidth}×${videoPreview.videoHeight} pixel → 추출 ${width}×${height} pixel. 고정점은 추출 화면 좌표를 입력하세요. 원본 좌표에 배율 ${factor.toPrecision(5)}를 곱합니다.`;
  });
  function releaseVideo() {
    videoPreview.pause();
    videoPreview.removeAttribute('src');
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = undefined;
  }
  file.addEventListener('change', () => {
    releaseVideo();
    const selected = file.files?.[0];
    if (kind.value !== 'video' || !selected || selected.size > OBSERVATION_LIMITS.mediaBytes) return;
    videoUrl = URL.createObjectURL(selected);
    videoPreview.src = videoUrl;
  });
  video.append(
    dimensions,
    videoPreview,
    element(
      document,
      'p',
      'lab-muted',
      '지원되는 로컬 영상에서 일정한 시간 간격으로 두 표식의 중심을 추적합니다. 추출 화면은 비율을 유지하며 최대 640×480 pixel입니다. 영상 좌표 y는 아래쪽이 양수입니다. 가림·코덱 미지원·표식 손실은 미리보기 오류로 보고합니다. RGB와 고정점은 실제 촬영 환경에 맞추세요.'
    )
  );
  video.hidden = true;
  root.append(video);
  function color(text: string) {
    if (!/^#[0-9a-f]{6}$/i.test(text)) throw new Error('표식 색상은 #RRGGBB로 입력하세요.');
    return {
      red: parseInt(text.slice(1, 3), 16),
      green: parseInt(text.slice(3, 5), 16),
      blue: parseInt(text.slice(5, 7), 16),
      tolerance: readNumber(tolerance),
      minPixels: 2
    };
  }
  function options() {
    return {
      timeUnit: timeUnit.value as 's' | 'ms',
      angleUnit: angleUnit.value as 'rad' | 'deg',
      timeScale: readNumber(timeScale),
      timeOffset: readNumber(timeOffset),
      angleScale: [readNumber(firstScale), readNumber(secondScale)] as [number, number],
      angleOffset: [readNumber(firstOffset), readNumber(secondOffset)] as [number, number],
      missing: missing.value as 'reject' | 'drop' | 'interpolate',
      maxGapSeconds: readNumber(gap),
      coordinateUnit: coordinateUnit.value as 'px' | 'm' | 'cm',
      pixelsPerMeter: readNumber(pixelsPerMeter),
      pivot: { x: readNumber(pivotX), y: readNumber(pivotY) },
      yAxis: yAxis.value as 'down' | 'up'
    };
  }
  function coordinateVisibility() {
    const positions = representation.value === 'coordinates';
    coordinates.hidden = !positions;
    first.closest<HTMLElement>('.ds-field')!.hidden = second.closest<HTMLElement>('.ds-field')!.hidden = positions;
    angleUnit.disabled = positions || kind.value === 'video';
  }
  representation.addEventListener('change', coordinateVisibility);
  kind.addEventListener('change', () => {
    video.hidden = kind.value !== 'video';
    timeUnit.disabled = kind.value === 'video';
    coordinateVisibility();
    raw.hidden = rawLabel.hidden = mapping.hidden = kind.value === 'video';
    file.accept = kind.value === 'video' ? 'video/*' : '.csv,.txt,text/csv,text/plain';
    file.value = '';
    releaseVideo();
  });
  root.addEventListener('input', changed);
  root.addEventListener('change', changed);
  return {
    element: root,
    dispose: releaseVideo,
    setDisabled(disabled: boolean) {
      root.disabled = disabled;
      timeUnit.disabled = kind.value === 'video';
      coordinateVisibility();
    },
    async preview(signal: AbortSignal, progress: (fraction: number) => void) {
      const selected = file.files?.[0];
      if (kind.value === 'video') {
        if (!selected) throw new Error('녹화 영상 파일을 먼저 선택하세요.');
        return previewRecordedVideo(
          selected,
          {
            pivot: { x: readNumber(x), y: readNumber(y) },
            first: color(color1.input.value),
            second: color(color2.input.value),
            yAxis: 'down'
          },
          { sampleCount: readNumber(frames), transform: options() },
          signal,
          progress
        );
      }
      if (selected && selected.size > OBSERVATION_LIMITS.textBytes)
        throw new Error('관측 CSV 파일은 2 MiB 이하여야 합니다.');
      let text = raw.value;
      if (selected) {
        try {
          text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await selected.arrayBuffer());
        } catch {
          throw new Error('CSV 파일은 올바른 UTF-8 인코딩이어야 합니다. 원본을 보존하고 UTF-8로 내보내세요.');
        }
      }
      if (signal.aborted) throw new Error('미리보기를 취소했습니다.');
      return previewObservationImport({
        text,
        name: selected?.name ?? 'pasted-observations.csv',
        kind: kind.value as 'csv' | 'sensor',
        mapping:
          representation.value === 'coordinates'
            ? { time: time.value, x1: x1.value, y1: y1.value, x2: x2.value, y2: y2.value }
            : { time: time.value, theta1: first.value, ...(second.value ? { theta2: second.value } : {}) },
        options: options()
      });
    }
  };
}
