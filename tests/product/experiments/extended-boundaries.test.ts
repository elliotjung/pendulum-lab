import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createExtendedExecutor,
  EXTENDED_WORKER_TIMEOUT_MS,
  validateExtendedResult
} from '../../../src/product/experiments/extended-client';
import { extendedPresetFields } from '../../../src/product/experiments/extended-config';
import { executeExtendedExperiment } from '../../../src/product/experiments/extended-science';
import {
  extendedFocusLabHref,
  extendedFocusStorageKey,
  loadExtendedFocusFields,
  saveExtendedFocusFields
} from '../../../src/product/experiments/extended-transfer';
import type { ExtendedEvent, ExtendedRequest, ExtendedWorker } from '../../../src/product/experiments/extended-worker';
import type { LearnUnit } from '../../../src/product/learn/schema';
import { createExtendedRuntime } from '../../../src/product/experiments/extended-runtime';
import { decodeShareToken } from '../../../src/product/persistence/share';
import { parseProductRoute } from '../../../src/product/contracts/routes';

const request: ExtendedRequest = { id: 'boundary-2-1', unitId: '2.1', fields: extendedPresetFields('2.1') };
const valid = executeExtendedExperiment(request.unitId, request.fields);
const unit = { id: '2.1', courseId: 'course-2', contentVersion: 1 } as LearnUnit;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}
function fakeWorker() {
  const worker: ExtendedWorker & { sent: ExtendedRequest[]; terminated: number } = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    sent: [],
    terminated: 0,
    postMessage(message) {
      this.sent.push(message);
    },
    terminate() {
      this.terminated++;
    }
  };
  return worker;
}
type MutableData = Record<string, unknown>;
const modified = (change: (data: MutableData) => void): unknown => {
  const data = structuredClone(valid) as unknown as MutableData;
  change(data);
  return data;
};

afterEach(() => vi.useRealTimers());

describe('S25 untrusted worker result contract', () => {
  it.each([2, 3].flatMap((course) => Array.from({ length: 9 }, (_, i) => `${course}.${i + 1}`)))(
    '%s accepts every declared native result after structural and source checks',
    (id) => {
      const expected: ExtendedRequest = { id: `valid-${id}`, unitId: id, fields: extendedPresetFields(id) };
      const result = executeExtendedExperiment(id, expected.fields);
      expect(validateExtendedResult(result, expected)).toEqual(result);
    }
  );
  it('accepts real declared data and returns a detached safe-data copy', () => {
    const input = structuredClone(valid);
    const result = validateExtendedResult(input, request);
    expect(result).toEqual(valid);
    expect(result).not.toBe(input);
    expect(result.trace).not.toBe(input.trace);
  });

  it.each([
    ['2.3', 'adaptive-steps', 3],
    ['2.4', 'canonical-energy', 1],
    ['2.5', 'stiff-radius', 2]
  ] as const)('%s rejects nonnumeric values in a numeric chart column', (id, tableId, column) => {
    const expected: ExtendedRequest = { id: `numeric-${id}`, unitId: id, fields: extendedPresetFields(id) };
    const result = structuredClone(executeExtendedExperiment(id, expected.fields)) as unknown as MutableData;
    const target = (result.tables as { id: string; rows: unknown[][] }[]).find((entry) => entry.id === tableId)!;
    target.rows[0]![column] = 'not-a-number';
    expect(() => validateExtendedResult(result, expected)).toThrow();
  });

  it.each([
    [
      'wrong source unit',
      (data: MutableData) => {
        data.unitId = '2.2';
      }
    ],
    [
      'unexpected top-level field',
      (data: MutableData) => {
        data.undeclared = true;
      }
    ],
    [
      'wrong restart fields',
      (data: MutableData) => {
        (data.fields as MutableData).omega1 = 0.5;
      }
    ],
    [
      'empty state',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.state = [];
      }
    ],
    [
      'wrong state dimension',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.state = [0, 0];
      }
    ],
    [
      'missing physical points',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.positions = [];
      }
    ],
    [
      'negative physical time',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.time = -1;
      }
    ],
    [
      'time beyond declared duration',
      (data: MutableData) => {
        (data.trace as MutableData[]).at(-1)!.time = 99;
      }
    ],
    [
      'nonfinite diagnostic',
      (data: MutableData) => {
        (data.metrics as MutableData[])[0]!.value = Infinity;
      }
    ],
    [
      'duplicate metric identity',
      (data: MutableData) => {
        (data.metrics as MutableData[]).push(structuredClone((data.metrics as MutableData[])[0]!));
      }
    ],
    [
      'string tensions causing unbounded renderer series',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.tensions = 'a'.repeat(16_384);
      }
    ],
    [
      'invalid optional constraint',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.constraint = '0';
      }
    ],
    [
      'invalid optional momentum',
      (data: MutableData) => {
        (data.trace as MutableData[])[0]!.verticalMomentum = null;
      }
    ],
    [
      'malformed companion',
      (data: MutableData) => {
        data.companions = ['not-a-companion'];
      }
    ],
    [
      'undeclared companion setting type',
      (data: MutableData) => {
        data.companions = [{ id: 'bad', description: 'invalid nested settings', settings: { algorithm: [1] } }];
      }
    ],
    [
      'unsafe accessor',
      (data: MutableData) => {
        Object.defineProperty(data, 'danger', {
          enumerable: true,
          get() {
            throw new Error('getter must not execute');
          }
        });
      }
    ]
  ] as const)('rejects %s before rendering or acceptance', (_label, change) => {
    expect(() => validateExtendedResult(modified(change), request)).toThrow();
  });

  it('rejects a native-valid S21 batch from another declared input even without an expected batch attachment', () => {
    const requested: ExtendedRequest = { id: 'batch-guard', unitId: '2.9', fields: extendedPresetFields('2.9') };
    const result = executeExtendedExperiment(requested.unitId, requested.fields);
    const different = executeExtendedExperiment(requested.unitId, { ...requested.fields, duration: 1 });
    expect(different.batch?.plan.id).not.toBe(result.batch?.plan.id);
    expect(() => validateExtendedResult({ ...result, batch: different.batch }, requested)).toThrow();
  });
});

describe('S25 worker lifecycle and cancellation boundaries', () => {
  it('returns detached accepted edits so callers cannot mutate runtime state through the result', () => {
    const runtime = createExtendedRuntime(unit);
    const edited = runtime.setFields({ omega1: 0.4 });
    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error('Expected valid editable velocity.');
    (edited.value as Record<string, number>).m1 = 9;
    expect(runtime.getSnapshot().fields.m1).toBe(1);
    runtime.dispose();
  });
  it('discards another job and all queued messages after cancellation', () => {
    const worker = fakeWorker();
    const events: ExtendedEvent[] = [];
    const job = createExtendedExecutor(() => worker)(request, (event) => events.push(event));
    const handler = worker.onmessage!;
    handler({ data: { type: 'progress', id: 'another-job', fraction: 1 } } as MessageEvent<ExtendedEvent>);
    expect(events).toEqual([]);
    job.dispose();
    handler({ data: { type: 'result', id: request.id, result: valid } } as MessageEvent<ExtendedEvent>);
    handler({ data: { type: 'error', id: request.id, message: 'late failure' } } as MessageEvent<ExtendedEvent>);
    expect(worker.terminated).toBe(1);
    expect(events).toEqual([]);
    expect(worker.onmessage).toBeNull();
  });

  it('fails once on regressing progress and terminates the actual worker', () => {
    const worker = fakeWorker();
    const events: ExtendedEvent[] = [];
    createExtendedExecutor(() => worker)(request, (event) => events.push(event));
    const handler = worker.onmessage!;
    handler({ data: { type: 'progress', id: request.id, fraction: 0.5 } } as MessageEvent<ExtendedEvent>);
    handler({ data: { type: 'progress', id: request.id, fraction: 0.4 } } as MessageEvent<ExtendedEvent>);
    handler({ data: { type: 'result', id: request.id, result: valid } } as MessageEvent<ExtendedEvent>);
    expect(events.map((event) => event.type)).toEqual(['progress', 'error']);
    expect(worker.terminated).toBe(1);
  });

  it('times out inactivity, while valid progress restarts the inactivity window', () => {
    vi.useFakeTimers();
    const worker = fakeWorker();
    const events: ExtendedEvent[] = [];
    createExtendedExecutor(() => worker)(request, (event) => events.push(event));
    vi.advanceTimersByTime(EXTENDED_WORKER_TIMEOUT_MS - 1);
    worker.onmessage!({ data: { type: 'progress', id: request.id, fraction: 0.1 } } as MessageEvent<ExtendedEvent>);
    vi.advanceTimersByTime(EXTENDED_WORKER_TIMEOUT_MS - 1);
    expect(events.map((event) => event.type)).toEqual(['progress']);
    vi.advanceTimersByTime(1);
    expect(events.map((event) => event.type)).toEqual(['progress', 'error']);
    expect(worker.terminated).toBe(1);
  });

  it('blocks malformed result without emitting a success event', () => {
    const worker = fakeWorker();
    const events: ExtendedEvent[] = [];
    createExtendedExecutor(() => worker)(request, (event) => events.push(event));
    worker.onmessage!({
      data: { type: 'result', id: request.id, result: { ...valid, unitId: '3.1' } }
    } as MessageEvent<ExtendedEvent>);
    expect(events.map((event) => event.type)).toEqual(['error']);
    expect(worker.terminated).toBe(1);
  });
});

describe('S25 isolated restart session and unchanged share contract', () => {
  it.each([2, 3].flatMap((course) => Array.from({ length: 9 }, (_, i) => `${course}.${i + 1}`)))(
    '%s preserves all declared fields, units and provenance in restart and Lab transfer',
    (id) => {
      const lesson = { id, courseId: `course-${id[0]}`, contentVersion: 1 } as LearnUnit;
      const fields = extendedPresetFields(id);
      const target = memoryStorage();
      saveExtendedFocusFields(target, lesson, fields);
      expect(loadExtendedFocusFields(target, lesson)).toEqual(fields);
      const stored = JSON.parse(target.getItem(extendedFocusStorageKey(lesson))!) as { experiment: unknown };
      const parsed = parseProductRoute(extendedFocusLabHref(lesson, fields));
      if (!parsed.ok || parsed.value.kind !== 'lab-system') throw new Error('Expected a Lab route.');
      const decoded = decodeShareToken(parsed.value.stateToken);
      if (!decoded.ok) throw new Error('Expected canonical input with SI units.');
      expect(decoded.value).toEqual(stored.experiment);
      expect(decoded.value.provenance?.source.id).toBe(`learn:course-${id[0]}:${id}:v1`);
    }
  );
  it('round trips edited restart fields and source through the canonical share route', () => {
    const fields = { ...request.fields, theta1: 0.7, omega1: 0.3 };
    const parsed = parseProductRoute(extendedFocusLabHref(unit, fields));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.kind !== 'lab-system') throw new Error('Expected a Lab route.');
    const decoded = decodeShareToken(parsed.value.stateToken);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Expected a canonical share token.');
    expect(decoded.value.provenance?.source).toEqual({ kind: 'derived', id: 'learn:course-2:2.1:v1' });
    const target = memoryStorage();
    target.setItem('legacy-state', 'original');
    target.setItem('learning-progress', 'original');
    saveExtendedFocusFields(target, unit, fields);
    expect(loadExtendedFocusFields(target, unit)).toEqual(fields);
    expect(target.getItem('legacy-state')).toBe('original');
    expect(target.getItem('learning-progress')).toBe('original');
    expect(target.data.size).toBe(3);
  });

  it.each(['not json', 'x'.repeat(65537), '{"schema":"future"}', '{"__proto__":{}}', '{"schema":1,"schema":2}'])(
    'preserves unreadable, ambiguous or future stored originals without writes',
    (raw) => {
      const target = memoryStorage();
      target.setItem(extendedFocusStorageKey(unit), raw);
      const before = [...target.data];
      expect(() => loadExtendedFocusFields(target, unit)).toThrow();
      expect([...target.data]).toEqual(before);
    }
  );

  it('rejects a changed unit source, fixed value or canonical runtime while preserving the stored string', () => {
    const target = memoryStorage();
    saveExtendedFocusFields(target, unit, request.fields);
    const original = target.getItem(extendedFocusStorageKey(unit))!;
    for (const change of [
      (data: MutableData) => {
        data.contentVersion = 2;
      },
      (data: MutableData) => {
        (data.fields as MutableData).m1 = 2;
      },
      (data: MutableData) => {
        ((data.experiment as MutableData).runtime as MutableData).endTime = 3;
      },
      (data: MutableData) => {
        (((data.experiment as MutableData).provenance as MutableData).source as MutableData).id =
          'learn:course-2:2.2:v1';
      }
    ]) {
      const data = JSON.parse(original) as MutableData;
      change(data);
      const raw = JSON.stringify(data);
      target.setItem(extendedFocusStorageKey(unit), raw);
      expect(() => loadExtendedFocusFields(target, unit)).toThrow();
      expect(target.getItem(extendedFocusStorageKey(unit))).toBe(raw);
    }
  });
});
