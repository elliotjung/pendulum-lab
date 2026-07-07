import { describe, expect, it } from 'vitest';
import { EDUCATION_CARDS } from '../src/app/educationCards';

describe('education cards', () => {
  it('covers the main chaos diagnostic tabs with experiment actions', () => {
    expect(EDUCATION_CARDS.map((card) => card.tab)).toEqual(['lyap', 'sweep', 'bifurc', 'zeroone', 'rqa', 'ftle']);
    expect(EDUCATION_CARDS.every((card) => card.body.length > 40 && card.preset.length > 0)).toBe(true);
  });
});
