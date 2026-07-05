import { mountModernLab, type LabHandle } from './LabController';
import { publishDebugApi } from '../runtime/globalApi';
import { LabApp } from './LabApp';
import { Shell } from './Shell';
import type { LabConfig } from './LabSimulation';
import type { LyapunovTab } from './LyapunovTab';
import type { ValidationTab } from './ValidationTab';
import type { SweepTab } from './SweepTab';
import type { CompareTab } from './CompareTab';
import type { BifurcationTab } from './BifurcationTab';
import type { Phase3DTab } from './Phase3DTab';
import type { DensityTab } from './DensityTab';
import type { ExpansionLabTab } from './ExpansionLabTab';
import type { ResearchMatrixTab } from './ResearchMatrixTab';
import type { GoldenCenterTab } from './GoldenCenterTab';
import type { ZeroOneTab } from './ZeroOneTab';
import type { ClvTab } from './ClvTab';
import type { BasinTab } from './BasinTab';
import type { RqaTab } from './RqaTab';
import type { FtleTab } from './FtleTab';
import type { ResearchPlusTab } from './ResearchPlusTab';
import type { ControlTab } from './ControlTab';

/**
 * Runtime bootstrap entry points for the browser app. Imported directly by
 * `src/main.ts` so the public `src/app/index.ts` barrel can keep class exports
 * without forcing every analysis tab into the initial bundle.
 */

function modernEnabled(): boolean {
  return typeof location !== 'undefined';
}

const PROBE_CONFIG: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

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

export function maybeMountModernLab(): boolean {
  if (!modernEnabled()) return false;
  const existing = (window as Window & { __modernLab?: LabApp }).__modernLab;
  if (existing) return true;
  if (!document.getElementById('main')) return false;
  const app = new LabApp();
  app.start();
  (window as Window & { __modernLab?: LabApp }).__modernLab = app;
  publishDebugApi({ modernLab: app });
  return true;
}

export function maybeMountModernShell(): boolean {
  if (!modernEnabled() || !document.querySelector('.tab[data-tab]')) return false;
  const w = window as Window & { __modernShell?: Shell };
  if (w.__modernShell) return true;
  const shell = new Shell();
  shell.install();
  w.__modernShell = shell;
  return true;
}

interface ModernTabs {
  lyapunov: LyapunovTab;
  validation: ValidationTab;
  sweep: SweepTab;
  compare: CompareTab;
  bifurcation: BifurcationTab;
  phase3d: Phase3DTab;
  density: DensityTab;
  expansion: ExpansionLabTab;
  matrix: ResearchMatrixTab;
  golden: GoldenCenterTab;
  zeroOne: ZeroOneTab;
  clv: ClvTab;
  basin: BasinTab;
  rqa: RqaTab;
  ftle: FtleTab;
  researchPlus: ResearchPlusTab;
  control: ControlTab;
}

type ModernTabsWindow = Window & {
  __modernTabs?: ModernTabs;
  __modernTabsLoading?: Promise<boolean>;
};

export function maybeMountModernAnalysisTabs(): Promise<boolean> {
  if (!modernEnabled() || !document.getElementById('lyapSpecCanvas')) return Promise.resolve(false);
  const w = window as ModernTabsWindow;
  if (w.__modernTabs) return Promise.resolve(true);
  if (w.__modernTabsLoading) return w.__modernTabsLoading;

  w.__modernTabsLoading = (async () => {
    const [
      { LyapunovTab },
      { ValidationTab },
      { SweepTab },
      { CompareTab },
      { BifurcationTab },
      { Phase3DTab },
      { DensityTab },
      { ExpansionLabTab },
      { ResearchMatrixTab },
      { GoldenCenterTab },
      { ZeroOneTab },
      { ClvTab },
      { BasinTab },
      { RqaTab },
      { FtleTab },
      { ResearchPlusTab },
      { ControlTab }
    ] = await Promise.all([
      import('./LyapunovTab'),
      import('./ValidationTab'),
      import('./SweepTab'),
      import('./CompareTab'),
      import('./BifurcationTab'),
      import('./Phase3DTab'),
      import('./DensityTab'),
      import('./ExpansionLabTab'),
      import('./ResearchMatrixTab'),
      import('./GoldenCenterTab'),
      import('./ZeroOneTab'),
      import('./ClvTab'),
      import('./BasinTab'),
      import('./RqaTab'),
      import('./FtleTab'),
      import('./ResearchPlusTab'),
      import('./ControlTab')
    ]);

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
    const control = new ControlTab();
    control.install();

    w.__modernTabs = { lyapunov, validation, sweep, compare, bifurcation, phase3d, density, expansion, matrix, golden, zeroOne, clv, basin, rqa, ftle, researchPlus, control };
    return true;
  })();

  return w.__modernTabsLoading;
}
