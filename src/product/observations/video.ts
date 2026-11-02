import { trackDoublePendulumFrame, type DoubleMarkerTrackingSpec } from '../../research/videoTracking';
import { previewObservationImport } from './artifact';
import { OBSERVATION_LIMITS, type ObservationImportOptions, type ObservationPreview } from './types';

export interface RecordedVideoOptions {
  sampleCount: number;
  transform?: Partial<ObservationImportOptions>;
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('영상 가져오기를 취소했습니다.', 'AbortError');
}

/** Browser event wait with cancellation and a finite inactivity limit; all listeners are released. */
function mediaEvent(video: HTMLVideoElement, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const clear = () => {
      clearTimeout(timer);
      video.removeEventListener(event, success);
      video.removeEventListener('error', failure);
      signal?.removeEventListener('abort', cancel);
    };
    const success = () => {
      clear();
      resolve();
    };
    const failure = () => {
      clear();
      reject(new Error('이 브라우저가 영상을 해독하지 못했습니다. mp4/webm/ogg 형식과 코덱을 확인하세요.'));
    };
    const cancel = () => {
      clear();
      reject(new DOMException('영상 가져오기를 취소했습니다.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      clear();
      reject(new Error('영상 응답이 10초 동안 없어 가져오기를 중단했습니다.'));
    }, 10000);
    video.addEventListener(event, success, { once: true });
    video.addEventListener('error', failure, { once: true });
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

export function validateTrackingSpec(spec: DoubleMarkerTrackingSpec): void {
  if (
    !spec ||
    !spec.pivot ||
    !Number.isFinite(spec.pivot.x) ||
    !Number.isFinite(spec.pivot.y) ||
    Math.abs(spec.pivot.x) > 100000 ||
    Math.abs(spec.pivot.y) > 100000 ||
    (spec.yAxis !== undefined && spec.yAxis !== 'up' && spec.yAxis !== 'down')
  )
    throw new Error('영상 원점 또는 좌표 방향을 확인하세요.');
  for (const target of [spec.first, spec.second]) {
    if (
      !target ||
      [target.red, target.green, target.blue].some((v) => !Number.isFinite(v) || v < 0 || v > 255) ||
      !(target.tolerance > 0 && target.tolerance <= Math.sqrt(3) * 255) ||
      (target.minAlpha !== undefined &&
        (!Number.isFinite(target.minAlpha) || target.minAlpha < 0 || target.minAlpha > 255)) ||
      (target.minPixels !== undefined &&
        (!Number.isInteger(target.minPixels) ||
          target.minPixels < 1 ||
          target.minPixels > OBSERVATION_LIMITS.videoPixels))
    )
      throw new Error('영상 마커 색상·허용 거리·최소 픽셀 수를 확인하세요.');
  }
  if (
    Math.hypot(
      spec.first.red - spec.second.red,
      spec.first.green - spec.second.green,
      spec.first.blue - spec.second.blue
    ) <=
    spec.first.tolerance + spec.second.tolerance
  )
    throw new Error('두 색상 마커의 허용 영역이 겹칩니다. 서로 구별되는 색을 선택하세요.');
}

export function videoBytesBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return btoa(binary);
}

function videoSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'video/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mime === 'video/ogg') return new TextDecoder().decode(bytes.subarray(0, 4)) === 'OggS';
  return new TextDecoder().decode(bytes.subarray(4, 8)) === 'ftyp';
}

/** Two-colour markers only. No automatic body detection, physical-length inference or remote upload. */
export async function previewRecordedVideo(
  file: File,
  tracking: DoubleMarkerTrackingSpec,
  options: RecordedVideoOptions,
  signal?: AbortSignal,
  onProgress?: (fraction: number) => void
): Promise<ObservationPreview> {
  aborted(signal);
  validateTrackingSpec(tracking);
  if (
    !Number.isInteger(options.sampleCount) ||
    options.sampleCount < 2 ||
    options.sampleCount > OBSERVATION_LIMITS.videoFrames
  )
    throw new Error('영상 표본 수는 2~256 사이의 정수여야 합니다.');
  if (
    file.size < 8 ||
    file.size > OBSERVATION_LIMITS.mediaBytes ||
    !['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'].includes(file.type)
  )
    throw new Error('영상은 8 MiB 이하의 mp4/webm/ogg/quicktime 파일이어야 합니다.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  aborted(signal);
  if (!videoSignature(bytes, file.type)) throw new Error('영상의 실제 파일 서명이 MIME 형식과 다릅니다.');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  const start = performance.now();
  try {
    const metadata = mediaEvent(video, 'loadedmetadata', signal);
    video.src = url;
    video.load();
    await metadata;
    if (!(video.duration > 0 && video.duration <= 60))
      throw new Error('유한한 60초 이하의 영상과 유효한 화면 크기가 필요합니다.');
    if (
      !Number.isSafeInteger(video.videoWidth) ||
      !Number.isSafeInteger(video.videoHeight) ||
      video.videoWidth < 1 ||
      video.videoHeight < 1 ||
      video.videoWidth > OBSERVATION_LIMITS.videoSourceEdge ||
      video.videoHeight > OBSERVATION_LIMITS.videoSourceEdge ||
      video.videoWidth * video.videoHeight > OBSERVATION_LIMITS.videoSourcePixels
    )
      throw new Error(
        '원본 영상은 8 Mi pixel 이하이며 각 변은 최대 8192 pixel이어야 합니다. 먼저 낮은 해상도로 변환하세요.'
      );
    const factor = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
    canvas.width = Math.max(1, Math.floor(video.videoWidth * factor));
    canvas.height = Math.max(1, Math.floor(video.videoHeight * factor));
    if (canvas.width * canvas.height * options.sampleCount > OBSERVATION_LIMITS.videoPixelWork)
      throw new Error('영상 표본·해상도 작업량이 24 Mi pixel 제한을 넘습니다. 표본 수를 줄이세요.');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('이 브라우저에서 영상 픽셀 읽기를 사용할 수 없습니다.');
    if (video.readyState < 2) await mediaEvent(video, 'loadeddata', signal);
    // Chromium can report loadeddata at t=0 before presenting the decoded first frame.
    // Prime presentation with an in-range seek, then return to the actual t=0 sample.
    // Both waits keep the existing timeout/cancellation cleanup; no sample is dropped or shifted.
    const primeTime = Math.min(0.001, video.duration / 2);
    if (!(primeTime > 0)) throw new Error('영상 길이가 유효한 첫 프레임 추출에 너무 짧습니다.');
    for (const time of [primeTime, 0]) {
      aborted(signal);
      const seeked = mediaEvent(video, 'seeked', signal);
      video.currentTime = time;
      await seeked;
    }
    const rows = ['time,x1,y1,x2,y2'];
    let missedFrames = 0;
    for (let index = 0; index < options.sampleCount; index += 1) {
      aborted(signal);
      if (performance.now() - start > 120000) throw new Error('영상 추출의 120초 실행 제한을 초과했습니다.');
      const time = (index / (options.sampleCount - 1)) * Math.max(0, video.duration - 0.001);
      if (Math.abs(video.currentTime - time) > 1e-8) {
        const seeked = mediaEvent(video, 'seeked', signal);
        video.currentTime = time;
        await seeked;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const result = trackDoublePendulumFrame(context.getImageData(0, 0, canvas.width, canvas.height), tracking);
      if (
        result &&
        Math.hypot(result.first.x - tracking.pivot.x, result.first.y - tracking.pivot.y) > 0 &&
        Math.hypot(result.second.x - result.first.x, result.second.y - result.first.y) > 0
      ) {
        rows.push(`${time},${result.first.x},${result.first.y},${result.second.x},${result.second.y}`);
      } else {
        rows.push(`${time},,,,`);
        missedFrames += 1;
      }
      onProgress?.((index + 1) / options.sampleCount);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    aborted(signal);
    return await previewObservationImport({
      name: file.name,
      kind: 'video',
      text: rows.join('\n'),
      mapping: { time: 'time', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2' },
      options: {
        ...options.transform,
        timeUnit: 's',
        coordinateUnit: 'px',
        pivot: { ...tracking.pivot },
        yAxis: tracking.yAxis ?? 'down'
      },
      media: { name: file.name, mime: file.type, base64: videoBytesBase64(bytes) },
      capture: {
        algorithm: 'native-colorMarkerCentroid/v1',
        tracking: JSON.parse(JSON.stringify(tracking)) as Record<string, unknown>,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        width: canvas.width,
        height: canvas.height,
        coordinateFrame: 'sampled-canvas-pixels',
        durationSeconds: video.duration,
        sampleCount: options.sampleCount,
        missedFrames
      }
    });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
