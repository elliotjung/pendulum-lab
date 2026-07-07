/**
 * hudEffects — runtime companions for the Futuristic HUD layer
 * (css/06-futuristic-hud.css). Purely decorative; no simulation, state, or
 * worker coupling.
 *
 * What it does:
 *  - dismisses the static boot/loading overlay (#hudBoot in app.html) once the
 *    shell is up (the overlay is pointer-events:none and has a pure-CSS
 *    failsafe fade, so it can never trap the UI even if this module fails);
 *  - injects HUD corner brackets into the main canvas frames;
 *  - swaps the emoji accordion glyphs for crisp stroke-icon SVGs;
 *  - runs a low-cost ambient particle field on a fixed background canvas.
 *
 * Continuous effects (particles, the canvas scan sweep enabled via the
 * `body.hud-fx` class) are OFF under automation (`navigator.webdriver`) and
 * under prefers-reduced-motion: this repo has measured always-running
 * animations starving requestAnimationFrame — and with it the simulation
 * loop — under software compositors in headless E2E runs, so ambience is
 * reserved for real interactive sessions.
 */

const PARTICLE_COLORS = ['#1ee3ff', '#9d78ff', '#ff7a2c'] as const;
const SVG_NS = 'http://www.w3.org/2000/svg';

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const automated = (): boolean => typeof navigator !== 'undefined' && navigator.webdriver === true;

/** Continuous ambience is for real, motion-tolerant sessions only. */
const fxEnabled = (): boolean => !automated() && !reducedMotion();

/* ---------------------------------------------------------------------------
 * Boot overlay
 * ------------------------------------------------------------------------- */

function dismissBootOverlay(): void {
  const overlay = document.getElementById('hudBoot');
  if (!overlay) return;
  if (!fxEnabled()) {
    overlay.remove();
    return;
  }
  overlay.classList.add('hud-boot-done');
  // The CSS transition is .5s; remove the node shortly after so it stops
  // participating in hit-testing/paint entirely.
  window.setTimeout(() => overlay.remove(), 700);
}

/* ---------------------------------------------------------------------------
 * HUD corner brackets + scan sweep
 * ------------------------------------------------------------------------- */

function decorateFrame(host: HTMLElement, withScan: boolean): void {
  if (host.querySelector(':scope > .hud-corner')) return;
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    const bracket = document.createElement('i');
    bracket.className = `hud-corner hud-corner-${corner}`;
    bracket.setAttribute('aria-hidden', 'true');
    host.append(bracket);
  }
  if (withScan && !host.querySelector(':scope > .hud-scan')) {
    const scan = document.createElement('i');
    scan.className = 'hud-scan';
    scan.setAttribute('aria-hidden', 'true');
    host.append(scan);
  }
}

function decorateFrames(): void {
  const withScan = fxEnabled();
  document.querySelectorAll<HTMLElement>('.main-wrap').forEach((wrap) => decorateFrame(wrap, withScan));
}

/* ---------------------------------------------------------------------------
 * Premium stroke icons for the accordion glyphs
 * ------------------------------------------------------------------------- */

/** path data per glyph, drawn in a 24×24 viewBox with stroke:currentColor. */
const ICON_PATHS: Record<string, readonly string[]> = {
  '⚛': ['M12 12h.01', 'M12 5c6 0 9 3.2 9 7s-3 7-9 7-9-3.2-9-7 3-7 9-7z', 'M8.5 6.2c-3.6 4.6-3.6 7 0 11.6M15.5 6.2c3.6 4.6 3.6 7 0 11.6'],
  '⚖': ['M12 4v16M7 20h10', 'M5 8h14', 'M7 8l-2.5 5a2.6 2.6 0 0 0 5 0L7 8zM17 8l-2.5 5a2.6 2.6 0 0 0 5 0L17 8z'],
  '🎨': ['M4 6.5h10v6H4z', 'M14 9.5h3l3 3v5h-6z', 'M7 12.5v5M4 17.5h9'],
  '∫': ['M9 20c3 1.2 4-.8 4-3V7c0-2.2 1-4.2 4-3', 'M8 12h8'],
  '👥': ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5', 'M15.5 5.4a3 3 0 0 1 0 5.2M17.5 14.3c1.6.8 2.6 2.3 3 4.7'],
  '♪': ['M9 17.5V5.5l9-2v12', 'M9 17.5a2.5 2 0 1 1-5 0 2.5 2 0 0 1 5 0zM18 15.5a2.5 2 0 1 1-5 0 2.5 2 0 0 1 5 0z'],
  '⬇': ['M12 4v9M8 9.5l4 4 4-4', 'M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  '📊': ['M4 19h16', 'M6.5 16v-5M11 16V6M15.5 16V9', 'M19.5 16V12'],
  '⌨': ['M3.5 7h17a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 15.5v-7A1.5 1.5 0 0 1 3.5 7z', 'M6 10.5h.01M9.5 10.5h.01M13 10.5h.01M16.5 10.5h.01M7.5 13.5h9'],
  'λ': ['M6 19L13 5c1.2-2.4 3-2 4 0', 'M10.5 10.5L15 19'],
  '▦': ['M6 5v14M12 5v14M18 5v14', 'M5 6h14M5 12h14M5 18h14'],
  '∿': ['M3 12c2.4-6 4.8-6 7.2 0s4.8 6 7.2 0', 'M20.5 10.5l.9 1.4-1.6.5'],
  '⤳': ['M4 17c5 0 5-9 12-9', 'M13.5 6.5L17 8l-2 3'],
  '◯': ['M12 12m-7.5 0a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0'],
  '◉': ['M12 12m-7.5 0a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0', 'M12 12m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0'],
  '▓': ['M7 7.5h.01M12 6h.01M17 8.5h.01M9 12h.01M14.5 12.5h.01M7.5 16.5h.01M12.5 17.5h.01M17 16h.01'],
  '✓': ['M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', 'M8 12.5l2.6 2.6L16 9.4'],
  '◐': ['M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', 'M12 4v16', 'M12 6.5c4 1.6 4 9.4 0 11'],
  '⇌': ['M5 9h12M14 6l3 3-3 3', 'M19 15H7M10 12l-3 3 3 3'],
  '❋': ['M12 4v16M4 12h16', 'M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7'],
  '▨': ['M6 6h4.5v4.5H6zM13.5 6H18v4.5h-4.5zM6 13.5h4.5V18H6zM13.5 13.5H18V18h-4.5z'],
  '⩜': ['M3.5 15c4-5 9-5 17-1', 'M3.5 10c4.5-3.6 9.5-3.6 17 .5', 'M3.5 19.5c5-2 10-2 17 0'],
  '∑': ['M17 6.5V5H7l6 7-6 7h10v-1.5'],
  '⊶': ['M6 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', 'M18 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', 'M8.5 12h7']
};

function buildIcon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('hud-icon');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Swap emoji/text accordion glyphs for stroke icons; unknown glyphs stay. */
function upgradeAccordionIcons(): void {
  document.querySelectorAll<HTMLElement>('.acc > summary .acc-icon').forEach((slot) => {
    if (slot.querySelector('svg')) return;
    const glyph = slot.textContent?.trim() ?? '';
    const paths = ICON_PATHS[glyph];
    if (paths) slot.replaceChildren(buildIcon(paths));
  });
}

/* ---------------------------------------------------------------------------
 * Ambient particle field
 * ------------------------------------------------------------------------- */

interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  phase: number;
  twinkle: number;
  sprite: number;
}

/** Pre-rendered radial-glow sprite, so per-frame draws are plain drawImage. */
function makeSprite(color: string): HTMLCanvasElement {
  const size = 48;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.25, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return sprite;
}

function scatterParticles(width: number, height: number): Particle[] {
  const count = Math.max(20, Math.min(56, Math.round((width * height) / 34000)));
  const particles: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    // Weight the palette towards cyan; purple and orange are rarer accents.
    const roll = Math.random();
    const sprite = roll < 0.62 ? 0 : roll < 0.86 ? 1 : 2;
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.8 + Math.random() * 1.9,
      vx: (Math.random() - 0.5) * 0.16,
      vy: -0.04 - Math.random() * 0.14,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.5 + Math.random() * 1.1,
      sprite
    });
  }
  return particles;
}

function installParticleField(): void {
  if (document.getElementById('hudParticles')) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'hudParticles';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.append(canvas);

  const sprites = PARTICLE_COLORS.map(makeSprite);
  let width = 0;
  let height = 0;
  let particles: Particle[] = [];

  const resize = (): void => {
    // DPR is deliberately capped at 1: soft glows do not need retina density
    // and the smaller framebuffer keeps the field far off the perf budget.
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    particles = scatterParticles(width, height);
  };
  resize();

  let rafId = 0;
  let lastFrame = 0;
  const FRAME_MS = 33; // ~30fps is plenty for slow ambient drift.

  const frame = (now: number): void => {
    rafId = window.requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS) return;
    const dt = Math.min(3, (now - lastFrame) / FRAME_MS);
    lastFrame = now;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.x += p.vx * dt * 2;
      p.y += p.vy * dt * 2;
      p.phase += 0.02 * p.twinkle * dt;
      if (p.y < -6) { p.y = height + 6; p.x = Math.random() * width; }
      if (p.x < -6) p.x = width + 6;
      else if (p.x > width + 6) p.x = -6;
      const alpha = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(p.phase));
      const size = p.radius * 7;
      ctx.globalAlpha = alpha;
      const sprite = sprites[p.sprite];
      if (sprite) ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  };

  const start = (): void => {
    if (rafId === 0) {
      lastFrame = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  };
  const stop = (): void => {
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (fxEnabled()) start();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 180);
  });

  // If the user turns on reduced motion mid-session, retire the field.
  if (typeof window.matchMedia === 'function') {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener?.('change', (event) => {
      if (event.matches) {
        stop();
        canvas.remove();
        document.body.classList.remove('hud-fx');
      }
    });
  }

  start();
}

/* ---------------------------------------------------------------------------
 * Cursor spotlight — a soft holographic glow that trails the pointer.
 * Event-driven (no continuous rAF): pointermove schedules a single frame
 * that moves one composited element via transform.
 * ------------------------------------------------------------------------- */

function installCursorGlow(): void {
  if (document.getElementById('hudCursorGlow')) return;
  const glow = document.createElement('div');
  glow.id = 'hudCursorGlow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.append(glow);
  let pending = 0;
  let x = -400;
  let y = -400;
  document.addEventListener('pointermove', (event) => {
    x = event.clientX;
    y = event.clientY;
    if (pending) return;
    pending = window.requestAnimationFrame(() => {
      pending = 0;
      glow.style.transform = `translate3d(${x - 210}px, ${y - 210}px, 0)`;
    });
  }, { passive: true });
}

/* ---------------------------------------------------------------------------
 * Install
 * ------------------------------------------------------------------------- */

/** Install the HUD runtime companions. Idempotent; call after the shell is up. */
export function installHudEffects(): void {
  if (typeof document === 'undefined') return;
  decorateFrames();
  upgradeAccordionIcons();
  if (fxEnabled()) {
    document.body.classList.add('hud-fx');
    installParticleField();
    installCursorGlow();
  }
  dismissBootOverlay();
}
