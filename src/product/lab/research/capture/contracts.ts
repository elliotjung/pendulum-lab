import type { ImuCaptureMetadata, ImuAxis } from '../../../../browser/imuMotionCapture';
import type { VideoMarkerCaptureMetadata } from '../../../../browser/videoMarkerCapture';

export const LIVE_CAPTURE_LIMITS = Object.freeze({
  seconds: 30,
  imuSamples: 4096,
  cameraSamples: 256,
  cameraWidth: 640,
  cameraHeight: 480
});

export type CaptureState =
  'idle' | 'requesting' | 'streaming' | 'tracking-lost' | 'denied' | 'unsupported' | 'stopped' | 'error';
export interface CaptureCallbacks {
  onState(state: CaptureState, message: string): void;
  onCount(count: number): void;
}
export type NativeCaptureBundle =
  | { source: 'native-imu'; metadata: ImuCaptureMetadata; csv: string }
  | { source: 'native-camera-markers'; metadata: VideoMarkerCaptureMetadata; csv: string };
export interface LiveCaptureSession {
  start(): Promise<boolean>;
  stop(): void;
  dispose(): void;
  bundle(): NativeCaptureBundle;
  calibrate?(): Promise<boolean>;
}
export interface ImuSettings {
  axis: ImuAxis;
  axisDirection: 1 | -1;
}
