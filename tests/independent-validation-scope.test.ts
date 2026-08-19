import { describe, expect, it } from 'vitest';
import { buildIndependentValidationScope } from '../scripts/independent-validation-scope';

describe('independent validation scope', () => {
  it('distinguishes internal TypeScript, two independent runtimes, and unavailable optional MATLAB', () => {
    const report = buildIndependentValidationScope({
      reference: { referenceMethod: 'gbs', summary: { integrators: 2, passed: 2 } },
      referenceSha256: 'a'.repeat(64),
      scipy: { cases: [{ pass: true, scipyMethod: 'DOP853' }] },
      scipySha256: 'b'.repeat(64),
      julia: { status: 'pass', solverReference: 'Vern9', rows: [{ t: 0 }] },
      juliaSha256: 'c'.repeat(64)
    });

    expect(report.status).toBe('pass');
    expect(report.summary.independentPassed).toBe(2);
    expect(report.runtimes.find((item) => item.id === 'internal-typescript')).toMatchObject({
      independentFromTypeScript: false,
      status: 'pass'
    });
    expect(report.runtimes.find((item) => item.id === 'matlab')).toMatchObject({
      availability: 'unavailable',
      status: 'not-run',
      requiredForRelease: false,
      evidencePath: null
    });
  });

  it('fails when only one independent runtime has passing evidence', () => {
    const report = buildIndependentValidationScope({
      reference: { summary: { integrators: 1, passed: 1 } },
      referenceSha256: 'a'.repeat(64),
      scipy: { cases: [{ pass: true }] },
      scipySha256: 'b'.repeat(64),
      julia: { status: 'fail', rows: [] },
      juliaSha256: 'c'.repeat(64)
    });

    expect(report.status).toBe('fail');
    expect(report.summary.independentPassed).toBe(1);
  });
});
