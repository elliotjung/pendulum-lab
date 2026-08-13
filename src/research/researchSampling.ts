export type ParameterStudyStrategy =
  'grid' | 'random' | 'symmetric' | 'latin-hypercube' | 'edge-focus' | 'sobol' | 'chebyshev';

function seedFromText(text: string): number {
  // FNV-1a preserves character order; the previous character sum made common
  // anagrams (for example experiment IDs with reordered tokens) share a stream.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 17;
}

function nextUnit(seedBox: { seed: number }): number {
  seedBox.seed = (seedBox.seed * 1664525 + 1013904223) % 4294967296;
  return seedBox.seed / 4294967296;
}

function vanDerCorput(index: number, base = 2): number {
  let denominator = 1;
  let result = 0;
  let n = index;
  while (n > 0) {
    denominator *= base;
    result += (n % base) / denominator;
    n = Math.floor(n / base);
  }
  return result;
}

function scale(min: number, max: number, unit: number): number {
  return min + (max - min) * unit;
}

export function generateStudyValues(
  strategy: ParameterStudyStrategy,
  min: number,
  max: number,
  count: number,
  seedText: string
): number[] {
  const supported = new Set<ParameterStudyStrategy>([
    'grid',
    'random',
    'symmetric',
    'latin-hypercube',
    'edge-focus',
    'sobol',
    'chebyshev'
  ]);
  if (!supported.has(strategy)) throw new RangeError(`generateStudyValues: unsupported strategy ${String(strategy)}`);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || !Number.isFinite(max - min)) {
    throw new RangeError('generateStudyValues: bounds must be finite, ordered, and have a finite span');
  }
  if (!Number.isFinite(count) || count <= 0) {
    throw new RangeError('generateStudyValues: count must be positive and finite');
  }
  if (typeof seedText !== 'string' || seedText.length > 4_096) {
    throw new RangeError('generateStudyValues: seed text must be a string of at most 4096 code units');
  }
  const n = Math.max(2, Math.min(64, Math.round(count)));
  const seedBox = { seed: seedFromText(seedText) };
  if (strategy === 'random') {
    return Array.from({ length: n }, () => scale(min, max, nextUnit(seedBox))).sort((a, b) => a - b);
  }
  if (strategy === 'latin-hypercube') {
    return Array.from({ length: n }, (_, i) => scale(min, max, (i + nextUnit(seedBox)) / n)).sort((a, b) => a - b);
  }
  if (strategy === 'sobol') {
    return Array.from({ length: n }, (_, i) => scale(min, max, vanDerCorput(i + 1, 2))).sort((a, b) => a - b);
  }
  if (strategy === 'chebyshev') {
    return Array.from({ length: n }, (_, i) => {
      const unit = 0.5 + 0.5 * Math.cos(((2 * i + 1) * Math.PI) / (2 * n));
      return scale(min, max, unit);
    }).sort((a, b) => a - b);
  }
  if (strategy === 'edge-focus') {
    return Array.from({ length: n }, (_, i) => {
      const u = i / Math.max(1, n - 1);
      return scale(min, max, 0.5 - 0.5 * Math.cos(Math.PI * u));
    }).sort((a, b) => a - b);
  }
  if (strategy === 'symmetric') {
    const mid = (min + max) / 2;
    const span = (max - min) / 2;
    if (n % 2 === 1) {
      const rings = (n - 1) / 2;
      return [
        mid,
        ...Array.from({ length: rings }, (_, i) => mid - span * ((i + 1) / rings)),
        ...Array.from({ length: rings }, (_, i) => mid + span * ((i + 1) / rings))
      ].sort((a, b) => a - b);
    }
    const rings = n / 2;
    return [
      ...Array.from({ length: rings }, (_, i) => mid - span * ((i + 1) / rings)),
      ...Array.from({ length: rings }, (_, i) => mid + span * ((i + 1) / rings))
    ].sort((a, b) => a - b);
  }
  return Array.from({ length: n }, (_, i) => scale(min, max, i / Math.max(1, n - 1)));
}
