/**
 * Pure helpers for the 3D lab. Keeping palettes, presets, and parser logic
 * here lets the UI modules split further without dragging canvas/DOM state
 * through every file.
 */

export interface ChainColor {
  r: number;
  g: number;
  b: number;
  css: string;
}

export interface DoubleStringPreset {
  label: string;
  theta1: number;
  theta2: number;
  omega1: number;
  omega2: number;
}

export type ClampNumber = (value: unknown, fallback: number, min: number, max: number) => number;

/** Per-bob display colours for the N-chain (cycled when N exceeds the palette). */
export const CHAIN_COLORS: ChainColor[] = [
  { r: 244, g: 162, b: 97, css: '#f4a261' },
  { r: 76, g: 201, b: 240, css: '#4cc9f0' },
  { r: 56, g: 232, b: 140, css: '#38e88c' },
  { r: 240, g: 196, b: 25, css: '#f0c419' },
  { r: 230, g: 57, b: 70, css: '#e63946' }
];

/** Named double-string presets covering the three qualitative regimes. */
export const DOUBLE_STRING_PRESETS: Record<string, DoubleStringPreset> = {
  'gentle-swing': { label: 'Gentle swing (stays taut)', theta1: 0.7, theta2: 0.4, omega1: 0.2, omega2: -0.1 },
  'chaotic-taut': { label: 'Chaotic but taut', theta1: 2.0, theta2: 2.4, omega1: 0, omega2: 0 },
  'slack-cascade': { label: 'Near-inverted fold (slack + recapture)', theta1: 2.5, theta2: -2.5, omega1: 0, omega2: 0 },
  whirling: { label: 'Fast whirl (centripetally taut)', theta1: 3.0, theta2: 3.0, omega1: 0, omega2: 8 }
};

/**
 * Parse a whitespace/comma-separated list, padded from the previous clamped
 * value and clamped to exactly `n` entries. The clamp function is injected so
 * this helper preserves the same fallback semantics as the calling module.
 */
export function parseClampedNumberList(
  raw: string,
  n: number,
  fallback: number,
  min: number,
  max: number,
  clampNumber: ClampNumber
): number[] {
  const parsed = raw
    .split(/[,\s]+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(clampNumber(parsed[i], out[i - 1] ?? fallback, min, max));
  }
  return out;
}
