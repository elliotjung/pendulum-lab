export const OBSERVATION_LIMITS = Object.freeze({
  textBytes: 2 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024,
  mediaBytes: 8 * 1024 * 1024,
  rows: 4096,
  columns: 16,
  durationSeconds: 3600,
  videoFrames: 256,
  videoPixels: 640 * 480,
  videoSourcePixels: 8 * 1024 * 1024,
  videoSourceEdge: 8192,
  videoPixelWork: 24 * 1024 * 1024
});

export type ObservationKind = 'csv' | 'sensor' | 'video';
export type ObservationMapping =
  { time: string; theta1: string; theta2?: string } | { time: string; x1: string; y1: string; x2: string; y2: string };

export interface ObservationImportOptions {
  timeUnit: 's' | 'ms';
  angleUnit: 'rad' | 'deg';
  /** Applied after unit conversion: t_s = t_raw * unitFactor * timeScale + timeOffset. */
  timeScale: number;
  timeOffset: number;
  /** Applied after radian conversion, separately for each channel. */
  angleScale: readonly [number, number];
  angleOffset: readonly [number, number];
  missing: 'reject' | 'drop' | 'interpolate';
  maxGapSeconds: number;
  coordinateUnit: 'px' | 'm' | 'cm';
  pixelsPerMeter: number;
  pivot: { x: number; y: number };
  yAxis: 'down' | 'up';
}

export const DEFAULT_OBSERVATION_OPTIONS: Readonly<ObservationImportOptions> = Object.freeze({
  timeUnit: 's',
  angleUnit: 'rad',
  timeScale: 1,
  timeOffset: 0,
  angleScale: Object.freeze([1, 1] as const),
  angleOffset: Object.freeze([0, 0] as const),
  missing: 'reject',
  maxGapSeconds: 0.25,
  coordinateUnit: 'px',
  pixelsPerMeter: 100,
  pivot: Object.freeze({ x: 0, y: 0 }),
  yAxis: 'down'
});

export interface ObservationMedia {
  name: string;
  mime: string;
  base64: string;
}
export interface ObservationImportRequest {
  text: string;
  name: string;
  kind: ObservationKind;
  mapping: ObservationMapping;
  options?: Partial<ObservationImportOptions>;
  media?: ObservationMedia;
  /** Tracking/calibration provenance; plain bounded JSON, never executed. */
  capture?: Record<string, unknown>;
}
export interface ObservationArtifact {
  schema: 'pendulum-observation/v1';
  id: string;
  original: {
    id: string;
    name: string;
    kind: ObservationKind;
    text: string;
    sha256: string;
    media?: ObservationMedia & { sha256: string };
    capture?: Record<string, unknown>;
  };
  transform: {
    id: string;
    mapping: ObservationMapping;
    options: ObservationImportOptions;
    history: readonly string[];
    sourceRows: number;
    droppedRows: number;
    interpolatedValues: number;
  };
  data: {
    times: readonly number[];
    angles: readonly (readonly number[])[];
    timeUnit: 's';
    angleUnit: 'rad';
  };
  warnings: readonly string[];
}
export interface ObservationPreview {
  stage: 'preview';
  artifact: ObservationArtifact;
  summary: { sourceRows: number; acceptedRows: number; channels: number; durationSeconds: number };
}
