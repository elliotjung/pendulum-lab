import { describe, expect, it } from 'vitest';
import {
  applyNumericControlParams,
  canonicalizeVelocityAliases,
  formatIntegratorControlRejection,
  formatNumericControlRejections,
  numericInputContract,
  parseLabIntegratorParam,
  parseNumericControlParam
} from '../src/app/deepLinkControls';
import { audienceModeUrl } from '../src/app/audienceMode';
import { tabForLandingGoal } from '../src/app/tabRouting';

describe('numeric deep-link controls', () => {
  it('accepts only a complete numeric token within range and on the declared step', () => {
    const contract = { min: -4, max: 4, step: 0.1, stepBase: -4 };
    expect(parseNumericControlParam('-2.4', contract)).toEqual({ ok: true, value: -2.4 });
    expect(parseNumericControlParam('1e-1', contract)).toEqual({ ok: true, value: 0.1 });
    expect(parseNumericControlParam('1abc', contract)).toEqual({ ok: false, reason: 'syntax' });
    expect(parseNumericControlParam(' 1', contract)).toEqual({ ok: false, reason: 'syntax' });
    expect(parseNumericControlParam('4.1', contract)).toEqual({ ok: false, reason: 'range' });
    expect(parseNumericControlParam('0.05', contract)).toEqual({ ok: false, reason: 'step' });
  });

  it('canonicalizes accepted landing w1/w2 aliases while canonical values win', () => {
    const legacy = canonicalizeVelocityAliases(
      'https://example.test/lab?tab=lab&w1=3.1&w2=-2.4',
      new Map([
        ['w1', '3.1'],
        ['w2', '-2.4']
      ])
    );
    expect(legacy).toBe('https://example.test/lab?tab=lab&iw1=3.1&iw2=-2.4');

    const mixed = canonicalizeVelocityAliases(
      'https://example.test/lab?iw1=1.2&w1=3.1&w2=oops',
      new Map([['w1', '3.1']])
    );
    expect(mixed).toBe('https://example.test/lab?iw1=1.2&w2=oops');
  });

  it('treats slider step as a UI increment so authored Landing values survive', () => {
    const input = { min: '-3.1416', max: '3.1416', step: '0.001' } as HTMLInputElement;
    expect(numericInputContract(input)).toEqual({ min: -3.1416, max: 3.1416 });
    expect(parseNumericControlParam('2.18', numericInputContract(input))).toEqual({ ok: true, value: 2.18 });

    const gravity = { min: '0', max: '20', step: '0.1' } as HTMLInputElement;
    expect(parseNumericControlParam('9.81', numericInputContract(gravity))).toEqual({ ok: true, value: 9.81 });
  });

  it('returns bounded key/value/reason diagnostics instead of silently ignoring rejected URL values', () => {
    const controls = new Map<string, HTMLInputElement>([
      ['th1', { value: '2', min: '-3.1416', max: '3.1416', step: '0.001' } as HTMLInputElement],
      ['dt', { value: '0.005', min: '0.0001', max: '0.05', step: '0.0001' } as HTMLInputElement],
      ['g', { value: '9.81', min: '0', max: '20', step: '0.1' } as HTMLInputElement]
    ]);
    const applied: Array<[string, number]> = [];
    const result = applyNumericControlParams(
      `https://example.test/app.html?th1=2.18&dt=1oops&g=${'9'.repeat(80)}`,
      { getElementById: (id) => controls.get(id) ?? null },
      (id, value) => applied.push([id, value])
    );

    expect(applied).toEqual([['th1', 2.18]]);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejected.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: 'g', reason: 'range' },
      { id: 'dt', reason: 'syntax' }
    ]);
    const message = formatNumericControlRejections(result.rejected, false);
    expect(message).toContain('g="99999999999999999999999999999…" (allowed range)');
    expect(message).toContain('dt="1oops" (number syntax)');
    expect(message.length).toBeLessThan(320);
  });
});

describe('integrator deep-link control', () => {
  it('accepts only exact ids from the Lab integrator allowlist', () => {
    expect(parseLabIntegratorParam('rk4')).toBe('rk4');
    expect(parseLabIntegratorParam('yoshida4')).toBe('yoshida4');
    expect(parseLabIntegratorParam('verlet')).toBeNull();
    expect(parseLabIntegratorParam('RK4')).toBeNull();
    expect(parseLabIntegratorParam(' rk4')).toBeNull();
    expect(parseLabIntegratorParam('eval-javascript')).toBeNull();
  });

  it('bounds the rejected value shown to the user', () => {
    const message = formatIntegratorControlRejection(`bad\u0000${'x'.repeat(80)}`, false);
    expect(message).toContain(`method="bad${String.fromCodePoint(0xfffd)}xxxxxxxxxxxxxxxxxxxxxxxxx…"`);
    expect(message.length).toBeLessThan(180);
  });
});

describe('audience URL policy', () => {
  it('canonicalizes the legacy mode hint and preserves every unrelated contract parameter', () => {
    expect(audienceModeUrl('https://example.test/lab?mode=beginner&tab=lab&lang=ko', 'student')).toBe(
      'https://example.test/lab?tab=lab&lang=ko&audience=student'
    );
    expect(audienceModeUrl('https://example.test/lab?tab=lab&audience=research', 'research')).toBeNull();
  });
});

describe('landing intent contract', () => {
  it('maps only the three documented goals to stable workspace tabs', () => {
    expect(tabForLandingGoal('https://example.test/lab?goal=explore&audience=beginner')).toBe('lab');
    expect(tabForLandingGoal('https://example.test/lab?goal=classroom&audience=student')).toBe('lyap');
    expect(tabForLandingGoal('https://example.test/lab?goal=reproduce&audience=research')).toBe('research');
    expect(tabForLandingGoal('https://example.test/lab?goal=admin')).toBeNull();
    expect(tabForLandingGoal('not a URL')).toBeNull();
  });
});
