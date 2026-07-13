/**
 * Colorblind-safe visualization palette. The categorical colors are the
 * Okabe-Ito set, which is designed to remain distinguishable under the common
 * forms of color-vision deficiency (deuteranopia, protanopia, tritanopia).
 */

export const OKABE_ITO = {
  black: '#000000',
  orange: '#E69F00',
  skyBlue: '#56B4E9',
  bluishGreen: '#009E73',
  yellow: '#F0E442',
  blue: '#0072B2',
  vermillion: '#D55E00',
  reddishPurple: '#CC79A7'
} as const;

/** Ordered categorical sequence (skips pure black so it reads on a dark panel). */
export const CATEGORICAL: readonly string[] = [
  OKABE_ITO.skyBlue,
  OKABE_ITO.orange,
  OKABE_ITO.bluishGreen,
  OKABE_ITO.vermillion,
  OKABE_ITO.yellow,
  OKABE_ITO.blue,
  OKABE_ITO.reddishPurple
];

export interface VizTheme {
  background: string;
  grid: string;
  axis: string;
  text: string;
  accent: string;
  warn: string;
  good: string;
}

export const DARK_THEME: VizTheme = {
  background: '#0b111a',
  grid: '#1e2733',
  axis: '#8795a8',
  text: '#d8e2ef',
  accent: OKABE_ITO.skyBlue,
  warn: OKABE_ITO.vermillion,
  good: OKABE_ITO.bluishGreen
};

export const LIGHT_THEME: VizTheme = {
  background: '#f7fafc',
  grid: '#d9e1ea',
  axis: '#4a5568',
  text: '#1a202c',
  accent: OKABE_ITO.blue,
  warn: OKABE_ITO.vermillion,
  good: OKABE_ITO.bluishGreen
};

/** Pick a categorical color by index, wrapping around the palette. */
export function categorical(index: number): string {
  const n = CATEGORICAL.length;
  return CATEGORICAL[((index % n) + n) % n]!;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0')}`;
}

/** Linearly interpolate between two hex colors; t is clamped to [0, 1]. */
export function lerpHexColor(a: string, b: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * clamped,
    g: ca.g + (cb.g - ca.g) * clamped,
    b: ca.b + (cb.b - ca.b) * clamped
  });
}
