import { describe, expect, it } from 'vitest';
import {
  NAV_ACTION_GUIDE, NAV_ACTION_GUIDE_KO, NAV_TAB_GUIDE, NAV_TAB_GUIDE_KO,
  actionGuideText, currentNavLocale, navTipText, normalizeNavLocale, setNavLocale, tabGuideText
} from '../src/app/navGuide';
import { EXTRA_RAIL_TABS } from '../src/app/railNavigation';

/** The static rail tabs declared in app.html (data-tab values). */
const STATIC_RAIL_TABS = [
  'lab', 'compare',
  'lyap', 'sweep', 'bifurc', 'phase3d', 'density',
  'zeroone', 'clv', 'basin', 'rqa', 'ftle',
  'validate', 'research'
] as const;

/** The static rail action buttons declared in app.html (data-rail-action). */
const STATIC_RAIL_ACTIONS = ['floquet', 'manifest', 'integrity', 'palette', 'report'] as const;

describe('navigation guide', () => {
  it('covers every static rail tab with a description', () => {
    for (const tab of STATIC_RAIL_TABS) {
      expect(NAV_TAB_GUIDE[tab], `missing guide for tab "${tab}"`).toBeTruthy();
    }
  });

  it('covers every dynamically-registered rail tab', () => {
    for (const tab of EXTRA_RAIL_TABS) {
      expect(NAV_TAB_GUIDE[tab.id], `missing guide for extra tab "${tab.id}"`).toBeTruthy();
    }
  });

  it('covers every rail action button', () => {
    for (const action of STATIC_RAIL_ACTIONS) {
      expect(NAV_ACTION_GUIDE[action], `missing guide for action "${action}"`).toBeTruthy();
    }
  });

  it('keeps descriptions short, plain, and unpunctuated for the two-line menu', () => {
    const all = [...Object.entries(NAV_TAB_GUIDE), ...Object.entries(NAV_ACTION_GUIDE)];
    expect(all.length).toBeGreaterThan(0);
    for (const [id, description] of all) {
      expect(description.length, `"${id}" description too short`).toBeGreaterThanOrEqual(16);
      expect(description.length, `"${id}" description too long for the menu`).toBeLessThanOrEqual(60);
      expect(description.endsWith('.'), `"${id}" description should not end with a period`).toBe(false);
      expect(description.trim(), `"${id}" description has stray whitespace`).toBe(description);
    }
  });

  it('composes tooltips as "Full name — description"', () => {
    expect(navTipText('Lyapunov Spectrum', 'Measures divergence')).toBe('Lyapunov Spectrum — Measures divergence');
    expect(navTipText('', 'Measures divergence')).toBe('Measures divergence');
  });

  it('mirrors every English key in the Korean locale (and nothing extra)', () => {
    expect(Object.keys(NAV_TAB_GUIDE_KO).sort()).toEqual(Object.keys(NAV_TAB_GUIDE).sort());
    expect(Object.keys(NAV_ACTION_GUIDE_KO).sort()).toEqual(Object.keys(NAV_ACTION_GUIDE).sort());
    const all = [...Object.entries(NAV_TAB_GUIDE_KO), ...Object.entries(NAV_ACTION_GUIDE_KO)];
    for (const [id, description] of all) {
      expect(description.length, `"${id}" ko description bounds`).toBeGreaterThanOrEqual(8);
      expect(description.length, `"${id}" ko description bounds`).toBeLessThanOrEqual(34);
      expect(description.endsWith('.'), `"${id}" ko description should not end with a period`).toBe(false);
    }
  });

  it('locale state defaults to English and serves the requested dictionary', () => {
    expect(normalizeNavLocale('ko')).toBe('ko');
    expect(normalizeNavLocale('fr')).toBe('en');
    expect(currentNavLocale()).toBe('en');
    expect(tabGuideText('lab')).toBe(NAV_TAB_GUIDE.lab);
    setNavLocale('ko');
    try {
      expect(tabGuideText('lab')).toBe(NAV_TAB_GUIDE_KO.lab);
      expect(actionGuideText('palette')).toBe(NAV_ACTION_GUIDE_KO.palette);
    } finally {
      setNavLocale('en');
    }
    expect(actionGuideText('palette')).toBe(NAV_ACTION_GUIDE.palette);
  });
});
