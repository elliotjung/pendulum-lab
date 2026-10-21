import { describe, expect, it } from 'vitest';
import { ADVANCED_DIAGNOSTIC_KINDS } from '../../../src/product/adapters/analysis/advanced/contracts';
import { defaultAdvancedSettings } from '../../../src/product/adapters/analysis/advanced/settings';
import {
  advancedAssumptions,
  advancedFieldLabels,
  advancedSettingDescription
} from '../../../src/product/lab/views/advanced-settings';

describe('S19 advanced analysis settings presented to users', () => {
  it.each(ADVANCED_DIAGNOSTIC_KINDS)('%s exposes labeled settings, defaults, bounds and scientific limits', (kind) => {
    const settings = defaultAdvancedSettings(kind);
    for (const [key, value] of Object.entries(settings)) {
      expect(advancedFieldLabels[key]).toBeTruthy();
      const text = advancedSettingDescription(kind, settings, key, 'normalized-time', 'rad');
      expect(text).toContain(`기본값 ${value}`);
      expect(text).not.toMatch(/undefined|NaN/);
      if (typeof value === 'number') expect(text).toContain('범위 ');
    }
    expect(advancedAssumptions[kind]).toMatch(/비용|O\(N²\)/);
    expect(advancedAssumptions[kind]).toMatch(/민감|의존|확인|증명|보장|인증|유한/);
  });

  it('updates dynamic resource and map bounds instead of displaying incompatible generic maxima', () => {
    expect(
      advancedSettingDescription(
        'recurrence-network',
        defaultAdvancedSettings('recurrence-network'),
        'maxSamples',
        's',
        'm'
      )
    ).toContain('범위 16–256 정수');
    expect(advancedSettingDescription('rqa', defaultAdvancedSettings('rqa'), 'maxSamples', 's', 'm')).toContain(
      '범위 16–512 정수'
    );
    expect(
      advancedSettingDescription(
        'topological-entropy',
        defaultAdvancedSettings('topological-entropy'),
        'mapParameter',
        'iteration',
        '1'
      )
    ).toContain('범위 0.001–2');
    const logistic = { ...defaultAdvancedSettings('topological-entropy'), source: 'logistic' };
    expect(advancedSettingDescription('topological-entropy', logistic, 'mapParameter', 'iteration', '1')).toContain(
      '범위 0.001–4'
    );
    expect(advancedSettingDescription('wada', defaultAdvancedSettings('wada'), 'resolution', 's', 'rad')).toContain(
      '범위 16–32 정수'
    );
  });

  it('distinguishes correlation-sum fitting, QR block durations and ridge amplitude margins', () => {
    expect(
      advancedSettingDescription(
        'correlation-dimension',
        defaultAdvancedSettings('correlation-dimension'),
        'fitLowFraction',
        's',
        'm'
      )
    ).toContain('상관합 C(r)');
    expect(advancedSettingDescription('clv', defaultAdvancedSettings('clv'), 'window', 's', 'm')).toContain(
      'renormEvery×dt'
    );
    expect(
      advancedSettingDescription('lcs-ridge', defaultAdvancedSettings('lcs-ridge'), 'margin', 's', 'rad')
    ).toContain('FTLE 차이 (s⁻¹)');
    expect(advancedAssumptions['topological-entropy']).toContain('독립 1차원');
    expect(advancedAssumptions['transfer-operator']).toContain('현재 진자 궤적의 전이 연산자가 아닙니다');
    expect(advancedAssumptions.wada).toContain('세 해상도');
    expect(advancedAssumptions.uncertainty).toContain('proxy');
  });
});
