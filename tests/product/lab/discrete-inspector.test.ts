import { describe, expect, it } from 'vitest';
import { defaultDiscreteConfig } from '../../../src/product/adapters/physics/discrete';
import { applyDiscreteDraft } from '../../../src/product/lab/views/discrete-inspector';
const values = (config: ReturnType<typeof defaultDiscreteConfig>) => ({
  ...config.parameters,
  gridSize: config.gridSize,
  iterations: config.iterations,
  sampleEvery: config.sampleEvery
});
describe('S17 atomic complex and matrix drafts', () => {
  it('applies complex coefficients and keeps the origin without normalizing imaginary input', () => {
    const current = { ...defaultDiscreteConfig('system:quantum-kicked-rotor'), startIteration: 20 },
      before = structuredClone(current),
      wavefunction = { re: [1, 0.5, 0, 0], im: [0, 0.5, 0, 0] };
    const applied = applyDiscreteDraft(
      current,
      { ...values(current), gridSize: 4, iterations: 30, hbar: 2 },
      '[]',
      JSON.stringify(wavefunction),
      '{}'
    );
    expect(applied.wavefunction).toEqual(wavefunction);
    expect(applied.parameters.hbar).toBe(2);
    expect(applied.startIteration).toBe(20);
    expect(current).toEqual(before);
  });
  it('applies the real and imaginary matrix as written while allowing an honest nonunitary diagnostic', () => {
    const current = defaultDiscreteConfig('system:unitary-floquet'),
      matrix = {
        re: [
          [1, 0],
          [0, 0]
        ],
        im: [
          [0, 0],
          [0, -2]
        ]
      };
    const applied = applyDiscreteDraft(
      current,
      { ...values(current), gridSize: 2 },
      '[]',
      '{}',
      JSON.stringify(matrix)
    );
    expect(applied.matrix).toEqual(matrix);
    expect(current.gridSize).toBe(4);
  });
  it('rejects malformed duplicate-key and dimension drafts without replacing the applied object', () => {
    const current = defaultDiscreteConfig('system:quantum-kicked-rotor'),
      before = structuredClone(current);
    for (const text of ['{broken', '{"re":[1],"re":[0],"im":[0]}', '{"re":[1,0],"im":[0]}', '{"re":[0,0],"im":[0,0]}'])
      expect(() => applyDiscreteDraft(current, values(current), '[]', text, '{}')).toThrow();
    expect(() =>
      applyDiscreteDraft(current, { ...values(current), gridSize: 7 }, '[]', JSON.stringify(current.wavefunction), '{}')
    ).toThrow();
    expect(() =>
      applyDiscreteDraft(
        defaultDiscreteConfig(),
        { ...values(defaultDiscreteConfig()), iterations: 1.5 },
        '[1,0]',
        '{}',
        '{}'
      )
    ).toThrow();
    expect(current).toEqual(before);
  });
});
