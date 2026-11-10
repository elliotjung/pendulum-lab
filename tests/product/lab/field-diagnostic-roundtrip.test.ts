import { describe, expect, it } from 'vitest';
import {
  defaultFieldDiagnosticSettings,
  evaluateFieldDiagnostic,
  serializeFieldDiagnosticArtifact
} from '../../../src/product/lab/views/field-diagnostics';

describe('S28 independent field diagnostic persistence', () => {
  it('diatomic: complete exported settings, units and native scientific rows reconstruct exactly through JSON', () => {
    const settings = { ...defaultFieldDiagnosticSettings('diatomic'), massA: 1.3, massB: 2.7, samples: 12 };
    const original = evaluateFieldDiagnostic('diatomic', settings);
    const json = serializeFieldDiagnosticArtifact(original);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe('pendulum-field-diagnostic/v1');
    expect(parsed.algorithmVersion).toBe('field-diagnostic-native-v1');
    expect(parsed.scope).toBe('independent-native-diagnostic');
    expect(parsed.diagnostic).toBe('diatomic');
    expect(parsed.settings).toEqual(settings);
    expect(parsed.settingsUnits).toEqual({
      massA: 'kg',
      massB: 'kg',
      forceConstant: 'N/m',
      latticeConstant: 'm',
      onsiteOmegaSq: 's⁻²',
      samples: '개'
    });
    expect(parsed.source).toBe(original.source);
    expect(parsed.columns).toEqual(original.columns);
    expect(parsed.rows).toEqual(original.rows);
    expect(parsed.summary).toEqual(original.summary);
    // This existing contract exports an independent result and has no separate
    // UI importer. Reconstruct with the actual public native evaluator.
    const reconstructed = evaluateFieldDiagnostic(parsed.diagnostic, parsed.settings);
    expect(reconstructed).toEqual(original);
    expect(serializeFieldDiagnosticArtifact(reconstructed)).toBe(json);
  });
});
