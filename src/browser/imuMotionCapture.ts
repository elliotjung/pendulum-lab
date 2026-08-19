export type ImuCaptureState = 'idle' | 'requesting' | 'streaming' | 'denied' | 'unsupported' | 'stopped';
export type ImuAxis = 'beta' | 'gamma';

export interface ImuMotionSample {
  timestamp: number;
  /** Accelerometer inclination relative to the most recent calibration. */
  angle: number;
  angularVelocity: number;
  angularAcceleration: number;
}

export interface ImuMotionCaptureDependencies {
  secureContext: boolean;
  deviceMotionEvent:
    (typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }) | undefined;
  addListener: (listener: (event: DeviceMotionEvent) => void) => void;
  removeListener: (listener: (event: DeviceMotionEvent) => void) => void;
}

export interface ImuMotionCaptureOptions {
  axis?: ImuAxis;
  /** Flip the selected device axis to match the experiment's positive rotation. */
  axisDirection?: 1 | -1;
  dependencies?: Partial<ImuMotionCaptureDependencies>;
  onSample?: (sample: ImuMotionSample) => void;
  onStateChange?: (state: ImuCaptureState, message: string) => void;
}

export interface ImuCaptureMetadata {
  schemaVersion: 'pendulum-imu-capture/v1';
  exportedAt: string;
  axis: ImuAxis;
  axisDirection: 1 | -1;
  consentGrantedAt: string | null;
  calibration: { angleOffset: number; angularVelocityBias: number };
  sampling: {
    samples: number;
    rejectedEvents: number;
    meanIntervalSeconds: number | null;
    intervalStdDevSeconds: number | null;
    maxJitterSeconds: number | null;
  };
}

function browserDependencies(): ImuMotionCaptureDependencies {
  const eventType =
    typeof DeviceMotionEvent === 'undefined'
      ? undefined
      : (DeviceMotionEvent as ImuMotionCaptureDependencies['deviceMotionEvent']);
  return {
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
    deviceMotionEvent: eventType,
    addListener: (listener) => window.addEventListener('devicemotion', listener),
    removeListener: (listener) => window.removeEventListener('devicemotion', listener)
  };
}

function inclination(event: DeviceMotionEvent, axis: ImuAxis): number | null {
  const acceleration = event.accelerationIncludingGravity;
  const x = acceleration?.x;
  const y = acceleration?.y;
  const z = acceleration?.z;
  if (x == null || y == null || z == null || ![x, y, z].every(Number.isFinite)) return null;
  return axis === 'beta' ? Math.atan2(y, Math.hypot(x, z)) : Math.atan2(x, Math.hypot(y, z));
}

function angularVelocity(event: DeviceMotionEvent, axis: ImuAxis): number | null {
  const degreesPerSecond = event.rotationRate?.[axis];
  return degreesPerSecond == null || !Number.isFinite(degreesPerSecond) ? null : (degreesPerSecond * Math.PI) / 180;
}

/** DeviceMotion collector with the explicit iOS permission handshake. */
export class ImuMotionCaptureController {
  private readonly axis: ImuAxis;
  private readonly axisDirection: 1 | -1;
  private readonly dependencies: ImuMotionCaptureDependencies;
  private readonly onSample: ((sample: ImuMotionSample) => void) | undefined;
  private readonly onStateChange: ((state: ImuCaptureState, message: string) => void) | undefined;
  private readonly listener = (event: DeviceMotionEvent): void => {
    this.consume(event);
  };
  private samples: ImuMotionSample[] = [];
  private rawAngle = 0;
  private angleOffset = 0;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private lastVelocity: number | null = null;
  private angularVelocityBias = 0;
  private rawVelocities: number[] = [];
  private rejectedEvents = 0;
  private consentGrantedAt: string | null = null;
  state: ImuCaptureState = 'idle';

  constructor(options: ImuMotionCaptureOptions = {}) {
    this.axis = options.axis ?? 'beta';
    this.axisDirection = options.axisDirection ?? 1;
    const defaults = browserDependencies();
    this.dependencies = { ...defaults, ...options.dependencies };
    this.onSample = options.onSample;
    this.onStateChange = options.onStateChange;
  }

  private setState(state: ImuCaptureState, message: string): void {
    this.state = state;
    this.onStateChange?.(state, message);
  }

  async start(): Promise<boolean> {
    if (this.state === 'streaming') return true;
    if (!this.dependencies.secureContext) {
      this.setState('unsupported', 'Motion sensors require HTTPS. You can import an exported sensor CSV instead.');
      return false;
    }
    const eventType = this.dependencies.deviceMotionEvent;
    if (!eventType) {
      this.setState('unsupported', 'DeviceMotion is unavailable on this browser or device.');
      return false;
    }
    this.setState('requesting', 'Requesting motion-sensor permission…');
    if (eventType.requestPermission) {
      try {
        if ((await eventType.requestPermission()) !== 'granted') {
          this.setState('denied', 'Motion-sensor permission was denied. You can import a sensor CSV instead.');
          return false;
        }
      } catch {
        this.setState('denied', 'Motion-sensor permission could not be granted. You can import a sensor CSV instead.');
        return false;
      }
    }
    this.consentGrantedAt = new Date().toISOString();
    this.samples = [];
    this.rawVelocities = [];
    this.rejectedEvents = 0;
    this.firstTimestamp = null;
    this.lastTimestamp = null;
    this.lastVelocity = null;
    this.dependencies.addListener(this.listener);
    this.setState('streaming', `Motion sensor active (${this.axis} axis).`);
    return true;
  }

  /** Zero the displayed inclination at the device's current pose. */
  calibrate(): void {
    this.angleOffset = this.rawAngle;
  }

  /** Estimate stationary gyroscope bias from the most recent raw samples. */
  calibrateAngularVelocityBias(sampleWindow = 32): number {
    if (!Number.isInteger(sampleWindow) || sampleWindow < 1)
      throw new Error('IMU bias calibration window must be a positive integer.');
    const values = this.rawVelocities.slice(-sampleWindow);
    if (values.length === 0) throw new Error('IMU bias calibration requires at least one valid sample.');
    this.angularVelocityBias = values.reduce((sum, value) => sum + value, 0) / values.length;
    this.lastVelocity = null;
    return this.angularVelocityBias;
  }

  /** Consume one event; public so recorded event fixtures can be replayed. */
  consume(event: DeviceMotionEvent): ImuMotionSample | null {
    if (this.state !== 'streaming') return null;
    const angle = inclination(event, this.axis);
    const velocity = angularVelocity(event, this.axis);
    if (angle === null || velocity === null || !Number.isFinite(event.timeStamp)) {
      this.rejectedEvents += 1;
      return null;
    }
    const alignedAngle = this.axisDirection * angle;
    const alignedRawVelocity = this.axisDirection * velocity;
    this.rawAngle = alignedAngle;
    this.firstTimestamp ??= event.timeStamp;
    const timestamp = Math.max(0, (event.timeStamp - this.firstTimestamp) / 1000);
    if (this.lastTimestamp !== null && timestamp <= this.lastTimestamp) {
      this.rejectedEvents += 1;
      return null;
    }
    const correctedVelocity = alignedRawVelocity - this.angularVelocityBias;
    const dt = this.lastTimestamp === null ? null : timestamp - this.lastTimestamp;
    const acceleration = dt && this.lastVelocity !== null ? (correctedVelocity - this.lastVelocity) / dt : 0;
    const sample: ImuMotionSample = {
      timestamp,
      angle: alignedAngle - this.angleOffset,
      angularVelocity: correctedVelocity,
      angularAcceleration: acceleration
    };
    this.samples.push(sample);
    this.rawVelocities.push(alignedRawVelocity);
    if (this.rawVelocities.length > 256) this.rawVelocities.splice(0, this.rawVelocities.length - 256);
    this.lastTimestamp = timestamp;
    this.lastVelocity = correctedVelocity;
    this.onSample?.(sample);
    return sample;
  }

  series(): readonly ImuMotionSample[] {
    return this.samples.map((sample) => ({ ...sample }));
  }

  exportCsv(): string {
    return [
      'time,angle,angular_velocity,angular_acceleration',
      ...this.samples.map((sample) =>
        [sample.timestamp, sample.angle, sample.angularVelocity, sample.angularAcceleration]
          .map((value) => value.toPrecision(12))
          .join(',')
      )
    ].join('\n');
  }

  metadata(): ImuCaptureMetadata {
    const intervals = this.samples.slice(1).map((sample, index) => sample.timestamp - this.samples[index]!.timestamp);
    const mean = intervals.length > 0 ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
    const variance =
      mean === null || intervals.length === 0
        ? null
        : intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
    return {
      schemaVersion: 'pendulum-imu-capture/v1',
      exportedAt: new Date().toISOString(),
      axis: this.axis,
      axisDirection: this.axisDirection,
      consentGrantedAt: this.consentGrantedAt,
      calibration: { angleOffset: this.angleOffset, angularVelocityBias: this.angularVelocityBias },
      sampling: {
        samples: this.samples.length,
        rejectedEvents: this.rejectedEvents,
        meanIntervalSeconds: mean,
        intervalStdDevSeconds: variance === null ? null : Math.sqrt(variance),
        maxJitterSeconds:
          mean === null ? null : intervals.reduce((maximum, value) => Math.max(maximum, Math.abs(value - mean)), 0)
      }
    };
  }

  exportBundle(): { metadata: ImuCaptureMetadata; csv: string } {
    return { metadata: this.metadata(), csv: this.exportCsv() };
  }

  stop(): void {
    this.dependencies.removeListener(this.listener);
    this.setState('stopped', `Motion sensor stopped; ${this.samples.length} samples retained.`);
  }

  cleanup(): void {
    this.stop();
    this.samples = [];
    this.rawVelocities = [];
  }
}
