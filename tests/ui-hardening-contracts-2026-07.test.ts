import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('2026-07 UI hardening source contracts', () => {
  it('loads hardening after themes and the interaction layer last', () => {
    const html = read('app.html');
    const instrument = html.indexOf('./css/03-instrument-workbench.css');
    const daylight = html.indexOf('./css/10-porcelain-daylight.css');
    const hardening = html.indexOf('./css/11-ui-hardening.css');
    const interaction = html.indexOf('./css/12-interaction-polish.css');
    expect(instrument).toBeGreaterThan(html.indexOf('./css/02-research-governance-v7-style.css'));
    expect(daylight).toBeGreaterThan(instrument);
    expect(hardening).toBeGreaterThan(daylight);
    expect(interaction).toBeGreaterThan(hardening);
    expect(interaction).toBeLessThan(html.indexOf('./src/main.ts'));
  });

  it('keeps the retired decorative stack out of HTML, source, and the filesystem', () => {
    const html = read('app.html');
    const main = read('src/main.ts');
    expect(html).not.toContain('id="hudBoot"');
    for (const path of [
      'css/03-liquid-glass.css',
      'css/04-premium.css',
      'css/06-futuristic-hud.css',
      'css/07-kinetic-overdrive.css',
      'css/08-refined-luxe.css',
      'src/app/hudEffects.ts',
      'src/app/kineticOverdrive.ts'
    ]) {
      expect(html).not.toContain(path);
      expect(main).not.toContain(path);
      expect(existsSync(resolve(root, path))).toBe(false);
    }
    for (const retiredRuntime of ['installHudEffects', 'installKineticOverdrive', 'hudParticles', 'hudCursorGlow']) {
      expect(main).not.toContain(retiredRuntime);
      expect(html).not.toContain(retiredRuntime);
    }

    const polish = read('src/app/UiPolish.ts');
    expect(polish).not.toContain('createElement');
    expect(polish).not.toContain('setInterval');
    expect(polish).not.toContain('getAnimations');

    for (const source of [
      'src/app/audienceModeStyles.ts',
      'src/app/onboardingTour.ts',
      'src/app/resultBadges.ts',
      'src/app/shortcutHelp.ts',
      'src/app/educationCards.ts',
      'src/app/parity/shared.ts'
    ]) {
      const cssOwner = read(source);
      expect(cssOwner).not.toContain('linear-gradient');
      expect(cssOwner).not.toContain('radial-gradient');
      expect(cssOwner).not.toContain('backdrop-filter');
    }
  });

  it('covers narrow/zoomed, coarse pointer, contrast, motion, transparency, print, and forced-color environments', () => {
    const css = read('css/11-ui-hardening.css');
    for (const contract of [
      '@media (max-width: 320px)',
      '@media (max-width: 375px)',
      '@media (max-width: 640px)',
      '@media (pointer: coarse)',
      '@media (hover: none)',
      '@media (prefers-contrast: more)',
      '@media (prefers-reduced-transparency: reduce)',
      '@media (prefers-reduced-motion: reduce)',
      '@media (forced-colors: active)',
      '@media print',
      'overflow: visible !important',
      'env(safe-area-inset-bottom)',
      '--ui-target: 44px',
      'scrollbar-gutter: stable',
      'overscroll-behavior: contain'
    ])
      expect(css).toContain(contract);
  });

  it('gives custom modals shared inert isolation, nested restoration, focus trapping, and a polite announcer', () => {
    const modal = read('src/app/modalSurface.ts');
    expect(modal).toContain('activeModals.at(-1)');
    expect(modal).toContain('child.inert = true');
    expect(modal).toContain("child.setAttribute('aria-hidden', 'true')");
    expect(modal).toContain('backgroundState.clear()');
    expect(modal).toContain('exposeActiveSurface(child)');
    expect(modal).toContain('if (top) exposeActiveSurface(top)');
    expect(modal).toContain('backgroundObserver.observe(document.body, { childList: true })');
    expect(modal).toContain("'uiPreferenceStatus'");
    expect(modal).toContain('trapModalFocus');
    expect(modal).toContain("status.setAttribute('aria-live', 'polite')");
    expect(modal).toContain("status.setAttribute('aria-atomic', 'true')");
  });

  it('wires modal activation and deactivation into every hardened custom dialog', () => {
    for (const path of [
      'src/app/audienceMode.ts',
      'src/app/resultBadges.ts',
      'src/app/parity/command-palette.ts',
      'src/app/parity/stable-help.ts'
    ]) {
      const source = read(path);
      expect(source).toContain('activateModalSurface(');
      expect(source).toContain('deactivateModalSurface(');
    }
  });

  it('models mode, locale, and theme as independently described preference fields with localized announcements', () => {
    const audience = `${read('src/app/audienceMode.ts')}\n${read('src/app/audiencePreferences.ts')}`;
    const locale = read('src/app/uiLocale.ts');
    const theme = read('src/app/themePreference.ts');
    expect(audience).toContain('audience-field audience-field-mode');
    expect(audience).toContain('audiencePreferencesToggle');
    expect(audience).toContain('audiencePreferenceFields');
    expect(audience).toContain("select.setAttribute('aria-describedby', 'audienceModeHint')");
    expect(audience).toContain('announceUiPreference');
    expect(locale).toContain('audience-field audience-field-locale');
    expect(locale).toContain("select.setAttribute('aria-describedby', 'navLocaleHint')");
    expect(locale).toContain('pendulum:ui-locale-changed');
    expect(locale).toContain('메뉴 언어: 한국어');
    expect(theme).toContain('audience-field audience-field-theme');
    expect(theme).toContain("select.setAttribute('aria-describedby', 'colorThemeHint')");
    expect(theme).toContain("return value === 'light' ? 'light' : 'dark'");
    expect(theme).toContain('화면 테마:');
  });

  it('makes the audience chooser safe at dynamic viewport sizes and in forced colors', () => {
    const css = read('src/app/audienceModeStyles.ts');
    expect(css).toContain('var(--ui-viewport-height,100dvh)');
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('min-width:44px');
    expect(css).toContain('.audience-preference-fields[hidden]');
    expect(css).toContain('@media(max-height:560px)');
    expect(css).toContain('@media(forced-colors:active)');
    expect(css).toContain('appearance:none');
    expect(css).toContain('border:2px solid ButtonText!important');
    expect(css).toContain('padding-bottom:calc(92px + env(safe-area-inset-bottom))');
    expect(css).toContain('.audience-preferences-toggle{display:grid;width:44px;height:44px}');
    expect(css).toContain('bottom:calc(var(--compact-rail-offset,77px) + 62px)');
  });

  it('defers palette and control filtering during IME composition and resumes on compositionend', () => {
    for (const path of ['src/app/parity/command-palette.ts', 'src/app/parity/control-search.ts']) {
      const source = read(path);
      expect(source).toContain('event.isComposing');
      expect(source).toContain("addEventListener('compositionend'");
    }
  });

  it('gives the palette a clear action, busy state, zero-result surface, extended keys, and visual-viewport bounds', () => {
    const palette = read('src/app/parity/command-palette.ts');
    for (const contract of [
      'rgv8CmdClear',
      "setAttribute('aria-busy', 'true')",
      'flushScheduledCommandRender(input)',
      'rgv8-cmd-empty',
      "event.key === 'PageDown'",
      '{ capture: true }',
      "document.querySelector('dialog[open]')",
      "input.setAttribute('aria-describedby', 'rgv8CmdStatus rgv8CmdHint')",
      "input?.setAttribute('aria-expanded', 'false')",
      "closest<HTMLElement>('[contenteditable]')",
      'editableRoot?.isContentEditable',
      '--ui-viewport-offset-left',
      '--ui-viewport-height',
      '@media(forced-colors:active)',
      '@media(prefers-reduced-motion:reduce)'
    ])
      expect(palette).toContain(contract);
  });

  it('keeps the late palette hardening in one adopted stylesheet because its base CSS is installed at runtime', () => {
    const palette = read('src/app/parity/command-palette.ts');
    const shared = read('src/app/parity/shared.ts');
    const hardening = read('css/11-ui-hardening.css');
    expect(shared).toContain("installStyle(\n    'rg-style'");
    expect(palette).toContain('installAdoptedStyle(PALETTE_STYLE_ID, commandPaletteHardeningCss())');
    expect(palette).toContain('.rgv8-cmd-search');
    expect(hardening).not.toContain('.rgv8-cmd-search');
  });

  it('localizes the governance search itself, including help, clear label, and result counts', () => {
    const governance = `${read('src/app/parity/governance-ui.ts')}\n${read('src/app/parity/control-search.ts')}`;
    for (const contract of [
      'CONTROL_SEARCH_COPY',
      "if (action === 'palette')",
      '시뮬레이션 조절기 검색',
      '조절기 검색어 지우기',
      '조절기를 검색하세요',
      '개가 일치합니다.',
      "search.setAttribute('aria-controls', labControls?.id ?? 'tab-lab')",
      "event.key !== 'Escape' || !search.value"
    ])
      expect(governance).toContain(contract);
  });

  it('tracks visual viewport width, height, offsets, and input modality once without guessing keyboard state', () => {
    const polish = read('src/app/UiPolish.ts');
    for (const contract of [
      '--ui-viewport-height',
      '--ui-viewport-width',
      '--ui-viewport-offset-left',
      '--ui-viewport-offset-top',
      "dataset.inputModality = 'keyboard'",
      'if (installed) return'
    ])
      expect(polish).toContain(contract);
    expect(polish).not.toContain('--ui-keyboard-inset');
    expect(polish).not.toContain('data-virtual-keyboard');
  });

  it('keeps rail arrow navigation local and synchronizes orientation immediately and after media changes', () => {
    const shell = read('src/app/Shell.ts');
    const main = read('src/main.ts');
    expect(shell).toContain("clone.closest<HTMLElement>('.rail-submenu,.rail-tab-list') ?? document");
    expect(shell).toContain('syncTablistOrientation();');
    expect(shell).toContain("window.matchMedia?.('(max-width: 560px)')");
    expect(shell).toContain("compactQuery?.addEventListener?.('change', syncTablistOrientation)");
    expect(shell).not.toContain("'(max-width: 560px), (pointer: coarse)'");
    expect(shell).toContain('export function isTextEntryShortcutTarget');
    expect(main).toContain('isTextEntryShortcutTarget(event.target)');
    expect(shell).toContain("behavior: reduceMotion ? 'auto' : 'smooth'");
    expect(shell).toContain("const korean = document.documentElement.lang === 'ko'");
    expect(shell).toContain("? '측면 패널 표시'");
    expect(shell).toContain("? '측면 패널 숨기기'");
  });

  it('does not let a hidden help dialog permanently block Trust Drawer Escape', () => {
    const drawer = read('src/app/trustDrawer.ts');
    expect(drawer).toContain('hasActiveModalSurface()');
    expect(drawer).toContain("document.querySelector('dialog[open]')");
    expect(drawer).not.toContain('querySelectorAll<HTMLElement>(\'[aria-modal="true"]\')');
  });

  it('localizes the stable-help modal and updates it when the UI locale changes', () => {
    const help = read('src/app/parity/stable-help.ts');
    expect(help).toContain('STABLE_HELP_COPY');
    expect(help).toContain('시뮬레이션 도움말');
    expect(help).toContain('안정화 도움말');
    expect(help).toContain('pendulum:ui-locale-changed');
    expect(help).toContain('localizeStableHelp(backdrop)');
  });

  it('routes unmounted research tabs to their owner without an unowned request loop', () => {
    const main = read('src/main.ts');
    const bootstrap = read('src/app/bootstrap.ts');
    expect(main).toContain('TAB_REQUESTED_EVENT');
    expect(main).toContain('void ensureResearch(tab).catch(reportResearchBootFailure)');
    expect(main).toContain('did not install its tab panel');
    expect(bootstrap).toContain('const entries = entriesForTab(tabName)');
    expect(bootstrap).toContain('if (!entries.length) return');
    expect(bootstrap).not.toContain('void mountForTab(tabName)\\n      .then(() =>');
  });

  it('keeps runtime validation and probe geometry out of CSP-blocked cssText setters', () => {
    const validation = read('src/app/ValidationTab.ts');
    const bootstrap = read('src/app/bootstrap.ts');
    const css = read('css/11-ui-hardening.css');
    expect(validation).not.toContain('style.cssText');
    expect(bootstrap).not.toContain('style.cssText');
    expect(validation).toContain("row.className = 'validation-result-row'");
    expect(bootstrap).toContain("canvas.className = 'modern-lab-probe'");
    expect(css).toContain('.validation-result-row');
    expect(css).toContain('#modern-lab-probe.modern-lab-probe');
  });
});
