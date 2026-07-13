import {
  type ResearchArtifactManifestEntry,
  type ResearchProjectProfile,
  type ResearchSessionProfile,
  defaultResearchProjectProfile,
  defaultResearchSessionProfile,
  researchUid
} from './shared';

export const MAX_RESEARCH_SESSIONS = 48;
export const MAX_RESEARCH_SESSION_ARTIFACTS = 80;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function clippedText(value: unknown, fallback: string, maxLength = 220): string {
  const text = typeof value === 'string' ? value.trim() : fallback;
  return (text || fallback).slice(0, maxLength);
}

function isoText(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

function sanitizeStringList(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function sanitizeArtifactManifestEntry(value: unknown): ResearchArtifactManifestEntry | null {
  if (!isPlainObject(value)) return null;
  const kind =
    value.kind === 'figure' || value.kind === 'dataset' || value.kind === 'workspace' || value.kind === 'export'
      ? value.kind
      : 'report';
  const path = clippedText(value.path, '', 220);
  if (!path) return null;
  const entry: ResearchArtifactManifestEntry = {
    id: clippedText(value.id, researchUid('artifact'), 100),
    label: clippedText(value.label, path, 160),
    path,
    kind,
    createdAt: isoText(value.createdAt)
  };
  if (typeof value.hash === 'string') entry.hash = clippedText(value.hash, '', 120);
  return entry;
}

export function sanitizeResearchSession(value: unknown, fallbackProjectId: string): ResearchSessionProfile {
  const fallback = defaultResearchSessionProfile(fallbackProjectId);
  if (!isPlainObject(value)) return fallback;
  const createdAt = isoText(value.createdAt, fallback.createdAt);
  const artifacts = Array.isArray(value.artifactManifest)
    ? value.artifactManifest
        .map(sanitizeArtifactManifestEntry)
        .filter((entry): entry is ResearchArtifactManifestEntry => Boolean(entry))
        .slice(0, MAX_RESEARCH_SESSION_ARTIFACTS)
    : [];
  return {
    id: clippedText(value.id, fallback.id, 100),
    projectId: clippedText(value.projectId, fallbackProjectId, 100),
    name: clippedText(value.name, fallback.name, 140),
    objective: clippedText(value.objective, fallback.objective, 1_200),
    createdAt,
    updatedAt: isoText(value.updatedAt, createdAt),
    pinnedRunIds: sanitizeStringList(value.pinnedRunIds, 24),
    artifactManifest: artifacts,
    comparisonHistory: sanitizeStringList(value.comparisonHistory, 80)
  };
}

export function sanitizeResearchProject(value: unknown, activeSessionId: string): ResearchProjectProfile {
  const fallback = defaultResearchProjectProfile();
  if (!isPlainObject(value)) {
    return { ...fallback, activeSessionId, sessionIds: [activeSessionId] };
  }
  const createdAt = isoText(value.createdAt, fallback.createdAt);
  const sessionIds = sanitizeStringList(value.sessionIds, MAX_RESEARCH_SESSIONS);
  return {
    id: clippedText(value.id, fallback.id, 100),
    name: clippedText(value.name, fallback.name, 140),
    createdAt,
    updatedAt: isoText(value.updatedAt, createdAt),
    activeSessionId: clippedText(value.activeSessionId, activeSessionId, 100),
    sessionIds: sessionIds.length ? sessionIds : [activeSessionId]
  };
}

export function sanitizeResearchSessions(
  value: unknown,
  projectId: string,
  activeSession: ResearchSessionProfile
): ResearchSessionProfile[] {
  const raw = Array.isArray(value) ? value : [];
  const byId = new Map<string, ResearchSessionProfile>();
  byId.set(activeSession.id, activeSession);
  for (const item of raw) {
    const session = sanitizeResearchSession(item, projectId);
    byId.set(session.id, session.id === activeSession.id ? { ...session, ...activeSession } : session);
    if (byId.size >= MAX_RESEARCH_SESSIONS) break;
  }
  return Array.from(byId.values()).slice(0, MAX_RESEARCH_SESSIONS);
}
