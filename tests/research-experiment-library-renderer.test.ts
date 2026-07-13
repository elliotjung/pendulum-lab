import { describe, expect, it } from 'vitest';
import {
  experimentBadgeText,
  experimentOptionLabel,
  experimentSummaryText
} from '../src/app/parity/research-experiment-library-renderer';
import type { ResearchExperiment } from '../src/app/parity/shared';
import type { RuntimeSnapshot } from '../src/types/domain';

const snapshot = {
  hash: 'abc123',
  method: 'rk4',
  systemType: 'double',
  dt: 0.01
} as RuntimeSnapshot;

const experiment: ResearchExperiment = {
  id: 'exp-1',
  name: 'baseline',
  createdAt: '2026-07-07T00:00:00.000Z',
  updatedAt: '2026-07-07T00:00:00.000Z',
  notes: 'validated baseline',
  tags: ['paper'],
  snapshot,
  metrics: {
    drift: 1e-5,
    lambdaMax: -0.1,
    fps: 60,
    physicsMsPerFrame: 1,
    poincarePoints: 12,
    qualityScore: 95,
    validationStatus: 'pass'
  },
  favorite: true
};

describe('research experiment library renderer helpers', () => {
  it('keeps favorite option labels compact and deterministic', () => {
    expect(experimentOptionLabel(experiment)).toBe('* baseline');
  });

  it('summarizes selected and filtered experiment counts', () => {
    expect(experimentSummaryText(3, 1, experiment)).toContain(
      '3 experiment(s) (1 matching filter). Selected: baseline'
    );
    expect(experimentSummaryText(0, 0)).toBe('0 experiment(s). Save current state to begin.');
  });

  it('emits publication-readiness badges from experiment metrics', () => {
    expect(experimentBadgeText(experiment)).toBe('[reproducible] [validated] [export-ready]');
  });
});
