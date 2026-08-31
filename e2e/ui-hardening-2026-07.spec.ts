import { expect, test, type Page } from '@playwright/test';
import { openModernTab, openWorkspacePreferences, waitForModernShell } from './shell';

test.describe.configure({ timeout: 120_000 });

async function openResearchShell(page: Page): Promise<void> {
  // The modern shell is ready before every optional image/font/worker has
  // finished. Avoid coupling UI geometry checks to unrelated `load` work.
  await page.goto('/?audience=research', { waitUntil: 'domcontentloaded' });
  await waitForModernShell(page);
}

test('mode and language fields stay unbroken at 320, 375, 768, and 1024 CSS pixels', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await openResearchShell(page);
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: width <= 375 ? 700 : 768 });
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    const fields = page.locator('#audiencePreferenceFields');
    if (!(await fields.isVisible())) await page.locator('#audiencePreferencesToggle').click();
    await expect(fields).toBeVisible();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      const mode = rect('.audience-field-mode .custom-select-button');
      const locale = rect('.audience-field-locale .custom-select-button');
      const modeField = rect('.audience-field-mode');
      const localeField = rect('.audience-field-locale');
      const preferenceDock = rect('.rail .audience-select');
      const rail = rect('.rail');
      const mainColumn = document.querySelector<HTMLElement>('.main-col');
      const overlap = Boolean(
        mode &&
        locale &&
        mode.left < locale.right &&
        mode.right > locale.left &&
        mode.top < locale.bottom &&
        mode.bottom > locale.top
      );
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        mode: mode && { left: mode.left, right: mode.right, height: mode.height },
        locale: locale && { left: locale.left, right: locale.right, height: locale.height },
        modeField: modeField && { left: modeField.left, right: modeField.right },
        localeField: localeField && { left: localeField.left, right: localeField.right },
        preferenceDockClearance: preferenceDock ? innerHeight - preferenceDock.top : null,
        railClearance: rail ? innerHeight - rail.top : null,
        railWidth: rail?.width ?? null,
        mainColumnBottomPadding: mainColumn ? Number.parseFloat(getComputedStyle(mainColumn).paddingBottom) : null,
        overlap
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
    expect(geometry.overlap).toBe(false);
    expect(geometry.mode).not.toBeNull();
    expect(geometry.locale).not.toBeNull();
    expect(geometry.mode!.left).toBeGreaterThanOrEqual(geometry.modeField!.left - 1);
    expect(geometry.mode!.right).toBeLessThanOrEqual(geometry.modeField!.right + 1);
    expect(geometry.locale!.left).toBeGreaterThanOrEqual(geometry.localeField!.left - 1);
    expect(geometry.locale!.right).toBeLessThanOrEqual(geometry.localeField!.right + 1);
    expect(geometry.mode!.height).toBeGreaterThanOrEqual(width <= 560 ? 43.9 : 33.9);
    expect(geometry.locale!.height).toBeGreaterThanOrEqual(width <= 560 ? 43.9 : 33.9);
    if (width === 768) expect(geometry.railWidth).toBeLessThanOrEqual(60);
    if (width <= 560) {
      expect(geometry.preferenceDockClearance).not.toBeNull();
      expect(geometry.railClearance).not.toBeNull();
      expect(geometry.mainColumnBottomPadding).toBeGreaterThanOrEqual(geometry.railClearance! + 8);
    }
  }
});

test('Korean preference copy, long options, focus, and polite announcements stay synchronized', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await openResearchShell(page);

  await page.locator('#audiencePreferencesToggle').click();
  await expect(page.locator('#audiencePreferenceFields')).toBeVisible();

  const locale = page.locator('#navLocale');
  const localeButton = locale.locator('..').locator('.custom-select-button');
  await locale.focus();
  await locale.selectOption('ko');
  await expect(localeButton).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#uiPreferenceStatus')).toHaveText('메뉴 언어: 한국어');
  await expect(page.locator('#audienceMode option')).toHaveText(['초보', '학생', '연구']);
  await expect(page.locator('#colorTheme option')).toHaveText(['다크', '라이트']);
  await expect(page.locator('#audienceModeHint')).toHaveText('화면에 표시할 기능의 깊이를 조절합니다.');
  await expect(page.locator('#navLocaleHint')).toHaveText('메뉴와 핵심 조절기의 언어를 바꿉니다.');
  await expect(page.locator('#colorThemeHint')).toHaveText('작업공간의 색상 테마를 바꿉니다. 기본값은 다크입니다.');
  await expect(page.locator('#panelToggle')).toHaveAttribute('aria-label', '측면 패널 숨기기');
  await expect(page.locator('#panelToggle')).toHaveAttribute('title', '측면 패널 숨기기 (\\)');

  const mode = page.locator('#audienceMode');
  const modeButton = mode.locator('..').locator('.custom-select-button');
  await mode.focus();
  await mode.selectOption('student');
  await expect(modeButton).toBeFocused();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');
  await expect(page.locator('#uiPreferenceStatus')).toHaveText('사용자 모드: 학생');
  const clipped = await modeButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const host = element.closest('.audience-field')!.getBoundingClientRect();
    const value = element.querySelector<HTMLElement>('.custom-select-value');
    return (
      rect.left >= host.left && rect.right <= host.right && value && getComputedStyle(value).textOverflow === 'ellipsis'
    );
  });
  expect(clipped).toBe(true);

  const stableHelp = page.locator('#siHelpBackdrop');
  await expect(page.locator('#siHelpBtn')).toBeAttached();
  await page.evaluate(() => document.getElementById('siHelpBtn')?.click());
  await expect(stableHelp).toBeVisible();
  await expect(stableHelp.locator('.si-help')).toHaveAttribute('aria-label', '안정화 도움말');
  await expect(page.locator('#siHelpTitle')).toHaveText('시뮬레이션 도움말');
  await expect(page.locator('#siCloseHelp')).toHaveText('닫기');
  await page.keyboard.press('Escape');
  await expect(stableHelp).toBeHidden();
  await expect(stableHelp).toHaveAttribute('aria-hidden', 'true');
  await expect(modeButton).toBeFocused();

  await locale.selectOption('en');
  await expect(page.locator('#panelToggle')).toHaveAttribute('aria-label', 'Hide side panel');
  await expect(page.locator('#siHelpTitle')).toHaveText('Simulation Assistance');
  await locale.selectOption('ko');
  await expect(page.locator('#panelToggle')).toHaveAttribute('aria-label', '측면 패널 숨기기');
  await expect(page.locator('#siHelpTitle')).toHaveText('시뮬레이션 도움말');
});

test('outside-pointer dismissal never strands focus inside the hidden desktop preferences', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openResearchShell(page);
  const toggle = page.locator('#audiencePreferencesToggle');
  const fields = page.locator('#audiencePreferenceFields');
  await toggle.click();
  await expect(fields).toBeVisible();
  const audienceButton = page.locator('#audienceMode').locator('..').locator('.custom-select-button');
  await expect(audienceButton).toBeFocused();
  await page.locator('header h1').click();
  await expect(fields).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(audienceButton).toBeFocused();
  const panelToggle = page.locator('#panelToggle');
  await panelToggle.click();
  await expect(fields).toBeHidden();
  await expect(panelToggle).toBeFocused();
});

test('compact preferences and an update prompt stay clear of the bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openResearchShell(page);

  const toggle = page.locator('#audiencePreferencesToggle');
  const fields = page.locator('#audiencePreferenceFields');
  await expect(toggle).toBeVisible();
  await expect(fields).toBeHidden();
  await toggle.click();
  await expect(fields).toBeVisible();

  await page.evaluate(() => {
    const banner = document.createElement('aside');
    banner.className = 'pwa-update-banner';
    banner.setAttribute('role', 'region');
    const copy = document.createElement('span');
    copy.textContent = 'Update ready. Save your exact experiment before restarting.';
    const update = document.createElement('button');
    update.type = 'button';
    update.textContent = 'Save & update';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pwa-update-dismiss';
    dismiss.setAttribute('aria-label', 'Later');
    dismiss.textContent = '×';
    banner.append(copy, update, dismiss);
    document.body.append(banner);
  });

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const preferenceFields = rect('#audiencePreferenceFields');
    const preferenceToggle = rect('#audiencePreferencesToggle');
    const rail = rect('.rail');
    const updatePrompt = rect('.pwa-update-banner');
    return {
      fieldsRailOverlap: intersects(preferenceFields, rail),
      toggleRailOverlap: intersects(preferenceToggle, rail),
      promptRailOverlap: intersects(updatePrompt, rail),
      promptFieldsOverlap: intersects(updatePrompt, preferenceFields),
      promptTop: updatePrompt.top,
      fieldsBottom: preferenceFields.bottom,
      viewportHeight: innerHeight
    };
  });

  expect(geometry.fieldsRailOverlap).toBe(false);
  expect(geometry.toggleRailOverlap).toBe(false);
  expect(geometry.promptRailOverlap).toBe(false);
  expect(geometry.promptFieldsOverlap).toBe(false);
  expect(geometry.promptTop).toBeGreaterThanOrEqual(0);
  expect(geometry.fieldsBottom).toBeLessThanOrEqual(geometry.viewportHeight);
});

test('audience chooser isolates the background, supports arrow navigation, and restores focus', async ({ page }) => {
  await openResearchShell(page);
  const home = page.locator('#railHome');
  await home.focus();
  await home.click();
  const chooser = page.locator('#audienceModeChooser');
  await expect(chooser).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-audience-choice="research"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-audience-choice="beginner"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-audience-choice="research"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(chooser).toBeHidden();
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.app-shell')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(home).toBeFocused();

  await home.click();
  await chooser.click({ position: { x: 2, y: 2 } });
  await expect(chooser).toBeHidden();
  await expect(home).toBeFocused();
});

test('a palette opened over the audience chooser becomes the exposed modal and restores the chooser', async ({
  page
}) => {
  await openResearchShell(page);
  await page.locator('#railHome').click();
  const chooser = page.locator('#audienceModeChooser');
  await expect(chooser).toBeVisible();

  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  });
  const palette = page.locator('#rgv8Cmd');
  await expect(palette).toBeVisible({ timeout: 30_000 });
  await expect(palette).not.toHaveAttribute('aria-hidden', 'true');
  await expect(palette).not.toHaveAttribute('inert', '');
  await expect(chooser).toHaveAttribute('aria-hidden', 'true');
  await expect(chooser).toHaveAttribute('inert', '');
  await expect(page.locator('body')).toHaveAttribute('data-modal-depth', '2');

  await page.evaluate(() => {
    const lateButton = document.createElement('button');
    lateButton.id = 'lateModalBackgroundButton';
    lateButton.textContent = 'Late background action';
    document.body.append(lateButton);
  });
  await expect(page.locator('#lateModalBackgroundButton')).toHaveAttribute('inert', '');
  await expect(page.locator('#lateModalBackgroundButton')).toHaveAttribute('aria-hidden', 'true');

  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(chooser).toBeVisible();
  await expect(chooser).not.toHaveAttribute('aria-hidden', 'true');
  await expect(chooser).not.toHaveAttribute('inert', '');
  await expect(page.locator('body')).toHaveAttribute('data-modal-depth', '1');
  await expect(page.locator('[data-audience-choice="research"]')).toBeFocused();
  await expect(page.locator('#lateModalBackgroundButton')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(chooser).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('data-modal-depth');
  await expect(page.locator('#lateModalBackgroundButton')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#lateModalBackgroundButton')).not.toHaveAttribute('aria-hidden', 'true');
});

test('command palette handles a short visual viewport, IME, zero results, clear, Escape, and backdrop', async ({
  page
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await openResearchShell(page);
  const launcher = page.locator('.rail-palette-launcher');
  await launcher.focus();
  await page.keyboard.press('Control+K');
  const palette = page.locator('#rgv8Cmd');
  const input = page.locator('#rgv8CmdInput');
  await expect(palette).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');

  // A short visual viewport models an on-screen keyboard/orientation squeeze.
  await page.setViewportSize({ width: 375, height: 360 });
  const viewportFit = await page.locator('.rgv8-cmd-panel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewport: window.visualViewport?.height ?? innerHeight,
      cssViewport: getComputedStyle(document.documentElement).getPropertyValue('--ui-viewport-height').trim(),
      inputFont: getComputedStyle(document.getElementById('rgv8CmdInput')!).fontSize
    };
  });
  expect(viewportFit.top).toBeGreaterThanOrEqual(0);
  expect(viewportFit.bottom).toBeLessThanOrEqual(viewportFit.viewport + 1);
  expect(Number.parseFloat(viewportFit.cssViewport)).toBeCloseTo(viewportFit.viewport, 0);
  expect(Number.parseFloat(viewportFit.inputFont)).toBeGreaterThanOrEqual(16);

  const initialCount = await page.locator('#rgv8CmdList [data-command-id]').count();
  expect(initialCount).toBeGreaterThan(0);
  await page.keyboard.press('PageUp');
  await expect(page.locator('#rgv8CmdOption-0')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.locator(`#rgv8CmdOption-${initialCount - 1}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('PageDown');
  await expect(page.locator(`#rgv8CmdOption-${initialCount - 1}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#rgv8CmdOption-0')).toHaveAttribute('aria-selected', 'true');
  await input.evaluate((element) => {
    const search = element as HTMLInputElement;
    search.value = '조합중없는명령';
    search.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: '령', inputType: 'insertCompositionText', isComposing: true })
    );
  });
  await page.waitForTimeout(90);
  await expect(page.locator('#rgv8CmdList [data-command-id]')).toHaveCount(initialCount);
  await input.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await expect(page.locator('#rgv8CmdList [data-command-id]')).toHaveCount(0);
  await expect(page.locator('#rgv8CmdStatus')).toContainText('0');
  await expect(page.locator('.rgv8-cmd-empty')).toBeVisible();
  const clear = page.locator('#rgv8CmdClear');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(clear).toBeHidden();
  expect(await page.locator('#rgv8CmdList [data-command-id]').count()).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(launcher).toBeFocused();

  await page.setViewportSize({ width: 375, height: 700 });
  await page.keyboard.press('Control+K');
  await palette.click({ position: { x: 2, y: 2 } });
  await expect(palette).toBeHidden();
  await expect(launcher).toBeFocused();
});

test('typing and immediately pressing Enter executes the freshly filtered command', async ({ page }) => {
  await openResearchShell(page);
  await page.locator('.rail-palette-launcher').click();
  const input = page.locator('#rgv8CmdInput');
  await expect(input).toBeFocused();
  await input.evaluate((element) => {
    const commandInput = element as HTMLInputElement;
    commandInput.value = 'Open architecture diagnostics';
    commandInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    commandInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  await expect(page.locator('#rgv8Cmd')).toBeHidden();
  await expect(page.locator('#tab-architecture')).toBeVisible();
});

test('Ctrl+K stays with every valid contenteditable form while the user is typing', async ({ page }) => {
  await openResearchShell(page);
  await expect(page.locator('#rgv8Cmd')).toBeHidden();
  for (const value of ['', 'plaintext-only']) {
    const id = value ? 'plaintextEditor' : 'bareEditor';
    await page.evaluate(
      ({ editorId, attributeValue }) => {
        document.getElementById(editorId)?.remove();
        const editor = document.createElement('div');
        editor.id = editorId;
        editor.setAttribute('contenteditable', attributeValue);
        editor.textContent = 'editing';
        document.body.append(editor);
        editor.focus();
      },
      { editorId: id, attributeValue: value }
    );
    await expect(page.locator(`#${id}`)).toBeFocused();
    await page.keyboard.press('Control+K');
    await expect(page.locator('#rgv8Cmd')).toBeHidden();
    await expect(page.locator(`#${id}`)).toBeFocused();
  }
});

test('the deployed meta CSP permits WASM while constructable runtime styles stay inline-free', async ({ page }) => {
  await openResearchShell(page);
  const result = await page.evaluate(async () => {
    const module = await WebAssembly.compile(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]));
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(':root{--csp-runtime-style-probe:17px}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const value = getComputedStyle(document.documentElement).getPropertyValue('--csp-runtime-style-probe').trim();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
    return {
      module: module instanceof WebAssembly.Module,
      style: value,
      inlineStyleElements: document.querySelectorAll('style').length
    };
  });
  expect(result).toEqual({ module: true, style: '17px', inlineStyleElements: 0 });
});

test('strict CSP preserves validation rows and modern-lab probe geometry without cssText', async ({ page }) => {
  await page.goto('/?audience=research&modernLabProbe', { waitUntil: 'domcontentloaded' });
  await waitForModernShell(page);
  const probe = page.locator('#modern-lab-probe');
  await expect(probe).toBeVisible();
  const probeGeometry = await probe.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      width: rect.width,
      height: rect.height,
      right: getComputedStyle(element).right,
      bottom: getComputedStyle(element).bottom
    };
  });
  expect(probeGeometry).toEqual({ position: 'fixed', width: 200, height: 200, right: '8px', bottom: '8px' });

  await openModernTab(page, 'validate', '#tab-validate');
  await page.locator('#runValidation').click();
  const row = page.locator('#validateResults .validation-result-row').first();
  await expect(row).toBeVisible();
  const rowStyle = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    return { paddingTop: style.paddingTop, borderBottomWidth: style.borderBottomWidth, fontSize: style.fontSize };
  });
  expect(rowStyle).toEqual({ paddingTop: '3px', borderBottomWidth: '1px', fontSize: '10.5px' });
});

test('rail keyboard movement stays in its tablist and orientation updates immediately', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openResearchShell(page);
  const simButton = page.locator('[data-rail-section-button="sim"]');
  await simButton.focus();
  await expect(page.locator('#rail-panel-sim')).toHaveAttribute('aria-orientation', 'vertical');
  const lab = page.locator('#rail-panel-sim [data-tab="lab"]');
  await lab.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#rail-panel-sim [data-tab="compare"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(simButton).toBeFocused();
  await expect(page.locator('.rail-section.open')).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 700 });
  await expect(page.locator('#rail-panel-sim')).toHaveAttribute('aria-orientation', 'horizontal');
});

test('a coarse 768px tablet keeps the visually vertical rail orientation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const tabletPage = await context.newPage();
  await openResearchShell(tabletPage);
  expect(await tabletPage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await expect(tabletPage.locator('#rail-panel-sim')).toHaveAttribute('aria-orientation', 'vertical');
  const rail = await tabletPage.locator('.rail').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(rail.height).toBeGreaterThan(rail.width * 4);
  await context.close();
});

test('forced colors and reduced motion preserve visible state and remove decorative motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await openResearchShell(page);
  await openWorkspacePreferences(page);
  const visibleSelect = page.locator('#audienceMode').locator('..').locator('.custom-select-button');
  await visibleSelect.focus();
  await expect(visibleSelect).toBeFocused();
  const selectContract = await visibleSelect.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderStyle, outline: style.outlineStyle, forcedColorAdjust: style.forcedColorAdjust };
  });
  expect(selectContract.border).toBe('solid');
  expect(selectContract.outline).not.toBe('none');
  expect(selectContract.forcedColorAdjust).toBe('auto');

  const motionContract = await visibleSelect.evaluate((element) => {
    const button = getComputedStyle(element);
    const chevron = element.querySelector<HTMLElement>('.custom-select-chevron');
    return {
      boxShadow: button.boxShadow,
      transition: chevron ? getComputedStyle(chevron).transitionDuration : '1s'
    };
  });
  expect(motionContract.boxShadow).toBe('none');
  expect(Number.parseFloat(motionContract.transition)).toBeLessThanOrEqual(0.001);
});

test('Korean control search defers IME filtering, reports zero, and Escape clears without closing drawer', async ({
  page
}) => {
  await openResearchShell(page);
  const preferenceFields = page.locator('#audiencePreferenceFields');
  if (!(await preferenceFields.isVisible())) await page.locator('#audiencePreferencesToggle').click();
  await expect(preferenceFields).toBeVisible();
  await page.locator('#navLocale').selectOption('ko');
  await page.locator('#trustDrawerToggle').click();
  await page.locator('[data-trust-tab="performance"]').click();
  const search = page.locator('#siControlSearch');
  await expect(search).toBeVisible({ timeout: 30_000 });
  await expect(search).toHaveAttribute('placeholder', '조절기를 검색하세요');
  await expect(search).toHaveAttribute('aria-controls', 'tab-lab-controls');
  await expect(page.locator('#siControlSearchClear')).toHaveAttribute('aria-label', '조절기 검색어 지우기');

  const hiddenBefore = await page.locator('#tab-lab .controls .si-row-hidden').count();
  await search.evaluate((element) => {
    const controlSearch = element as HTMLInputElement;
    controlSearch.value = '존재하지않는조절기';
    controlSearch.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: '기', inputType: 'insertCompositionText', isComposing: true })
    );
  });
  await page.waitForTimeout(80);
  await expect(page.locator('#tab-lab .controls .si-row-hidden')).toHaveCount(hiddenBefore);
  await search.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', isComposing: true }));
  });
  await expect(search).toHaveValue('존재하지않는조절기');
  await search.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await expect(page.locator('#siSearchStatus')).toContainText(/조절기 \d+개 중 0개가 일치/);
  expect(await page.locator('#tab-lab .controls .si-row-hidden').count()).toBeGreaterThan(hiddenBefore);

  await search.focus();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.locator('#siSearchStatus')).toContainText(/조절기 \d+개를 표시/);
  await expect(page.locator('#trustDrawer')).toBeVisible();
  await expect(page.locator('#tab-lab .controls .si-row-hidden')).toHaveCount(hiddenBefore);

  await page.locator('#trustDrawer').focus();
  await page.keyboard.press('?');
  await expect(page.locator('#shortcutHelpDialog')).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(page.locator('#rgv8Cmd')).toBeHidden();
  await expect(page.locator('#shortcutHelpDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcutHelpDialog')).toBeHidden();
  await expect(page.locator('#trustDrawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#trustDrawer')).toBeHidden();
  await expect(page.locator('#trustDrawerToggle')).toBeFocused();
});

test('200 percent page scale keeps the command surface inside the visual viewport', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP page-scale regression is Chromium-specific');
  await page.setViewportSize({ width: 1024, height: 768 });
  await openResearchShell(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.locator('.rail-palette-launcher').focus();
  await page.keyboard.press('Control+K');
  const fit = await page.locator('.rgv8-cmd-panel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      scale: viewport?.scale ?? 1,
      offsetLeft: viewport?.offsetLeft ?? 0,
      offsetTop: viewport?.offsetTop ?? 0,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: viewport?.width ?? innerWidth,
      height: viewport?.height ?? innerHeight
    };
  });
  expect(fit.scale).toBeCloseTo(2, 1);
  expect(fit.left).toBeGreaterThanOrEqual(fit.offsetLeft - 1);
  expect(fit.right).toBeLessThanOrEqual(fit.offsetLeft + fit.width + 1);
  expect(fit.top).toBeGreaterThanOrEqual(fit.offsetTop - 1);
  expect(fit.bottom).toBeLessThanOrEqual(fit.offsetTop + fit.height + 1);
});
