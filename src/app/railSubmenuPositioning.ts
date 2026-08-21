/**
 * Layout helpers for the desktop rail flyouts.
 *
 * The CSS owns the flyout's horizontal placement; this module only measures
 * the active trigger and supplies the vertical anchor custom properties. That
 * keeps a submenu visually connected to the button that opened it when the
 * viewport, browser chrome, or page zoom changes.
 */

export function compactRail(): boolean {
  // Match the actual horizontal-bottom-rail CSS breakpoint. Pointer precision
  // does not change the layout: a 768px touch tablet still has a vertical rail.
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 560px)').matches;
}

/** Keep a desktop flyout visually attached to the button that opened it. */
export function positionRailSubmenu(section: HTMLElement): void {
  const submenu = section.querySelector<HTMLElement>('.rail-submenu');
  const button = section.querySelector<HTMLElement>('.rail-menu-button');
  if (!submenu || !button) return;
  if (compactRail()) {
    submenu.style.removeProperty('--rail-submenu-top');
    submenu.style.removeProperty('--rail-submenu-anchor');
    return;
  }

  requestAnimationFrame(() => {
    if (!section.classList.contains('open')) return;
    const buttonRect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportBottom = viewportTop + viewportHeight;
    const availableHeight = Math.max(120, viewportHeight - 20);
    const menuHeight = Math.min(submenu.scrollHeight, availableHeight);
    const top = Math.min(
      Math.max(viewportTop + 10, buttonRect.top),
      Math.max(viewportTop + 10, viewportBottom - menuHeight - 10)
    );
    const anchor = Math.min(Math.max(18, buttonRect.top + buttonRect.height / 2 - top), Math.max(18, menuHeight - 18));
    submenu.style.setProperty('--rail-submenu-top', `${top.toFixed(1)}px`);
    submenu.style.setProperty('--rail-submenu-anchor', `${anchor.toFixed(1)}px`);
  });
}
