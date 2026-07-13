import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import energyBenchmarkReport from '../reports/energy-benchmark.json';
import { normalizeEnergyBenchmark } from '../src/app/energyBenchmarkView';
import { NAV_ACTION_LABEL_KO, NAV_TAB_GUIDE, NAV_TAB_LABEL_KO } from '../src/app/navGuide';
import { ONBOARDING_PD_MISSION, TOUR_STEPS } from '../src/app/onboardingTour';
import { APP_SHORTCUTS } from '../src/app/shortcutHelp';

describe('UX and accessibility contracts', () => {
  it('publishes a discoverable, non-conflicting keyboard shortcut guide', () => {
    expect(APP_SHORTCUTS.find((shortcut) => shortcut.keys === '?')?.ko).toContain('단축키');
    expect(new Set(APP_SHORTCUTS.map((shortcut) => shortcut.keys)).size).toBe(APP_SHORTCUTS.length);
    expect(APP_SHORTCUTS.every((shortcut) => shortcut.en.length > 8 && shortcut.ko.length > 4)).toBe(true);
  });

  it('has Korean structural labels for every guided navigation tab and action', () => {
    expect(Object.keys(NAV_TAB_LABEL_KO).sort()).toEqual(Object.keys(NAV_TAB_GUIDE).sort());
    expect(Object.keys(NAV_ACTION_LABEL_KO).sort()).toEqual(['floquet', 'integrity', 'manifest', 'palette', 'report']);
  });

  it('includes the literature-anchored A_PD measurement mission', () => {
    expect(ONBOARDING_PD_MISSION.literatureValue).toBe(1.0663);
    expect(ONBOARDING_PD_MISSION.tolerance).toBe(0.01);
    const mission = TOUR_STEPS.find((step) => step.kind === 'mission');
    expect(mission?.en.body).toContain('1.0663');
    expect(mission?.ko.body).toContain('문헌값');
  });

  it('normalizes every committed long-run energy drift curve for the Validation view', () => {
    const model = normalizeEnergyBenchmark(energyBenchmarkReport);
    expect(model.series).toHaveLength(14);
    expect(model.steps).toBe(100_000);
    expect(model.series.every((series) => series.time.length === series.drift.length && series.time.length > 100)).toBe(
      true
    );
    expect(model.series.find((series) => series.id === 'yoshida4')?.maxRelDrift).toBeGreaterThan(0);
  });

  it('loads the final light/print stylesheet and defines both structural media profiles', () => {
    const root = resolve(import.meta.dirname, '..');
    const html = readFileSync(resolve(root, 'app.html'), 'utf8');
    const css = readFileSync(resolve(root, 'css/09-accessibility-themes.css'), 'utf8');
    expect(html).toContain('./css/09-accessibility-themes.css');
    expect(css).toContain('@media (prefers-color-scheme: light)');
    expect(css).toContain('@media print');
    expect(css).toContain('color-scheme: dark light');
    expect(css).toContain('.trust-drawer');
  });
});
