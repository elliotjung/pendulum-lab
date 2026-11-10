import { describe, expect, it } from 'vitest';
import { SHARED_EXPERIMENT_TABS } from '../../../src/app/experimentShareTypes';
import { EXPERIMENT_RECIPES } from '../../../src/app/experimentRecipes';
import { experimentRecipeControlValues } from '../../../src/app/experimentWorkflowControls';
import { LabSimulation } from '../../../src/app/LabSimulation';
import { LEGACY_DESTINATIONS } from '../../../src/product/lab/views/legacy-navigation';
import { legacyRecipeExperiment } from '../../../src/product/lab/views/legacy-workflow';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  fromCanonicalPlanar,
  createPlanarSimulation
} from '../../../src/product/adapters/physics/planar';
import { parseProductRoute } from '../../../src/product/contracts/routes';

describe('S28 legacy navigation and native recipe adapters', () => {
  it('maps every serialized native tab intent to a concrete local destination with no invented external URL', () => {
    expect(Object.keys(LEGACY_DESTINATIONS).sort()).toEqual([...SHARED_EXPERIMENT_TABS].sort());
    for (const destination of Object.values(LEGACY_DESTINATIONS)) {
      expect(destination.label.length).toBeGreaterThan(0);
      expect(
        Boolean(
          destination.route ||
          destination.analysis ||
          destination.section ||
          destination.batch ||
          destination.action ||
          destination.tab
        )
      ).toBe(true);
      if (destination.route) expect(parseProductRoute(destination.route).ok).toBe(true);
    }
  });
  for (const recipe of EXPERIMENT_RECIPES)
    it(`${recipe.id} applies the exact native control recipe and computes the same native trajectory`, () => {
      const source = toCanonicalPlanar({ ...defaultPlanarConfig(), tolerance: 1e-9, duration: 0.04 });
      if (!source.ok) throw new Error('fixture');
      const unchanged = structuredClone(source.value),
        next = legacyRecipeExperiment(source.value, recipe.id),
        parsed = fromCanonicalPlanar(next);
      if (!parsed.ok) throw new Error('fixture');
      const controls = new Map(experimentRecipeControlValues(recipe, 'reference'));
      expect(parsed.value.initialState).toEqual(['th1', 'th2', 'iw1', 'iw2'].map((key) => controls.get(key)));
      expect(parsed.value.step).toBe(controls.get('dt'));
      expect(parsed.value.tolerance).toBe(1e-9);
      expect(source.value).toEqual(unchanged);
      const native = new LabSimulation({
        system: 'double',
        parameters: {
          m1: Number(controls.get('m1')),
          m2: Number(controls.get('m2')),
          l1: Number(controls.get('l1')),
          l2: Number(controls.get('l2')),
          g: Number(controls.get('g'))
        },
        gamma: Number(controls.get('gamma')),
        method: recipe.setup.method,
        dt: recipe.setup.dt,
        initialState: parsed.value.initialState,
        tolerance: 1e-9
      });
      const product = createPlanarSimulation(parsed.value);
      for (let i = 0; i < 3; i++) {
        native.step(1);
        product.step();
        expect(product.snapshot().state).toEqual(Array.from(native.getState()));
      }
    });
});
