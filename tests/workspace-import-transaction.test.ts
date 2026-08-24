import { describe, expect, it, vi } from 'vitest';
import { stateHash } from '../src/state/StateStore';
import type { RuntimeSnapshot } from '../src/types/domain';
import {
  WorkspaceImportOperationError,
  runWorkspaceImportTransaction,
  stageWorkspaceImport,
  type WorkspaceImportStage,
  type WorkspaceImportTransactionAdapter
} from '../src/app/parity/workspace-import-transaction';

const snapshot: RuntimeSnapshot = {
  schemaVersion: 'pendulum-session/v10-ts',
  systemType: 'double',
  method: 'rk4',
  mode: 'research',
  dt: 0.002,
  tolerance: 1e-7,
  stepsPerFrame: 6,
  damping: 0,
  parameters: { m1: 1, m2: 1.2, l1: 1.1, l2: 0.9, g: 9.81 },
  state: [0.4, -0.2, 0.1, -0.1],
  simTime: 1.25,
  seed: 42,
  hash: 'untrusted-file-hash'
};

function workspaceDocument(): Record<string, unknown> {
  return {
    schemaVersion: 'pendulum-workspace/v1',
    research: {
      schemaVersion: 'pendulum-research-workbench/v4',
      experiments: [],
      runLog: [],
      comparisonRows: []
    },
    designStudy: {
      schemaVersion: 'pendulum-design-study/v1',
      id: 'design-import',
      generatedAt: '2026-08-24T00:00:00.000Z',
      variables: [{ key: 'theta1', min: -1, max: 1 }],
      strategy: 'sobol',
      count: 1,
      replicates: 1,
      budget: { maxPoints: 4, maxTimeMs: 10_000, maxFailures: 2 },
      points: [{ id: 'point-1', values: { theta1: 0.25 }, origin: 'design', replicate: 0 }],
      status: 'running',
      message: 'in flight at export time'
    },
    figureCaptions: { main: 'Imported main figure', futureCanvas: 'Forward-compatible caption' },
    snapshot: structuredClone(snapshot)
  };
}

function staged(): WorkspaceImportStage {
  const result = stageWorkspaceImport(workspaceDocument());
  if (!result.ok) throw new Error(result.diagnostic.message);
  return result.value;
}

describe('workspace import staging', () => {
  it('canonicalizes every section without mutating the input document', () => {
    const source = workspaceDocument();
    const result = stageWorkspaceImport(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.designStudy?.status).toBe('idle');
    expect(result.value.figureCaptionPatch).toEqual({ main: 'Imported main figure' });
    expect(result.value.ignoredFigureCaptionIds).toEqual(['futureCanvas']);
    expect(result.value.snapshot?.hash).toBe(stateHash(snapshot.state));
    expect((source.designStudy as { status: string }).status).toBe('running');
    expect((source.snapshot as RuntimeSnapshot).hash).toBe('untrusted-file-hash');
  });

  it('rejects a nested design defect before any transaction can start', () => {
    const source = workspaceDocument();
    const design = source.designStudy as { points: Array<{ values: Record<string, number> }> };
    design.points[0]!.values.theta1 = 10;
    const result = stageWorkspaceImport(source);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('WORKSPACE_IMPORT_DESIGN_INVALID');
      expect(result.diagnostic.phase).toBe('stage');
    }
  });

  it('rejects a snapshot that the interactive controls cannot represent', () => {
    const source = workspaceDocument();
    (source.snapshot as RuntimeSnapshot).dt = 1e-8;
    const result = stageWorkspaceImport(source);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('WORKSPACE_IMPORT_SNAPSHOT_INVALID');
  });
});

describe('workspace import transaction state machine', () => {
  it('commits only after post-apply verification succeeds', async () => {
    const order: string[] = [];
    const adapter: WorkspaceImportTransactionAdapter<string> = {
      backup: async () => {
        order.push('backup');
        return 'old';
      },
      apply: async () => void order.push('apply'),
      verify: async () => void order.push('verify'),
      rollback: async () => void order.push('rollback')
    };
    const result = await runWorkspaceImportTransaction(staged(), adapter);
    expect(result.status).toBe('committed');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'WORKSPACE_IMPORT_COMMITTED', phase: 'verify' })
    ]);
    expect(order).toEqual(['backup', 'apply', 'verify']);
  });

  it('rejects a failed backup without invoking apply or rollback', async () => {
    const apply = vi.fn();
    const rollback = vi.fn();
    const result = await runWorkspaceImportTransaction(staged(), {
      backup: async () => {
        throw new Error('backup denied');
      },
      apply,
      verify: vi.fn(),
      rollback
    });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics[0]?.code).toBe('WORKSPACE_IMPORT_BACKUP_FAILED');
    expect(apply).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('preserves a specific runtime precondition code in the user-visible diagnostic', async () => {
    const result = await runWorkspaceImportTransaction(staged(), {
      backup: async () => {
        throw new WorkspaceImportOperationError('WORKSPACE_IMPORT_BUSY', 'research batch is running');
      },
      apply: vi.fn(),
      verify: vi.fn(),
      rollback: vi.fn()
    });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({ code: 'WORKSPACE_IMPORT_BUSY', phase: 'backup', severity: 'error' })
    );
  });

  it('rolls every staged mutation back when apply fails midway', async () => {
    const surfaces = { research: 'old', design: 'old', captions: 'old' };
    const result = await runWorkspaceImportTransaction(staged(), {
      backup: async () => ({ ...surfaces }),
      apply: async () => {
        surfaces.research = 'new';
        surfaces.design = 'new';
        throw new Error('caption quota failure');
      },
      verify: vi.fn(),
      rollback: async (backup) => Object.assign(surfaces, backup),
      verifyRollback: async (backup) => expect(surfaces).toEqual(backup)
    });
    expect(result.status).toBe('rolled-back');
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      'WORKSPACE_IMPORT_APPLY_FAILED',
      'WORKSPACE_IMPORT_ROLLED_BACK'
    ]);
    expect(surfaces).toEqual({ research: 'old', design: 'old', captions: 'old' });
  });

  it('rolls back an apparently successful apply that fails verification', async () => {
    let value = 'old';
    const result = await runWorkspaceImportTransaction(staged(), {
      backup: async () => value,
      apply: async () => {
        value = 'new';
      },
      verify: async () => {
        throw new Error('durable mirror mismatch');
      },
      rollback: async (backup) => {
        value = backup;
      },
      verifyRollback: async (backup) => expect(value).toBe(backup)
    });
    expect(result.status).toBe('rolled-back');
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      'WORKSPACE_IMPORT_VERIFY_FAILED',
      'WORKSPACE_IMPORT_ROLLED_BACK'
    ]);
    expect(value).toBe('old');
  });

  it('raises a critical coded diagnostic when compensation itself cannot be verified', async () => {
    const result = await runWorkspaceImportTransaction(staged(), {
      backup: async () => 'old',
      apply: async () => {
        throw new Error('apply failed');
      },
      verify: vi.fn(),
      rollback: async () => {
        throw new Error('rollback storage unavailable');
      }
    });
    expect(result.status).toBe('rollback-failed');
    expect(result.diagnostics.at(-1)).toEqual(
      expect.objectContaining({ code: 'WORKSPACE_IMPORT_ROLLBACK_FAILED', severity: 'critical' })
    );
  });
});
