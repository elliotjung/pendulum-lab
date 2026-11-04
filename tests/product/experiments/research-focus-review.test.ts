import { describe, expect, it, vi } from 'vitest';
import sample from '../../../content/learn/course-1/1.1';
import type { LearnUnit } from '../../../src/product/learn/schema';
import type { ResearchFocusResult } from '../../../src/product/experiments/research-focus-contracts';
import { researchPresetFields } from '../../../src/product/experiments/research-focus-definitions';
import { researchCanonical } from '../../../src/product/experiments/research-focus-config';
import { validateResearchResult } from '../../../src/product/experiments/research-focus-validation';
import { createResearchRuntime } from '../../../src/product/experiments/research-focus-runtime';
import { createResearchExecutor } from '../../../src/product/experiments/research-focus-client';
import type { ResearchEvent } from '../../../src/product/experiments/research-focus-worker';

function fixture() {
  const unit: LearnUnit = { ...sample, id: '5.2', courseId: 'course-5', contentVersion: 1 };
  const fields = researchPresetFields(unit.id);
  const request = { id: 'independent_review', unitId: unit.id, fields };
  const result: ResearchFocusResult = {
    schema: 'pendulum-research-focus/v1',
    unitId: unit.id,
    fields,
    canonical: researchCanonical(unit, fields),
    metrics: [{ id: 'value', label: '측정값', value: 1, unit: '1' }],
    tables: [],
    charts: [
      {
        id: 'phase',
        title: '위상',
        xLabel: '각도(rad)',
        yLabel: '각속도(rad/s)',
        series: [
          {
            label: 'native',
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.2, y: 0.3 }
            ]
          }
        ]
      }
    ],
    warnings: ['유한 표본의 수치 진단입니다.']
  };
  return { unit, request, result };
}

describe('S26 independent lifecycle and plotting review', () => {
  it.each(['line', 'scatter'] as const)('accepts the declared %s drawing mode through the worker boundary', (mode) => {
    const { request, result } = fixture();
    const withMode = { ...result, charts: result.charts.map((chart) => ({ ...chart, mode })) };
    expect(validateResearchResult(withMode, request)).toEqual(withMode);
  });

  it.each(['unknown', 1, null])('rejects an unsupported drawing mode %s', (mode) => {
    const { request, result } = fixture();
    const malformed = { ...result, charts: result.charts.map((chart) => ({ ...chart, mode })) };
    expect(() => validateResearchResult(malformed, request)).toThrow();
  });

  it('does not start a worker after a synchronous running-state subscriber cancels the run', () => {
    const { unit } = fixture();
    const executor = vi.fn(() => ({ dispose: vi.fn() }));
    const runtime = createResearchRuntime(unit, { executor });
    runtime.subscribe((snapshot) => {
      if (snapshot.status === 'running') runtime.cancel();
    });
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('cancelled');
    expect(executor).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('suppresses a deferred startup failure after the request is disposed', async () => {
    const { request } = fixture();
    const events: ResearchEvent[] = [];
    const job = createResearchExecutor(() => {
      throw new Error('blocked fixture');
    })(request, (event) => events.push(event));
    job.dispose();
    await Promise.resolve();
    expect(events).toEqual([]);
  });
});
