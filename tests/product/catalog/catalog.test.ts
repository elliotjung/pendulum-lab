import { describe, expect, it } from 'vitest';
import {
  catalog,
  allDefinitions,
  getDefinition,
  validateCatalog,
  createCatalog,
  capabilityRejections,
  compatibleAnalyses,
  compatibleIntegrators,
  matchesCapability,
  supportsSystem
} from '../../../src/product/catalog';
import type { CapabilityCatalog, CapabilityPredicate } from '../../../src/product/contracts/catalog';

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [P in keyof T]: Mutable<T[P]> }
    : T;
const copy = () => structuredClone(catalog) as Mutable<CapabilityCatalog>;
const system = (id: string) => catalog.systems.find((system) => system.id === `system:${id}`)!;

describe('S02 typed capability catalog', () => {
  it('registers all systems, analysis input contracts and methods with unique stable IDs', () => {
    expect(validateCatalog(catalog)).toEqual([]);
    expect(catalog.systems).toHaveLength(35);
    expect(catalog.analyses).toHaveLength(51);
    expect(catalog.integrators).toHaveLength(21);
    expect(allDefinitions(catalog)).toHaveLength(135);
    expect(catalog.integrators.filter((method) => method.legacyId !== undefined)).toHaveLength(16);
    expect(catalog.systems.every((system) => system.engineAdapters.length > 0)).toBe(true);
    expect(catalog.analyses.every((analysis) => analysis.inputs.length > 0)).toBe(true);
  });

  it('records the S16 native FK extension without fabricating or reassigning a baseline capability', () => {
    const fk = system('frenkel-kontorova');
    expect(fk.baselineIds).toEqual([]);
    expect(fk.legacyBindings).toEqual([
      { module: 'src/physics/sineGordon.ts', exportName: 'relaxFrenkelKontorovaKink' }
    ]);
    expect(fk.evolution).toBe('diagnostic');
    for (const patch of [
      { id: 'system:invented' },
      { integrationStage: 17 },
      { evolution: 'ode' },
      { legacyBindings: [{ module: 'src/physics/standardMap.ts', exportName: 'standardMapStep' }] }
    ]) {
      const data = copy(),
        entry = data.systems.find((item) => item.id === fk.id)!;
      Object.assign(entry, patch);
      expect(validateCatalog(data).some((error) => error.includes('baselineIds'))).toBe(true);
    }
    const data = copy();
    data.systems[0]!.baselineIds = [];
    expect(validateCatalog(data).some((error) => error.includes('baselineIds'))).toBe(true);
  });

  it('returns only known IDs and isolates the deeply frozen registry from caller objects', () => {
    expect(getDefinition('system:double')?.category).toBe('system');
    expect(getDefinition('__proto__')).toBeUndefined();
    expect(getDefinition('toString')).toBeUndefined();
    const source = copy();
    const isolated = createCatalog(source);
    source.systems[0]!.name.ko = 'caller edit';
    expect(isolated.systems[0]!.name.ko).not.toBe('caller edit');
    expect(Object.isFrozen(isolated.systems[0]!.engineAdapters[0])).toBe(true);
    expect(() => {
      (isolated as Mutable<CapabilityCatalog>).systems[0]!.name.ko = 'mutation';
    }).toThrow();
  });

  it.each([null, [], 4, 'catalog', {}, { systems: [null] }])(
    'reports malformed roots without crashing (%j)',
    (value) => {
      expect(validateCatalog(value).length).toBeGreaterThan(0);
    }
  );

  it('rejects duplicate IDs, names normalized for case/space, baseline references and method IDs', () => {
    const data = copy();
    data.systems[1]!.id = data.systems[0]!.id;
    data.systems[1]!.name.en = `  ${data.systems[0]!.name.en.toUpperCase()}  `;
    expect(validateCatalog(data).join('\n')).toMatch(/duplicate id/);
    expect(validateCatalog(data).join('\n')).toMatch(/duplicate name/);
    const refs = copy();
    refs.systems[1]!.baselineIds = [...refs.systems[0]!.baselineIds];
    const methods = refs.integrators.filter((entry) => entry.legacyId !== undefined);
    methods[1]!.legacyId = methods[0]!.legacyId!;
    expect(validateCatalog(refs).join('\n')).toMatch(/duplicate baseline reference/);
    expect(validateCatalog(refs).join('\n')).toMatch(/duplicate legacy integrator/);
  });

  it('rejects missing translations including nested scientific and input descriptions', () => {
    const data = copy();
    data.systems[0]!.name.ko = '';
    data.systems[0]!.parameters.description.en = ' ';
    data.analyses[0]!.inputs[0]!.description.ko = '';
    data.analyses[0]!.computation.cost.en = '';
    expect(validateCatalog(data).filter((error) => error.includes('missing translation'))).toHaveLength(4);
  });

  it('rejects absent bindings, unsafe module paths, bad stages and incomplete analysis schemas', () => {
    const data = copy();
    data.systems[0]!.engineAdapters = [];
    data.systems[1]!.legacyBindings[0]!.module = '../physics/double.ts';
    data.analyses[0]!.integrationStage = 31;
    data.analyses[0]!.inputs = [];
    data.analyses[0]!.outputs = [];
    const errors = validateCatalog(data).join('\n');
    expect(errors).toMatch(/engineAdapters/);
    expect(errors).toMatch(/invalid source module/);
    expect(errors).toMatch(/invalid integration stage/);
    expect(errors).toMatch(/inputs/);
    expect(errors).toMatch(/outputs/);
    expect(() => createCatalog(data)).toThrow(/Invalid capability catalog/);
  });

  it('rejects unknown cross references and incompatible system-stepper combinations', () => {
    const data = copy();
    data.analyses[0]!.compatibility.systemIds = ['system:missing'];
    data.systems.find((entry) => entry.id === 'system:quantum-kicked-rotor')!.stepping = {
      kind: 'selectable',
      integratorIds: ['integrator:rk4', 'integrator:missing']
    };
    const errors = validateCatalog(data).join('\n');
    expect(errors).toMatch(/unknown system/);
    expect(errors).toMatch(/incompatible integrator integrator:rk4/);
    expect(errors).toMatch(/unknown integrator integrator:missing/);
  });

  it('rejects a declared input omitted from compatibility and unknown enum values', () => {
    const data = copy();
    data.analyses[0]!.compatibility.requiredInputs = [];
    expect(validateCatalog(data).join('\n')).toMatch(/input requirements disagree/);
    const broken = JSON.parse(JSON.stringify(catalog));
    broken.integrators[0].compatibility.evolutions = ['not-an-evolution'];
    broken.analyses[0].inputs[0].kind = 'invented-data';
    expect(validateCatalog(broken).join('\n')).toMatch(/invalid value not-an-evolution/);
    expect(validateCatalog(broken).join('\n')).toMatch(/unknown input kind/);
  });

  it('does not coerce malformed JSON arrays into valid enum strings', () => {
    const data = JSON.parse(JSON.stringify(catalog));
    data.auxiliary[0].category = [data.auxiliary[0].category];
    data.systems[0].family = [data.systems[0].family];
    data.systems[1].evolution = [data.systems[1].evolution];
    data.integrators[0].method = [data.integrators[0].method];
    data.analyses[0].computation.location = [data.analyses[0].computation.location];
    data.analyses[1].inputs[0].kind = [data.analyses[1].inputs[0].kind];
    const errors = validateCatalog(data).join('\n');
    for (const message of [
      'incorrect category',
      'unknown family',
      'unknown evolution',
      'invalid integrator method',
      'invalid computation location',
      'unknown input kind'
    ]) {
      expect(errors).toContain(message);
    }
  });
});

describe('declarative compatibility', () => {
  it('ANDs system and evolution clauses with all data requirements and explains refusal', () => {
    const predicate: CapabilityPredicate = {
      systemIds: ['system:double'],
      evolutions: ['ode'],
      requiredInputs: ['trajectory', 'tangent-model']
    };
    const double = system('double');
    expect(matchesCapability(predicate, { system: double, availableInputs: ['trajectory', 'tangent-model'] })).toBe(
      true
    );
    expect(capabilityRejections(predicate, { system: double, availableInputs: ['trajectory'] })).toEqual([
      'missing-input:tangent-model'
    ]);
    expect(supportsSystem(predicate, system('standard-map'))).toBe(false);
    expect(supportsSystem({ ...predicate, evolutions: ['map'] }, double)).toBe(false);
    expect(supportsSystem({ requiredInputs: [], systemIds: [] }, double)).toBe(false);
    expect(supportsSystem({ requiredInputs: [] }, double)).toBe(true);
  });

  it('never offers generic ODE steppers for map, quantum, delay, projection or hybrid internal solvers', () => {
    for (const id of [
      'standard-map',
      'quantum-kicked-rotor',
      'unitary-floquet',
      'pyragas',
      'spherical-embedded',
      'rope',
      'double-string'
    ]) {
      expect(
        compatibleIntegrators(catalog, { system: system(id), availableInputs: ['state', 'vector-field'] })
      ).toEqual([]);
    }
    const split = catalog.integrators.filter((integrator) => integrator.method === 'split');
    for (const id of ['kuramoto', 'huygens-phase-pair', 'driven', 'duffing', 'kapitza']) {
      expect(split.every((integrator) => !supportsSystem(integrator.compatibility, system(id)))).toBe(true);
    }
  });

  it('requires real analysis data instead of treating catalog registration as a produced artifact', () => {
    const context = { system: system('double'), availableInputs: [] } as const;
    expect(compatibleAnalyses(catalog, context)).toEqual([]);
    const fft = catalog.analyses.find((analysis) => analysis.id === 'analysis:fft')!;
    expect(compatibleAnalyses(catalog, { ...context, availableInputs: fft.compatibility.requiredInputs })).toContain(
      fft
    );
    const estimation = catalog.analyses.find((analysis) => analysis.id === 'analysis:parameter-estimation')!;
    expect(
      matchesCapability(estimation.compatibility, {
        system: system('quantum-kicked-rotor'),
        availableInputs: estimation.compatibility.requiredInputs
      })
    ).toBe(false);
  });
});
