import { describe, expect, it } from 'vitest';
import {
  normalizeResearchStorage,
  RESEARCH_STORAGE_SCHEMA_VERSION,
  sanitizeWorkspaceList
} from '../src/app/parity/storage-sync';

const activeWorkspace = {
  id: 'workspace-active',
  name: 'Active Study',
  objective: 'Quantify the Melnikov gap map.',
  flagshipId: 'melnikov-gap-map',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z'
};

describe('research workspace storage v3', () => {
  it('migrates older workbench payloads into a workspace profile list', () => {
    const normalized = normalizeResearchStorage({
      schemaVersion: 'pendulum-research-workbench/v2',
      workspace: activeWorkspace,
      workspaces: [
        { ...activeWorkspace, name: 'stale active name' },
        {
          id: 'workspace-secondary',
          name: 'Secondary Study',
          objective: 'Cross-check a GPU field sweep.',
          flagshipId: 'gpu-scale-contract',
          createdAt: '2026-01-03T00:00:00.000Z',
          updatedAt: '2026-01-04T00:00:00.000Z'
        }
      ],
      experiments: [],
      runLog: [],
      comparisonRows: []
    });

    expect(normalized.migrations).toEqual([`pendulum-research-workbench/v2 -> ${RESEARCH_STORAGE_SCHEMA_VERSION}`]);
    expect(RESEARCH_STORAGE_SCHEMA_VERSION).toBe('pendulum-research-workbench/v4');
    expect(normalized.research.project.activeSessionId).toBe(normalized.research.sessions[0]?.id);
    expect(normalized.research.sessions[0]?.artifactManifest).toEqual([]);
    expect(normalized.research.workspace.name).toBe('Active Study');
    expect(normalized.research.workspaces.map((workspace) => workspace.id)).toEqual([
      'workspace-active',
      'workspace-secondary'
    ]);
    expect(normalized.research.workspaces[0]?.name).toBe('Active Study');
  });

  it('deduplicates workspace profiles and preserves the active profile first', () => {
    const list = sanitizeWorkspaceList(
      [
        { ...activeWorkspace, name: 'old active' },
        { ...activeWorkspace, id: 'workspace-other', name: 'Other' },
        { ...activeWorkspace, id: 'workspace-other', name: 'Other newest' }
      ],
      activeWorkspace
    );

    expect(list.map((workspace) => workspace.id)).toEqual(['workspace-active', 'workspace-other']);
    expect(list[0]?.name).toBe('Active Study');
    expect(list[1]?.name).toBe('Other newest');
  });
});
