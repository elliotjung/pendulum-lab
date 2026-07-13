import {
  trackDoublePendulumFrame,
  type DoubleMarkerTrackingSpec,
  type TrackedDoublePendulumFrame
} from '../research/videoTracking';
import type { DoublePendulumObservation } from '../research/parameterEstimation';

export type VideoMarkerCaptureState = 'idle' | 'requesting' | 'streaming' | 'denied' | 'unsupported' | 'stopped' | 'error';

export interface VideoMarkerSample extends TrackedDoublePendulumFrame {
  /** Monotonic seconds since capture started. */
  timestamp: number;
}

export interface VideoMarkerCaptureDependencies {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
  secureContext: boolean;
}

export interface VideoMarkerCaptureOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  tracking: DoubleMarkerTrackingSpec;
  constraints?: MediaStreamConstraints;
  dependencies?: Partial<VideoMarkerCaptureDependencies>;
  onSample?: (sample: VideoMarkerSample) => void;
  onStateChange?: (state: VideoMarkerCaptureState, message: string) => void;
}

function browserDependencies(): VideoMarkerCaptureDependencies {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    now: () => performance.now(),
    secureContext: typeof window !== 'undefined' && window.isSecureContext
  };
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Permission-aware webcam controller for two-colour double-pendulum tracking.
 * The controller owns every acquired track and always releases it from stop(),
 * start() failure, or page cleanup.
 */
export class VideoMarkerCaptureController {
  private readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tracking: DoubleMarkerTrackingSpec;
  private readonly constraints: MediaStreamConstraints;
  private readonly dependencies: VideoMarkerCaptureDependencies;
  private readonly onSample: ((sample: VideoMarkerSample) => void) | undefined;
  private readonly onStateChange: ((state: VideoMarkerCaptureState, message: string) => void) | undefined;
  private stream: MediaStream | null = null;
  private frameHandle: number | null = null;
  private startedAt = 0;
  private samples: VideoMarkerSample[] = [];
  state: VideoMarkerCaptureState = 'idle';

  constructor(options: VideoMarkerCaptureOptions) {
    this.video = options.video;
    this.canvas = options.canvas;
    this.tracking = options.tracking;
    this.constraints = options.constraints ?? { video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
    const defaults = browserDependencies();
    this.dependencies = { ...defaults, ...options.dependencies };
    this.onSample = options.onSample;
    this.onStateChange = options.onStateChange;
  }

  private setState(state: VideoMarkerCaptureState, message: string): void {
    this.state = state;
    this.onStateChange?.(state, message);
  }

  async start(): Promise<boolean> {
    if (this.state === 'requesting' || this.state === 'streaming') return true;
    if (!this.dependencies.secureContext) {
      this.setState('unsupported', 'Camera capture requires HTTPS or localhost. Import a recorded CSV instead.');
      return false;
    }
    this.setState('requesting', 'Requesting camera permission…');
    try {
      const stream = await this.dependencies.getUserMedia(this.constraints);
      this.stream = stream;
      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
      }
      this.samples = [];
      this.startedAt = this.dependencies.now();
      this.setState('streaming', 'Camera active; tracking both colour markers.');
      this.scheduleFrame();
      return true;
    } catch (error) {
      stopStream(this.stream);
      this.stream = null;
      this.video.srcObject = null;
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.setState(denied ? 'denied' : 'error', denied
        ? 'Camera permission was denied. Import a recorded CSV instead.'
        : `Camera could not start: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private scheduleFrame(): void {
    this.frameHandle = this.dependencies.requestFrame((timestamp: number) => {
      if (this.state !== 'streaming') return;
      this.captureFrame(timestamp);
      this.scheduleFrame();
    });
  }

  /** Capture one preview frame. Public for deterministic recorded-media tests. */
  captureFrame(timestampMs: number = this.dependencies.now()): VideoMarkerSample | null {
    if (this.state !== 'streaming') return null;
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context || this.canvas.width <= 0 || this.canvas.height <= 0) return null;
    context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const tracked = trackDoublePendulumFrame(frame, this.tracking);
    if (!tracked) return null;
    const elapsed = Math.max(0, (timestampMs - this.startedAt) / 1000);
    const previous = this.samples.at(-1)?.timestamp;
    if (previous !== undefined && elapsed <= previous) return null;
    const sample: VideoMarkerSample = { ...tracked, timestamp: elapsed };
    this.samples.push(sample);
    this.onSample?.(sample);
    return sample;
  }

  observation(): DoublePendulumObservation {
    if (this.samples.length < 2) throw new Error('At least two successfully tracked frames are required.');
    const origin = this.samples[0]!.timestamp;
    return {
      times: this.samples.map((sample) => sample.timestamp - origin),
      angles: this.samples.map((sample) => [sample.angles[0], sample.angles[1]] as const)
    };
  }

  observationCsv(): string {
    const observation = this.observation();
    return [
      'time,theta1,theta2',
      ...observation.times.map((time, index) => `${time.toPrecision(12)},${observation.angles[index]![0].toPrecision(12)},${observation.angles[index]![1].toPrecision(12)}`)
    ].join('\n');
  }

  sampleCount(): number {
    return this.samples.length;
  }

  stop(): void {
    if (this.frameHandle !== null) this.dependencies.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    stopStream(this.stream);
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.setState('stopped', `Camera stopped; ${this.samples.length} tracked frames retained.`);
  }

  cleanup(): void {
    this.stop();
    this.samples = [];
  }
}
