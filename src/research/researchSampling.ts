export type ParameterStudyStrategy =
  'grid' | 'random' | 'symmetric' | 'latin-hypercube' | 'edge-focus' | 'sobol' | 'chebyshev';

function seedFromText(text: string): number {
  return Math.abs(text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) || 17;
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
  const n = Math.max(2, Math.min(64, Math.round(Number.isFinite(count) ? count : 7)));
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
    return Array.from({ length: n }, (_, i) => {
      if (i === 0) return mid;
      const ring = Math.ceil(i / 2);
      const sign = i % 2 === 0 ? 1 : -1;
      return mid + sign * span * (ring / Math.ceil((n - 1) / 2));
    }).sort((a, b) => a - b);
  }
  return Array.from({ length: n }, (_, i) => scale(min, max, i / Math.max(1, n - 1)));
}
