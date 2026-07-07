import type { DesignBudget, DesignPoint, MultiStrategy, StudyVariable } from '../../research/experimentDesign';
import type { StudyPointResults } from './shared';

export interface DesignStudyPointState {
  id: string;
  values: Record<string, number>;
  origin: DesignPoint['origin'];
  replicate: number;
  attempts?: number;
  results?: StudyPointResults;
  error?: string;
}

export interface DesignStudyState {
  schemaVersion: 'pendulum-design-study/v1';
  id: string;
  generatedAt: string;
  variables: StudyVariable[];
  strategy: MultiStrategy;
  count: number;
  replicates: number;
  budget: DesignBudget;
  points: DesignStudyPointState[];
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'failed' | 'budget-stopped';
  message: string;
}
