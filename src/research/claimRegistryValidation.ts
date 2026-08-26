import {
  CLAIM_DOWNGRADE_INPUTS,
  CLAIM_INCIDENT_DRILL_SCHEMA,
  CLAIM_INCIDENT_SEVERITIES,
  CLAIM_INCIDENT_STATUSES,
  CLAIM_MATURITY_LEVELS,
  CLAIM_REGISTRY_SCHEMA,
  CLAIM_VISIBLE_LEVELS,
  type ClaimDowngradeInputId,
  type ClaimRegistryValidation,
  type ClaimRegistryValidationContext,
  type ClaimVisibleLevel
} from './claimRegistryContracts';
import {
  CLAIM_SCOPE_CATEGORIES,
  DOWNGRADE_INPUT_VALUES,
  REQUIRED_LIMITATION_IDS,
  VISIBILITY_RANK,
  claimId,
  duplicateIds,
  enumValue,
  isoInstant,
  kebabId,
  nonEmptyText,
  npmScriptName,
  object,
  repositoryFixture,
  repositoryJsonArtifact,
  repositoryTypeScriptSource,
  sha256,
  sourceReportValues,
  stringArray,
  unregisteredQuantifiedPublicClaimIds,
  type JsonObject
} from './claimRegistryUtilities';

function validateMaturityAndSystemCatalog(registry: JsonObject, problems: string[]): Set<string> {
  const definitions = object(registry.maturityDefinitions);
  for (const maturity of CLAIM_MATURITY_LEVELS) {
    if (!definitions || !nonEmptyText(definitions[maturity], 20)) {
      problems.push(`registry.maturityDefinitions.${maturity} must be a substantive single-line definition`);
    }
  }

  const limitations = Array.isArray(registry.limitations) ? registry.limitations.map(object) : [];
  if (!Array.isArray(registry.limitations)) problems.push('registry.limitations must be an array');
  const limitationIds = limitations.flatMap((entry) => (entry && typeof entry.id === 'string' ? [entry.id] : []));
  for (const duplicate of duplicateIds(limitationIds)) problems.push(`duplicate limitation id: ${duplicate}`);
  const limitationSet = new Set(limitationIds);
  for (const id of REQUIRED_LIMITATION_IDS) {
    if (!limitationSet.has(id)) problems.push(`registry limitation catalog is missing ${id}`);
  }
  for (const [index, limitation] of limitations.entries()) {
    if (!limitation) {
      problems.push(`registry.limitations[${index}] must be an object`);
      continue;
    }
    if (!/^L(?:0[1-9]|1[0-8])$/.test(String(limitation.id))) {
      problems.push(`registry.limitations[${index}].id must be L01 through L18`);
    }
    if (!nonEmptyText(limitation.statement, 24)) {
      problems.push(`registry limitation ${String(limitation.id)} statement must be substantive single-line text`);
    }
    if (!stringArray(limitation.appliesTo) || (limitation.appliesTo as string[]).some((value) => !kebabId(value))) {
      problems.push(`registry limitation ${String(limitation.id)} appliesTo must contain kebab-case targets`);
    }
  }

  const models = Array.isArray(registry.models) ? registry.models.map(object) : [];
  if (!Array.isArray(registry.models)) problems.push('registry.models must be an array');
  const modelIds = models.flatMap((entry) => (entry && typeof entry.id === 'string' ? [entry.id] : []));
  for (const duplicate of duplicateIds(modelIds)) problems.push(`duplicate registry model id: ${duplicate}`);
  const modelSet = new Set(modelIds);
  for (const [index, model] of models.entries()) {
    if (!model) {
      problems.push(`registry.models[${index}] must be an object`);
      continue;
    }
    const prefix = `registry model ${String(model.id)}`;
    if (!kebabId(model.id)) problems.push(`registry.models[${index}].id must be kebab-case`);
    if (!nonEmptyText(model.label)) problems.push(`${prefix} label must be non-empty single-line text`);
    if (!repositoryTypeScriptSource(model.implementation)) {
      problems.push(`${prefix} implementation must be a repository-relative src/physics/*.ts path`);
    }
    if (!enumValue(CLAIM_MATURITY_LEVELS, model.maturity)) problems.push(`${prefix} maturity is invalid`);
    if (!stringArray(model.limitationIds, 3)) {
      problems.push(`${prefix} limitationIds must be an array`);
    } else {
      for (const id of model.limitationIds)
        if (!limitationSet.has(id)) problems.push(`${prefix} links unknown limitation ${id}`);
    }
  }

  const count = object(registry.systemCountDefinition);
  if (!count) {
    problems.push('registry.systemCountDefinition must be an object');
    return limitationSet;
  }
  if (!claimId(count.claimId)) problems.push('registry.systemCountDefinition.claimId is invalid');
  if (count.unit !== 'physical-system-families') {
    problems.push('registry.systemCountDefinition.unit must be physical-system-families');
  }
  if (!nonEmptyText(count.statement, 20)) problems.push('registry.systemCountDefinition.statement must be substantive');
  if (!nonEmptyText(count.countingRule, 30))
    problems.push('registry.systemCountDefinition.countingRule must be substantive');
  if (!Number.isInteger(count.publicCount) || Number(count.publicCount) <= 0) {
    problems.push('registry.systemCountDefinition.publicCount must be a positive integer');
  }
  if (
    !stringArray(count.countedModelIds) ||
    new Set(count.countedModelIds as string[]).size !== (count.countedModelIds as string[]).length
  ) {
    problems.push('registry.systemCountDefinition.countedModelIds must be a unique string array');
  } else {
    if (count.publicCount !== count.countedModelIds.length) {
      problems.push('registry.systemCountDefinition.publicCount must equal countedModelIds length');
    }
    for (const id of count.countedModelIds) {
      if (!modelSet.has(id)) problems.push(`registry.systemCountDefinition links unknown model ${id}`);
    }
  }
  if (
    !stringArray(count.systemSpecKinds) ||
    new Set(count.systemSpecKinds as string[]).size !== (count.systemSpecKinds as string[]).length
  ) {
    problems.push('registry.systemCountDefinition.systemSpecKinds must be a unique string array');
  } else if (count.systemSpecKindCount !== count.systemSpecKinds.length) {
    problems.push('registry.systemCountDefinition.systemSpecKindCount must equal systemSpecKinds length');
  }
  if (!stringArray(count.exclusions, 20))
    problems.push('registry.systemCountDefinition.exclusions must explain exclusions');
  return limitationSet;
}

function validateIncidentPolicy(
  registry: JsonObject,
  context: ClaimRegistryValidationContext,
  problems: string[]
): void {
  const policy = object(registry.incidentPolicy);
  if (!policy) {
    problems.push('registry.incidentPolicy must be an object');
    return;
  }
  if (!stringArray(policy.process, 12) || (policy.process as string[]).length < 5) {
    problems.push('registry.incidentPolicy.process must define at least five substantive lifecycle steps');
  }
  const severities = object(policy.severityDefinitions);
  for (const severity of CLAIM_INCIDENT_SEVERITIES) {
    if (!severities || !nonEmptyText(severities[severity], 20)) {
      problems.push(`registry.incidentPolicy.severityDefinitions.${severity} must be substantive`);
    }
  }
  if (policy.revokedVisibleLevel !== 'withheld') {
    problems.push('registry.incidentPolicy.revokedVisibleLevel must be withheld');
  }
  if (!repositoryFixture(policy.drillFixture)) {
    problems.push('registry.incidentPolicy.drillFixture must be a repository-relative tests/fixtures/*.json path');
  } else if (!context.existingArtifacts.has(policy.drillFixture)) {
    problems.push(`registry incident drill fixture does not exist: ${policy.drillFixture}`);
  }
}

function validateIncidentMetadata(value: unknown, prefix: string, problems: string[]): void {
  const incident = object(value);
  if (!incident) {
    problems.push(`${prefix} incident must be an object`);
    return;
  }
  if (!enumValue(CLAIM_INCIDENT_STATUSES, incident.status)) problems.push(`${prefix} incident.status is invalid`);
  const nullableTextFields = ['incidentId', 'correctionArtifact', 'userNotification'] as const;
  for (const field of nullableTextFields) {
    if (incident[field] !== null && !nonEmptyText(incident[field], 8)) {
      problems.push(`${prefix} incident.${field} must be null or substantive single-line text`);
    }
  }
  for (const field of ['detectedAt', 'embargoUntil'] as const) {
    if (incident[field] !== null && !isoInstant(incident[field])) {
      problems.push(`${prefix} incident.${field} must be null or an ISO timestamp`);
    }
  }
  if (incident.severity !== null && !enumValue(CLAIM_INCIDENT_SEVERITIES, incident.severity)) {
    problems.push(`${prefix} incident.severity is invalid`);
  }
  if (incident.revokedArtifactSha256 !== null && !sha256(incident.revokedArtifactSha256)) {
    problems.push(`${prefix} incident.revokedArtifactSha256 must be null or a lowercase SHA-256 digest`);
  }
  if (incident.status === 'clear') {
    for (const field of [
      'incidentId',
      'severity',
      'detectedAt',
      'embargoUntil',
      'correctionArtifact',
      'revokedArtifactSha256',
      'userNotification'
    ]) {
      if (incident[field] !== null) problems.push(`${prefix} clear incident must set ${field} to null`);
    }
  } else {
    if (!nonEmptyText(incident.incidentId, 8)) problems.push(`${prefix} active incident requires incidentId`);
    if (!enumValue(CLAIM_INCIDENT_SEVERITIES, incident.severity))
      problems.push(`${prefix} active incident requires severity`);
    if (!isoInstant(incident.detectedAt)) problems.push(`${prefix} active incident requires detectedAt`);
  }
  if (incident.status === 'revoked' && !sha256(incident.revokedArtifactSha256)) {
    problems.push(`${prefix} revoked incident requires revokedArtifactSha256`);
  }
}

function hasRule(
  entry: JsonObject,
  input: ClaimDowngradeInputId,
  values: readonly string[],
  maximum: ClaimVisibleLevel
): boolean {
  const visibility = object(entry.visibility);
  const rules = visibility && Array.isArray(visibility.downgradeRules) ? visibility.downgradeRules.map(object) : [];
  return rules.some((rule) => {
    if (!rule || rule.input !== input || !Array.isArray(rule.when) || !enumValue(CLAIM_VISIBLE_LEVELS, rule.to))
      return false;
    return (
      values.every((value) => (rule.when as unknown[]).includes(value)) &&
      VISIBILITY_RANK[rule.to] <= VISIBILITY_RANK[maximum]
    );
  });
}

function validateIncidentDrillFixture(
  registry: JsonObject,
  context: ClaimRegistryValidationContext,
  problems: string[]
): void {
  const drill = object(context.incidentDrill);
  if (!drill) {
    problems.push('incident drill fixture must be a JSON object');
    return;
  }
  if (drill.schemaVersion !== CLAIM_INCIDENT_DRILL_SCHEMA) {
    problems.push(`incident drill fixture schemaVersion must be ${CLAIM_INCIDENT_DRILL_SCHEMA}`);
  }
  if (drill.synthetic !== true) problems.push('incident drill fixture must be explicitly synthetic');
  if (!isoInstant(drill.evaluatedAt)) problems.push('incident drill fixture evaluatedAt must be an ISO timestamp');
  if (drill.expectedEffectiveVisibleLevel !== 'withheld') {
    problems.push('incident drill fixture expectedEffectiveVisibleLevel must be withheld');
  }
  const claims = Array.isArray(registry.claims) ? registry.claims.map(object) : [];
  const claim = claims.find((entry) => entry?.id === drill.claimId);
  if (!claim) {
    problems.push(`incident drill fixture links unknown claim ${String(drill.claimId)}`);
    return;
  }
  if (!sha256(drill.revokedArtifactSha256)) problems.push('incident drill fixture revokedArtifactSha256 is invalid');
  validateIncidentMetadata(drill.incident, 'incident drill fixture', problems);
  const incident = object(drill.incident);
  if (incident?.status !== 'revoked') problems.push('incident drill fixture incident.status must be revoked');
}

export function validateClaimRegistry(
  registryValue: unknown,
  evidenceValue: unknown,
  context: ClaimRegistryValidationContext
): ClaimRegistryValidation {
  const problems: string[] = [];
  const requireEvidenceBindings = context.requireEvidenceBindings !== false;
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

  const limitationSet = validateMaturityAndSystemCatalog(registry, problems);
  const countDefinition = object(registry.systemCountDefinition);
  if (context.systemSpecKinds && countDefinition && Array.isArray(countDefinition.systemSpecKinds)) {
    const declared = countDefinition.systemSpecKinds;
    if (
      declared.length !== context.systemSpecKinds.length ||
      declared.some((kind, index) => kind !== context.systemSpecKinds?.[index])
    ) {
      problems.push('registry.systemCountDefinition.systemSpecKinds must match the runtime SystemSpec union');
    }
  }
  validateIncidentPolicy(registry, context, problems);

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

  const quantifiedMissing = new Set(unregisteredQuantifiedPublicClaimIds(registry, evidence));
  for (const id of [...evidenceById.keys()].sort()) {
    if (registryById.has(id)) continue;
    problems.push(
      quantifiedMissing.has(id)
        ? `unregistered quantified public claim in evidence-summary: ${id}`
        : `evidence-summary claim is missing from registry: ${id}`
    );
  }
  for (const id of [...registryById.keys()].sort()) {
    if (!evidenceById.has(id)) problems.push(`registry claim has no evidence-summary claim: ${id}`);
  }

  const declaredSourceReports = sourceReportValues(evidence);
  const declaredSourceHashes = object(evidence.sourceReportSha256);
  for (const [id, entry] of registryById) {
    const prefix = `registry claim ${id}`;
    const evidenceClaim = evidenceById.get(id);
    if (!nonEmptyText(entry.owner) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.owner)) {
      problems.push(`${prefix} owner must be a lowercase kebab-case responsibility`);
    }
    if (!enumValue(CLAIM_MATURITY_LEVELS, entry.maturity)) problems.push(`${prefix} maturity is invalid`);

    const scope = object(entry.scope);
    if (!scope || !CLAIM_SCOPE_CATEGORIES.has(String(scope.category)))
      problems.push(`${prefix} scope.category is invalid`);
    if (!scope || !nonEmptyText(scope.statement, 20)) {
      problems.push(`${prefix} scope.statement must be a single-line statement of at least 20 characters`);
    }

    if (!repositoryJsonArtifact(entry.sourceArtifact)) {
      problems.push(`${prefix} sourceArtifact must be a repository-relative reports/*.json path`);
    } else {
      if (!declaredSourceReports.has(entry.sourceArtifact)) {
        problems.push(`${prefix} sourceArtifact is not declared by evidence-summary.sourceReports`);
      }
      if (evidenceClaim?.sourceReport !== entry.sourceArtifact) {
        problems.push(`${prefix} sourceArtifact does not match evidence-summary sourceReport`);
      }
      if (requireEvidenceBindings && (!declaredSourceHashes || !sha256(declaredSourceHashes[entry.sourceArtifact]))) {
        problems.push(`${prefix} sourceArtifact is missing a SHA-256 binding in evidence-summary`);
      }
      if (requireEvidenceBindings && !isoInstant(evidenceClaim?.evidenceGeneratedAt)) {
        problems.push(`${prefix} evidence-summary evidenceGeneratedAt is missing or invalid`);
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

    if (!stringArray(entry.limitationIds, 3)) {
      problems.push(`${prefix} limitationIds must be an array`);
    } else {
      for (const limitationId of entry.limitationIds) {
        if (!limitationSet.has(limitationId)) problems.push(`${prefix} links unknown limitation ${limitationId}`);
      }
    }

    const validity = object(entry.validity);
    if (
      !validity ||
      !stringArray(validity.evidenceClasses) ||
      (validity.evidenceClasses as string[]).some((item) => !kebabId(item))
    ) {
      problems.push(`${prefix} validity.evidenceClasses must contain kebab-case evidence classes`);
    }
    if (!validity || !Number.isInteger(validity.validForDays) || Number(validity.validForDays) < 1) {
      problems.push(`${prefix} validity.validForDays must be a positive integer`);
    }

    const visibility = object(entry.visibility);
    if (!visibility || !enumValue(CLAIM_VISIBLE_LEVELS, visibility.defaultLevel)) {
      problems.push(`${prefix} visibility.defaultLevel is invalid`);
    }
    const rules = visibility && Array.isArray(visibility.downgradeRules) ? visibility.downgradeRules.map(object) : [];
    if (!visibility || !Array.isArray(visibility.downgradeRules)) {
      problems.push(`${prefix} visibility.downgradeRules must be an array`);
    }
    for (const [index, rule] of rules.entries()) {
      const rulePrefix = `${prefix} visibility.downgradeRules[${index}]`;
      if (!rule) {
        problems.push(`${rulePrefix} must be an object`);
        continue;
      }
      const ruleInput = rule.input;
      if (!enumValue(CLAIM_DOWNGRADE_INPUTS, ruleInput)) {
        problems.push(`${rulePrefix}.input is invalid`);
        continue;
      }
      if (
        !stringArray(rule.when) ||
        (rule.when as string[]).some((value) => !DOWNGRADE_INPUT_VALUES[ruleInput].has(value))
      ) {
        problems.push(`${rulePrefix}.when contains an invalid ${ruleInput} value`);
      }
      if (!enumValue(CLAIM_VISIBLE_LEVELS, rule.to)) problems.push(`${rulePrefix}.to is invalid`);
      if (!nonEmptyText(rule.reason, 16)) problems.push(`${rulePrefix}.reason must be substantive`);
      const defaultLevel = visibility?.defaultLevel;
      if (
        enumValue(CLAIM_VISIBLE_LEVELS, defaultLevel) &&
        enumValue(CLAIM_VISIBLE_LEVELS, rule.to) &&
        VISIBILITY_RANK[rule.to] >= VISIBILITY_RANK[defaultLevel]
      ) {
        problems.push(`${rulePrefix}.to must be lower than visibility.defaultLevel`);
      }
    }
    if (!hasRule(entry, 'evidence-freshness', ['expired', 'unknown'], 'informational')) {
      problems.push(`${prefix} must downgrade expired and unknown evidence to informational or withheld`);
    }
    if (!hasRule(entry, 'artifact-status', ['revoked'], 'withheld')) {
      problems.push(`${prefix} must withhold a revoked source artifact`);
    }
    if (!hasRule(entry, 'incident-status', ['embargoed', 'revoked'], 'withheld')) {
      problems.push(`${prefix} must withhold embargoed or revoked incidents`);
    }
    if (!hasRule(entry, 'incident-status', ['investigating', 'correction-pending'], 'informational')) {
      problems.push(`${prefix} must downgrade investigating or correction-pending incidents`);
    }
    if (
      (id === 'tests.unit' || id === 'validation.scipy.regular' || id === 'benchmark.energy.methods') &&
      !hasRule(entry, 'claim-status', ['failed', 'missing', 'unknown'], 'withheld')
    ) {
      problems.push(`${prefix} must withhold failed, missing, or unknown claim evidence`);
    }
    if (id === 'testing.mutation' && !hasRule(entry, 'mutation-status', ['low'], 'measured')) {
      problems.push(`${prefix} must consume the low mutation downgrade input`);
    }
    if (id === 'gpu.vendor-matrix' && !hasRule(entry, 'gpu-status', ['partial'], 'measured')) {
      problems.push(`${prefix} must consume the partial GPU downgrade input`);
    }
    if (id === 'publication.release' && !hasRule(entry, 'publication-status', ['partial'], 'informational')) {
      problems.push(`${prefix} must consume the partial publication downgrade input`);
    }
    validateIncidentMetadata(entry.incident, prefix, problems);
  }

  validateIncidentDrillFixture(registry, context, problems);
  return { ok: problems.length === 0, problems };
}
