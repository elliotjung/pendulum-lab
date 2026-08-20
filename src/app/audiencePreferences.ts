interface AudienceOptionMeta {
  label: string;
  description: string;
}

/** Build the responsive mode-preference flyout without coupling it to mode policy. */
export function installAudiencePreferenceControl(
  rail: Element,
  modes: Readonly<Record<string, AudienceOptionMeta>>,
  onModeChange: (value: string) => void
): HTMLSelectElement {
  const wrap = document.createElement('div');
  wrap.className = 'audience-select';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Workspace preferences');

  const preferenceToggle = document.createElement('button');
  preferenceToggle.id = 'audiencePreferencesToggle';
  preferenceToggle.className = 'audience-preferences-toggle';
  preferenceToggle.type = 'button';
  preferenceToggle.textContent = 'Aa';
  preferenceToggle.setAttribute('aria-label', 'Open workspace preferences');
  preferenceToggle.setAttribute('aria-controls', 'audiencePreferenceFields');
  preferenceToggle.setAttribute('aria-expanded', 'false');
  preferenceToggle.title = 'Mode and language';

  const preferenceFields = document.createElement('div');
  preferenceFields.id = 'audiencePreferenceFields';
  preferenceFields.className = 'audience-preference-fields';
  preferenceFields.hidden = true;
  preferenceFields.setAttribute('aria-label', 'Mode and language preferences');

  const field = document.createElement('div');
  field.className = 'audience-field audience-field-mode';
  const label = document.createElement('label');
  label.className = 'audience-field-label';
  label.htmlFor = 'audienceMode';
  label.textContent = 'Mode';

  const select = document.createElement('select');
  select.id = 'audienceMode';
  select.name = 'audience-mode';
  select.autocomplete = 'off';
  select.setAttribute('aria-label', 'Audience mode');
  select.setAttribute('aria-describedby', 'audienceModeHint');
  for (const [value, meta] of Object.entries(modes)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = meta.label;
    option.title = meta.description;
    select.append(option);
  }
  select.addEventListener('change', () => onModeChange(select.value));

  const hint = document.createElement('span');
  hint.id = 'audienceModeHint';
  hint.className = 'v10-sr';
  hint.textContent = 'Controls how much interface detail is visible.';
  field.append(label, select, hint);
  preferenceFields.append(field);
  wrap.append(preferenceToggle, preferenceFields);
  rail.append(wrap);

  let preferencesOpen = false;
  const compactPreferences = window.matchMedia('(max-width: 560px)');
  const syncPreferencePanel = (): void => {
    preferenceFields.hidden = !preferencesOpen;
    preferenceFields.setAttribute('role', compactPreferences.matches ? 'dialog' : 'group');
    wrap.classList.toggle('is-open', preferencesOpen);
    preferenceToggle.hidden = false;
    preferenceToggle.setAttribute('aria-expanded', String(preferencesOpen));
  };
  preferenceToggle.addEventListener('click', () => {
    preferencesOpen = !preferencesOpen;
    syncPreferencePanel();
    if (preferencesOpen) queueMicrotask(() => select.focus());
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !preferencesOpen) return;
    event.preventDefault();
    preferencesOpen = false;
    syncPreferencePanel();
    preferenceToggle.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!preferencesOpen || wrap.contains(event.target as Node) || preferenceFields.contains(event.target as Node))
      return;
    const restoreFocus = document.activeElement instanceof Element && wrap.contains(document.activeElement);
    const externalFocusable =
      event.target instanceof Element
        ? event.target.closest(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])'
          )
        : null;
    preferencesOpen = false;
    syncPreferencePanel();
    // Keep keyboard focus out of the newly hidden subtree. If the pointer is
    // activating another focusable control, its native default action can
    // still move focus there after this pointerdown handler.
    if (restoreFocus) {
      window.setTimeout(() => {
        if (!externalFocusable) preferenceToggle.focus({ preventScroll: true });
      }, 0);
    }
  });
  compactPreferences.addEventListener?.('change', () => {
    preferencesOpen = false;
    syncPreferencePanel();
  });
  syncPreferencePanel();
  return select;
}
