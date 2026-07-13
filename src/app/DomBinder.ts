/**
 * DomBinder — the single typed gateway between app controllers and the page
 * DOM. Tabs and the Lab app read controls, write status text, and take over
 * legacy elements exclusively through this layer, so:
 *
 * - control IDs live in one place per controller instead of ad-hoc
 *   `document.getElementById` calls sprinkled through the logic;
 * - controllers can be pointed at a different root (a fixture fragment in
 *   tests, a future shadow root) without touching their logic;
 * - "take over" semantics (cloning a node to drop legacy listeners) are
 *   consistent everywhere.
 */

export type ControlRoot = Document | HTMLElement;

export class DomBinder {
  constructor(private readonly root: ControlRoot = document) {}

  /** Typed element lookup. */
  el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    const found =
      this.root instanceof Document ? this.root.getElementById(id) : this.root.querySelector(`#${CSS.escape(id)}`);
    return (found as T | null) ?? null;
  }

  /** Numeric control value with fallback (NaN-safe). */
  num(id: string, fallback: number): number {
    const el = this.el<HTMLInputElement>(id);
    const v = el ? Number.parseFloat(el.value) : Number.NaN;
    return Number.isFinite(v) ? v : fallback;
  }

  /** String control value with fallback. */
  str(id: string, fallback: string): string {
    const el = this.el<HTMLInputElement | HTMLSelectElement>(id);
    return el ? el.value : fallback;
  }

  /** Checkbox state with fallback. */
  bool(id: string, fallback = false): boolean {
    const el = this.el<HTMLInputElement>(id);
    return el ? el.checked : fallback;
  }

  /** Write text content if the element exists. */
  setText(id: string, text: string): void {
    const el = this.el(id);
    if (el) el.textContent = text;
  }

  /** Set a control's value without dispatching events. */
  setValue(id: string, value: string | number): void {
    const el = this.el<HTMLInputElement | HTMLSelectElement>(id);
    if (el) el.value = String(value);
  }

  /** A canvas plus its 2D context, or null when absent. */
  canvas2d(
    id: string
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } | null {
    const canvas = this.el<HTMLCanvasElement>(id);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    return { canvas, ctx, width: canvas.width, height: canvas.height };
  }

  /**
   * Replace an element with a clone, dropping every previously-attached
   * listener, so the caller owns it exclusively.
   */
  takeOver(id: string): HTMLElement | null {
    const el = this.el(id);
    if (!el) return null;
    const clone = el.cloneNode(true) as HTMLElement;
    el.replaceWith(clone);
    return clone;
  }

  /** Bind a click handler, optionally taking the element over first. */
  onClick(
    id: string,
    handler: (el: HTMLElement, event: MouseEvent) => void,
    options: { takeOver?: boolean } = {}
  ): HTMLElement | null {
    const el = options.takeOver ? this.takeOver(id) : this.el(id);
    el?.addEventListener('click', (event) => handler(el, event as MouseEvent));
    return el;
  }

  /** Bind a change handler, optionally taking the element over first. */
  onChange(
    id: string,
    handler: (el: HTMLElement, event: Event) => void,
    options: { takeOver?: boolean } = {}
  ): HTMLElement | null {
    const el = options.takeOver ? this.takeOver(id) : this.el(id);
    el?.addEventListener('change', (event) => handler(el, event));
    return el;
  }

  /** Bind an input handler, optionally taking the element over first. */
  onInput(
    id: string,
    handler: (el: HTMLElement, event: Event) => void,
    options: { takeOver?: boolean } = {}
  ): HTMLElement | null {
    const el = options.takeOver ? this.takeOver(id) : this.el(id);
    el?.addEventListener('input', (event) => handler(el, event));
    return el;
  }

  /** Whether the given tab panel is the active one. */
  tabActive(panelId: string): boolean {
    return this.el(panelId)?.classList.contains('active') ?? true;
  }

  /** All elements matching a selector under the root. */
  all<T extends Element = HTMLElement>(selector: string): T[] {
    return Array.from(this.root.querySelectorAll<Element>(selector)) as T[];
  }
}

/** The default binder over the live page document. */
export const pageDom = new DomBinder();
