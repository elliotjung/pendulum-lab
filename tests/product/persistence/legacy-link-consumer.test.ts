import { describe, expect, it } from 'vitest';
import { buildPerturbedStates, PERTURBATION_PATTERNS } from '../../../src/app/ensemblePerturbation';
import { migrateLegacyLink } from '../../../src/product/persistence/legacy-link';
import {
  legacyLinkConsumerSettings,
  legacyEnsembleEntries
} from '../../../src/product/persistence/legacy-link-consumer';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  fromCanonicalPlanar
} from '../../../src/product/adapters/physics/planar';
import { defaultChainConfig, toCanonicalChain, fromCanonicalChain } from '../../../src/product/adapters/physics/chain';

describe('S28 exact legacy context consumers', () => {
  for (const system of ['double', 'compound-double', 'triple'] as const)
    for (const pattern of PERTURBATION_PATTERNS)
      it(`${system} ${pattern} preserves native ensemble member inputs, order and context`, () => {
        const canonical =
          system === 'triple'
            ? toCanonicalChain({ ...defaultChainConfig('system:triple'), duration: 0.1 })
            : toCanonicalPlanar({ ...defaultPlanarConfig(`system:${system}`), duration: 0.1 });
        if (!canonical.ok) throw new Error('fixture');
        const translated = migrateLegacyLink(
          `?workflowStep=measure&ensembleCount=7&epsilon=0.00012345678901234567&perturbationVar=iw2&perturbationPattern=${pattern}&perturbationSeed=4294967295&speed=1.7&spf=11&angleUnit=deg`,
          { queryBase: canonical.value, durationSeconds: 0.1, sourceId: 'consumer-fixture' }
        );
        if (!translated.ok || !translated.value.canonical) throw new Error(JSON.stringify(translated));
        const source = translated.value.canonical,
          settings = legacyLinkConsumerSettings(translated.value.compatibility);
        expect(settings.playback).toEqual({ speed: 1.7, stepsPerFrame: 11 });
        expect(settings.angleUnit).toBe('deg');
        expect(settings.workflow).toEqual({
          goal: 'sensitive-dependence',
          step: 'measure',
          trajectoryStage: 'ensemble'
        });
        const parsed = system === 'triple' ? fromCanonicalChain(source) : fromCanonicalPlanar(source);
        if (!parsed.ok) throw new Error('fixture');
        const native = buildPerturbedStates(
          parsed.value.initialState,
          system === 'triple' ? 6 : 4,
          7,
          7,
          system,
          settings.ensemble.spec
        ).members;
        const entries = legacyEnsembleEntries(source, settings.ensemble);
        expect(entries).toHaveLength(8);
        expect(entries[0]!.experiment).toEqual(source);
        entries.slice(1).forEach((entry, i) => {
          const config =
            system === 'triple' ? fromCanonicalChain(entry.experiment) : fromCanonicalPlanar(entry.experiment);
          if (!config.ok) throw new Error('fixture');
          expect(config.value.initialState).toEqual(Array.from(native[i]!));
          expect(entry.sourceId).toBe(`perturbed-${i + 1}`);
          expect(entry.experiment.runtime).toEqual(source.runtime);
          expect(entry.experiment.integrator).toEqual(source.integrator);
          expect(entry.experiment.seed).toEqual(source.seed);
          expect(entry.experiment.provenance).toEqual({
            createdByVersion: 'legacy-ensemble-v1',
            source: { kind: 'derived', id: `perturbed-${i + 1}` },
            parentExperimentIds: [source.provenance!.source.id]
          });
        });
        expect(() => legacyLinkConsumerSettings(structuredClone(translated.value.compatibility))).toThrow();
      });
  it('refuses repairs and out-of-family perturbations instead of inventing member states', () => {
    const source = toCanonicalPlanar(defaultPlanarConfig());
    if (!source.ok) throw new Error('fixture');
    const valid = {
      count: 3,
      spec: { variable: 'th1' as const, pattern: 'random' as const, epsilon: 0.0001, seed: 42 }
    };
    for (const count of [-1, 1.5, 81]) expect(() => legacyEnsembleEntries(source.value, { ...valid, count })).toThrow();
    for (const patch of [{ epsilon: 0 }, { epsilon: NaN }, { seed: -1 }, { seed: 2 ** 32 }, { variable: 'th3' }])
      expect(() =>
        legacyEnsembleEntries(source.value, { ...valid, spec: { ...valid.spec, ...patch } as typeof valid.spec })
      ).toThrow();
  });
});
