/**
 * Functional input polish shared by every visual theme.
 *
 * Range progress is exposed as `--sp`, visual viewport dimensions keep modal
 * geometry honest on mobile, and input modality follows actual interaction.
 * No decorative DOM is created here.
 */

function syncRange(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min || '0');
  const max = Number.parseFloat(input.max || '100');
  const value = Number.parseFloat(input.value || '0');
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(value)) return;

  const progress = `${Math.min(100, Math.max(0, ((value - min) / span) * 100)).toFixed(2)}%`;
  if (input.style.getPropertyValue('--sp') !== progress) input.style.setProperty('--sp', progress);
}

function syncAllRanges(): void {
  document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(syncRange);
}

let resyncQueued = false;
function queueResync(): void {
  if (resyncQueued) return;
  resyncQueued = true;
  requestAnimationFrame(() => {
    resyncQueued = false;
    syncAllRanges();
  });
}

function syncVisualViewport(): void {
  const viewport = window.visualViewport;
  const height = Math.max(1, viewport?.height ?? window.innerHeight);
  const width = Math.max(1, viewport?.width ?? window.innerWidth);
  const root = document.documentElement;
  root.style.setProperty('--ui-viewport-height', `${height.toFixed(2)}px`);
  root.style.setProperty('--ui-viewport-width', `${width.toFixed(2)}px`);
  root.style.setProperty('--ui-viewport-offset-left', `${(viewport?.offsetLeft ?? 0).toFixed(2)}px`);
  root.style.setProperty('--ui-viewport-offset-top', `${(viewport?.offsetTop ?? 0).toFixed(2)}px`);
}

let installed = false;

export function installUiPolish(): void {
  if (installed) return;
  installed = true;
  syncAllRanges();
  syncVisualViewport();

  window.addEventListener('resize', syncVisualViewport, { passive: true });
  window.addEventListener('orientationchange', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab' || event.key.startsWith('Arrow'))
        document.documentElement.dataset.inputModality = 'keyboard';
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      document.documentElement.dataset.inputModality = event.pointerType === 'touch' ? 'touch' : 'pointer';
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'input',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
    },
    true
  );

  // Presets and restored sessions update range values programmatically.
  document.addEventListener('click', queueResync, true);

  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
    },
    true
  );
}
