import { describe, expect, it, vi } from 'vitest';
import { ImuMotionCaptureController, type ImuMotionCaptureDependencies } from '../src/browser/imuMotionCapture';

function motionEvent(timestamp: number, betaDegreesPerSecond: number, y = 1, z = 1): DeviceMotionEvent {
  return {
    timeStamp: timestamp,
    accelerationIncludingGravity: { x: 0, y, z },
    rotationRate: { alpha: 0, beta: betaDegreesPerSecond, gamma: 0 }
  } as unknown as DeviceMotionEvent;
}

function fixture(permission: 'granted' | 'denied' = 'granted', secureContext = true) {
  let listener: ((event: DeviceMotionEvent) => void) | null = null;
  const addListener = vi.fn((next: (event: DeviceMotionEvent) => void) => { listener = next; });
  const removeListener = vi.fn();
  const eventType = class {} as unknown as ImuMotionCaptureDependencies['deviceMotionEvent'];
  Object.assign(eventType!, { requestPermission: vi.fn(async () => permission) });
  const dependencies: ImuMotionCaptureDependencies = {
    secureContext,
    deviceMotionEvent: eventType,
    addListener,
    removeListener
  };
  const controller = new ImuMotionCaptureController({ dependencies, axis: 'beta' });
  return { controller, addListener, removeListener, dispatch: (event: DeviceMotionEvent) => listener?.(event) };
}

describe('ImuMotionCaptureController', () => {
  it('requests iOS permission and produces calibrated angle/acceleration samples', async () => {
    const { controller, dispatch, addListener, removeListener } = fixture();
    expect(await controller.start()).toBe(true);
    expect(controller.state).toBe('streaming');
    expect(addListener).toHaveBeenCalledOnce();

    dispatch(motionEvent(1000, 10));
    controller.calibrate();
    dispatch(motionEvent(1100, 20));
    const series = controller.series();
    expect(series).toHaveLength(2);
    expect(series[1]!.timestamp).toBeCloseTo(0.1, 12);
    expect(series[1]!.angle).toBeCloseTo(0, 12);
    expect(series[1]!.angularAcceleration).toBeCloseTo((10 * Math.PI / 180) / 0.1, 12);
    expect(controller.exportCsv()).toContain('angular_acceleration');

    controller.stop();
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('offers a non-crashing fallback for denial, insecure pages, and missing APIs', async () => {
    const denied = fixture('denied');
    expect(await denied.controller.start()).toBe(false);
    expect(denied.controller.state).toBe('denied');

    const insecure = fixture('granted', false);
    expect(await insecure.controller.start()).toBe(false);
    expect(insecure.controller.state).toBe('unsupported');

    const missing = new ImuMotionCaptureController({
      dependencies: {
        secureContext: true,
        deviceMotionEvent: undefined,
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    });
    expect(await missing.start()).toBe(false);
    expect(missing.state).toBe('unsupported');
  });

  it('rejects non-monotonic and incomplete sensor events', async () => {
    const { controller } = fixture();
    await controller.start();
    expect(controller.consume(motionEvent(10, 0))).not.toBeNull();
    expect(controller.consume(motionEvent(10, 0))).toBeNull();
    expect(controller.consume({ timeStamp: 20 } as DeviceMotionEvent)).toBeNull();
  });
});
