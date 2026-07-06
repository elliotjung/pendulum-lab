import { createRailTabButton, EXTRA_RAIL_TABS } from '../railNavigation';
import { $, html, setActiveTab } from './shared';

export function installExtraTabs(): void {
  const nav = document.querySelector('.tabs');
  const main = document.querySelector('.main-col');
  const target = document.getElementById('rail-govern-tabs') ?? document.getElementById('rail-panel-govern') ?? nav;
  if (!target || !main) return;
  for (const tab of EXTRA_RAIL_TABS) {
    if (!document.querySelector(`.tab[data-tab="${tab.id}"]`)) {
      target.append(createRailTabButton(tab));
    }
    if (!$(`tab-${tab.id}`)) {
      const panel = html('div', { id: `tab-${tab.id}`, className: 'tabpanel', role: 'tabpanel' });
      main.append(panel);
    }
  }
}

export function bindExtraTabClicks(): void {
  for (const tab of EXTRA_RAIL_TABS) {
    document.querySelectorAll<HTMLElement>(`.tab[data-tab="${tab.id}"]`).forEach((btn) => {
      if (btn.dataset.parityBound === 'true') return;
      btn.dataset.parityBound = 'true';
      btn.addEventListener('click', () => setActiveTab(tab.id));
    });
  }
}
