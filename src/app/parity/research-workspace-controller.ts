import { CERTIFIED_WORKBENCH_FLAGSHIP } from '../../research/certifiedWorkbench';
import { hashText } from '../../research/researchExportUtils';
import {
  type ResearchArtifactManifestEntry,
  type ResearchRunLogEntry,
  type ResearchSessionProfile,
  type ResearchWorkspaceProfile,
  researchUid,
  state
} from './shared';

export const MAX_WORKSPACE_PROFILES = 24;

export function ensureWorkspaceList(): void {
  const active = state.research.workspace;
  const byId = new Map<string, ResearchWorkspaceProfile>();
  if (active?.id) byId.set(active.id, active);
  for (const workspace of state.research.workspaces ?? []) {
    if (workspace?.id) byId.set(workspace.id, workspace.id === active.id ? { ...workspace, ...active } : workspace);
    if (byId.size >= MAX_WORKSPACE_PROFILES) break;
  }
  if (!byId.size && active?.id) byId.set(active.id, active);
  state.research.workspaces = Array.from(byId.values()).slice(0, MAX_WORKSPACE_PROFILES);
}

export function activeResearchSession(): ResearchSessionProfile {
  let session = state.research.sessions.find((entry) => entry.id === state.research.project.activeSessionId);
  if (!session) {
    const now = new Date().toISOString();
    session = {
      id: state.research.project.activeSessionId || researchUid('session'),
      projectId: state.research.project.id,
      name: `${state.research.workspace.name} Session`,
      objective: state.research.workspace.objective,
      createdAt: now,
      updatedAt: now,
      pinnedRunIds: [],
      artifactManifest: [],
      comparisonHistory: []
    };
    state.research.sessions.unshift(session);
  }
  return session;
}

export function upsertResearchSession(session: ResearchSessionProfile): void {
  const next = state.research.sessions.filter((entry) => entry.id !== session.id);
  state.research.sessions = [session, ...next].slice(0, 48);
  state.research.project.activeSessionId = session.id;
  state.research.project.sessionIds = Array.from(new Set([session.id, ...state.research.project.sessionIds])).slice(
    0,
    48
  );
  state.research.project.updatedAt = session.updatedAt;
}

export function workspaceOptions(): Array<[string, string]> {
  ensureWorkspaceList();
  return state.research.workspaces.map((workspace) => [workspace.id, workspace.name || workspace.id]);
}

export function upsertWorkspaceProfile(profile: ResearchWorkspaceProfile): void {
  ensureWorkspaceList();
  const next = state.research.workspaces.filter((workspace) => workspace.id !== profile.id);
  state.research.workspaces = [profile, ...next].slice(0, MAX_WORKSPACE_PROFILES);
}

export function selectWorkspaceProfile(id: string): boolean {
  const workspace = state.research.workspaces.find((entry) => entry.id === id);
  if (!workspace) return false;
  state.research.workspace = { ...workspace, updatedAt: new Date().toISOString() };
  upsertWorkspaceProfile(state.research.workspace);
  state.research.layout.lastTab = 'research';
  return true;
}

export function createWorkspaceProfileState(baseName: string, objective: string): void {
  const now = new Date().toISOString();
  state.research.workspace = {
    id: researchUid('workspace'),
    name: `${baseName} ${state.research.workspaces.length + 1}`,
    objective,
    flagshipId: CERTIFIED_WORKBENCH_FLAGSHIP.id,
    createdAt: now,
    updatedAt: now
  };
  const session: ResearchSessionProfile = {
    id: researchUid('session'),
    projectId: state.research.project.id,
    name: `${baseName} session ${state.research.sessions.length + 1}`,
    objective,
    createdAt: now,
    updatedAt: now,
    pinnedRunIds: [],
    artifactManifest: [],
    comparisonHistory: []
  };
  upsertResearchSession(session);
  upsertWorkspaceProfile(state.research.workspace);
  state.research.layout.lastTab = 'research';
}

export function saveWorkspaceProfileState(input: {
  projectName: string;
  sessionName: string;
  workspaceName: string;
  objective: string;
  density: 'comfortable' | 'compact';
  panelCollapsed: boolean;
}): void {
  const now = new Date().toISOString();
  state.research.project = {
    ...state.research.project,
    name: input.projectName || state.research.project.name,
    updatedAt: now
  };
  const session = {
    ...activeResearchSession(),
    name: input.sessionName || activeResearchSession().name,
    objective: input.objective,
    updatedAt: now
  };
  upsertResearchSession(session);
  state.research.workspace = {
    ...state.research.workspace,
    name: input.workspaceName || CERTIFIED_WORKBENCH_FLAGSHIP.title,
    objective: input.objective || CERTIFIED_WORKBENCH_FLAGSHIP.thesis,
    flagshipId: CERTIFIED_WORKBENCH_FLAGSHIP.id,
    updatedAt: now
  };
  if (!state.research.workspace.createdAt) state.research.workspace.createdAt = now;
  upsertWorkspaceProfile(state.research.workspace);
  state.research.layout = {
    ...state.research.layout,
    density: input.density,
    lastTab: 'research',
    panelCollapsed: input.panelCollapsed
  };
}

export function recordRunInActiveSession(entry: ResearchRunLogEntry): void {
  const session = activeResearchSession();
  const next: ResearchSessionProfile = {
    ...session,
    updatedAt: entry.timestamp,
    comparisonHistory: [entry.id, ...session.comparisonHistory.filter((id) => id !== entry.id)].slice(0, 80),
    artifactManifest: session.artifactManifest
  };
  if (entry.artifact) {
    const kind: ResearchArtifactManifestEntry['kind'] =
      entry.type === 'export'
        ? 'export'
        : entry.artifact.endsWith('.png') || entry.artifact.endsWith('.svg')
          ? 'figure'
          : 'report';
    next.artifactManifest = [
      {
        id: researchUid('artifact'),
        label: entry.label,
        path: entry.artifact,
        kind,
        createdAt: entry.timestamp,
        hash: hashText(`${entry.artifact}|${entry.snapshotHash}|${entry.timestamp}`).slice(0, 16)
      },
      ...session.artifactManifest.filter((artifact) => artifact.path !== entry.artifact)
    ].slice(0, 80);
  }
  upsertResearchSession(next);
}
