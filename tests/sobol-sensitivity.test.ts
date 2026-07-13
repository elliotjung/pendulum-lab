import { describe, expect, it } from 'vitest';
import { sobolIndices } from '../src/research/sobolSensitivity';

describe('Sobol sensitivity indices (Saltelli/Jansen estimators)', () => {
  it('recovers exact variance fractions of an additive linear model', async () => {
    // f = 2·x₁ + x₂ on [0,1]²: V_i = c_i²/12, no interactions, so
    // S₁ = 4/5, S₂ = 1/5 and S_Ti = S_i exactly.
    const result = await sobolIndices(
      (point) => 2 * point[0]! + point[1]!,
      [
        { name: 'x1', min: 0, max: 1 },
        { name: 'x2', min: 0, max: 1 }
      ],
      { samples: 1024 }
    );
    expect(result.firstOrder[0]).toBeCloseTo(0.8, 1);
    expect(result.firstOrder[1]).toBeCloseTo(0.2, 1);
    expect(result.total[0]).toBeCloseTo(0.8, 1);
    expect(result.total[1]).toBeCloseTo(0.2, 1);
    expect(result.evaluations).toBe(1024 * 4);
    expect(result.nonFiniteOutputs).toBe(0);
  });

  it('matches the analytic Ishigami indices (the standard benchmark)', async () => {
    // Ishigami a=7, b=0.1 on [−π, π]³: S₁≈0.3139, S₂≈0.4424, S₃=0, S_T3≈0.2437.
    const a = 7;
    const b = 0.1;
    const ishigami = (point: number[]): number =>
      Math.sin(point[0]!) + a * Math.sin(point[1]!) ** 2 + b * point[2]! ** 4 * Math.sin(point[0]!);
    const bounds = { min: -Math.PI, max: Math.PI };
    const result = await sobolIndices(
      ishigami,
      [
        { name: 'x1', ...bounds },
        { name: 'x2', ...bounds },
        { name: 'x3', ...bounds }
      ],
      { samples: 2048 }
    );
    expect(result.firstOrder[0]).toBeGreaterThan(0.25);
    expect(result.firstOrder[0]).toBeLessThan(0.38);
    expect(result.firstOrder[1]).toBeGreaterThan(0.38);
    expect(result.firstOrder[1]).toBeLessThan(0.51);
    // x₃ has zero first-order effect but a real total effect through the
    // x₁x₃ interaction — the signature Sobol-analysis distinction.
    expect(Math.abs(result.firstOrder[2]!)).toBeLessThan(0.05);
    expect(result.total[2]).toBeGreaterThan(0.18);
    expect(result.total[2]).toBeLessThan(0.31);
    // Total ≥ first-order (up to Monte-Carlo noise) for every variable.
    for (let i = 0; i < 3; i += 1) {
      expect(result.total[i]!).toBeGreaterThan(result.firstOrder[i]! - 0.05);
    }
  });

  it('reports progress and excludes non-finite outputs without poisoning the rest', async () => {
    let calls = 0;
    let lastDone = 0;
    const result = await sobolIndices(
      (point) => {
        calls += 1;
        return calls === 3 ? Number.NaN : point[0]!;
      },
      [{ name: 'x', min: 0, max: 1 }],
      {
        samples: 16,
        onProgress: (done, total) => {
          lastDone = done;
          expect(total).toBe(16 * 3);
        }
      }
    );
    expect(lastDone).toBe(16 * 3);
    expect(result.nonFiniteOutputs).toBeGreaterThan(0);
    expect(Number.isFinite(result.firstOrder[0]!)).toBe(true);
  });

  it('rejects empty ranges and too many variables', async () => {
    await expect(sobolIndices(() => 0, [{ name: 'x', min: 1, max: 1 }])).rejects.toThrow(/empty range/);
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `x${i}`, min: 0, max: 1 }));
    await expect(sobolIndices(() => 0, seven)).rejects.toThrow(/at most 6/);
  });
});
