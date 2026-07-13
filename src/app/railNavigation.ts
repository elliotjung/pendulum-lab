export interface RailTabDefinition {
  id: string;
  label: string;
  tip: string;
  icon: string;
}

export const EXTRA_RAIL_TABS = [
  { id: 'architecture', label: 'Arch', tip: 'Architecture diagnostics', icon: 'ARCH' },
  { id: 'research', label: 'Research', tip: 'Research contract', icon: 'R' },
  { id: 'lab3d', label: '3D Lab', tip: 'Rope and spherical pendulum 3D lab', icon: '3D' },
  { id: 'canonical', label: 'Canonical', tip: 'Canonical Hamiltonian QA', icon: 'dH' },
  { id: 'aplus', label: 'Audit', tip: 'Scientific audit', icon: 'A+' },
  { id: 'docs', label: 'Docs', tip: 'Method notes', icon: '?' }
] as const satisfies readonly RailTabDefinition[];

export function createRailTabButton(tab: RailTabDefinition): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'tab';
  button.title = tab.tip;
  button.setAttribute('aria-label', tab.tip);
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.dataset.tab = tab.id;
  button.dataset.tip = tab.tip;

  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = tab.icon;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = tab.label;

  button.append(icon, label);
  return button;
}
