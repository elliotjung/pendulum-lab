/**
 * kineticOverdrive - visual-only motion layer for the lab shell.
 *
 * It decorates existing surfaces with pointer-reactive light, a compact live
 * telemetry strip, and canvas orbit overlays. It does not read or mutate
 * simulation state beyond mirroring already-rendered diagnostic text.
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const COMPACT_QUERY = '(max-width: 560px), (pointer: coarse)';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

function media(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

function urlParam(name: string): string | null {
  try {
    return new URL(window.location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

function automated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

function effectsAllowed(): boolean {
  if (urlParam('fx') === 'on') return !media(REDUCED_QUERY);
  return !automated() && !media(REDUCED_QUERY) && !media(COMPACT_QUERY);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function textOf(id: string, fallback: string): string {
  return document.getElementById(id)?.textContent?.trim() || fallback;
}

function decorateSurfaces(): void {
  document.querySelectorAll<HTMLElement>('.main-wrap, .plot-cell, .controls, .presets').forEach((node) => {
    node.classList.add('kinetic-surface');
  });

  document.querySelectorAll<HTMLElement>('.main-wrap').forEach((wrap) => {
    if (!wrap.querySelector(':scope > .kinetic-orbit-a')) {
      wrap.append(el('i', 'kinetic-orbit kinetic-orbit-a'));
      wrap.append(el('i', 'kinetic-orbit kinetic-orbit-b'));
    }
  });
}

function installField(): void {
  if (document.getElementById('kineticField')) return;
  const field = el('div', 'kinetic-field');
  field.id = 'kineticField';
  field.setAttribute('aria-hidden', 'true');
  document.body.prepend(field);
}

function buildTelemetryStrip(): HTMLElement | null {
  let strip = document.querySelector<HTMLElement>('.kinetic-strip');
  if (strip) return strip;

  const anchor = document.querySelector<HTMLElement>('.diag-row');
  if (!anchor) return null;

  strip = el('section', 'kinetic-strip');
  strip.setAttribute('aria-label', 'Live telemetry');
  const items: Array<[string, string, string]> = [
    ['Loop', 'dPhys', '0.00 ms'],
    ['Render', 'dRender', '0.00 ms'],
    ['Backend', 'dBackend', 'main'],
    ['Mode', 'modeLabel', 'running']
  ];

  for (const [label, sourceId, fallback] of items) {
    const cell = el('div', 'kinetic-channel');
    cell.dataset.sourceId = sourceId;
    const labelNode = el('span', 'kinetic-label', label);
    const valueNode = el('strong', 'kinetic-value', textOf(sourceId, fallback));
    cell.append(labelNode, valueNode);
    strip.append(cell);
  }

  anchor.insertAdjacentElement('afterend', strip);
  return strip;
}

function updateTelemetry(strip: HTMLElement): void {
  strip.querySelectorAll<HTMLElement>('.kinetic-channel').forEach((cell) => {
    const value = cell.querySelector<HTMLElement>('.kinetic-value');
    const sourceId = cell.dataset.sourceId;
    if (!value || !sourceId) return;
    const next = textOf(sourceId, value.textContent?.trim() || '--');
    if (value.textContent !== next) {
      value.textContent = next;
      value.classList.remove('kinetic-flash');
      void value.offsetWidth;
      value.classList.add('kinetic-flash');
    }
  });
}

function installPointerLight(): void {
  if (!media(FINE_POINTER_QUERY)) return;
  let pending = 0;
  let x = 0;
  let y = 0;

  document.addEventListener('pointermove', (event) => {
    x = event.clientX;
    y = event.clientY;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.kinetic-surface') : null;
    if (target) {
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      target.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    }
    if (pending) return;
    pending = window.requestAnimationFrame(() => {
      pending = 0;
      document.documentElement.style.setProperty('--ko-x', `${x}px`);
      document.documentElement.style.setProperty('--ko-y', `${y}px`);
    });
  }, { passive: true });
}

export function installKineticOverdrive(): void {
  if (typeof document === 'undefined') return;
  if (!effectsAllowed()) return;

  document.body.classList.add('kinetic-overdrive');
  installField();
  decorateSurfaces();
  installPointerLight();

  const strip = buildTelemetryStrip();
  if (!strip) return;
  updateTelemetry(strip);

  let timer = window.setInterval(() => updateTelemetry(strip), 750);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.clearInterval(timer);
      timer = 0;
    } else if (timer === 0) {
      updateTelemetry(strip);
      timer = window.setInterval(() => updateTelemetry(strip), 750);
    }
  });
}
