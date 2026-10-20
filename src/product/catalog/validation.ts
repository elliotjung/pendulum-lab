import type { CapabilityCatalog, CatalogDefinition } from '../contracts/catalog';
import { supportsSystem } from './predicates';

const categories = [
  'system',
  'analysis',
  'integrator',
  'control',
  'importer',
  'exporter',
  'storage-schema',
  'route',
  'runtime'
];
const evolutions = [
  'ode',
  'hybrid',
  'constrained',
  'delay',
  'sde',
  'field',
  'map',
  'quantum',
  'spectral',
  'diagnostic'
];
const families = [
  'classical',
  'flexible',
  'spatial',
  'driven-control',
  'nonlinear',
  'network',
  'stochastic-field',
  'discrete-quantum'
];
const inputKinds = [
  'state',
  'trajectory',
  'scalar-series',
  'uniform-series',
  'energy-series',
  'vector-field',
  'tangent-model',
  'flow-map',
  'map-function',
  'jacobian',
  'phase-series',
  'ensemble',
  'parameter-grid',
  'observations',
  'training-data',
  'matrix',
  'symmetric-matrix',
  'complex-matrix',
  'linear-operator',
  'periodic-orbit',
  'continuation-branch',
  'basin-grid',
  'ftle-grid',
  'point-cloud',
  'lattice',
  'field',
  'model-evaluator',
  'potential',
  'multipliers',
  'energy-function',
  'parameterized-model',
  'residual-function',
  'symmetric-operator',
  'parameters'
];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const oneOf = (value: unknown, choices: readonly string[]): boolean =>
  typeof value === 'string' && choices.includes(value);

/** Runtime shape checks also guard data-loaded catalogs. Errors include stable paths for build diagnostics. */
export function validateCatalog(value: unknown): string[] {
  const errors: string[] = [];
  const fail = (path: string, message: string) => {
    errors.push(`${path}: ${message}`);
  };
  function text(value: unknown, path: string) {
    if (!record(value)) {
      fail(path, 'localized text required');
      return;
    }
    for (const locale of ['ko', 'en']) if (!nonempty(value[locale])) fail(`${path}.${locale}`, 'missing translation');
  }
  function list(value: unknown, path: string, minimum = 0): unknown[] {
    if (!Array.isArray(value)) {
      fail(path, 'array required');
      return [];
    }
    if (value.length < minimum) fail(path, `at least ${minimum} item required`);
    return value;
  }
  function strings(value: unknown, path: string, choices?: readonly string[], minimum = 0) {
    const items = list(value, path, minimum);
    for (const item of items) {
      if (!nonempty(item) || (choices !== undefined && !choices.includes(item)))
        fail(path, `invalid value ${String(item)}`);
    }
    if (new Set(items).size !== items.length) fail(path, 'duplicate values');
  }
  function binding(value: unknown, path: string) {
    if (!record(value)) {
      fail(path, 'binding required');
      return;
    }
    if (!nonempty(value.module) || !/^src\/(?:[\w-]+\/)*[\w.-]+\.ts$/.test(value.module))
      fail(path, 'invalid source module');
    if (!nonempty(value.exportName) || !/^[\w$]+$/.test(value.exportName)) fail(path, 'invalid export name');
    if (value.member !== undefined && !nonempty(value.member)) fail(path, 'invalid member');
  }
  function bindings(value: unknown, path: string) {
    list(value, path, 1).forEach((item, index) => binding(item, `${path}[${index}]`));
  }
  function schema(value: unknown, path: string) {
    if (!record(value)) {
      fail(path, 'schema reference required');
      return;
    }
    if (value.kind !== 'legacy-api' || value.version !== 'unversioned')
      fail(path, 'unsupported legacy schema reference');
    bindings(value.bindings, `${path}.bindings`);
    text(value.description, `${path}.description`);
  }
  function predicate(value: unknown, path: string) {
    if (!record(value)) {
      fail(path, 'predicate required');
      return;
    }
    strings(value.requiredInputs, `${path}.requiredInputs`, inputKinds);
    if (value.systemIds !== undefined) strings(value.systemIds, `${path}.systemIds`);
    if (value.evolutions !== undefined) strings(value.evolutions, `${path}.evolutions`, evolutions);
  }
  if (!record(value)) return ['catalog: object required'];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [group, expected] of [
    ['systems', 'system'],
    ['analyses', 'analysis'],
    ['integrators', 'integrator'],
    ['auxiliary', null]
  ] as const) {
    for (const [index, entry] of list(value[group], group, 1).entries()) {
      const path = `${group}[${index}]`;
      if (!record(entry)) {
        fail(path, 'definition required');
        continue;
      }
      if (
        !oneOf(entry.category, categories) ||
        (expected !== null && entry.category !== expected) ||
        (expected === null && ['system', 'analysis', 'integrator'].includes(String(entry.category)))
      )
        fail(path, 'incorrect category');
      if (!nonempty(entry.id) || !new RegExp(`^${String(entry.category)}:[a-z0-9]+(?:-[a-z0-9]+)*$`).test(entry.id))
        fail(path, 'invalid stable id');
      else {
        if (ids.has(entry.id)) fail(path, `duplicate id ${entry.id}`);
        ids.add(entry.id);
      }
      text(entry.name, `${path}.name`);
      text(entry.description, `${path}.description`);
      if (record(entry.name))
        for (const locale of ['ko', 'en']) {
          const name = entry.name[locale];
          if (nonempty(name)) {
            const key = `${String(entry.category)}:${locale}:${name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()}`;
            if (names.has(key)) fail(`${path}.name.${locale}`, `duplicate name ${name}`);
            names.add(key);
          }
        }
      strings(entry.tags, `${path}.tags`, undefined, 1);
      // S16 exposes an existing static native API as a new product route. The frozen S01 inventory is unchanged.
      const nativeFkExtension =
        entry.id === 'system:frenkel-kontorova' &&
        entry.category === 'system' &&
        entry.integrationStage === 16 &&
        entry.family === 'stochastic-field' &&
        entry.evolution === 'diagnostic' &&
        Array.isArray(entry.legacyBindings) &&
        entry.legacyBindings.length === 1 &&
        record(entry.legacyBindings[0]) &&
        entry.legacyBindings[0].module === 'src/physics/sineGordon.ts' &&
        entry.legacyBindings[0].exportName === 'relaxFrenkelKontorovaKink';
      strings(entry.baselineIds, `${path}.baselineIds`, undefined, nativeFkExtension ? 0 : 1);
      bindings(entry.legacyBindings, `${path}.legacyBindings`);
      if (
        !Number.isInteger(entry.integrationStage) ||
        Number(entry.integrationStage) < 2 ||
        Number(entry.integrationStage) > 30
      )
        fail(path, 'invalid integration stage');
      list(entry.limitations, `${path}.limitations`).forEach((item, i) => text(item, `${path}.limitations[${i}]`));
      if (entry.category === 'system') {
        if (!oneOf(entry.family, families)) fail(path, 'unknown family');
        if (!oneOf(entry.evolution, evolutions)) fail(path, 'unknown evolution');
        bindings(entry.engineAdapters, `${path}.engineAdapters`);
        schema(entry.state, `${path}.state`);
        schema(entry.parameters, `${path}.parameters`);
        text(entry.coordinates, `${path}.coordinates`);
        const dof = entry.degreesOfFreedom;
        if (!record(dof)) fail(path, 'degrees of freedom required');
        else if (dof.kind === 'fixed') {
          if (!Number.isInteger(dof.value) || Number(dof.value) < 1) fail(path, 'positive degrees of freedom required');
        } else if (dof.kind === 'variable') text(dof.description, `${path}.degreesOfFreedom.description`);
        else fail(path, 'unknown degrees of freedom kind');
        const stepping = entry.stepping;
        if (!record(stepping)) fail(path, 'stepping required');
        else if (stepping.kind === 'selectable')
          strings(stepping.integratorIds, `${path}.stepping.integratorIds`, undefined, 1);
        else if (stepping.kind === 'internal') {
          binding(stepping.binding, `${path}.stepping.binding`);
          text(stepping.description, `${path}.stepping.description`);
        } else fail(path, 'unknown stepping kind');
      }
      if (entry.category === 'analysis' || entry.category === 'integrator')
        predicate(entry.compatibility, `${path}.compatibility`);
      if (entry.category === 'analysis') {
        const inputs = list(entry.inputs, `${path}.inputs`, 1);
        inputs.forEach((input, i) => {
          if (!record(input)) {
            fail(path, 'invalid input');
            return;
          }
          if (!oneOf(input.kind, inputKinds)) fail(path, 'unknown input kind');
          text(input.description, `${path}.inputs[${i}].description`);
        });
        const kinds = inputs.filter(record).map((input) => input.kind);
        if (new Set(kinds).size !== kinds.length) fail(path, 'duplicate input kinds');
        if (
          record(entry.compatibility) &&
          Array.isArray(entry.compatibility.requiredInputs) &&
          [...entry.compatibility.requiredInputs].sort().join(',') !== [...kinds].sort().join(',')
        )
          fail(path, 'input requirements disagree with predicate');
        schema(entry.parameters, `${path}.parameters`);
        list(entry.outputs, `${path}.outputs`, 1).forEach((output, i) => {
          if (!record(output)) {
            fail(path, 'invalid output');
            return;
          }
          if (!nonempty(output.kind)) fail(path, 'output kind required');
          text(output.description, `${path}.outputs[${i}].description`);
        });
        if (!record(entry.computation)) fail(path, 'computation required');
        else {
          if (!oneOf(entry.computation.location, ['main', 'worker', 'wasm']))
            fail(path, 'invalid computation location');
          if (typeof entry.computation.cancellable !== 'boolean') fail(path, 'cancellation flag required');
          text(entry.computation.cost, `${path}.computation.cost`);
        }
      }
      if (entry.category === 'integrator') {
        if (
          !oneOf(entry.method, [
            'explicit',
            'implicit',
            'split',
            'adaptive-controller',
            'canonical-transform',
            'stochastic'
          ])
        )
          fail(path, 'invalid integrator method');
        if (
          entry.order !== null &&
          (typeof entry.order !== 'number' || !Number.isFinite(entry.order) || entry.order <= 0)
        )
          fail(path, 'invalid method order');
        if (entry.legacyId !== undefined && !nonempty(entry.legacyId)) fail(path, 'invalid legacy id');
      }
    }
  }
  // Cross-references are safe to inspect only after the complete shape has passed.
  if (errors.length > 0) return errors;
  const catalog = value as unknown as CapabilityCatalog;
  const systems = new Map(catalog.systems.map((system) => [system.id, system]));
  const integrators = new Map(catalog.integrators.map((integrator) => [integrator.id, integrator]));
  const baselineIds = new Set<string>();
  const legacyIds = new Set<string>();
  for (const entry of allDefinitions(catalog)) {
    for (const id of entry.baselineIds) {
      if (baselineIds.has(id)) fail(entry.id, `duplicate baseline reference ${id}`);
      baselineIds.add(id);
    }
    if (entry.category === 'analysis' || entry.category === 'integrator') {
      for (const id of entry.compatibility.systemIds ?? [])
        if (!systems.has(id)) fail(entry.id, `unknown system ${id}`);
      const explicitlyStandalone = entry.compatibility.systemIds?.length === 0;
      if (!explicitlyStandalone && !catalog.systems.some((system) => supportsSystem(entry.compatibility, system)))
        fail(entry.id, 'predicate matches no registered system');
    }
    if (entry.category === 'integrator' && entry.legacyId !== undefined) {
      if (legacyIds.has(entry.legacyId)) fail(entry.id, `duplicate legacy integrator ${entry.legacyId}`);
      legacyIds.add(entry.legacyId);
    }
  }
  for (const system of catalog.systems)
    if (system.stepping.kind === 'selectable') {
      for (const id of system.stepping.integratorIds) {
        const integrator = integrators.get(id);
        if (integrator === undefined) fail(system.id, `unknown integrator ${id}`);
        else if (!supportsSystem(integrator.compatibility, system)) fail(system.id, `incompatible integrator ${id}`);
      }
    }
  return errors;
}

export function allDefinitions(catalog: CapabilityCatalog): CatalogDefinition[] {
  return [...catalog.systems, ...catalog.analyses, ...catalog.integrators, ...catalog.auxiliary];
}

export function assertValidCatalog(catalog: CapabilityCatalog): void {
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(`Invalid capability catalog:\n${errors.join('\n')}`);
}

/** Clone before freezing so consumers cannot mutate the catalog or freeze a caller's source objects. */
export function createCatalog(definitions: CapabilityCatalog): CapabilityCatalog {
  assertValidCatalog(definitions);
  const result = structuredClone(definitions);
  function freeze(value: unknown): void {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(result);
  return result;
}
