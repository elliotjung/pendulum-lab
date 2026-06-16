export { LabSimulation } from './LabSimulation';
export type { LabConfig, LabSnapshot, BobPosition } from './LabSimulation';
export { LabRenderer } from './LabRenderer';
export type { LabRenderOptions } from './LabRenderer';
export { mountModernLab } from './LabController';
export type { LabHandle, MountOptions } from './LabController';
export { LabApp } from './LabApp';
export { LyapunovTab } from './LyapunovTab';
export { ValidationTab } from './ValidationTab';
export { SweepTab } from './SweepTab';
export { CompareTab } from './CompareTab';
export { BifurcationTab } from './BifurcationTab';
export { Phase3DTab } from './Phase3DTab';
export { DensityTab } from './DensityTab';
export { ExpansionLabTab } from './ExpansionLabTab';
export { ResearchMatrixTab } from './ResearchMatrixTab';
export { GoldenCenterTab } from './GoldenCenterTab';
export { ZeroOneTab } from './ZeroOneTab';
export { ClvTab } from './ClvTab';
export { BasinTab } from './BasinTab';
export { RqaTab } from './RqaTab';
export { FtleTab } from './FtleTab';
export { ResearchPlusTab } from './ResearchPlusTab';
export { Shell } from './Shell';

import { mountModernLab, type LabHandle } from './LabController';
import { publishDebugApi } from '../runtime/globalApi';
import { LabApp } from './LabApp';
import { LyapunovTab } from './LyapunovTab';
import { ValidationTab } from './ValidationTab';
import { SweepTab } from './SweepTab';
import { CompareTab } from './CompareTab';
import { BifurcationTab } from './BifurcationTab';
import { Phase3DTab } from './Phase3DTab';
import { DensityTab } from './DensityTab';
import { ExpansionLabTab } from './ExpansionLabTab';
import { ResearchMatrixTab } from './ResearchMatrixTab';
import { GoldenCenterTab } from './GoldenCenterTab';
import { ZeroOneTab } from './ZeroOneTab';
import { ClvTab } from './ClvTab';
import { BasinTab } from './BasinTab';
import { RqaTab } from './RqaTab';
import { FtleTab } from './FtleTab';
import { ResearchPlusTab } from './ResearchPlusTab';
import { Shell } from './Shell';
import type { LabConfig } from './LabSimulation';

/**
 * Whether the modern app should mount. The legacy runtime has been removed, so
 * the modern stack always mounts in a browser context (the old `?lab=legacy`
 * escape hatch is gone — honoring it would now leave a blank page).
 */
function modernEnabled(): boolean {
  return typeof location !== 'undefined';
}

/** Chaotic double-pendulum preset used by the feature-flag probe. */
const PROBE_CONFIG: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

/**
 * Stage-2 feature flag. When the page is opened with `?modernLabProbe`, mount
 * the self-contained modern Lab onto a dedicated probe canvas (it does NOT touch
 * the legacy `#main` canvas), and publish a small handle for the e2e parity test
 * to read. This proves the modern simulation+render loop works end-to-end in a
 * real browser without disturbing the legacy app.
 */
export function maybeMountModernLabProbe(): boolean {
  if (typeof location === 'undefined' || !/[?&]modernLabProbe\b/.test(location.search)) return false;
  if (document.getElementById('modern-lab-probe')) return true;

  const canvas = document.createElement('canvas');
  canvas.id = 'modern-lab-probe';
  canvas.width = 400;
  canvas.height = 400;
  canvas.setAttribute('aria-label', 'modern lab probe');
  canvas.style.cssText = 'position:fixed;right:8px;bottom:8px;width:200px;height:200px;z-index:9999;border:1px solid #2a3340;border-radius:8px';
  document.body.appendChild(canvas);

  const handle = mountModernLab(canvas, PROBE_CONFIG, { stepsPerFrame: 6, trailLength: 1200 });
  handle.start();
  (window as Window & { __modernLabProbe?: LabHandle }).__modernLabProbe = handle;
  return true;
}

/**
 * Mount the modern Lab tab (simulation + every side plot) on the real lab
 * canvases. Published on `window.__modernLab` for tooling and tests.
 */
export function maybeMountModernLab(): boolean {
  if (!modernEnabled()) return false;
  const existing = (window as Window & { __modernLab?: LabApp }).__modernLab;
  if (existing) return true;
  if (!document.getElementById('main')) return false; // only on the simulator page
  const app = new LabApp();
  app.start();
  (window as Window & { __modernLab?: LabApp }).__modernLab = app;
  // Also exposed on the structured debug namespace; `__modernLab` remains the
  // legacy test hook.
  publishDebugApi({ modernLab: app });
  return true;
}

/** Mount the modern shell: tab navigation, slider displays, presets, keyboard. */
export function maybeMountModernShell(): boolean {
  if (!modernEnabled() || !document.querySelector('.tab[data-tab]')) return false;
  const w = window as Window & { __modernShell?: Shell };
  if (w.__modernShell) return true;
  const shell = new Shell();
  shell.install();
  w.__modernShell = shell;
  return true;
}

/** Mount the modern analysis-tab controllers (Lyapunov, Validation, Sweep, …). */
export function maybeMountModernAnalysisTabs(): boolean {
  if (!modernEnabled() || !document.getElementById('lyapSpecCanvas')) return false;
  const w = window as Window & {
    __modernTabs?: {
      lyapunov: LyapunovTab; validation: ValidationTab; sweep: SweepTab;
      compare: CompareTab; bifurcation: BifurcationTab; phase3d: Phase3DTab; density: DensityTab; expansion: ExpansionLabTab; matrix: ResearchMatrixTab; golden: GoldenCenterTab;
      zeroOne: ZeroOneTab; clv: ClvTab; basin: BasinTab; rqa: RqaTab; ftle: FtleTab; researchPlus: ResearchPlusTab;
    };
  };
  if (w.__modernTabs) return true;
  const lyapunov = new LyapunovTab();
  lyapunov.install();
  const validation = new ValidationTab();
  validation.install();
  const sweep = new SweepTab();
  sweep.install();
  const compare = new CompareTab();
  compare.install();
  const bifurcation = new BifurcationTab();
  bifurcation.install();
  const phase3d = new Phase3DTab();
  phase3d.install();
  const density = new DensityTab();
  density.install();
  const expansion = new ExpansionLabTab();
  expansion.install();
  const matrix = new ResearchMatrixTab();
  matrix.install();
  const golden = new GoldenCenterTab();
  golden.install();
  // Research-grade chaos diagnostics (surfaced as their own tabs). The install
  // calls are no-ops on pages that don't carry their controls, matching the
  // other tabs' takeover pattern.
  const zeroOne = new ZeroOneTab();
  zeroOne.install();
  const clv = new ClvTab();
  clv.install();
  const basin = new BasinTab();
  basin.install();
  const rqa = new RqaTab();
  rqa.install();
  const ftle = new FtleTab();
  ftle.install();
  const researchPlus = new ResearchPlusTab();
  researchPlus.install();
  w.__modernTabs = { lyapunov, validation, sweep, compare, bifurcation, phase3d, density, expansion, matrix, golden, zeroOne, clv, basin, rqa, ftle, researchPlus };
  return true;
}
