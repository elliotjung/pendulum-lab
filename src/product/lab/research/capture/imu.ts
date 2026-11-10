import { ImuMotionCaptureController, type ImuMotionCaptureDependencies } from '../../../../browser/imuMotionCapture';
import { LIVE_CAPTURE_LIMITS, type CaptureCallbacks, type ImuSettings, type LiveCaptureSession } from './contracts';

/** The native collector owns the measurements; this adapter bounds and cancels its lifetime. */
export function createImuSession(
  settings: ImuSettings,
  callbacks: CaptureCallbacks,
  dependencies: Partial<ImuMotionCaptureDependencies> = {}
): LiveCaptureSession {
  if (!['beta', 'gamma'].includes(settings.axis) || ![1, -1].includes(settings.axisDirection))
    throw new Error('IMU 축과 회전 방향을 확인하세요.');
  let active = false,
    launched = false,
    valid = false,
    count = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const eventType: ImuMotionCaptureDependencies['deviceMotionEvent'] =
    dependencies.deviceMotionEvent ?? (typeof DeviceMotionEvent === 'undefined' ? undefined : DeviceMotionEvent);
  const add =
    dependencies.addListener ??
    ((listener) => {
      if (typeof window !== 'undefined') window.addEventListener('devicemotion', listener);
    });
  const remove =
    dependencies.removeListener ??
    ((listener) => {
      if (typeof window !== 'undefined') window.removeEventListener('devicemotion', listener);
    });
  const permissionType = eventType
    ? (Object.assign(function DeviceMotionPermissionAdapter() {}, {
        ...(eventType.requestPermission
          ? {
              requestPermission: async () => {
                const granted = await eventType.requestPermission!();
                return active ? granted : 'denied';
              }
            }
          : {})
      }) as unknown as ImuMotionCaptureDependencies['deviceMotionEvent'])
    : undefined;
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function deadline() {
    clearTimer();
    timer = setTimeout(() => finish('30초 상한에 도달해 센서와 권한 대기를 중지했습니다.'), 30000);
  }
  function finish(message: string) {
    if (!active) return;
    active = false;
    clearTimer();
    controller.stop();
    callbacks.onState('stopped', `${message} ${count}표본을 보존했습니다.`);
  }
  const controller = new ImuMotionCaptureController({
    ...settings,
    dependencies: {
      secureContext: dependencies.secureContext ?? (typeof window !== 'undefined' && window.isSecureContext),
      deviceMotionEvent: permissionType,
      addListener: (listener) => {
        if (active) add(listener);
      },
      removeListener: remove
    },
    onStateChange: (state, message) => {
      if (!active || state === 'stopped') return;
      if (state === 'streaming') deadline();
      callbacks.onState(state, message);
    },
    onSample: () => {
      if (!active) return;
      callbacks.onCount(++count);
      if (count >= LIVE_CAPTURE_LIMITS.imuSamples) finish('4096표본 상한에 도달했습니다.');
    }
  });
  async function begin() {
    active = true;
    valid = false;
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
    count = 0;
    callbacks.onCount(count);
    return true;
  }
  return {
    async start() {
      if (launched) throw new Error('새 센서 기록은 새 채집 세션에서 시작하세요.');
      launched = true;
      return begin();
    },
    async calibrate() {
      if (!active || controller.state !== 'streaming' || count < 1)
        throw new Error('센서 표본을 먼저 받은 뒤 기기를 정지시키고 보정하세요.');
      valid = false;
      controller.calibrate();
      controller.calibrateAngularVelocityBias(32);
      controller.stop();
      // Native start resets old samples while retaining its calibrated zero and bias.
      return begin();
    },
    stop() {
      finish('센서 채집을 중지했습니다.');
    },
    bundle() {
      if (active || !valid || count < 2) throw new Error('채집을 중지하고 유효한 표본 2개 이상을 확인하세요.');
      return { source: 'native-imu', ...controller.exportBundle() };
    },
    dispose() {
      active = false;
      clearTimer();
      controller.cleanup();
      valid = false;
    }
  };
}
