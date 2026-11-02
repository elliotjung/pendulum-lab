import { describe, expect, it } from 'vitest';
import {
  confirmObservationImport,
  parseObservationArtifact,
  previewObservationImport,
  serializeObservationArtifact
} from '../../../src/product/observations/artifact';

describe('S22 independent observation contract review', () => {
  const source = {
    name: 'sensor.csv',
    kind: 'sensor' as const,
    text: 'clock,a,b\n0,0,90\n100,,45\n200,90,0',
    mapping: { time: 'clock', theta1: 'a', theta2: 'b' }
  };

  it('preserves the actual clock when a missing row is deliberately dropped', async () => {
    const preview = await previewObservationImport({
      ...source,
      options: { timeUnit: 'ms', angleUnit: 'deg', missing: 'drop', timeOffset: 2 }
    });
    const imported = confirmObservationImport(preview);
    expect(imported.original.text).toBe(source.text);
    expect(imported.data.times).toEqual([2, 2.2]);
    expect(imported.data.angles[0]).toEqual([0, Math.PI / 2]);
    expect(imported.transform.droppedRows).toBe(1);
    expect(Object.isFrozen(imported.data.angles[0])).toBe(true);
    expect(await parseObservationArtifact(serializeObservationArtifact(imported))).toEqual(imported);
  });

  it('rejects confirmation of a fabricated preview', async () => {
    const preview = await previewObservationImport({ ...source, options: { missing: 'drop' } });
    expect(() => confirmObservationImport({ ...preview })).toThrow();
  });

  it('does not execute an input accessor', async () => {
    let accessed = false;
    const input = {
      ...source,
      get options() {
        accessed = true;
        return {};
      }
    };
    await expect(previewObservationImport(input)).rejects.toThrow();
    expect(accessed).toBe(false);
  });

  it('detects observation values changed independently of the retained raw source', async () => {
    const preview = await previewObservationImport({ ...source, options: { missing: 'drop' } });
    const value = JSON.parse(serializeObservationArtifact(confirmObservationImport(preview)));
    value.data.angles[0][0] = 100;
    await expect(parseObservationArtifact(JSON.stringify(value))).rejects.toThrow();
  });

  it('detects raw source changes even when transformed values would be numerically equal', async () => {
    const preview = await previewObservationImport({ ...source, options: { missing: 'drop' } });
    const value = JSON.parse(serializeObservationArtifact(confirmObservationImport(preview)));
    value.original.text = value.original.text.replace('0,0,90', '0,0.0,90');
    await expect(parseObservationArtifact(JSON.stringify(value))).rejects.toThrow();
  });

  it('rejects unknown fields and prototype pollution in restored artifacts', async () => {
    const preview = await previewObservationImport({ ...source, options: { missing: 'drop' } });
    const text = serializeObservationArtifact(confirmObservationImport(preview));
    const value = JSON.parse(text);
    value.data.unexpected = true;
    await expect(parseObservationArtifact(JSON.stringify(value))).rejects.toThrow();
    await expect(parseObservationArtifact(text.replace('{', '{"__proto__":{"polluted":true},'))).rejects.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not silently reorder timestamps or extrapolate missing endpoints', async () => {
    await expect(previewObservationImport({ ...source, text: 'clock,a,b\n1,0,0\n0,1,1' })).rejects.toThrow();
    await expect(
      previewObservationImport({ ...source, text: 'clock,a,b\n0,,0\n1,1,1', options: { missing: 'interpolate' } })
    ).rejects.toThrow();
  });
});
