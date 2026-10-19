import { catalog, supportsSystem } from '../catalog';
import { inspectSafeData } from '../persistence/safe-data';
import type { SystemDefinition } from './catalog';
import { fields, integer, invalid, isFieldName, isRecord, token } from './contract-checks';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from './experiment';
import { checkProvenance } from './provenance-validation';
import { checkQuantityMap } from './quantities';
import { issue, success, type ContractIssue, type ContractResult } from './validation';

export const MAX_RUN_STEPS = 1_000_000_000;
export const MAX_ANALYSES = 64;

export function checkOptions(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!isRecord(value)) {
    invalid(issues, path, 'Expected an option map.');
    return;
  }
  if (Object.keys(value).length > 128) {
    invalid(issues, path, 'Too many options.');
    return;
  }
  for (const [name, option] of Object.entries(value)) {
    if (!isFieldName(name)) invalid(issues, `${path}.${name}`, 'Expected an adapter-defined option name.');
    if (typeof option !== 'boolean') token(option, `${path}.${name}`, issues);
  }
}

function checkIntegrator(value: unknown, system: SystemDefinition | undefined, issues: ContractIssue[]): void {
  const path = '$.integrator';
  if (!isRecord(value)) {
    invalid(issues, path, 'Expected integrator configuration.');
    return;
  }
  if (value.kind !== 'selectable' && value.kind !== 'internal') {
    invalid(issues, `${path}.kind`, 'Expected selectable or internal.');
    return;
  }
  fields(
    value,
    value.kind === 'selectable' ? ['kind', 'id', 'version', 'settings'] : ['kind', 'version', 'settings'],
    ['options'],
    path,
    issues
  );
  token(value.version, `${path}.version`, issues);
  checkQuantityMap(value.settings, `${path}.settings`, issues);
  if (Object.hasOwn(value, 'options')) checkOptions(value.options, `${path}.options`, issues);
  if (system && system.stepping.kind !== value.kind) {
    issues.push(issue('incompatible-capability', path, 'Integrator ownership must match the catalog system.'));
  }
  if (value.kind === 'selectable') {
    const definition = catalog.integrators.find((entry) => entry.id === value.id);
    if (!definition) issues.push(issue('unknown-id', `${path}.id`, 'Unknown integrator ID.'));
    else if (
      system &&
      (system.stepping.kind !== 'selectable' ||
        !system.stepping.integratorIds.includes(definition.id) ||
        !supportsSystem(definition.compatibility, system))
    ) {
      issues.push(issue('incompatible-capability', `${path}.id`, 'Integrator does not support this system.'));
    }
  }
}

function seconds(value: unknown, positive: boolean, path: string, issues: ContractIssue[]): number | undefined {
  if (!fields(value, ['value', 'unit'], [], path, issues)) return;
  if (value.unit !== 's') invalid(issues, `${path}.unit`, 'Runtime time quantities must use seconds.');
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || (positive && value.value <= 0)) {
    invalid(issues, `${path}.value`, positive ? 'Expected positive finite seconds.' : 'Expected finite seconds.');
    return;
  }
  return value.value;
}

function checkRuntime(
  value: unknown,
  system: SystemDefinition | undefined,
  modelVersion: unknown,
  issues: ContractIssue[]
): void {
  const path = '$.runtime';
  if (!isRecord(value)) {
    invalid(issues, path, 'Expected runtime configuration.');
    return;
  }
  // S14 adds explicitly versioned time-response wrappers around two diagnostic
  // tools. Their legacy evaluation contracts and catalog evolution stay intact.
  const nonlinearTimeWrapper =
    modelVersion === 'nonlinear-model-v1' && (system?.id === 'system:mathieu' || system?.id === 'system:friction');
  const domain =
    system &&
    (nonlinearTimeWrapper
      ? 'time'
      : ['map', 'quantum'].includes(system.evolution)
        ? 'iteration'
        : ['spectral', 'diagnostic'].includes(system.evolution)
          ? 'evaluation'
          : 'time');
  if (domain && value.domain !== domain)
    issues.push(issue('incompatible-capability', `${path}.domain`, 'Runtime domain must match the catalog system.'));
  if (value.domain === 'time') {
    fields(value, ['domain', 'start', 'duration', 'step', 'sampleEvery'], [], path, issues);
    const start = seconds(value.start, false, `${path}.start`, issues);
    const duration = seconds(value.duration, true, `${path}.duration`, issues);
    const step = seconds(value.step, true, `${path}.step`, issues);
    integer(value.sampleEvery, 1, MAX_RUN_STEPS, `${path}.sampleEvery`, issues);
    if (duration !== undefined && step !== undefined && (step > duration || Math.ceil(duration / step) > MAX_RUN_STEPS))
      invalid(issues, path, 'Step must fit duration and the bounded execution budget.');
    if (
      start !== undefined &&
      duration !== undefined &&
      (!Number.isFinite(start + duration) || start + duration <= start)
    )
      invalid(issues, path, 'End time must be finite and distinguishable from start.');
    if (start !== undefined && step !== undefined && (!Number.isFinite(start + step) || start + step <= start))
      invalid(issues, '$.runtime.step', 'Step must advance the represented start time.');
  } else if (value.domain === 'iteration') {
    fields(value, ['domain', 'start', 'iterations', 'sampleEvery'], [], path, issues);
    integer(value.start, 0, Number.MAX_SAFE_INTEGER, `${path}.start`, issues);
    integer(value.iterations, 1, MAX_RUN_STEPS, `${path}.iterations`, issues);
    integer(value.sampleEvery, 1, MAX_RUN_STEPS, `${path}.sampleEvery`, issues);
    if (
      typeof value.start === 'number' &&
      typeof value.iterations === 'number' &&
      !Number.isSafeInteger(value.start + value.iterations)
    )
      invalid(issues, path, 'Final iteration must be a safe integer.');
  } else if (value.domain === 'evaluation') fields(value, ['domain'], [], path, issues);
  else invalid(issues, `${path}.domain`, 'Expected time, iteration, or evaluation.');
}

export function checkAnalysis(value: unknown, path: string, issues: ContractIssue[], system?: SystemDefinition): void {
  if (!fields(value, ['id', 'algorithmVersion', 'settings'], ['options'], path, issues)) return;
  const definition = catalog.analyses.find((entry) => entry.id === value.id);
  if (!definition) issues.push(issue('unknown-id', `${path}.id`, 'Unknown analysis ID.'));
  else if (system && !supportsSystem(definition.compatibility, system))
    issues.push(issue('incompatible-capability', `${path}.id`, 'Analysis does not support this system.'));
  token(value.algorithmVersion, `${path}.algorithmVersion`, issues);
  checkQuantityMap(value.settings, `${path}.settings`, issues);
  if (Object.hasOwn(value, 'options')) checkOptions(value.options, `${path}.options`, issues);
}

/** Validates transport structure and catalog compatibility; future adapters validate model-specific physics. */
export function validateExperimentState(input: unknown): ContractResult<ExperimentStateV1> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const value = safe.value;
  const issues: ContractIssue[] = [];
  if (
    !fields(
      value,
      ['schema', 'systemId', 'modelVersion', 'parameters', 'initialConditions', 'integrator', 'runtime', 'analyses'],
      ['modelOptions', 'seed', 'provenance'],
      '$',
      issues
    )
  )
    return { ok: false, issues };
  if (value.schema !== EXPERIMENT_SCHEMA)
    issues.push(
      issue(
        'unsupported-version',
        '$.schema',
        'Unsupported experiment schema; preserve the original file.',
        'use-supported-version'
      )
    );
  const system = catalog.systems.find((entry) => entry.id === value.systemId);
  if (!system) issues.push(issue('unknown-id', '$.systemId', 'Unknown system ID.'));
  token(value.modelVersion, '$.modelVersion', issues);
  checkQuantityMap(value.parameters, '$.parameters', issues);
  checkQuantityMap(value.initialConditions, '$.initialConditions', issues);
  if (Object.hasOwn(value, 'modelOptions')) checkOptions(value.modelOptions, '$.modelOptions', issues);
  checkIntegrator(value.integrator, system, issues);
  checkRuntime(value.runtime, system, value.modelVersion, issues);
  if (!Array.isArray(value.analyses) || value.analyses.length > MAX_ANALYSES)
    invalid(issues, '$.analyses', `Expected at most ${MAX_ANALYSES} analyses.`);
  else {
    const ids = new Set<unknown>();
    value.analyses.forEach((analysis, index) => {
      checkAnalysis(analysis, `$.analyses[${index}]`, issues, system);
      if (isRecord(analysis)) {
        if (ids.has(analysis.id)) invalid(issues, `$.analyses[${index}].id`, 'Duplicate analysis ID.');
        ids.add(analysis.id);
      }
    });
  }
  if (Object.hasOwn(value, 'seed')) {
    if (fields(value.seed, ['value', 'generator', 'generatorVersion'], [], '$.seed', issues)) {
      if (typeof value.seed.value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.seed.value))
        invalid(issues, '$.seed.value', 'Expected an opaque ASCII seed string (1–128 characters).');
      token(value.seed.generator, '$.seed.generator', issues);
      token(value.seed.generatorVersion, '$.seed.generatorVersion', issues);
    }
  } else if (system?.evolution === 'sde')
    invalid(issues, '$.seed', 'Stochastic systems require a seed, generator, and generator version.');
  if (Object.hasOwn(value, 'provenance')) checkProvenance(value.provenance, value, issues);
  return issues.length ? { ok: false, issues } : success(value as unknown as ExperimentStateV1);
}
