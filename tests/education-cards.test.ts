import { describe, expect, it } from 'vitest';
import { EDUCATION_CARDS, FIRST_EXPERIMENTS } from '../src/app/educationCards';

describe('education cards', () => {
  it('covers the main chaos diagnostic tabs with experiment actions', () => {
    expect(EDUCATION_CARDS.map((card) => card.tab)).toEqual(['lyap', 'sweep', 'bifurc', 'zeroone', 'rqa', 'ftle']);
    expect(EDUCATION_CARDS.every((card) => card.body.length > 40 && card.preset.length > 0)).toBe(true);
  });

  it('offers a bilingual first-ten-minute path with distinct observation goals', () => {
    expect(FIRST_EXPERIMENTS.map((experiment) => experiment.id)).toEqual(['period', 'energy', 'chaos']);
    expect(new Set(FIRST_EXPERIMENTS.map((experiment) => experiment.preset)).size).toBe(FIRST_EXPERIMENTS.length);
    expect(
      FIRST_EXPERIMENTS.every(
        (experiment) =>
          experiment.title.en.length > 0 &&
          experiment.title.ko.length > 0 &&
          experiment.question.en.endsWith('?') &&
          experiment.question.ko.endsWith('?')
      )
    ).toBe(true);
  });
});
