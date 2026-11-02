import { describe, expect, it } from 'vitest';
import { modelRequest } from './fixtures';
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
