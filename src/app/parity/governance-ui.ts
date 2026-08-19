/**
 * Public compatibility barrel for governance surfaces.
 *
 * Command palette, mode controls, manifest/audit panels, and static tab
 * construction are deliberately isolated so they can evolve independently.
 * Rail palette behavior (if (action === 'palette')) lives in governance-tabs.
 */
export { hideCommandPalette, installCommandPalettes, renderCommandList, showCommandPalette } from './command-palette';
export { bulletList, figCard, metric, paragraph, selectRow } from './governance-elements';
export { installStableHelp, showStableHelp } from './stable-help';
export { filterControls } from './control-search';

export * from './governance-tabs';
export * from './governance-panels';
export * from './governance-audit';
export * from './governance-modes';
