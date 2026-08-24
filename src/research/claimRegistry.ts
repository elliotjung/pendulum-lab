export const CLAIM_REGISTRY_SCHEMA = 'pendulum-claim-registry/v1' as const;

const CLAIM_SCOPE_CATEGORIES = new Set([
  'hardware-validation',
  'numerical-benchmark',
  'publication-status',
  'scientific-validation',
  'software-verification'
]);

export interface ClaimRegistryEntry {
  id: string;
  owner: string;
  scope: {
    category: string;
    statement: string;
  };
  sourceArtifact: string;
  reproduce: string;
  caveat: string | null;
  invalidatedBy: string[];
}

export interface ClaimRegistry {
  schemaVersion: typeof CLAIM_REGISTRY_SCHEMA;
  evidenceArtifact: 'reports/evidence-summary.json';
  claims: ClaimRegistryEntry[];
}

export interface ClaimRegistryValidationContext {
  packageScripts: Readonly<Record<string, unknown>>;
  existingArtifacts: ReadonlySet<string>;
}

export interface ClaimRegistryValidation {
  ok: boolean;
  problems: string[];
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function nonEmptyText(value: unknown, minimumLength = 1): value is string {
  return typeof value === 'string' && value.trim() === value && value.length >= minimumLength && !/[\r\n]/.test(value);
}

function claimId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value);
}

function repositoryJsonArtifact(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^reports\/[a-z0-9][a-z0-9./-]*\.json$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//')
  );
}

function npmScriptName(command: string): string | null {
  if (/[;&|`<>\r\n]/.test(command)) return null;
  const match = /^npm run ([a-z0-9:_-]+)(?: --(?: .+)?)?$/.exec(command);
  return match?.[1] ?? null;
}

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

function sourceReportValues(evidence: JsonObject): Set<string> {
  const reports = object(evidence.sourceReports);
  if (!reports) return new Set();
  return new Set(Object.values(reports).filter((value): value is string => typeof value === 'string'));
}

export function evidenceSourceArtifacts(value: unknown): string[] {
  const evidence = object(value);
  if (!evidence) return [];
  return [...sourceReportValues(evidence)].filter(repositoryJsonArtifact).sort();
}

export function validateClaimRegistry(
  registryValue: unknown,
  evidenceValue: unknown,
  context: ClaimRegistryValidationContext
): ClaimRegistryValidation {
  const problems: string[] = [];
  const registry = object(registryValue);
  const evidence = object(evidenceValue);
  if (!registry) return { ok: false, problems: ['registry must be a JSON object'] };
  if (!evidence) return { ok: false, problems: ['evidence summary must be a JSON object'] };

  if (registry.schemaVersion !== CLAIM_REGISTRY_SCHEMA) {
    problems.push(`registry.schemaVersion must be ${CLAIM_REGISTRY_SCHEMA}`);
  }
  if (registry.evidenceArtifact !== 'reports/evidence-summary.json') {
    problems.push('registry.evidenceArtifact must be reports/evidence-summary.json');
  }
  if (evidence.schemaVersion !== 'pendulum-evidence-summary/v1') {
    problems.push('evidence summary schemaVersion must be pendulum-evidence-summary/v1');
  }

  const registryClaims = Array.isArray(registry.claims) ? registry.claims : [];
  const evidenceClaims = Array.isArray(evidence.claims) ? evidence.claims : [];
  if (!Array.isArray(registry.claims)) problems.push('registry.claims must be an array');
  if (!Array.isArray(evidence.claims)) problems.push('evidence summary claims must be an array');

  const registryEntries = registryClaims.map(object);
  const evidenceEntries = evidenceClaims.map(object);
  const registryIds = registryEntries.flatMap((entry) => (entry && typeof entry.id === 'string' ? [entry.id] : []));
  const evidenceIds = evidenceEntries.flatMap((entry) => (entry && typeof entry.id === 'string' ? [entry.id] : []));

  for (const duplicate of duplicateIds(registryIds)) problems.push(`duplicate registry claim id: ${duplicate}`);
  for (const duplicate of duplicateIds(evidenceIds)) problems.push(`duplicate evidence-summary claim id: ${duplicate}`);

  const registryById = new Map<string, JsonObject>();
  for (const [index, entry] of registryEntries.entries()) {
    if (!entry) {
      problems.push(`registry.claims[${index}] must be an object`);
      continue;
    }
    if (!claimId(entry.id)) {
      problems.push(`registry.claims[${index}].id is invalid`);
      continue;
    }
    if (!registryById.has(entry.id)) registryById.set(entry.id, entry);
  }

  const evidenceById = new Map<string, JsonObject>();
  for (const [index, entry] of evidenceEntries.entries()) {
    if (!entry) {
      problems.push(`evidence.claims[${index}] must be an object`);
      continue;
    }
    if (!claimId(entry.id)) {
      problems.push(`evidence.claims[${index}].id is invalid`);
      continue;
    }
    if (!evidenceById.has(entry.id)) evidenceById.set(entry.id, entry);
  }

  for (const id of [...evidenceById.keys()].sort()) {
    if (!registryById.has(id)) problems.push(`evidence-summary claim is missing from registry: ${id}`);
  }
  for (const id of [...registryById.keys()].sort()) {
    if (!evidenceById.has(id)) problems.push(`registry claim has no evidence-summary claim: ${id}`);
  }

  const declaredSourceReports = sourceReportValues(evidence);
  for (const [id, entry] of registryById) {
    const prefix = `registry claim ${id}`;
    const evidenceClaim = evidenceById.get(id);
    if (!nonEmptyText(entry.owner) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.owner)) {
      problems.push(`${prefix} owner must be a lowercase kebab-case responsibility`);
    }

    const scope = object(entry.scope);
    if (!scope || !CLAIM_SCOPE_CATEGORIES.has(String(scope.category))) {
      problems.push(`${prefix} scope.category is invalid`);
    }
    if (!scope || !nonEmptyText(scope.statement, 20)) {
      problems.push(`${prefix} scope.statement must be a single-line statement of at least 20 characters`);
    }

    if (!repositoryJsonArtifact(entry.sourceArtifact)) {
      problems.push(`${prefix} sourceArtifact must be a repository-relative reports/*.json path`);
    } else {
      if (!declaredSourceReports.has(entry.sourceArtifact)) {
        problems.push(`${prefix} sourceArtifact is not declared by evidence-summary.sourceReports`);
      }
      if (!context.existingArtifacts.has(entry.sourceArtifact)) {
        problems.push(`${prefix} sourceArtifact does not exist: ${entry.sourceArtifact}`);
      }
      if (evidenceClaim?.sourceReport !== entry.sourceArtifact) {
        problems.push(`${prefix} sourceArtifact does not match evidence-summary sourceReport`);
      }
    }

    if (!nonEmptyText(entry.reproduce)) {
      problems.push(`${prefix} reproduce must be a non-empty single-line command`);
    } else {
      const scriptName = npmScriptName(entry.reproduce);
      if (!scriptName || typeof context.packageScripts[scriptName] !== 'string') {
        problems.push(`${prefix} reproduce must invoke a defined npm script without shell chaining`);
      }
      if (evidenceClaim?.reproduce !== entry.reproduce) {
        problems.push(`${prefix} reproduce does not match evidence-summary reproduce`);
      }
    }

    const caveatValid = entry.caveat === null || nonEmptyText(entry.caveat, 12);
    if (!caveatValid) problems.push(`${prefix} caveat must be null or a substantive single-line statement`);
    if (evidenceClaim && evidenceClaim.caveat !== entry.caveat) {
      problems.push(`${prefix} caveat does not match evidence-summary caveat`);
    }

    const invalidatedBy = Array.isArray(entry.invalidatedBy) ? entry.invalidatedBy : [];
    if (!Array.isArray(entry.invalidatedBy) || invalidatedBy.some((condition) => !nonEmptyText(condition, 12))) {
      problems.push(`${prefix} invalidatedBy must contain only substantive single-line conditions`);
    }
    if (entry.caveat === null && invalidatedBy.length === 0) {
      problems.push(`${prefix} must define a caveat or at least one invalidating condition`);
    }
  }

  return { ok: problems.length === 0, problems };
}
