import { describe, expect, it } from 'vitest';
import {
  designPointCanvasPosition,
  designSummaryText,
  designTableRows
} from '../src/app/parity/research-design-renderers';
import type { DesignStudyState } from '../src/app/parity/research-design-types';

const design: DesignStudyState = {
  schemaVersion: 'pendulum-design-study/v1',
  id: 'design-test',
  generatedAt: '2026-07-07T00:00:00.000Z',
  variables: [
    { key: 'theta1', min: 0, max: 2 },
    { key: 'damping', min: 0, max: 1 }
  ],
  strategy: 'sobol',
  count: 2,
  replicates: 1,
  budget: { maxPoints: 8, maxTimeMs: 1000, maxFailures: 2 },
  status: 'complete',
  message: 'done',
  points: [
    {
      id: 'p0',
      origin: 'design',
      replicate: 0,
      values: { theta1: 1, damping: 0.5 },
      results: {
        lambdaMax: 0.12345,
        lambdaBlockStdError: 0.00678,
        rqaDeterminism: 0.8,
        rqaDivergence: 0.2,
        ftle: 1.25,
        durationMs: 20,
        completedAt: '2026-07-07T00:00:01.000Z'
      }
    },
    { id: 'p1', origin: 'boundary', replicate: 0, values: { theta1: 2, damping: 1 }, error: 'timeout' }
  ]
};

describe('research design render helpers', () => {
  it('projects a design point into the padded canvas plot area', () => {
    const point = design.points[0]!;
    const position = designPointCanvasPosition(point, design.variables[0]!, design.variables[1]!, 320, 200);
    expect(position.x).toBe(160);
    expect(position.y).toBe(100);
  });

  it('summarizes completion and failure counts without touching the DOM', () => {
    expect(designSummaryText(design)).toContain('2 points (1 complete, 1 failed)');
    expect(designSummaryText(design)).toContain('Status: complete');
  });

  it('builds stable table rows for the design study renderer', () => {
    expect(designTableRows(design)).toEqual([
      ['design', 'theta1=1.000 damping=0.500', '0.1235', '+/-0.0068', '1.250', ''],
      ['boundary', 'theta1=2.000 damping=1.000', '-', '-', '-', 'timeout']
    ]);
  });
});
