import { describe, expect, it } from 'vitest';
import { modelRequest, oscillatorData } from './fixtures';
import { learningDefaults } from '../../../../src/product/adapters/analysis/data-driven/learning-contracts';
import type { DataDrivenRequest } from '../../../../src/product/adapters/analysis/data-driven/contracts';
import {
  runDataDriven,
  reevaluateDataDriven,
  executeDataDrivenJob,
  validateDataDrivenRequest,
  dataDrivenResultId
} from '../../../../src/product/adapters/analysis/data-driven/execute';
import {
  serializeDataDrivenResult,
  parseDataDrivenResult,
  validateDataDrivenResult
} from '../../../../src/product/adapters/analysis/data-driven/artifact';
import {
  modelData,
  modelDigest,
  modelJson,
  parseModelJson
} from '../../../../src/product/adapters/analysis/data-driven/safe';

describe('S23 immutable source/model/evaluation lineage', () => {
  for (const method of [
    'sindy',
    'dmd',
    'havok',
    'reservoir',
    'hamiltonian',
    'arnoldi',
    'lanczos',
    'general-eigensolver'
  ] as const)
    it(`${method}: complete versioned artifact roundtrip reconstructs identical native outputs and evaluation lineage`, async () => {
      const data = oscillatorData();
      const input: DataDrivenRequest['input'] =
        method === 'arnoldi' || method === 'lanczos' || method === 'general-eigensolver'
          ? {
              kind: 'eigen',
              operator: {
                kind: 'dense',
                matrix:
                  method === 'general-eigensolver'
                    ? [
                        [0, -1],
                        [1, 0]
                      ]
                    : Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 8 - i : 0)))
              },
              settings: {
                method,
                k: method === 'general-eigensolver' ? 1 : 2,
                krylovDim: method === 'general-eigensolver' ? 2 : 8,
                maxRestarts: 20,
                tolerance: 1e-8,
                seed: 's28-artifact-replay',
                which: 'LA'
              }
            }
          : {
              kind: 'learning',
              data,
              settings: { ...learningDefaults(data, method), polynomialDegree: method === 'hamiltonian' ? 2 : 1 }
            };
      const request: DataDrivenRequest = {
        schema: 'pendulum-data-driven-request/v1',
        id: `s28-${method}`,
        mode: 'train',
        input
      };
      const original = await runDataDriven(request);
      expect(original.output.rows.length).toBeGreaterThan(0);
      expect(original.output.rows.flat().every(Number.isFinite)).toBe(true);
      if (method === 'general-eigensolver')
        expect(original.output.rows.map((row) => row.slice(1))).toEqual([
          [0, 1],
          [0, -1]
        ]);
      else if (method === 'arnoldi' || method === 'lanczos') {
        expect(original.output.rows[0]![1]).toBeCloseTo(8, 7);
        expect(original.output.rows[1]![1]).toBeCloseTo(7, 7);
      }
      const restored = await parseDataDrivenResult(await serializeDataDrivenResult(original));
      expect(restored).toEqual(original);
      expect(restored.request.input).toEqual(input);
      const evaluated = await reevaluateDataDriven(restored);
      expect(evaluated.request.mode).toBe('evaluate');
      expect(evaluated.request.parentId).toBe(restored.id);
      expect(evaluated.inputId).toBe(original.inputId);
      expect(evaluated.output).toEqual(original.output);
      expect(await parseDataDrivenResult(await serializeDataDrivenResult(evaluated))).toEqual(evaluated);
      expect((await runDataDriven(restored.request)).output).toEqual(original.output);
    });
  it('restores exact model/data/settings and can retrain or evaluate with explicit parent lineage', async () => {
    const request = modelRequest(),
      result = await runDataDriven(request);
    const restored = await parseDataDrivenResult(await serializeDataDrivenResult(result));
    expect(restored).toEqual(result);
    expect(Object.isFrozen(restored.output.model)).toBe(true);
    expect(restored.request.input).toEqual(request.input);
    const evaluated = await reevaluateDataDriven(restored);
    expect(evaluated.request.parentId).toBe(restored.id);
    expect(evaluated.request.mode).toBe('evaluate');
    expect(evaluated.inputId).toBe(restored.inputId);
    expect(evaluated.output).toEqual(restored.output);
    expect((await runDataDriven(request)).output).toEqual(result.output);
    expect(await parseDataDrivenResult(await serializeDataDrivenResult(evaluated))).toEqual(evaluated);
  });
  it('rejects edited results even after a public checksum has been regenerated', async () => {
    const result = structuredClone(await runDataDriven(modelRequest()));
    result.output.rows[0]![1]! += 1;
    const { id: _id, ...body } = result;
    result.id = await dataDrivenResultId(body);
    await expect(validateDataDrivenResult(result)).rejects.toThrow(/재평가/);
  });
  it('rejects another request, altered source, unsupported fields, versions and missing evaluation parent', async () => {
    const result = await runDataDriven(modelRequest());
    await expect(validateDataDrivenResult(result, { ...modelRequest(), id: 'other' })).rejects.toThrow(/계보/);
    const changed = structuredClone(result);
    if (changed.request.input.kind === 'learning') changed.request.input.data.values[0]![0]! += 1;
    await expect(validateDataDrivenResult(changed)).rejects.toThrow();
    expect(() => validateDataDrivenRequest({ ...modelRequest(), mode: 'evaluate' })).toThrow(/계보/);
    expect(() => validateDataDrivenRequest({ ...modelRequest(), schema: 'v2' })).toThrow();
    expect(() => validateDataDrivenRequest({ ...modelRequest(), id: 123 })).toThrow();
    expect(() => validateDataDrivenRequest({ ...modelRequest(), callback: 'execute' })).toThrow();
    await expect(parseDataDrivenResult('{')).rejects.toThrow();
  });
  it('reports native error as terminal event and progress only for an actual computation', async () => {
    const events: unknown[] = [];
    await executeDataDrivenJob({ ...modelRequest(), schema: 'invalid' } as never, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', id: 'worker-test' });
    const progress: { fraction: number | null; work: number }[] = [];
    await runDataDriven(modelRequest(), (e) => progress.push(e));
    expect(progress[0]).toEqual({ fraction: null, work: 0 });
    expect(progress.at(-1)?.fraction).toBe(1);
    expect(progress.every((p, i) => !i || p.work >= progress[i - 1]!.work)).toBe(true);
  });
});

describe('S23 inert bounded JSON', () => {
  it('does not invoke callbacks, accessors or toJSON and rejects dangerous prototypes, paths and cycles', () => {
    let invoked = false;
    const getter = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        invoked = true;
        return 1;
      }
    });
    expect(() => modelData(getter)).toThrow();
    expect(invoked).toBe(false);
    for (const value of [
      undefined,
      NaN,
      Infinity,
      () => 1,
      new Date(),
      Object.create({ a: 1 }),
      {
        toJSON() {
          invoked = true;
          return {};
        }
      },
      JSON.parse('{"__proto__":{"x":1}}'),
      { constructor: 1 },
      [1, , 3]
    ])
      expect(() => modelData(value)).toThrow();
    expect(invoked).toBe(false);
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => modelData(cycle)).toThrow();
    expect(() => modelData(Array.from({ length: 32769 }, () => 0))).toThrow();
    expect(() => parseModelJson(' '.repeat(16 * 1024 * 1024 + 1))).toThrow(/16 MiB/);
  });
  it('canonicalizes zeros and object order and hashes UTF8 with SHA256', async () => {
    expect(modelJson({ b: -0, a: '한글' })).toBe(modelJson({ a: '한글', b: 0 }));
    expect(await modelDigest({ a: 1, b: 2 })).toBe(await modelDigest({ b: 2, a: 1 }));
    expect(await modelDigest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
