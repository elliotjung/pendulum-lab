import { describe, expect, it, vi } from 'vitest';
import { VideoMarkerCaptureController, type VideoMarkerCaptureDependencies } from '../src/browser/videoMarkerCapture';

function markerFrame(): ImageData {
  const width = 16;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data[4 * i + 3] = 255;
  const paint = (cx: number, cy: number, color: readonly [number, number, number]): void => {
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        const index = 4 * (y * width + x);
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
      }
    }
  };
  paint(8, 7, [240, 20, 30]);
  paint(8, 12, [10, 220, 230]);
  return { width, height, data, colorSpace: 'srgb' };
}

function fixture(getUserMedia?: VideoMarkerCaptureDependencies['getUserMedia']) {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const video = {
    srcObject: null,
    muted: false,
    playsInline: false,
    videoWidth: 16,
    videoHeight: 16,
    play: vi.fn(async () => undefined),
    pause: vi.fn()
  } as unknown as HTMLVideoElement;
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => markerFrame())
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 16,
    height: 16,
    getContext: vi.fn(() => context)
  } as unknown as HTMLCanvasElement;
  const dependencies: VideoMarkerCaptureDependencies = {
    secureContext: true,
    getUserMedia: getUserMedia ?? vi.fn(async () => stream),
    requestFrame: vi.fn(() => 7),
    cancelFrame: vi.fn(),
    now: vi.fn(() => 1000)
  };
  const controller = new VideoMarkerCaptureController({
    video,
    canvas,
    tracking: {
      pivot: { x: 8, y: 2 },
      first: { red: 240, green: 20, blue: 30, tolerance: 20, minPixels: 4 },
      second: { red: 10, green: 220, blue: 230, tolerance: 20, minPixels: 4 }
    },
    dependencies
  });
  return { controller, dependencies, video, stop };
}

describe('VideoMarkerCaptureController', () => {
  it('owns the stream, timestamps tracked preview frames, and exports fit-ready CSV', async () => {
    const { controller, dependencies, video, stop } = fixture();
    expect(await controller.start()).toBe(true);
    expect(controller.state).toBe('streaming');
    expect(video.srcObject).not.toBeNull();

    expect(controller.captureFrame(1016)?.timestamp).toBeCloseTo(0.016, 12);
    expect(controller.captureFrame(1032)?.angles).toEqual([0, 0]);
    const observation = controller.observation();
    expect(observation.times[0]).toBe(0);
    expect(observation.times[1]).toBeCloseTo(0.016, 12);
    expect(observation.angles).toEqual([
      [0, 0],
      [0, 0]
    ]);
    expect(controller.observationCsv()).toContain('time,theta1,theta2');

    controller.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(dependencies.cancelFrame).toHaveBeenCalledWith(7);
  });

  it('fails closed in an insecure context and reports permission denial', async () => {
    const insecure = fixture();
    const insecureController = new VideoMarkerCaptureController({
      video: insecure.video,
      canvas: { width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement,
      tracking: {
        pivot: { x: 0, y: 0 },
        first: { red: 1, green: 1, blue: 1, tolerance: 1 },
        second: { red: 2, green: 2, blue: 2, tolerance: 1 }
      },
      dependencies: { ...insecure.dependencies, secureContext: false }
    });
    expect(await insecureController.start()).toBe(false);
    expect(insecureController.state).toBe('unsupported');

    const denied = fixture(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    expect(await denied.controller.start()).toBe(false);
    expect(denied.controller.state).toBe('denied');
  });

  it('requires at least two valid samples for a parameter-estimation observation', () => {
    const { controller } = fixture();
    expect(() => controller.observation()).toThrow(/At least two/);
  });
});
