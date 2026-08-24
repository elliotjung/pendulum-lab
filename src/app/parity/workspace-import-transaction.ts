import { canonicalLabSnapshot } from '../LabSnapshotRestore';
import { stateHash } from '../../state/StateStore';
import type { RuntimeSnapshot } from '../../types/domain';
import { FIGURE_CAPTIONS } from './paper-figure-capture';
import { DESIGN_VARIABLE_KEYS } from './research-design-controller';
import type { DesignStudyPointState, DesignStudyState } from './research-design-types';
import { isPlainObject } from './research-storage-validation';
import { normalizeResearchStorage } from './storage-schema';
import type { ResearchWorkbenchState } from './shared-types';

export type WorkspaceImportPhase = 'stage' | 'backup' | 'apply' | 'verify' | 'rollback';

export type WorkspaceImportDiagnosticCode =
  | 'WORKSPACE_IMPORT_SCHEMA_INVALID'
  | 'WORKSPACE_IMPORT_DESIGN_INVALID'
  | 'WORKSPACE_IMPORT_SNAPSHOT_INVALID'
  | 'WORKSPACE_IMPORT_BUSY'
  | 'WORKSPACE_IMPORT_RUNTIME_UNAVAILABLE'
  | 'WORKSPACE_IMPORT_BACKUP_FAILED'
  | 'WORKSPACE_IMPORT_APPLY_FAILED'
  | 'WORKSPACE_IMPORT_VERIFY_FAILED'
  | 'WORKSPACE_IMPORT_ROLLED_BACK'
  | 'WORKSPACE_IMPORT_ROLLBACK_FAILED'
  | 'WORKSPACE_IMPORT_COMMITTED';

export interface WorkspaceImportDiagnostic {
  code: WorkspaceImportDiagnosticCode;
  phase: WorkspaceImportPhase;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
}

export interface WorkspaceImportStage {
  research: ResearchWorkbenchState;
  researchMigrations: string[];
  droppedResearchEntries: number;
  designStudy: DesignStudyState | null;
  restoreDesignStudy: boolean;
  figureCaptionPatch: Record<string, string>;
  mergeFigureCaptions: boolean;
  snapshot: RuntimeSnapshot | null;
  restoreSnapshot: boolean;
  ignoredFigureCaptionIds: string[];
}

export type WorkspaceImportStageResult =
  { ok: true; value: WorkspaceImportStage } | { ok: false; diagnostic: WorkspaceImportDiagnostic };

export interface WorkspaceImportTransactionAdapter<TBackup> {
  backup(stage: WorkspaceImportStage): Promise<TBackup>;
  apply(stage: WorkspaceImportStage, backup: TBackup): Promise<void>;
  verify(stage: WorkspaceImportStage, backup: TBackup): Promise<void>;
  rollback(backup: TBackup): Promise<void>;
  verifyRollback?(backup: TBackup): Promise<void>;
}

export interface WorkspaceImportTransactionResult {
  status: 'committed' | 'rejected' | 'rolled-back' | 'rollback-failed';
  diagnostics: WorkspaceImportDiagnostic[];
}

export class WorkspaceImportOperationError extends Error {
  constructor(
    readonly code: WorkspaceImportDiagnosticCode,
    message: string
  ) {
    super(message);
    this.name = 'WorkspaceImportOperationError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function operationCode(error: unknown, fallback: WorkspaceImportDiagnosticCode): WorkspaceImportDiagnosticCode {
  return error instanceof WorkspaceImportOperationError ? error.code : fallback;
}

function failure(
  code: WorkspaceImportDiagnosticCode,
  phase: WorkspaceImportPhase,
  message: string
): WorkspaceImportStageResult {
  return { ok: false, diagnostic: { code, phase, severity: 'error', message } };
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function canonicalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeInteger(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function sanitizeDesignPoint(
  value: unknown,
  variables: Map<string, { min: number; max: number }>,
  ids: Set<string>,
  problems: string[]
): DesignStudyPointState | null {
  if (!isPlainObject(value)) {
    problems.push('a design point is not an object');
    return null;
  }
  if (!boundedString(value.id, 100) || ids.has(value.id)) {
    problems.push('design point ids must be unique non-empty strings of at most 100 characters');
    return null;
  }
  if (!isPlainObject(value.values)) {
    problems.push(`design point ${value.id} has invalid values`);
    return null;
  }
  const values: Record<string, number> = {};
  for (const [key, bounds] of variables) {
    const pointValue = value.values[key];
    if (!finite(pointValue) || pointValue < bounds.min || pointValue > bounds.max) {
      problems.push(`design point ${value.id} has an out-of-range ${key} value`);
      return null;
    }
    values[key] = pointValue;
  }
  if (Object.keys(value.values).some((key) => !variables.has(key))) {
    problems.push(`design point ${value.id} contains an undeclared variable`);
    return null;
  }
  const origins = new Set(['design', 'adaptive', 'boundary', 'uncertainty', 'replicate']);
  if (!origins.has(String(value.origin)) || !safeInteger(value.replicate, 0, 7)) {
    problems.push(`design point ${value.id} has invalid origin or replicate metadata`);
    return null;
  }
  const point: DesignStudyPointState = {
    id: value.id,
    values,
    origin: value.origin as DesignStudyPointState['origin'],
    replicate: value.replicate
  };
  if (value.attempts !== undefined) {
    if (!safeInteger(value.attempts, 0, 50)) {
      problems.push(`design point ${value.id} has invalid attempts metadata`);
      return null;
    }
    point.attempts = value.attempts;
  }
  if (value.error !== undefined) {
    if (typeof value.error !== 'string' || value.error.length > 400) {
      problems.push(`design point ${value.id} has an invalid error message`);
      return null;
    }
    point.error = value.error;
  }
  if (value.results !== undefined) {
    if (!isPlainObject(value.results)) {
      problems.push(`design point ${value.id} has invalid results`);
      return null;
    }
    const results = value.results;
    const resultKeys = ['lambdaMax', 'lambdaBlockStdError', 'rqaDeterminism', 'rqaDivergence', 'ftle'] as const;
    if (resultKeys.some((key) => !finite(results[key])) || !canonicalDate(results.completedAt)) {
      problems.push(`design point ${value.id} has incomplete numerical results`);
      return null;
    }
    if (results.durationMs !== undefined && (!finite(results.durationMs) || results.durationMs < 0)) {
      problems.push(`design point ${value.id} has invalid duration metadata`);
      return null;
    }
    point.results = {
      lambdaMax: Number(results.lambdaMax),
      lambdaBlockStdError: Number(results.lambdaBlockStdError),
      rqaDeterminism: Number(results.rqaDeterminism),
      rqaDivergence: Number(results.rqaDivergence),
      ftle: Number(results.ftle),
      completedAt: results.completedAt
    };
    if (finite(results.durationMs)) point.results.durationMs = results.durationMs;
  }
  ids.add(point.id);
  return point;
}

function sanitizeDesignStudy(value: unknown): { value: DesignStudyState | null; problems: string[] } {
  const problems: string[] = [];
  if (!isPlainObject(value)) return { value: null, problems: ['designStudy is not an object'] };
  if (value.schemaVersion !== 'pendulum-design-study/v1') problems.push('designStudy has an unsupported schemaVersion');
  if (!boundedString(value.id, 100)) problems.push('designStudy.id is missing or too long');
  if (!canonicalDate(value.generatedAt)) problems.push('designStudy.generatedAt is not a canonical ISO timestamp');
  if (!Array.isArray(value.variables) || value.variables.length < 1 || value.variables.length > 4)
    problems.push('designStudy must contain between 1 and 4 variables');
  const variables = new Map<string, { min: number; max: number }>();
  if (Array.isArray(value.variables)) {
    for (const item of value.variables) {
      if (
        !isPlainObject(item) ||
        typeof item.key !== 'string' ||
        !DESIGN_VARIABLE_KEYS.has(item.key) ||
        !finite(item.min) ||
        !finite(item.max) ||
        item.min >= item.max ||
        variables.has(item.key)
      ) {
        problems.push('designStudy contains an invalid or duplicate variable');
        continue;
      }
      variables.set(item.key, { min: item.min, max: item.max });
    }
  }
  const strategies = new Set(['sobol', 'latin-hypercube', 'grid']);
  if (!strategies.has(String(value.strategy))) problems.push('designStudy strategy is invalid');
  if (!safeInteger(value.count, 1, 128)) problems.push('designStudy count is outside 1..128');
  if (!safeInteger(value.replicates, 1, 8)) problems.push('designStudy replicates is outside 1..8');
  if (!isPlainObject(value.budget)) problems.push('designStudy budget is missing');
  const budget = isPlainObject(value.budget) ? value.budget : {};
  if (!safeInteger(budget.maxPoints, 4, 256)) problems.push('designStudy maxPoints is outside 4..256');
  if (!safeInteger(budget.maxTimeMs, 1, 3_600_000)) problems.push('designStudy maxTimeMs is outside 1..3600000');
  if (!safeInteger(budget.maxFailures, 1, 64)) problems.push('designStudy maxFailures is outside 1..64');
  const statuses = new Set(['idle', 'running', 'complete', 'cancelled', 'failed', 'budget-stopped']);
  if (!statuses.has(String(value.status))) problems.push('designStudy status is invalid');
  if (typeof value.message !== 'string' || value.message.length > 1_000)
    problems.push('designStudy message is invalid or too long');
  if (!Array.isArray(value.points) || value.points.length > 256)
    problems.push('designStudy points are invalid or over limit');
  const ids = new Set<string>();
  const points = Array.isArray(value.points)
    ? value.points
        .map((point) => sanitizeDesignPoint(point, variables, ids, problems))
        .filter((point): point is DesignStudyPointState => point !== null)
    : [];
  if (safeInteger(budget.maxPoints, 4, 256) && points.length > budget.maxPoints)
    problems.push('designStudy contains more points than its budget permits');
  if (problems.length > 0) return { value: null, problems };
  return {
    value: {
      schemaVersion: 'pendulum-design-study/v1',
      id: value.id as string,
      generatedAt: value.generatedAt as string,
      variables: Array.from(variables, ([key, bounds]) => ({ key, ...bounds })),
      strategy: value.strategy as DesignStudyState['strategy'],
      count: value.count as number,
      replicates: value.replicates as number,
      budget: {
        maxPoints: budget.maxPoints as number,
        maxTimeMs: budget.maxTimeMs as number,
        maxFailures: budget.maxFailures as number
      },
      points,
      status: value.status === 'running' ? 'idle' : (value.status as DesignStudyState['status']),
      message: value.message as string
    },
    problems: []
  };
}

/** Validate and canonicalize every workspace section without mutating browser state. */
export function stageWorkspaceImport(value: unknown): WorkspaceImportStageResult {
  if (!isPlainObject(value) || value.schemaVersion !== 'pendulum-workspace/v1' || !isPlainObject(value.research)) {
    return failure(
      'WORKSPACE_IMPORT_SCHEMA_INVALID',
      'stage',
      'Workspace staging requires a v1 document with a complete research section.'
    );
  }
  const normalized = normalizeResearchStorage(value.research);
  let designStudy: DesignStudyState | null = null;
  const restoreDesignStudy = value.designStudy !== undefined && value.designStudy !== null;
  if (restoreDesignStudy) {
    const design = sanitizeDesignStudy(value.designStudy);
    if (!design.value) {
      return failure(
        'WORKSPACE_IMPORT_DESIGN_INVALID',
        'stage',
        `Design study staging failed: ${design.problems[0] ?? 'invalid design study'}.`
      );
    }
    designStudy = design.value;
  }
  const mergeFigureCaptions = value.figureCaptions !== undefined;
  const figureCaptionPatch: Record<string, string> = {};
  const ignoredFigureCaptionIds: string[] = [];
  if (mergeFigureCaptions) {
    if (!isPlainObject(value.figureCaptions)) {
      return failure('WORKSPACE_IMPORT_SCHEMA_INVALID', 'stage', 'Figure captions must be a plain object.');
    }
    for (const [id, caption] of Object.entries(value.figureCaptions)) {
      if (typeof caption !== 'string' || caption.length > 400) {
        return failure(
          'WORKSPACE_IMPORT_SCHEMA_INVALID',
          'stage',
          `Figure caption ${id} is not a string of at most 400 characters.`
        );
      }
      if (!(id in FIGURE_CAPTIONS)) {
        ignoredFigureCaptionIds.push(id);
        continue;
      }
      figureCaptionPatch[id] = caption.trim();
    }
  }
  const restoreSnapshot = value.snapshot !== undefined && value.snapshot !== null;
  let snapshot: RuntimeSnapshot | null = null;
  if (restoreSnapshot) {
    try {
      const canonical = canonicalLabSnapshot(value.snapshot as RuntimeSnapshot);
      snapshot = { ...canonical, hash: stateHash(canonical.state) };
    } catch (error) {
      return failure(
        'WORKSPACE_IMPORT_SNAPSHOT_INVALID',
        'stage',
        `Live snapshot staging failed: ${errorMessage(error)}.`
      );
    }
  }
  return {
    ok: true,
    value: {
      research: normalized.research,
      researchMigrations: normalized.migrations,
      droppedResearchEntries: normalized.droppedEntries,
      designStudy,
      restoreDesignStudy,
      figureCaptionPatch,
      mergeFigureCaptions,
      snapshot,
      restoreSnapshot,
      ignoredFigureCaptionIds
    }
  };
}

async function compensate<TBackup>(
  adapter: WorkspaceImportTransactionAdapter<TBackup>,
  backup: TBackup,
  diagnostics: WorkspaceImportDiagnostic[]
): Promise<WorkspaceImportTransactionResult> {
  try {
    await adapter.rollback(backup);
    await adapter.verifyRollback?.(backup);
    diagnostics.push({
      code: 'WORKSPACE_IMPORT_ROLLED_BACK',
      phase: 'rollback',
      severity: 'warning',
      message: 'Workspace restore failed, and every backed-up surface was restored.'
    });
    return { status: 'rolled-back', diagnostics };
  } catch (error) {
    diagnostics.push({
      code: 'WORKSPACE_IMPORT_ROLLBACK_FAILED',
      phase: 'rollback',
      severity: 'critical',
      message: `Workspace rollback could not be verified: ${errorMessage(error)}.`
    });
    return { status: 'rollback-failed', diagnostics };
  }
}

/** Execute the staged restore as an observable transaction with compensating rollback. */
export async function runWorkspaceImportTransaction<TBackup>(
  stage: WorkspaceImportStage,
  adapter: WorkspaceImportTransactionAdapter<TBackup>
): Promise<WorkspaceImportTransactionResult> {
  let backup: TBackup;
  try {
    backup = await adapter.backup(stage);
  } catch (error) {
    return {
      status: 'rejected',
      diagnostics: [
        {
          code: operationCode(error, 'WORKSPACE_IMPORT_BACKUP_FAILED'),
          phase: 'backup',
          severity: 'error',
          message: `Workspace backup failed before import mutation: ${errorMessage(error)}.`
        }
      ]
    };
  }
  const diagnostics: WorkspaceImportDiagnostic[] = [];
  try {
    await adapter.apply(stage, backup);
  } catch (error) {
    diagnostics.push({
      code: operationCode(error, 'WORKSPACE_IMPORT_APPLY_FAILED'),
      phase: 'apply',
      severity: 'error',
      message: `Workspace apply failed: ${errorMessage(error)}.`
    });
    return compensate(adapter, backup, diagnostics);
  }
  try {
    await adapter.verify(stage, backup);
  } catch (error) {
    diagnostics.push({
      code: operationCode(error, 'WORKSPACE_IMPORT_VERIFY_FAILED'),
      phase: 'verify',
      severity: 'error',
      message: `Workspace verification failed: ${errorMessage(error)}.`
    });
    return compensate(adapter, backup, diagnostics);
  }
  return {
    status: 'committed',
    diagnostics: [
      {
        code: 'WORKSPACE_IMPORT_COMMITTED',
        phase: 'verify',
        severity: 'info',
        message: 'Workspace restored atomically and verified across live and durable state.'
      }
    ]
  };
}
