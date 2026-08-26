export const CLAIM_REGISTRY_SCHEMA = 'pendulum-claim-registry/v2' as const;
export const CLAIM_INCIDENT_DRILL_SCHEMA = 'pendulum-claim-incident-drill/v1' as const;

export const CLAIM_MATURITY_LEVELS = ['educational', 'validated', 'research', 'experimental'] as const;
export type ClaimMaturity = (typeof CLAIM_MATURITY_LEVELS)[number];

export const CLAIM_VISIBLE_LEVELS = [
  'withheld',
  'informational',
  'measured',
  'validated',
  'publication-ready'
] as const;
export type ClaimVisibleLevel = (typeof CLAIM_VISIBLE_LEVELS)[number];

export const CLAIM_DOWNGRADE_INPUTS = [
  'artifact-status',
  'claim-status',
  'evidence-freshness',
  'gpu-status',
  'incident-status',
  'mutation-status',
  'publication-status'
] as const;
export type ClaimDowngradeInputId = (typeof CLAIM_DOWNGRADE_INPUTS)[number];

export const CLAIM_INCIDENT_STATUSES = [
  'clear',
  'investigating',
  'embargoed',
  'correction-pending',
  'resolved',
  'revoked'
] as const;
export type ClaimIncidentStatus = (typeof CLAIM_INCIDENT_STATUSES)[number];

export const CLAIM_INCIDENT_SEVERITIES = ['sev-1', 'sev-2', 'sev-3', 'sev-4'] as const;
export type ClaimIncidentSeverity = (typeof CLAIM_INCIDENT_SEVERITIES)[number];

export interface ClaimLimitation {
  id: string;
  statement: string;
  appliesTo: string[];
}

export interface ClaimModelDefinition {
  id: string;
  label: string;
  implementation: string;
  maturity: ClaimMaturity;
  limitationIds: string[];
}

export interface ClaimSystemCountDefinition {
  claimId: string;
  publicCount: number;
  unit: 'physical-system-families';
  statement: string;
  countingRule: string;
  countedModelIds: string[];
  systemSpecKindCount: number;
  systemSpecKinds: string[];
  exclusions: string[];
}

export interface ClaimIncidentMetadata {
  status: ClaimIncidentStatus;
  incidentId: string | null;
  severity: ClaimIncidentSeverity | null;
  detectedAt: string | null;
  embargoUntil: string | null;
  correctionArtifact: string | null;
  revokedArtifactSha256: string | null;
  userNotification: string | null;
}

export interface ClaimDowngradeRule {
  input: ClaimDowngradeInputId;
  when: string[];
  to: ClaimVisibleLevel;
  reason: string;
}

export interface ClaimRegistryEntry {
  id: string;
  owner: string;
  maturity: ClaimMaturity;
  scope: {
    category: string;
    statement: string;
  };
  sourceArtifact: string;
  reproduce: string;
  caveat: string | null;
  invalidatedBy: string[];
  limitationIds: string[];
  validity: {
    evidenceClasses: string[];
    validForDays: number;
  };
  visibility: {
    defaultLevel: ClaimVisibleLevel;
    downgradeRules: ClaimDowngradeRule[];
  };
  incident: ClaimIncidentMetadata;
}

export interface ClaimRegistry {
  schemaVersion: typeof CLAIM_REGISTRY_SCHEMA;
  evidenceArtifact: 'reports/evidence-summary.json';
  maturityDefinitions: Record<ClaimMaturity, string>;
  systemCountDefinition: ClaimSystemCountDefinition;
  models: ClaimModelDefinition[];
  limitations: ClaimLimitation[];
  incidentPolicy: {
    process: string[];
    severityDefinitions: Record<ClaimIncidentSeverity, string>;
    revokedVisibleLevel: 'withheld';
    drillFixture: string;
  };
  claims: ClaimRegistryEntry[];
}

export interface ClaimRegistryValidationContext {
  packageScripts: Readonly<Record<string, unknown>>;
  existingArtifacts: ReadonlySet<string>;
  artifactSha256: ReadonlyMap<string, string>;
  incidentDrill: unknown;
  systemSpecKinds?: readonly string[];
  /**
   * Require per-report SHA/timestamp bindings from a freshly generated
   * evidence artifact. Source-only CI sets this false; the post-generation
   * gate sets it true so test execution never depends on its own output.
   */
  requireEvidenceBindings?: boolean;
}

export interface ClaimRegistryValidation {
  ok: boolean;
  problems: string[];
}

export interface ClaimDowngradeInputs {
  now: string;
  evidenceGeneratedAt: string | null;
  evidenceExpiresAt: string | null;
  claimStatus: 'passed' | 'failed' | 'missing' | 'unknown';
  gpuStatus: 'complete' | 'partial' | 'failed' | 'unknown';
  mutationStatus: 'high' | 'low' | 'failed' | 'unknown';
  publicationStatus: 'complete' | 'partial' | 'failed' | 'unknown';
  sourceArtifactSha256: string | null;
  revokedArtifactSha256: readonly string[];
}

export interface ClaimEvaluationOptions {
  now?: string;
  revokedArtifactSha256?: readonly string[];
}

export interface EffectiveClaim {
  id: string;
  maturity: ClaimMaturity;
  defaultVisibleLevel: ClaimVisibleLevel;
  effectiveVisibleLevel: ClaimVisibleLevel;
  validity: 'current' | 'expired' | 'unknown';
  validFrom: string | null;
  validUntil: string | null;
  limitationIds: string[];
  sourceArtifact: string;
  sourceArtifactSha256: string | null;
  incidentStatus: ClaimIncidentStatus;
  downgradeReasons: Array<{
    input: ClaimDowngradeInputId;
    value: string;
    to: ClaimVisibleLevel;
    reason: string;
  }>;
}
