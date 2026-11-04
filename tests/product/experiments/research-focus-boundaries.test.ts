import { afterEach, describe, expect, it, vi } from 'vitest';
import sample from '../../../content/learn/course-1/1.1';
import {
  researchFocusDeclaration,
  researchPresetFields,
  validateResearchFields
} from '../../../src/product/experiments/research-focus-definitions';
import { researchCanonical } from '../../../src/product/experiments/research-focus-config';
import { createResearchRuntime } from '../../../src/product/experiments/research-focus-runtime';
import {
  createResearchExecutor,
  RESEARCH_FOCUS_TIMEOUT_MS
} from '../../../src/product/experiments/research-focus-client';
import { validateResearchResult } from '../../../src/product/experiments/research-focus-validation';
import {
  loadResearchFocusFields,
  saveResearchFocusFields,
  researchFocusStorageKey,
  researchFocusLabHref
} from '../../../src/product/experiments/research-focus-transfer';
import type { ResearchFocusResult } from '../../../src/product/experiments/research-focus-contracts';
import type {
  ResearchEvent,
  ResearchRequest,
  ResearchWorker
} from '../../../src/product/experiments/research-focus-worker';
import type { LearnUnit } from '../../../src/product/learn/schema';
import { decodeShareToken } from '../../../src/product/persistence/share';

function fixture(id = '5.2') {
  const unit: LearnUnit = { ...sample, id, courseId: `course-${id[0]}`, contentVersion: 1 };
  const fields = researchPresetFields(id);
  const request: ResearchRequest = { id: `test_${id.replace('.', '_')}`, unitId: id, fields };
  const result: ResearchFocusResult = {
    schema: 'pendulum-research-focus/v1',
    unitId: id,
    fields,
    canonical: researchCanonical(unit, fields),
    metrics: [{ id: 'measured', label: '측정값', value: 1, unit: '1' }],
    tables: [{ id: 'settings', title: '설정', columns: ['변수', '값'], rows: [['N', 128]] }],
    charts: [
      {
        id: 'trace',
        title: '응답',
        xLabel: '시간 (s)',
        yLabel: '각도 (rad)',
        series: [{ label: '실제 응답', points: [{ x: 0, y: 1 }] }]
      }
    ],
    warnings: ['유한시간 결과입니다.']
  };
  return { unit, fields, request, result };
}
class WorkerFixture implements ResearchWorker {
  onmessage: ResearchWorker['onmessage'] = null;
  onerror: ResearchWorker['onerror'] = null;
  onmessageerror: ResearchWorker['onmessageerror'] = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  send(data: ResearchEvent) {
    this.onmessage?.({ data } as MessageEvent<ResearchEvent>);
  }
}
afterEach(() => vi.useRealTimers());
describe('S26 isolated research focus contracts', () => {
  it.each(['4.1', '4.10', '5.1', '5.13'])('%s roundtrips full input and exact canonical state', (id) => {
    const { unit, fields } = fixture(id);
    const saved = new Map<string, string>();
    saveResearchFocusFields({ setItem: (k, v) => saved.set(k, v) }, unit, fields);
    expect(loadResearchFocusFields({ getItem: (k) => saved.get(k) ?? null }, unit)).toEqual(fields);
    const href = researchFocusLabHref(unit, fields);
    const token = new URLSearchParams(href.split('?')[1]).get('state')!;
    expect(decodeShareToken(token)).toEqual({ ok: true, value: researchCanonical(unit, fields) });
  });
  it.each(['4.0', '4.11', '5.14', '6.1', '../4.1'])('rejects unreviewed unit %s', (id) =>
    expect(() => researchFocusDeclaration(id)).toThrow()
  );
  it('rejects hidden, extra, nonfinite, accessor and prototype settings without invoking getters', () => {
    const { fields } = fixture();
    expect(() => validateResearchFields('5.2', { ...fields, unknown: 1 })).toThrow();
    expect(() => validateResearchFields('5.2', { ...fields, step: NaN })).toThrow();
    const hidden = researchFocusDeclaration('5.2').fields.find(
      (f) => !researchFocusDeclaration('5.2').exposed.includes(f.id)
    )!;
    expect(() => validateResearchFields('5.2', { ...fields, [hidden.id]: hidden.value + 0.01 })).toThrow();
    const getter = vi.fn(() => 1);
    const bad = { ...fields };
    Object.defineProperty(bad, 'step', { get: getter, enumerable: true });
    expect(() => validateResearchFields('5.2', bad)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => validateResearchFields('5.2', Object.assign(Object.create({ inherited: 1 }), fields))).toThrow();
  });
  it('retains corrupt and forged stored originals without mutation', () => {
    const { unit, fields } = fixture();
    let original = '{broken';
    const storage = { getItem: () => original };
    expect(() => loadResearchFocusFields(storage, unit)).toThrow();
    expect(original).toBe('{broken');
    let stored = '';
    saveResearchFocusFields(
      {
        setItem: (_k, v) => {
          stored = v;
        }
      },
      unit,
      fields
    );
    const payload = JSON.parse(stored);
    payload.experiment.provenance.source.id = 'learn:course-5:5.3:v1';
    original = JSON.stringify(payload);
    expect(() => loadResearchFocusFields(storage, unit)).toThrow();
    expect(original).toContain('5.3');
    expect(researchFocusStorageKey(unit)).toContain('course-5/5.2');
  });
  it.each([
    [
      'nonfinite metric',
      (r: ResearchFocusResult) => {
        (r.metrics[0] as { value: number }).value = Infinity;
      }
    ],
    [
      'wrong input',
      (r: ResearchFocusResult) => {
        (r.fields as Record<string, number>).step = 0.123;
      }
    ],
    [
      'unit mismatch',
      (r: ResearchFocusResult) => {
        (r as { unitId: string }).unitId = '5.3';
      }
    ],
    [
      'canonical unit',
      (r: ResearchFocusResult) => {
        (r.canonical.initialConditions[Object.keys(r.canonical.initialConditions)[0]!] as { unit: string }).unit = 'm';
      }
    ],
    [
      'chart NaN',
      (r: ResearchFocusResult) => {
        (r.charts[0]!.series[0]!.points[0] as { y: number }).y = NaN;
      }
    ],
    [
      'string point',
      (r: ResearchFocusResult) => {
        (r.charts[0]!.series[0]!.points[0] as unknown as { x: string }).x = '1';
      }
    ],
    [
      'table shape',
      (r: ResearchFocusResult) => {
        (r.tables[0]!.rows as unknown[][]).push([1]);
      }
    ],
    [
      'unknown field',
      (r: ResearchFocusResult) => {
        Object.assign(r, { unreviewed: true });
      }
    ],
    [
      'duplicate ID',
      (r: ResearchFocusResult) => {
        (r.metrics as unknown[]).push(r.metrics[0]);
      }
    ]
  ] as const)('rejects worker %s', (_label, change) => {
    const { request, result } = fixture();
    const copy = structuredClone(result);
    change(copy);
    expect(() => validateResearchResult(copy, request)).toThrow();
  });
  it('accepts a bounded valid result as an isolated clone', () => {
    const { request, result } = fixture();
    const parsed = validateResearchResult(result, request);
    expect(parsed).toEqual(result);
    expect(parsed).not.toBe(result);
  });
  it('terminates a stalled worker, rejects progress regression and closes late events', () => {
    vi.useFakeTimers();
    const { request } = fixture();
    const worker = new WorkerFixture();
    const events: ResearchEvent[] = [];
    createResearchExecutor(() => worker)(request, (e) => events.push(e));
    worker.send({ type: 'progress', id: request.id, fraction: 0.4 });
    worker.send({ type: 'progress', id: request.id, fraction: 0.2 });
    expect(events.at(-1)?.type).toBe('error');
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = new WorkerFixture();
    const later: ResearchEvent[] = [];
    createResearchExecutor(() => second)(request, (e) => later.push(e));
    vi.advanceTimersByTime(RESEARCH_FOCUS_TIMEOUT_MS);
    expect(later.at(-1)?.type).toBe('error');
    expect(second.terminate).toHaveBeenCalledOnce();
  });
  it('shows startup and malformed response failures', async () => {
    const { request } = fixture();
    const events: ResearchEvent[] = [];
    createResearchExecutor(() => {
      throw new Error('denied');
    })(request, (e) => events.push(e));
    await Promise.resolve();
    expect(events.at(-1)?.type).toBe('error');
    const worker = new WorkerFixture();
    createResearchExecutor(() => worker)(request, (e) => events.push(e));
    worker.send({ type: 'result', id: request.id, result: {} as ResearchFocusResult });
    expect(events.at(-1)?.type).toBe('error');
  });
  it('cancels and restarts without accepting stale completion or exposing mutable state', () => {
    const { unit, result } = fixture();
    const runs: { request: ResearchRequest; emit: (e: ResearchEvent) => void; dispose: ReturnType<typeof vi.fn> }[] =
      [];
    const runtime = createResearchRuntime(unit, {
      executor: (request, emit) => {
        const dispose = vi.fn();
        runs.push({ request, emit, dispose });
        return { dispose };
      }
    });
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('running');
    expect(runtime.setFields({}).ok).toBe(false);
    runtime.cancel();
    runs[0]!.emit({ type: 'result', id: runs[0]!.request.id, result });
    expect(runtime.getSnapshot().status).toBe('cancelled');
    runtime.run();
    runs[1]!.emit({ type: 'result', id: runs[1]!.request.id, result });
    expect(runtime.getSnapshot().status).toBe('completed');
    const snapshot = runtime.getSnapshot();
    (snapshot.result!.metrics[0] as { value: number }).value = 500;
    expect(runtime.getSnapshot().result?.metrics[0]?.value).toBe(1);
    runtime.restart();
    expect(runtime.getSnapshot().result).toBeNull();
    runtime.dispose();
    runtime.run();
    expect(runs).toHaveLength(2);
  });
  it('handles synchronous executor completion and rejects corrupted injected results', () => {
    const { unit, result } = fixture();
    const dispose = vi.fn();
    const runtime = createResearchRuntime(unit, {
      executor: (request, emit) => {
        emit({ type: 'result', id: request.id, result });
        return { dispose };
      }
    });
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('completed');
    expect(dispose).toHaveBeenCalledOnce();
    const broken = createResearchRuntime(unit, {
      executor: (request, emit) => {
        emit({ type: 'result', id: request.id, result: { ...result, unitId: '5.3' } });
        return { dispose };
      }
    });
    broken.run();
    expect(broken.getSnapshot().status).toBe('error');
  });
});
