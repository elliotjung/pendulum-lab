import { describe, expect, it } from 'vitest';
import { TOUR_STEPS, TOUR_STORAGE_KEY } from '../src/app/onboardingTour';

describe('onboarding tour steps', () => {
  it('walks the four core surfaces in teaching order', () => {
    expect(TOUR_STEPS.map((step) => step.target)).toEqual(['#main', '.presets', '.rail-menu', '.audience-select']);
  });

  it('provides complete bilingual copy for every step', () => {
    for (const step of TOUR_STEPS) {
      for (const locale of ['en', 'ko'] as const) {
        const copy = step[locale];
        expect(copy.title.length, `${step.target} ${locale} title`).toBeGreaterThanOrEqual(4);
        expect(copy.title.length, `${step.target} ${locale} title`).toBeLessThanOrEqual(28);
        expect(copy.body.length, `${step.target} ${locale} body`).toBeGreaterThanOrEqual(30);
        expect(copy.body.length, `${step.target} ${locale} body`).toBeLessThanOrEqual(140);
      }
    }
  });

  it('persists under the ui storage namespace', () => {
    expect(TOUR_STORAGE_KEY).toBe('pendulum-lab/ui/tour-done');
  });
});
