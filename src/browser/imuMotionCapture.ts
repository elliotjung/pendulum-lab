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
  deviceMotionEvent: (typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }) | undefined;
  addListener: (listener: (event: DeviceMotionEvent) => void) => void;
  removeListener: (listener: (event: DeviceMotionEvent) => void) => void;
}

export interface ImuMotionCaptureOptions {
  axis?: ImuAxis;
  dependencies?: Partial<ImuMotionCaptureDependencies>;
  onSample?: (sample: ImuMotionSample) => void;
  onStateChange?: (state: ImuCaptureState, message: string) => void;
}

function browserDependencies(): ImuMotionCaptureDependencies {
  const eventType = typeof DeviceMotionEvent === 'undefined'
    ? undefined
    : DeviceMotionEvent as ImuMotionCaptureDependencies['deviceMotionEvent'];
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
  return axis === 'beta'
    ? Math.atan2(y, Math.hypot(x, z))
    : Math.atan2(x, Math.hypot(y, z));
}

function angularVelocity(event: DeviceMotionEvent, axis: ImuAxis): number | null {
  const degreesPerSecond = event.rotationRate?.[axis];
  return degreesPerSecond == null || !Number.isFinite(degreesPerSecond)
    ? null
    : degreesPerSecond * Math.PI / 180;
}

/** DeviceMotion collector with the explicit iOS permission handshake. */
export class ImuMotionCaptureController {
  private readonly axis: ImuAxis;
  private readonly dependencies: ImuMotionCaptureDependencies;
  private readonly onSample: ((sample: ImuMotionSample) => void) | undefined;
  private readonly onStateChange: ((state: ImuCaptureState, message: string) => void) | undefined;
  private readonly listener = (event: DeviceMotionEvent): void => { this.consume(event); };
  private samples: ImuMotionSample[] = [];
  private rawAngle = 0;
  private angleOffset = 0;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private lastVelocity: number | null = null;
  state: ImuCaptureState = 'idle';

  constructor(options: ImuMotionCaptureOptions = {}) {
    this.axis = options.axis ?? 'beta';
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
        if (await eventType.requestPermission() !== 'granted') {
          this.setState('denied', 'Motion-sensor permission was denied. You can import a sensor CSV instead.');
          return false;
        }
      } catch {
        this.setState('denied', 'Motion-sensor permission could not be granted. You can import a sensor CSV instead.');
        return false;
      }
    }
    this.samples = [];
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

  /** Consume one event; public so recorded event fixtures can be replayed. */
  consume(event: DeviceMotionEvent): ImuMotionSample | null {
    if (this.state !== 'streaming') return null;
    const angle = inclination(event, this.axis);
    const velocity = angularVelocity(event, this.axis);
    if (angle === null || velocity === null || !Number.isFinite(event.timeStamp)) return null;
    this.rawAngle = angle;
    this.firstTimestamp ??= event.timeStamp;
    const timestamp = Math.max(0, (event.timeStamp - this.firstTimestamp) / 1000);
    if (this.lastTimestamp !== null && timestamp <= this.lastTimestamp) return null;
    const dt = this.lastTimestamp === null ? null : timestamp - this.lastTimestamp;
    const acceleration = dt && this.lastVelocity !== null ? (velocity - this.lastVelocity) / dt : 0;
    const sample: ImuMotionSample = {
      timestamp,
      angle: angle - this.angleOffset,
      angularVelocity: velocity,
      angularAcceleration: acceleration
    };
    this.samples.push(sample);
    this.lastTimestamp = timestamp;
    this.lastVelocity = velocity;
    this.onSample?.(sample);
    return sample;
  }

  series(): readonly ImuMotionSample[] {
    return this.samples.map((sample) => ({ ...sample }));
  }

  exportCsv(): string {
    return [
      'time,angle,angular_velocity,angular_acceleration',
      ...this.samples.map((sample) => [sample.timestamp, sample.angle, sample.angularVelocity, sample.angularAcceleration].map((value) => value.toPrecision(12)).join(','))
    ].join('\n');
  }

  stop(): void {
    this.dependencies.removeListener(this.listener);
    this.setState('stopped', `Motion sensor stopped; ${this.samples.length} samples retained.`);
  }

  cleanup(): void {
    this.stop();
    this.samples = [];
  }
}
