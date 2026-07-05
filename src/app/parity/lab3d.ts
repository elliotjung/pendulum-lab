/**
 * 3D lab orchestrator: assembles the rope / double-string / spherical /
 * spherical-chain cards into the tab and wires their analysis/export handlers.
 *
 * The implementation lives in focused sibling modules:
 *  - `lab3d-render-loop.ts`  — shared state, frame loop, timing card
 *  - `lab3d-rope-ui.ts`      — rope card (params, sim, rendering)
 *  - `lab3d-double-string-ui.ts` — double-string card
 *  - `lab3d-spherical-chain-ui.ts` — spherical pendulum + N-chain cards
 *  - `lab3d-diagnostics.ts`  — worker/Noether/spectrum/energy-shell analyses
 *  - `lab3d-exports.ts`      — CSV + snapshot exports
 *  - `lab3d-chain-config.ts` / `lab3d-timing.ts` / `lab3d-utils.ts` — pure logic
 */
import { $, append, html } from './shared';
import { buildLab3dTimingCard } from './lab3d-render-loop';
import { buildRopeCard, resetRopeSim } from './lab3d-rope-ui';
import { buildDoubleStringCard, resetDoubleStringSim } from './lab3d-double-string-ui';
import { buildChainCard, buildSphereCard, resetChainSim, resetSphereSim } from './lab3d-spherical-chain-ui';
import { buildChartComparisonCard } from './lab3d-chart-compare-ui';
import {
  analyzeChainConserved,
  analyzeChainDiagnostics,
  analyzeChainSpectrum,
  analyzeDoubleStringDiagnostics,
  runChainEnergyShell
} from './lab3d-diagnostics';
import {
  exportChainSnapshot,
  exportChainTrajectoryCsv,
  exportDoubleStringSnapshot,
  exportDoubleStringTrajectoryCsv,
  exportSphereSnapshot
} from './lab3d-exports';

// Compatibility re-exports: the 3D lab's public surface stays importable from
// this module while the implementation lives in the focused siblings above.
export { lab3d, lab3dAnyRunning, lab3dEnsureLoop, lab3dFrame, registerLab3dFrameHook } from './lab3d-render-loop';
export { lab3dRopeParams, renderRopeReadout, renderRopeSim, resetRopeSim, ropeFrameHook } from './lab3d-rope-ui';
export {
  applyDoubleStringPreset,
  doubleStringFrameHook,
  doubleStringSpec,
  lab3dDoubleStringInitialState,
  lab3dDoubleStringParams,
  renderDoubleStringReadout,
  renderDoubleStringSim,
  resetDoubleStringSim
} from './lab3d-double-string-ui';
export {
  chainFrameHook,
  chainSpec,
  lab3dChainInitialState,
  lab3dChainMethod,
  lab3dChainN,
  lab3dChainParams,
  renderChainReadout,
  renderChainSim,
  renderSphereReadout,
  renderSphereSim,
  resetChainSim,
  resetSphereSim,
  sphereFrameHook
} from './lab3d-spherical-chain-ui';
export {
  analyzeChainConserved,
  analyzeChainDiagnostics,
  analyzeChainSpectrum,
  analyzeDoubleStringDiagnostics,
  runChainEnergyShell
} from './lab3d-diagnostics';
export {
  exportChainSnapshot,
  exportChainTrajectoryCsv,
  exportDoubleStringSnapshot,
  exportDoubleStringTrajectoryCsv,
  exportSphereSnapshot
} from './lab3d-exports';
export { buildChartComparisonCard, runChartComparison } from './lab3d-chart-compare-ui';

export function installLab3dTab(): void {
  const panel = $('tab-lab3d');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1180px';
  const wrap = html('div', { className: 'research-workbench' });

  const timingCard = buildLab3dTimingCard();
  const ropeCard = buildRopeCard();
  const doubleStringCard = buildDoubleStringCard({
    analyze: () => {
      void analyzeDoubleStringDiagnostics();
    },
    exportCsv: () => exportDoubleStringTrajectoryCsv(),
    exportSnapshot: () => exportDoubleStringSnapshot()
  });
  const sphereCard = buildSphereCard({
    exportSnapshot: () => exportSphereSnapshot()
  });
  const chainCard = buildChainCard({
    analyze: () => {
      void analyzeChainDiagnostics();
    },
    analyzeSpectrum: () => {
      void analyzeChainSpectrum();
    },
    analyzeConserved: () => analyzeChainConserved(),
    analyzeEnergyShell: () => runChainEnergyShell(),
    exportCsv: () => exportChainTrajectoryCsv(),
    exportSnapshot: () => exportChainSnapshot()
  });

  const chartCompareCard = buildChartComparisonCard();

  append(wrap, timingCard, ropeCard, doubleStringCard, sphereCard, chainCard, chartCompareCard);
  left.append(wrap);
  append(layout, left);
  panel.append(layout);
  resetRopeSim();
  resetDoubleStringSim();
  resetSphereSim();
  resetChainSim();
}
