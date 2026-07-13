import { describe, expect, it } from 'vitest';
import { ONBOARDING_PD_MISSION, TOUR_STEPS, TOUR_STORAGE_KEY } from '../src/app/onboardingTour';

describe('onboarding tour steps', () => {
  it('walks the core surfaces and a measurement mission in teaching order', () => {
    expect(TOUR_STEPS.map((step) => step.target)).toEqual([
      '#main',
      '.presets',
      '.rail-menu',
      '[data-workflow-tab="lyap"]',
      '.audience-select'
    ]);
    expect(TOUR_STEPS.find((step) => step.kind === 'mission')?.en.body).toContain(
      String(ONBOARDING_PD_MISSION.literatureValue)
    );
  });

  it('provides complete bilingual copy for every step', () => {
    for (const step of TOUR_STEPS) {
      for (const locale of ['en', 'ko'] as const) {
        const copy = step[locale];
        expect(copy.title.length, `${step.target} ${locale} title`).toBeGreaterThanOrEqual(4);
        expect(copy.title.length, `${step.target} ${locale} title`).toBeLessThanOrEqual(28);
        expect(copy.body.length, `${step.target} ${locale} body`).toBeGreaterThanOrEqual(30);
        expect(copy.body.length, `${step.target} ${locale} body`).toBeLessThanOrEqual(190);
      }
    }
  });

  it('persists under the ui storage namespace', () => {
    expect(TOUR_STORAGE_KEY).toBe('pendulum-lab/ui/tour-done');
  });
});
