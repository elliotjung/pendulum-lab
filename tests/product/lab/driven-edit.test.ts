import { describe, expect, it } from 'vitest';
import { DRIVEN_SYSTEM_IDS, defaultDrivenConfig } from '../../../src/product/adapters/physics/driven';
import { applyDrivenDraft } from '../../../src/product/lab/views/driven-inspector';
describe('S13 atomic plant forcing and controller editing', () => {
  it.each(DRIVEN_SYSTEM_IDS)('%s applies one complete SI draft without aliasing', (id) => {
    const config = defaultDrivenConfig(id),
      values: Record<string, number> = { ...config.parameters, step: 0.004, duration: 1, sampleEvery: 7 };
    for (const [key, value] of Object.entries({ ...config.forcing, ...config.controller }))
      if (typeof value === 'number') values[key] = value;
    config.initialState.forEach((v, i) => (values[`state-${i}`] = v));
    if (config.forcing) {
      values.frequency = 1.25;
      values.phase = -0.65;
    }
    const before = structuredClone(config),
      next = applyDrivenDraft(config, values, 'triangle', false, 'integrator:rk2');
    expect(next.integratorId).toBe('integrator:rk2');
    expect(next.step).toBe(0.004);
    expect(next.sampleEvery).toBe(7);
    expect(config).toEqual(before);
    expect(next.parameters).not.toBe(config.parameters);
    if (config.forcing)
      expect(next.forcing).toEqual({
        waveform: 'triangle',
        amplitude: config.forcing.amplitude,
        frequency: 1.25,
        phase: -0.65
      });
  });
  it('rejects invalid gain and unsafe controlled angle without replacing original', () => {
    const config = defaultDrivenConfig('system:inverted'),
      before = structuredClone(config),
      values: Record<string, number> = {
        ...config.parameters,
        kp: config.controller!.kp,
        kd: config.controller!.kd,
        kx: 0,
        kv: 0,
        reference: config.controller!.reference,
        maxOutput: config.controller!.maxOutput,
        step: config.step,
        duration: config.duration,
        sampleEvery: 1,
        'state-0': 0.1,
        'state-1': 0
      };
    values.kp = -1;
    expect(() => applyDrivenDraft(config, values, 'sine', true, config.integratorId)).toThrow();
    values.kp = 20;
    values['state-0'] = 2;
    expect(() => applyDrivenDraft(config, values, 'sine', true, config.integratorId)).toThrow();
    expect(config).toEqual(before);
  });
  it('lets an imported passive compatible state explicitly add a controller through an atomic draft', () => {
    const template = defaultDrivenConfig('system:inverted');
    const { controller, ...config } = template;
    const values: Record<string, number> = {
      ...config.parameters,
      kp: controller!.kp,
      kd: controller!.kd,
      reference: 0,
      maxOutput: 10,
      step: config.step,
      duration: config.duration,
      sampleEvery: 1,
      'state-0': 0.1,
      'state-1': 0
    };
    const before = structuredClone(config);
    const next = applyDrivenDraft(config, values, 'sine', true, config.integratorId);
    expect(next.controller).toMatchObject({
      enabled: true,
      kp: controller!.kp,
      kd: controller!.kd,
      kx: 0,
      kv: 0,
      maxOutput: 10
    });
    expect(config).toEqual(before);
    expect('controller' in config).toBe(false);
  });
});
