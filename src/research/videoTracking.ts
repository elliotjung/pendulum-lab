import type { DoublePendulumObservation } from './parameterEstimation';

/** Structural ImageData-compatible frame, usable in browsers and headless tests. */
export interface RgbaFrame {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface ColorMarkerTarget {
  red: number;
  green: number;
  blue: number;
  /** Maximum Euclidean RGB distance. */
  tolerance: number;
  minAlpha?: number;
  minPixels?: number;
}

export interface ColorCentroid {
  x: number;
  y: number;
  pixels: number;
  /** Mean match weight in [0,1], higher means closer to the target colour. */
  confidence: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function validateFrame(frame: RgbaFrame): void {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw new Error('RGBA frame dimensions must be positive integers.');
  }
  if (frame.data.length < frame.width * frame.height * 4)
    throw new Error('RGBA frame data is shorter than width*height*4.');
}

/** Weighted centroid of pixels lying within an RGB target ball. */
export function colorMarkerCentroid(frame: RgbaFrame, target: ColorMarkerTarget): ColorCentroid | null {
  validateFrame(frame);
  if (!(target.tolerance > 0) || !Number.isFinite(target.tolerance))
    throw new Error('marker tolerance must be positive and finite.');
  const minAlpha = target.minAlpha ?? 1;
  const minPixels = target.minPixels ?? 1;
  let weightedX = 0;
  let weightedY = 0;
  let weightSum = 0;
  let pixels = 0;
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = 4 * (y * frame.width + x);
      if (Number(frame.data[index + 3] ?? 0) < minAlpha) continue;
      const dr = Number(frame.data[index] ?? 0) - target.red;
      const dg = Number(frame.data[index + 1] ?? 0) - target.green;
      const db = Number(frame.data[index + 2] ?? 0) - target.blue;
      const distance = Math.hypot(dr, dg, db);
      if (distance > target.tolerance) continue;
      // Keep boundary pixels meaningful but give exact-colour pixels most say.
      const weight = Math.max(1e-6, 1 - distance / target.tolerance);
      weightedX += weight * x;
      weightedY += weight * y;
      weightSum += weight;
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (pixels < minPixels || weightSum === 0) return null;
  return {
    x: weightedX / weightSum,
    y: weightedY / weightSum,
    pixels,
    confidence: Math.min(1, weightSum / pixels),
    bounds: { minX, minY, maxX, maxY }
  };
}

export interface DoubleMarkerTrackingSpec {
  pivot: { x: number; y: number };
  first: ColorMarkerTarget;
  second: ColorMarkerTarget;
  /** Image y-axis convention; browser pixels increase downward. */
  yAxis?: 'down' | 'up';
}

export interface TrackedDoublePendulumFrame {
  first: ColorCentroid;
  second: ColorCentroid;
  angles: readonly [number, number];
}

/** Locate two colour markers and convert absolute/relative bob vectors to angles. */
export function trackDoublePendulumFrame(
  frame: RgbaFrame,
  spec: DoubleMarkerTrackingSpec
): TrackedDoublePendulumFrame | null {
  const first = colorMarkerCentroid(frame, spec.first);
  const second = colorMarkerCentroid(frame, spec.second);
  if (!first || !second) return null;
  const ySign = spec.yAxis === 'up' ? -1 : 1;
  const theta1 = Math.atan2(first.x - spec.pivot.x, ySign * (first.y - spec.pivot.y));
  const theta2 = Math.atan2(second.x - first.x, ySign * (second.y - first.y));
  return { first, second, angles: [theta1, theta2] };
}

/** Deterministic recorded-frame adapter for the existing inverse-fit observation type. */
export function trackDoublePendulumRecording(
  frames: readonly RgbaFrame[],
  times: readonly number[],
  spec: DoubleMarkerTrackingSpec
): DoublePendulumObservation {
  if (frames.length !== times.length || frames.length === 0)
    throw new Error('recording frames/times must have equal non-zero length.');
  const angles: Array<readonly [number, number]> = [];
  for (let i = 0; i < frames.length; i += 1) {
    if (i > 0 && !(times[i]! > times[i - 1]!)) throw new Error('recording times must be strictly increasing.');
    const tracked = trackDoublePendulumFrame(frames[i]!, spec);
    if (!tracked) throw new Error(`marker tracking failed at frame ${i}.`);
    angles.push(tracked.angles);
  }
  return { times: Array.from(times), angles };
}
