import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImuMotionCaptureController, type ImuMotionCaptureDependencies } from '../../../src/browser/imuMotionCapture';
import { VideoMarkerCaptureController } from '../../../src/browser/videoMarkerCapture';
import { createImuSession } from '../../../src/product/lab/research/capture/imu';
import { createCameraSession } from '../../../src/product/lab/research/capture/camera';
import { previewLiveCapture } from '../../../src/product/lab/research/capture/artifact';
import { parseObservationArtifact, serializeObservationArtifact } from '../../../src/product/observations';
import type { CaptureState } from '../../../src/product/lab/research/capture/contracts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function callbacks() {
  const states: CaptureState[] = [];
  return { states, onState: vi.fn((state: CaptureState) => states.push(state)), onCount: vi.fn() };
}
function motion(timeStamp: number, velocity = 10, y = 1): DeviceMotionEvent {
  return {
    timeStamp,
    accelerationIncludingGravity: { x: 0, y, z: 1 },
    rotationRate: { beta: velocity, gamma: velocity, alpha: 0 }
  } as unknown as DeviceMotionEvent;
}
function imuFixture(permission = vi.fn(async (): Promise<'granted' | 'denied'> => 'granted')) {
  const listeners = new Set<(event: DeviceMotionEvent) => void>();
  const dependencies: ImuMotionCaptureDependencies = {
    secureContext: true,
    deviceMotionEvent: Object.assign(function MotionEvent() {}, {
      requestPermission: permission
    }) as unknown as ImuMotionCaptureDependencies['deviceMotionEvent'],
    addListener: vi.fn((listener) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener) => {
      listeners.delete(listener);
    })
  };
  const events = callbacks();
  const session = createImuSession({ axis: 'beta', axisDirection: 1 }, events, dependencies);
  return {
    session,
    dependencies,
    events,
    listeners,
    dispatch: (event: DeviceMotionEvent) => [...listeners].forEach((listener) => listener(event))
  };
}
const tracking = {
  pivot: { x: 8, y: 2 },
  first: { red: 240, green: 20, blue: 30, tolerance: 20, minPixels: 4 },
  second: { red: 10, green: 220, blue: 230, tolerance: 20, minPixels: 4 },
  yAxis: 'down' as const
};
function markerFrame() {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) data[i * 4 + 3] = 255;
  for (const [cx, cy, red, green, blue] of [
    [8, 7, 240, 20, 30],
    [8, 12, 10, 220, 230]
  ]) {
    for (let y = cy! - 1; y <= cy! + 1; y++)
      for (let x = cx! - 1; x <= cx! + 1; x++) {
        const offset = (y * 16 + x) * 4;
        data[offset] = red!;
        data[offset + 1] = green!;
        data[offset + 2] = blue!;
      }
  }
  return { width: 16, height: 16, data, colorSpace: 'srgb' } as ImageData;
}
function cameraFixture() {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const video = {
    srcObject: null,
    videoWidth: 16,
    videoHeight: 16,
    play: vi.fn(async () => undefined),
    pause: vi.fn()
  } as unknown as HTMLVideoElement;
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => markerFrame()) };
  const canvas = { width: 16, height: 16, getContext: () => context } as unknown as HTMLCanvasElement;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const dependencies = {
    secureContext: true,
    getUserMedia: vi.fn(async () => stream),
    now: () => 1000,
    requestFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
    cancelFrame: vi.fn((id: number) => {
      frames.delete(id);
    })
  };
  const events = callbacks();
  const options = { video, canvas, tracking, calibration: { pixelsPerMeter: 100, note: 'fixture calibration' } };
  const session = createCameraSession(options, events, dependencies);
  function frame(time: number) {
    const first = frames.entries().next().value;
    if (!first) return;
    frames.delete(first[0]);
    first[1](time);
  }
  return { session, options, events, dependencies, frame, frames, context, stopTrack, stream, video, canvas };
}
afterEach(() => vi.useRealTimers());

describe('S28 bounded adapters over actual native IMU and camera capture', () => {
  it('does not request permission on construction and retains exact native IMU CSV with rejected-event provenance', async () => {
    const f = imuFixture();
    expect(f.dependencies.deviceMotionEvent!.requestPermission).not.toHaveBeenCalled();
    expect(f.listeners.size).toBe(0);
    await f.session.start();
    const input = [motion(1000), motion(1100, 20, 0.5), motion(1100), { timeStamp: 1300 } as DeviceMotionEvent];
    input.forEach(f.dispatch);
    f.session.stop();
    const native = new ImuMotionCaptureController({
      dependencies: { ...f.dependencies, addListener: vi.fn(), removeListener: vi.fn() }
    });
    await native.start();
    input.forEach((event) => native.consume(event));
    native.stop();
    const bundle = f.session.bundle();
    expect(bundle.csv).toBe(native.exportCsv());
    expect(bundle.metadata).toMatchObject({
      schemaVersion: 'pendulum-imu-capture/v1',
      sampling: { samples: 2, rejectedEvents: 2 }
    });
    expect(f.listeners.size).toBe(0);
    const preview = await previewLiveCapture(bundle);
    expect(preview.artifact.original.text).toBe(bundle.csv);
    expect(preview.artifact.original.capture!.nativeMetadata).toEqual(bundle.metadata);
    expect(preview.artifact.data.times).toEqual([0, 0.1]);
    expect(preview.artifact.warnings.some((entry) => entry.includes('단일 센서'))).toBe(true);
    expect(await parseObservationArtifact(serializeObservationArtifact(preview.artifact))).toEqual(preview.artifact);
    f.session.dispose();
    expect(() => f.session.bundle()).toThrow();
  });
  it('starts a clean native recording after explicit pose/bias calibration without mixing earlier samples', async () => {
    const f = imuFixture();
    await f.session.start();
    f.dispatch(motion(1000));
    f.dispatch(motion(1100));
    await f.session.calibrate!();
    f.dispatch(motion(2000));
    f.dispatch(motion(2100));
    f.session.stop();
    const bundle = f.session.bundle();
    expect(bundle.csv.split('\n')).toHaveLength(3);
    expect(bundle.csv).toContain('0.00000000000,0.00000000000,0.00000000000');
    expect(bundle.metadata).toMatchObject({
      calibration: { angleOffset: Math.PI / 4, angularVelocityBias: Math.PI / 18 },
      sampling: { samples: 2 }
    });
    f.session.dispose();
  });
  it('ignores late iOS permission after cancellation and never installs a sensor listener', async () => {
    const permission = deferred<'granted' | 'denied'>();
    const f = imuFixture(vi.fn(() => permission.promise));
    const starting = f.session.start();
    f.session.stop();
    permission.resolve('granted');
    expect(await starting).toBe(false);
    expect(f.dependencies.addListener).not.toHaveBeenCalled();
    expect(f.events.states.at(-1)).toBe('stopped');
    expect(f.events.states).not.toContain('streaming');
    f.session.dispose();
  });
  it('refuses denied/insecure sensor access and bounds native sample storage and wall time', async () => {
    const denied = imuFixture(vi.fn(async () => 'denied'));
    expect(await denied.session.start()).toBe(false);
    expect(denied.listeners.size).toBe(0);
    const insecure = createImuSession({ axis: 'beta', axisDirection: 1 }, callbacks(), { secureContext: false });
    expect(await insecure.start()).toBe(false);
    const f = imuFixture();
    await f.session.start();
    for (let i = 0; i < 5000; i++) f.dispatch(motion(i));
    expect(f.session.bundle().metadata).toMatchObject({ sampling: { samples: 4096 } });
    expect(f.listeners.size).toBe(0);
    vi.useFakeTimers();
    const timed = imuFixture();
    await timed.session.start();
    vi.advanceTimersByTime(30000);
    expect(timed.listeners.size).toBe(0);
    expect(timed.events.states.at(-1)).toBe('stopped');
    f.session.dispose();
    denied.session.dispose();
    insecure.dispose();
    timed.session.dispose();
  });
  it('retains genuine native camera marker results, calibrated provenance and exact CSV in the existing observation contract', async () => {
    const f = cameraFixture();
    expect(f.dependencies.getUserMedia).not.toHaveBeenCalled();
    await f.session.start();
    f.frame(1016);
    f.frame(1032);
    f.session.stop();
    const native = new VideoMarkerCaptureController({
      ...f.options,
      dependencies: { ...f.dependencies, requestFrame: vi.fn(() => 999), cancelFrame: vi.fn() }
    });
    await native.start();
    native.captureFrame(1016);
    native.captureFrame(1032);
    native.stop();
    const bundle = f.session.bundle();
    expect(bundle.csv).toBe(native.observationCsv());
    expect(bundle.metadata).toMatchObject({
      frame: { width: 16, height: 16 },
      calibration: { pixelsPerMeter: 100 },
      quality: { trackedFrames: 2 }
    });
    const preview = await previewLiveCapture(bundle);
    expect(preview.artifact.data.angles).toEqual([
      [0, 0],
      [0, 0]
    ]);
    expect(preview.artifact.data.times).toEqual([0, 0.016]);
    expect(preview.artifact.original.kind).toBe('sensor');
    expect(preview.artifact.original.capture!.units).toEqual({ time: 's', angle: 'rad' });
    expect(preview.artifact.original.media).toBeUndefined();
    expect(preview.artifact.original.capture).toMatchObject({
      source: 'native-camera-markers',
      originalVideoRecorded: false,
      nativeMetadata: bundle.metadata
    });
    expect(f.frames.size).toBe(0);
    expect(f.video.srcObject).toBeNull();
    f.session.dispose();
  });
  it('releases tracks from late camera permission after cancel and from a pending video play after disposal', async () => {
    const f = cameraFixture();
    const permission = deferred<MediaStream>();
    f.dependencies.getUserMedia.mockImplementation(() => permission.promise);
    const starting = f.session.start();
    f.session.stop();
    permission.resolve(f.stream);
    expect(await starting).toBe(false);
    expect(f.stopTrack).toHaveBeenCalledOnce();
    expect(f.video.play).not.toHaveBeenCalled();
    expect(f.frames.size).toBe(0);
    const pendingPlay = cameraFixture();
    const play = deferred<void>();
    vi.mocked(pendingPlay.video.play).mockImplementation(() => play.promise);
    const playing = pendingPlay.session.start();
    await Promise.resolve();
    await Promise.resolve();
    pendingPlay.session.dispose();
    play.resolve();
    expect(await playing).toBe(false);
    expect(pendingPlay.stopTrack).toHaveBeenCalledOnce();
    expect(pendingPlay.video.srcObject).toBeNull();
    expect(pendingPlay.frames.size).toBe(0);
    f.session.dispose();
  });
  it('bounds camera storage, stops oversized frames and never extends the 30s budget on tracking recovery', async () => {
    const f = cameraFixture();
    await f.session.start();
    for (let i = 0; i < 300; i++) f.frame(1016 + i * 16);
    expect(f.session.bundle().metadata).toMatchObject({ quality: { trackedFrames: 256 } });
    expect(f.stopTrack).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(0);
    const large = cameraFixture();
    Object.defineProperty(large.video, 'videoWidth', { value: 1280 });
    expect(await large.session.start()).toBe(false);
    expect(large.stopTrack).toHaveBeenCalledOnce();
    expect(large.frames.size).toBe(0);
    vi.useFakeTimers();
    const timed = cameraFixture();
    await timed.session.start();
    vi.advanceTimersByTime(29000);
    timed.context.getImageData.mockReturnValue({ ...markerFrame(), data: new Uint8ClampedArray(16 * 16 * 4) });
    for (let i = 0; i < 8; i++) timed.frame(30000 + i);
    timed.context.getImageData.mockReturnValue(markerFrame());
    timed.frame(31000);
    expect(timed.events.states).toContain('tracking-lost');
    vi.advanceTimersByTime(1000);
    expect(timed.stopTrack).toHaveBeenCalledOnce();
    expect(timed.frames.size).toBe(0);
    f.session.dispose();
    large.session.dispose();
    timed.session.dispose();
  });
  it('shows camera denial without retaining tracks or scheduling frames', async () => {
    const f = cameraFixture();
    f.dependencies.getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    expect(await f.session.start()).toBe(false);
    expect(f.events.states.at(-1)).toBe('denied');
    expect(f.frames.size).toBe(0);
    expect(() => f.session.bundle()).toThrow();
    f.session.dispose();
  });
});
