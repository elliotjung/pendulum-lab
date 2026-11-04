import { describe, expect, it } from 'vitest';
import { CORE_DIAGNOSTIC_KINDS } from '../../../src/product/adapters/analysis/core/contracts';
import { ADVANCED_DIAGNOSTIC_KINDS } from '../../../src/product/adapters/analysis/advanced/contracts';
import { defaultCoreSettings } from '../../../src/product/adapters/analysis/core/settings';
import { defaultAdvancedSettings } from '../../../src/product/adapters/analysis/advanced/settings';
import { readDiagnosticConfiguration } from '../../../src/product/adapters/analysis/core/source-config';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  createPlanarSimulation
} from '../../../src/product/adapters/physics/planar';
import { createCoreModel } from '../../../src/product/lab/views/core-model';
import {
  parseCoreConfig,
  serializeCoreConfig,
  loadCoreConfig,
  saveCoreConfig
} from '../../../src/product/lab/views/core-storage';
import {
  fromDiagnosticAnalysis,
  restoredDiagnostic,
  toDiagnosticAnalysis
} from '../../../src/product/lab/views/diagnostic-handoff';
import { encodeShareToken, decodeShareToken } from '../../../src/product/persistence/share';
import type { AnalysisState } from '../../../src/product/contracts/experiment';

const unwrap = <T>(value: { ok: true; value: T } | { ok: false; issues: readonly unknown[] }): T => {
  if (!value.ok) throw new Error(JSON.stringify(value.issues));
  return value.value;
};

describe('S26 canonical diagnostic handoff to the existing Lab', () => {
  it.each(CORE_DIAGNOSTIC_KINDS.filter((kind) => kind !== 'state-time' && kind !== 'phase'))(
    'preserves %s native core settings through physical restart, JSON and share',
    (kind) => {
      const settings = defaultCoreSettings(kind);
      const entry = toDiagnosticAnalysis('core', { kind, settings });
      const config = { ...defaultPlanarConfig(), duration: 0.02, step: 0.002, analyses: [entry] };
      const canonical = unwrap(toCanonicalPlanar(config));
      const physical = readDiagnosticConfiguration(canonical);
      expect(physical.family).toBe('planar');
      const parsed = parseCoreConfig(serializeCoreConfig(config), config.systemId);
      expect(parsed.analyses).toEqual([entry]);
      expect(restoredDiagnostic(canonical, 'core')).toEqual({ kind, settings });
      expect(unwrap(decodeShareToken(unwrap(encodeShareToken(canonical))))).toEqual(canonical);
      const model = createCoreModel(parsed);
      const native = createPlanarSimulation(config);
      model.step();
      native.step();
      expect(model.state.sample).toEqual(native.snapshot());
      expect(model.state.config.analyses).toEqual([entry]);
      model.dispose();
    }
  );

  it.each(['state-time', 'phase'] as const)('does not invent a catalog ID for the %s display projection', (kind) => {
    expect(() => toDiagnosticAnalysis('core', { kind, settings: defaultCoreSettings(kind) })).toThrow(/카탈로그/);
  });

  it.each(ADVANCED_DIAGNOSTIC_KINDS)('decodes %s native advanced settings without defaults or unit loss', (kind) => {
    const settings = defaultAdvancedSettings(kind);
    const entry = toDiagnosticAnalysis('advanced', { kind, settings });
    const canonical = unwrap(toCanonicalPlanar({ ...defaultPlanarConfig(), analyses: [entry] }));
    expect(fromDiagnosticAnalysis(entry, 'advanced')).toEqual({ kind, settings });
    expect(restoredDiagnostic(canonical, 'advanced')).toEqual({ kind, settings });
    expect(restoredDiagnostic(canonical, 'core')).toBeUndefined();
  });

  it('preserves primary NAFF and secondary FFT plus string options, exact edited values and storage', () => {
    const naff = toDiagnosticAnalysis('core', {
      kind: 'naff',
      settings: { ...defaultCoreSettings('naff'), terms: 2, refineIterations: 64 }
    });
    const fft = toDiagnosticAnalysis('core', {
      kind: 'fft',
      settings: { ...defaultCoreSettings('fft'), window: 'none', transient: 0.5 }
    });
    const config = { ...defaultPlanarConfig(), analyses: [naff, fft] };
    const data = new Map<string, string>();
    saveCoreConfig(
      {
        setItem: (key, value) => {
          data.set(key, value);
        }
      },
      config
    );
    const loaded = loadCoreConfig({ getItem: (key) => data.get(key) ?? null }, config.systemId)!;
    const canonical = unwrap(toCanonicalPlanar(loaded));
    expect(canonical.analyses).toEqual([naff, fft]);
    expect(restoredDiagnostic(canonical, 'core')?.kind).toBe('naff');
    expect(restoredDiagnostic(canonical, 'core', 'fft')?.settings).toEqual({
      coordinate: 0,
      transient: 0.5,
      window: 'none'
    });
  });

  it('does not interpret legacy or future analysis versions as native diagnostic settings', () => {
    const entry = toDiagnosticAnalysis('core', { kind: 'lyapunov', settings: defaultCoreSettings('lyapunov') });
    const canonical = unwrap(
      toCanonicalPlanar({ ...defaultPlanarConfig(), analyses: [{ ...entry, algorithmVersion: 'planar-analysis-v1' }] })
    );
    expect(restoredDiagnostic(canonical, 'core')).toBeUndefined();
    expect(() => fromDiagnosticAnalysis({ ...entry, algorithmVersion: 'core-diagnostics-v2' }, 'core')).toThrow(/버전/);
  });

  it('preserves the physical units of velocity sections, angle grids and FTLE ridge margins', () => {
    const settings = { ...defaultCoreSettings('poincare'), coordinate: 2, sectionValue: 0.25 };
    const section = toDiagnosticAnalysis('core', { kind: 'poincare', settings });
    expect(section.settings.sectionValue?.unit).toBe('rad/s');
    expect(fromDiagnosticAnalysis(section, 'core')).toEqual({ kind: 'poincare', settings });
    const ridge = toDiagnosticAnalysis('advanced', {
      kind: 'lcs-ridge',
      settings: defaultAdvancedSettings('lcs-ridge')
    });
    expect(ridge.settings.rangeLow?.unit).toBe('rad');
    expect(ridge.settings.rangeHigh?.unit).toBe('rad');
    expect(ridge.settings.margin?.unit).toBe('s^-1');
    expect(ridge.settings.duration?.unit).toBe('s');
  });

  it.each(['unit', 'vector', 'missing', 'duplicate', 'kind', 'option', 'unknown', 'range'])(
    'rejects a changed %s instead of silently resetting a received analysis',
    (mutation) => {
      const entry = structuredClone(
        toDiagnosticAnalysis('core', { kind: 'poincare', settings: defaultCoreSettings('poincare') })
      ) as {
        id: AnalysisState['id'];
        algorithmVersion: string;
        settings: Record<string, unknown>;
        options: Record<string, unknown>;
      };
      if (mutation === 'unit') entry.settings.duration = { kind: 'scalar', value: 10, unit: '1' };
      if (mutation === 'vector') entry.settings.duration = { kind: 'vector', values: [10], unit: 's' };
      if (mutation === 'missing') delete entry.settings.coordinate;
      if (mutation === 'duplicate') entry.options.duration = '10';
      if (mutation === 'kind') entry.options.kind = 'rqa';
      if (mutation === 'option') entry.options.direction = true;
      if (mutation === 'unknown') entry.options.extra = 'none';
      if (mutation === 'range') entry.settings.maxPoints = { kind: 'scalar', value: 999999, unit: '1' };
      expect(() => fromDiagnosticAnalysis(entry as unknown as AnalysisState, 'core')).toThrow();
    }
  );

  it('does not execute an accessor in an untrusted analysis', () => {
    let reads = 0;
    const entry = Object.defineProperty({}, 'algorithmVersion', {
      enumerable: true,
      get() {
        reads++;
        return 'core-diagnostics-v1';
      }
    });
    expect(() => fromDiagnosticAnalysis(entry as AnalysisState, 'core')).toThrow();
    expect(reads).toBe(0);
  });
});
