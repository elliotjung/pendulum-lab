import { describe, expect, it } from 'vitest';
import {
  collectBilingualPairs,
  PRODUCT_LOCALE_STORAGE_KEY,
  resolveProductLocale,
  translateProductString
} from '../../../src/product/app/locale-data';

describe('S28 product locale data and honest scientific fallback', () => {
  it('uses a separate versioned preference and accepts only explicit supported locales', () => {
    expect(PRODUCT_LOCALE_STORAGE_KEY).toBe('pendulum-lab/product/locale/v1');
    expect(resolveProductLocale('en', 'ko')).toBe('en');
    expect(resolveProductLocale('ko', 'en')).toBe('ko');
    expect(resolveProductLocale('unknown', 'en')).toBe('en');
    expect(resolveProductLocale(null, 'unknown')).toBe('ko');
    expect(resolveProductLocale(undefined, undefined)).toBe('ko');
  });

  it('extracts exact loaded bilingual copy without modifying formulas, numbers or input data', () => {
    const input = {
      title: { key: 'learn.title', ko: '검증된 제목', en: 'Verified title' },
      concepts: [{ ko: '검증된 설명', en: 'Verified explanation' }],
      expression: 'ω² = g/l',
      quantity: { value: 9.81, unit: 'm/s^2' }
    };
    const before = structuredClone(input);
    const pairs = collectBilingualPairs(input);
    expect([...pairs]).toEqual([
      ['검증된 제목', 'Verified title'],
      ['검증된 설명', 'Verified explanation']
    ]);
    expect(translateProductString('검증된 설명', 'en', pairs)).toEqual({
      text: 'Verified explanation',
      language: 'en'
    });
    expect(translateProductString('ω² = g/l', 'en', pairs)).toEqual({ text: 'ω² = g/l' });
    expect(translateProductString('9.81 m/s^2', 'en', pairs)).toEqual({ text: '9.81 m/s^2' });
    expect(input).toEqual(before);
  });

  it('keeps unknown science explicit as Korean fallback and restores the exact original', () => {
    const pairs = collectBilingualPairs({ ko: '알려진 문장', en: 'Known sentence' });
    expect(translateProductString('출처를 확인할 새 과학 설명', 'en', pairs)).toEqual({
      text: '출처를 확인할 새 과학 설명',
      language: 'ko'
    });
    expect(translateProductString('알려진 문장', 'ko', pairs)).toEqual({ text: '알려진 문장', language: 'ko' });
    expect(translateProductString('실행', 'en', pairs)).toEqual({ text: 'Run', language: 'en' });
    expect(translateProductString('첫 번째 질량 · m1 (kg)', 'en', pairs)).toEqual({
      text: 'First mass · m1 (kg)',
      language: 'en'
    });
    expect(translateProductString('θ₁ 1.23456789 rad', 'ko', pairs)).toEqual({ text: 'θ₁ 1.23456789 rad' });
  });

  it('does not choose an arbitrary translation for ambiguous original copy', () => {
    const pairs = collectBilingualPairs([
      { ko: '서로 다른 의미', en: 'Meaning A' },
      { ko: '서로 다른 의미', en: 'Meaning B' }
    ]);
    expect(pairs.has('서로 다른 의미')).toBe(false);
    expect(translateProductString('서로 다른 의미', 'en', pairs).language).toBe('ko');
  });

  it('never invokes accessors and safely bounds cyclic/deep metadata', () => {
    let invoked = false;
    const input = { safe: { ko: '안전', en: 'Safe' } } as Record<string, unknown>;
    Object.defineProperty(input, 'unsafe', {
      enumerable: true,
      get() {
        invoked = true;
        throw new Error('getter');
      }
    });
    input.cycle = input;
    expect([...collectBilingualPairs(input)]).toEqual([['안전', 'Safe']]);
    expect(invoked).toBe(false);
    let deep: unknown = { ko: '너무 깊음', en: 'Too deep' };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(collectBilingualPairs(deep).size).toBe(0);
  });
});
