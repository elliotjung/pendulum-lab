/** Dependency-free primitives shared by storage migration and import guards. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function optionalFinite(value: unknown): number | null {
  return finiteNumber(value) ? Number(value) : null;
}

export function clippedText(value: unknown, fallback: string, maxLength = 220): string {
  const text = typeof value === 'string' ? value.trim() : fallback;
  return (text || fallback).slice(0, maxLength);
}

export function isoText(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (!finiteNumber(value)) return fallback;
  return Math.max(min, Math.min(max, Number(value)));
}

export function sanitizeStringList(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}
