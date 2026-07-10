/**
 * Feature-parity layer orchestrator.
 *
 * The single-file research/governance/audit surfaces that used to live here as
 * a 6k-line monolith are now real modules under `./parity/`:
 *
 * - `parity/shared` — shared state, DOM builders, runtime snapshot readers
 * - `parity/research-workbench` — experiments, run log, parameter/design studies
 * - `parity/storage-sync` — localStorage schema, IndexedDB mirror, workspace IO
 * - `parity/figure-export` — figures, paper packs, notebook, bundles, provenance
 * - `parity/runtime-diagnostics` — validation surfaces, probes, runtime panels
 * - `parity/lab3d` — rope / double-string / spherical-chain 3D lab
 * - `parity/governance-ui` — extra tabs, palettes, onboarding, audit badge UI
 *
 * This file only sequences installation and publishes the frozen window APIs.
 */
import { publishDebugApi, publishPublicApi } from '../runtime/globalApi';
import { ensureCompatAnchors, installStyles, setAuditRenderHook, state } from './parity/shared';
import {
  bindExtraTabClicks,
  bindRailActions,
  installArchitectureTab,
  installAPlusTab,
  installCanonicalTab,
  installCommandPalettes,
  installDocsTab,
  installExtraTabs,
  installFeatureBadge,
  installLabLeftPanels,
  installLegacyValidationIdAnchors,
  installModeSelectAnchors,
  installOnboarding,
  installResearchStatusCards,
  installStableHelp,
  installStablePanel,
  featureReport,
  registerParityCommands,
  showFeaturePanel
} from './parity/governance-ui';
import {
  cancelStudyBatch,
  generateParameterStudy,
  loadDesignStudy,
  installResearchTab,
  rebuildComparisonMatrix,
  runStudyBatch,
  saveCurrentExperiment
} from './parity/research-workbench';
import { loadResearchState } from './parity/storage-sync';
import {
  buildPaperFigureManifest,
  buildResearchBundle,
  collectPaperFigures,
  exportPaperFigureManifestJson,
  exportPaperFiguresHtml,
  exportPaperMethodsLatex,
  exportPaperPackJson,
  exportResearchBundleJson,
  exportResearchNotebook
} from './parity/figure-export';
import { installLab3dTab } from './parity/lab3d';
import {
  installErrorPanel,
  installFloatingDiag,
  installValidationExtensions,
  renderRuntimePanels,
  runAPlusAudit
} from './parity/runtime-diagnostics';

export { currentSnapshot } from './parity/shared';

let installed = false;

export function installFeatureParityLayer(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  setAuditRenderHook(renderRuntimePanels);
  installStyles();
  ensureCompatAnchors();
  loadResearchState();
  loadDesignStudy();
  registerParityCommands();
  installExtraTabs();
  installArchitectureTab();
  installResearchTab();
  installLab3dTab();
  installCanonicalTab();
  installAPlusTab();
  installDocsTab();
  installStablePanel();
  installStableHelp();
  installResearchStatusCards();
  installLabLeftPanels();
  installValidationExtensions();
  installErrorPanel();
  installCommandPalettes();
  installOnboarding();
  installFloatingDiag();
  installFeatureBadge();
  installModeSelectAnchors();
  installLegacyValidationIdAnchors();
  bindExtraTabClicks();
  bindRailActions();
  renderRuntimePanels();
  // Refresh runtime panels only while the page is visible; a hidden tab
  // shouldn't pay a 2s DOM-write heartbeat.
  window.setInterval(() => {
    if (!document.hidden) renderRuntimePanels();
  }, 2000);
  const featureIntegrity = Object.freeze({ report: featureReport, show: showFeaturePanel });
  const aPlus = Object.freeze({ runAudit: runAPlusAudit });
  const researchWorkspace = Object.freeze({
    saveCurrentExperiment,
    generateParameterStudy,
    runStudyBatch,
    cancelStudyBatch,
    rebuildComparisonMatrix,
    exportPaperPack: exportPaperPackJson,
    exportFigures: exportPaperFiguresHtml,
    exportFigureManifest: exportPaperFigureManifestJson,
    exportLatex: exportPaperMethodsLatex,
    exportNotebook: exportResearchNotebook,
    exportBundle: exportResearchBundleJson,
    collectFigures: collectPaperFigures,
    figureManifest: () => buildPaperFigureManifest(),
    bundle: () => buildResearchBundle(),
    snapshot: () => ({
      experiments: state.research.experiments,
      runLog: state.research.runLog,
      parameterStudy: state.research.parameterStudy,
      batchCheckpoint: state.research.batchCheckpoint,
      comparisonRows: state.research.comparisonRows
    })
  });
  // Research workspace is part of the supported public API; integrity/audit
  // tooling is debug-only. Old global names stay as deprecated aliases.
  publishPublicApi({ research: researchWorkspace }, { PendulumResearchWorkspace: researchWorkspace });
  publishDebugApi(
    { featureIntegrity, aPlus },
    { PendulumFeatureIntegrity: featureIntegrity, PendulumLabAPlus: aPlus }
  );
}
