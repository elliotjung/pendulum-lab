/** Mutable parity-layer state, isolated from DOM and formatting helpers. */
import type { RunMode, RuntimeSnapshot } from '../../types/domain';
import type { ValidationCaseResult } from '../../validation/validationSuite';
import {
  defaultResearchLayoutPreferences,
  defaultResearchProjectProfile,
  defaultResearchSessionProfile,
  defaultResearchWorkspaceProfile,
  type AuditResult,
  type CanonicalQa,
  type ResearchWorkbenchState
} from './shared-types';

const initialResearchWorkspace = defaultResearchWorkspaceProfile();
const initialResearchProject = defaultResearchProjectProfile(initialResearchWorkspace.createdAt);
const initialResearchSession = defaultResearchSessionProfile(
  initialResearchProject.id,
  initialResearchWorkspace.createdAt
);

export const state = {
  mode: 'demo' as RunMode,
  recoveries: 0,
  auditLog: [] as string[],
  checkpoints: [] as RuntimeSnapshot[],
  lastValidation: null as ValidationCaseResult[] | null,
  lastCanonicalQa: null as CanonicalQa | null,
  lastAudit: null as AuditResult | null,
  lastFault: 'No runtime faults recorded.',
  research: {
    project: initialResearchProject,
    sessions: [initialResearchSession],
    workspace: initialResearchWorkspace,
    workspaces: [initialResearchWorkspace],
    layout: defaultResearchLayoutPreferences(),
    experiments: [],
    selectedExperimentId: '',
    runLog: [],
    parameterStudy: null,
    batchCheckpoint: null,
    comparisonRows: []
  } as ResearchWorkbenchState
};
