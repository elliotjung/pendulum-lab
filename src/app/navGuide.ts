/**
 * navGuide — plain-language, one-line explanations for every workspace menu
 * entry, written for first-time visitors who do not know the field jargon.
 *
 * The rail submenus render these as a second description line under each
 * label (see `decorateNavigation` in audienceMode.ts), and the same text is
 * folded into each button's title/aria-label tooltip. Pure data + pure
 * helpers so the module is unit-testable in the node vitest environment.
 *
 * Style contract (pinned by tests/nav-guide.test.ts): every description is a
 * short clause, 16–60 characters, no trailing period, plain words first and
 * the technical term second (the label already carries the jargon).
 */

/** One-line description per workspace tab id (`data-tab`). */
export const NAV_TAB_GUIDE: Record<string, string> = {
  // Explore
  lab: 'Run the live simulation and adjust every control',
  compare: 'Race integrators side by side on one motion',
  // Analyze
  lyap: 'Measure how fast nearby trajectories separate',
  sweep: 'Map chaos strength across starting angles',
  bifurc: 'Watch behavior change as a parameter varies',
  phase3d: 'Explore the trajectory as a rotatable 3D shape',
  density: 'See which states the motion visits most often',
  // Chaos diagnostics
  zeroone: 'Get a yes/no chaos verdict from one signal',
  clv: 'Trace the directions chaos stretches and folds',
  basin: 'Color each start by which rod flips first',
  rqa: 'Quantify repeating patterns in the motion',
  ftle: 'Reveal hidden barriers that organize the flow',
  // Validate
  validate: 'Run the built-in accuracy and health checks',
  research: 'Fit parameters, build surrogates, add noise',
  // Governance / dynamically-registered tabs (see railNavigation.ts)
  architecture: 'Inspect how the app modules fit together',
  lab3d: 'Swing rope and spherical pendulums in 3D',
  canonical: 'Audit the Hamiltonian form of the dynamics',
  aplus: 'Review the scientific evidence and audit trail',
  docs: 'Read the method notes behind every tool',
  // Tabs reachable from other surfaces (kept for tooltip completeness)
  expansion: 'Try extended physics models and scenarios',
  matrix: 'Cross-check results from independent methods',
  golden: 'Compare runs against pinned reference data'
};

/** One-line description per rail action button (`data-rail-action`). */
export const NAV_ACTION_GUIDE: Record<string, string> = {
  floquet: 'Test orbit stability at the current drive',
  manifest: 'Download a signed manifest of this session',
  integrity: 'Verify features against the manifest',
  palette: 'Search every command by keyboard (Ctrl+K)',
  report: 'Export a full report of the current session'
};

/** Compose the tooltip text shown on hover and read by screen readers. */
export function navTipText(name: string, description: string): string {
  return name ? `${name} — ${description}` : description;
}
