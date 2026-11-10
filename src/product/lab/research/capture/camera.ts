import {
  VideoMarkerCaptureController,
  type VideoMarkerCaptureDependencies,
  type VideoMarkerCaptureOptions
} from '../../../../browser/videoMarkerCapture';
import { validateTrackingSpec } from '../../../observations/video';
import { LIVE_CAPTURE_LIMITS, type CaptureCallbacks, type LiveCaptureSession } from './contracts';

export function createCameraSession(
  options: Pick<VideoMarkerCaptureOptions, 'video' | 'canvas' | 'tracking' | 'calibration'>,
  callbacks: CaptureCallbacks,
  dependencies: Partial<VideoMarkerCaptureDependencies> = {}
): LiveCaptureSession {
  validateTrackingSpec(options.tracking);
  const calibration = options.calibration;
  if (
    calibration?.pixelsPerMeter !== undefined &&
    (!Number.isFinite(calibration.pixelsPerMeter) || calibration.pixelsPerMeter <= 0)
  )
    throw new Error('카메라 길이 보정은 양의 pixel/m 값이어야 합니다.');
  let active = false,
    launched = false,
    valid = false,
    streamingStarted = false,
    count = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const getMedia = dependencies.getUserMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
  const request = dependencies.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancel = dependencies.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function deadline() {
    clearTimer();
    timer = setTimeout(() => finish('30초 상한에 도달해 카메라와 권한 대기를 중지했습니다.'), 30000);
  }
  function finish(message: string) {
    if (!active) return;
    active = false;
    clearTimer();
    controller.stop();
    callbacks.onState('stopped', `${message} ${count}표본을 보존했습니다.`);
  }
  const controller = new VideoMarkerCaptureController({
    ...options,
    constraints: {
      video: { facingMode: 'environment', width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 } },
      audio: false
    },
    dependencies: {
      secureContext: dependencies.secureContext ?? (typeof window !== 'undefined' && window.isSecureContext),
      now: dependencies.now ?? (() => performance.now()),
      getUserMedia: async (constraints) => {
        const stream = await getMedia(constraints);
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error('취소한 권한 요청의 카메라를 즉시 해제했습니다.');
        }
        return stream;
      },
      requestFrame: (callback) => {
        if (!active) return 0;
        if (
          options.canvas.width > LIVE_CAPTURE_LIMITS.cameraWidth ||
          options.canvas.height > LIVE_CAPTURE_LIMITS.cameraHeight ||
          options.canvas.width < 1 ||
          options.canvas.height < 1
        )
          throw new Error('카메라 해상도가 640×480 pixel 상한을 초과했습니다. 낮은 해상도를 사용하세요.');
        return request((time) => {
          if (active) callback(time);
        });
      },
      cancelFrame: cancel
    },
    onStateChange: (state, message) => {
      if (!active) return;
      if (state === 'streaming' && !streamingStarted) {
        streamingStarted = true;
        deadline();
      }
      callbacks.onState(state, message);
    },
    onSample: () => {
      if (!active) return;
      callbacks.onCount(++count);
      if (count >= LIVE_CAPTURE_LIMITS.cameraSamples) finish('256표본 상한에 도달했습니다.');
    }
  });
  return {
    async start() {
      if (launched) throw new Error('새 카메라 기록은 새 채집 세션에서 시작하세요.');
      launched = true;
      active = true;
      deadline();
      const started = await controller.start();
      if (!active) {
        controller.stop();
        return false;
      }
      if (!started) {
        active = false;
        clearTimer();
        return false;
      }
      valid = true;
      return true;
    },
    stop() {
      finish('카메라 채집을 중지했습니다.');
    },
    bundle() {
      if (active || !valid || count < 2) throw new Error('채집을 중지하고 추적한 표본 2개 이상을 확인하세요.');
      return { source: 'native-camera-markers', ...controller.exportBundle() };
    },
    dispose() {
      active = false;
      clearTimer();
      controller.cleanup();
      valid = false;
    }
  };
}
