import { describe, expect, it } from 'vitest';
import {
  colorMarkerCentroid,
  trackDoublePendulumFrame,
  trackDoublePendulumRecording,
  type RgbaFrame
} from '../src/research/videoTracking';

const WIDTH = 32;
const HEIGHT = 32;
const red = { red: 240, green: 20, blue: 30, tolerance: 30, minPixels: 4 };
const cyan = { red: 10, green: 220, blue: 230, tolerance: 30, minPixels: 4 };

function recordedFrame(first: [number, number], second: [number, number]): RgbaFrame {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) data[4 * i + 3] = 255;
  const paint = ([cx, cy]: [number, number], color: readonly [number, number, number]): void => {
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        const i = 4 * (y * WIDTH + x);
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
      }
    }
  };
  paint(first, [240, 20, 30]);
  paint(second, [10, 220, 230]);
  return { width: WIDTH, height: HEIGHT, data };
}

const spec = { pivot: { x: 16, y: 4 }, first: red, second: cyan };

describe('webcam colour-marker tracking core', () => {
  it('finds a weighted colour centroid and bounding box', () => {
    const centroid = colorMarkerCentroid(recordedFrame([16, 12], [20, 20]), red);
    expect(centroid).not.toBeNull();
    expect(centroid!.x).toBeCloseTo(16, 12);
    expect(centroid!.y).toBeCloseTo(12, 12);
    expect(centroid!.pixels).toBe(9);
    expect(centroid!.bounds).toEqual({ minX: 15, minY: 11, maxX: 17, maxY: 13 });
  });

  it('converts bob vectors to absolute first-link and relative second-link angles', () => {
    const tracked = trackDoublePendulumFrame(recordedFrame([16, 12], [24, 12]), spec);
    expect(tracked).not.toBeNull();
    expect(tracked!.angles[0]).toBeCloseTo(0, 12); // first link points down
    expect(tracked!.angles[1]).toBeCloseTo(Math.PI / 2, 12); // second points right
  });

  it('adapts a deterministic recorded sequence to parameter-estimation observations', () => {
    const observation = trackDoublePendulumRecording(
      [recordedFrame([16, 12], [16, 20]), recordedFrame([17, 12], [18, 20])],
      [0, 1 / 60],
      spec
    );
    expect(observation.times).toEqual([0, 1 / 60]);
    expect(observation.angles).toHaveLength(2);
    expect(observation.angles[0]![0]).toBeCloseTo(0, 12);
    expect(observation.angles[0]![1]).toBeCloseTo(0, 12);
    expect(observation.angles[1]![0]).toBeGreaterThan(0);
  });

  it('fails closed when a marker is missing', () => {
    const empty = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    expect(trackDoublePendulumFrame({ width: WIDTH, height: HEIGHT, data: empty }, spec)).toBeNull();
    expect(() => trackDoublePendulumRecording([{ width: WIDTH, height: HEIGHT, data: empty }], [0], spec)).toThrow(
      /frame 0/
    );
  });
});
