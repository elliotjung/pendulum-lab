import { previewObservationImport } from '../../../observations';
import { LIVE_CAPTURE_LIMITS, type NativeCaptureBundle } from './contracts';

/** Keep the native CSV and metadata exact; camera frames themselves are never recorded. */
export function previewLiveCapture(bundle: NativeCaptureBundle) {
  return previewObservationImport({
    text: bundle.csv,
    name: `${bundle.source}.csv`,
    kind: 'sensor',
    mapping:
      bundle.source === 'native-imu'
        ? { time: 'time', theta1: 'angle' }
        : { time: 'time', theta1: 'theta1', theta2: 'theta2' },
    options: { timeUnit: 's', angleUnit: 'rad', missing: 'reject' },
    capture: {
      schema: 'pendulum-product-live-capture/v1',
      source: bundle.source,
      nativeMetadata: bundle.metadata,
      units:
        bundle.source === 'native-imu'
          ? { time: 's', angle: 'rad', angularVelocity: 'rad/s', angularAcceleration: 'rad/s^2' }
          : { time: 's', angle: 'rad' },
      limits: LIVE_CAPTURE_LIMITS,
      originalVideoRecorded: false,
      timeOrigin:
        bundle.source === 'native-imu' ? 'first-accepted-DeviceMotion-event' : 'first-successfully-tracked-frame',
      limitations:
        bundle.source === 'native-imu'
          ? 'Accelerometer inclination is a single device axis, not two pendulum joint angles. Dynamic acceleration can bias inclination.'
          : 'Native two-colour marker tracking; derived CSV and calibration retained. Camera frames and audio are not recorded.'
    }
  });
}
