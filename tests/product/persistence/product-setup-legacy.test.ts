import { describe, expect, it } from 'vitest';
import type { RuntimeSnapshot } from '../../../src/types/domain';
import { runJson } from '../../../src/app/labExport';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import {
  previewLegacyMigration,
  exportLegacyMigrationBackup,
  type LegacyMigrationPreview
} from '../../../src/product/persistence/legacy-migration';
import { productSetupFromLegacyPreview } from '../../../src/product/persistence/product-setup-legacy';
import { decodeProductSetupToken } from '../../../src/product/persistence/product-setup-codec';
import { createProductSetupRoute, resolveProductRoute } from '../../../src/product/persistence/share-route';
import type { ProductSetupControlsV1 } from '../../../src/product/persistence/product-setup';

const controls: ProductSetupControlsV1 = {
  angleUnit: 'deg',
  playback: { mode: 'demo', timingMode: 'deterministic', speed: 1.7, stepsPerFrame: 6 },
  render: {
    trailMode: 'ice',
    trailLength: 2500,
    phaseAxis: 'both',
    qualityMode: 'cinematic',
    glow: true,
    longExposure: false,
    interpolate: true,
    autoQuality: false
  },
  ensemble: { count: 3, spec: { variable: 'iw2', pattern: 'symmetric', epsilon: 0.00012345678901234567, seed: 42 } },
  workflow: { goal: 'sensitive-dependence', step: 'measure', trajectoryStage: 'ensemble' }
};
function session(mode: RuntimeSnapshot['mode'] = 'research', stepsPerFrame = 11): RuntimeSnapshot {
  return {
    schemaVersion: 'pendulum-session/v11-ts',
    systemType: 'double',
    method: 'gauss2',
    mode,
    dt: 0.002,
    tolerance: 1e-9,
    stepsPerFrame,
    damping: 0.04,
    parameters: { m1: 1.3, m2: 0.7, l1: 0.8, l2: 1.1, g: 9.7 },
    state: [9 * Math.PI, -8 * Math.PI, 0.125, -0.0625],
    simTime: 3.5,
    seed: -9007199254740991,
    hash: 'original-private-hash-not-public-metadata'
  };
}
function adopted(raw: string) {
  const preview = previewLegacyMigration(raw, { durationSeconds: 0.02 });
  expect(preview.status).toBe('ready');
  const result = productSetupFromLegacyPreview(preview, preview.id, controls);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return { preview, setup: result.value };
}
describe('S28 explicit session mode/SPF adoption into a public full setup', () => {
  it.each(['double', 'triple', 'compound-double'] as const)(
    'preserves the supported historical %s schema/model without guessing execution metadata',
    (system) => {
      const source: RuntimeSnapshot = {
        ...session('education', 13),
        systemType: system,
        schemaVersion: system === 'compound-double' ? 'pendulum-session/v11-ts' : 'pendulum-session/v10-ts',
        ...(system === 'triple'
          ? {
              parameters: { ...session().parameters, m3: 0.6, l3: 0.7 },
              state: [9 * Math.PI, -8 * Math.PI, 0.15, 0.125, -0.0625, 0.02]
            }
          : {})
      };
      const { setup } = adopted(JSON.stringify(source));
      expect(setup.experiment.systemId).toBe(`system:${system}`);
      expect(setup.controls.playback).toEqual({ ...controls.playback, mode: 'education', stepsPerFrame: 13 });
    }
  );
  it.each(['demo', 'education', 'research', 'benchmark', 'performance', 'recovery'] as const)(
    'adopts exact original %s mode/SPF and keeps other controls explicit',
    (mode) => {
      const source = session(mode),
        raw = `\ufeff ${JSON.stringify(source, null, 2).replaceAll('\n', '\r\n')}\r\n`,
        before = structuredClone(controls);
      const { setup, preview } = adopted(raw);
      expect(setup.experiment).toEqual(preview.canonical);
      expect(setup.controls).toEqual({ ...controls, playback: { ...controls.playback, mode, stepsPerFrame: 11 } });
      expect(setup.experiment.integrator).toEqual(preview.canonical?.integrator);
      expect(setup.experiment.seed?.value).toBe('-9007199254740991');
      expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
      const route = createProductSetupRoute(setup);
      if (!route.ok) throw new Error('route');
      const restored = resolveProductRoute(route.value);
      expect(restored.ok && restored.value.setup).toEqual(setup);
      const token = route.value.split('state=')[1]!;
      const decoded = decodeProductSetupToken(token);
      expect(decoded.ok && decoded.value).toEqual(setup);
      expect(JSON.stringify(setup)).not.toContain(source.hash);
      expect(JSON.stringify(setup)).not.toContain('sourceText');
      expect(controls).toEqual(before);
    }
  );
  it('reads mode/SPF from the real runJson runtimeSnapshot while retaining prior results only in the original backup', () => {
    const source = session('benchmark', 60);
    const run = runJson(
      {
        system: 'double',
        method: 'gauss2',
        dt: source.dt,
        gamma: source.damping,
        parameters: source.parameters,
        initialState: [0.1, 0.2, 0, 0],
        tolerance: source.tolerance
      },
      source.state,
      source.simTime,
      12,
      0.001,
      { mode: source.mode, stepsPerFrame: source.stepsPerFrame, seed: source.seed, hash: source.hash, locale: 'ko' }
    );
    const raw = JSON.stringify(run),
      { preview, setup } = adopted(raw);
    expect(preview.sourceKind).toBe('modern-run');
    expect(setup.controls.playback).toEqual({ ...controls.playback, mode: 'benchmark', stepsPerFrame: 60 });
    expect(setup.experiment.initialConditions.theta1).toEqual({ kind: 'scalar', value: source.state[0], unit: 'rad' });
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
    expect(setup).not.toHaveProperty('energy');
    expect(setup).not.toHaveProperty('runtimeSnapshot');
  });
  it('requires issued matching confirmation and does not read forged preview accessors', () => {
    const preview = previewLegacyMigration(JSON.stringify(session()), { durationSeconds: 0.02 });
    expect(productSetupFromLegacyPreview(preview, 'other-id', controls).ok).toBe(false);
    expect(productSetupFromLegacyPreview(structuredClone(preview), preview.id, controls).ok).toBe(false);
    let calls = 0;
    const forged = Object.defineProperty({}, 'sourceKind', {
      get() {
        calls++;
        throw new Error('forbidden');
      }
    });
    expect(productSetupFromLegacyPreview(forged as LegacyMigrationPreview, preview.id, controls).ok).toBe(false);
    expect(calls).toBe(0);
  });
  it('does not evaluate accessors in chosen controls during explicit adoption', () => {
    const preview = previewLegacyMigration(JSON.stringify(session()), { durationSeconds: 0.02 });
    let calls = 0;
    const input = Object.defineProperty({ ...controls }, 'playback', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('forbidden');
      }
    });
    expect(productSetupFromLegacyPreview(preview, preview.id, input).ok).toBe(false);
    expect(calls).toBe(0);
  });
  it('does not overwrite or repair invalid current controls or unsupported source SPF', () => {
    const preview = previewLegacyMigration(JSON.stringify(session()), { durationSeconds: 0.02 });
    expect(
      productSetupFromLegacyPreview(preview, preview.id, { ...controls, playback: { ...controls.playback, speed: 10 } })
        .ok
    ).toBe(false);
    const oversized = previewLegacyMigration(JSON.stringify(session('research', 10000)), { durationSeconds: 0.02 });
    expect(oversized.status).toBe('ready');
    expect(productSetupFromLegacyPreview(oversized, oversized.id, controls)).toMatchObject({
      ok: false,
      issues: [{ path: '$.controls.playback' }]
    });
    expect(exportLegacyMigrationBackup(oversized).text).toBe(JSON.stringify(session('research', 10000)));
  });
  it('keeps link compatibility handoff and corrupted source recovery outside the session adoption helper', () => {
    const canonical = toCanonicalPlanar(defaultPlanarConfig());
    if (!canonical.ok) throw new Error('fixture');
    const linked = previewLegacyMigration('?th1=0.125', { durationSeconds: 0.02, queryBase: canonical.value });
    expect(productSetupFromLegacyPreview(linked, linked.id, controls).ok).toBe(false);
    const broken = previewLegacyMigration('{broken', { durationSeconds: 0.02 });
    expect(productSetupFromLegacyPreview(broken, broken.id, controls).ok).toBe(false);
  });
});
