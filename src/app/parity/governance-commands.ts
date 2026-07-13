/** Command-palette registration kept separate from governance DOM rendering. */
import { commandRegistry } from '../../runtime/CommandRegistry';
import {
  exportCapturedFiguresSvgZip,
  exportPaperFigureManifestJson,
  exportPaperFiguresHtml,
  exportPaperMethodsLatex,
  exportPaperPackJson,
  exportResearchBundleJson,
  exportResearchNotebook
} from './figure-export';
import {
  generateParameterStudy,
  rebuildComparisonMatrix,
  runStudyBatch,
  saveCurrentExperiment
} from './research-workbench';
import { runAPlusAudit, runCanonicalQa, runFloquetProbe } from './runtime-diagnostics';
import { setActiveTab } from './shared';

export interface GovernanceCommandCallbacks {
  exportManifest(filename: string): void;
  showFeaturePanel(): void;
}

/** Register the parity and research commands as idempotent upserts. */
export function registerGovernanceCommands(callbacks: GovernanceCommandCallbacks): void {
  commandRegistry.upsert({ id: 'parity.openArchitecture', label: 'Open architecture diagnostics', description: 'Open the restored architecture tab.', run: () => setActiveTab('architecture') });
  commandRegistry.upsert({ id: 'parity.openResearch', label: 'Open research contract', description: 'Open the restored research tab.', run: () => setActiveTab('research') });
  commandRegistry.upsert({ id: 'parity.runCanonicalQa', label: 'Run canonical QA', description: 'Run canonical residual and drift checks.', run: () => { runCanonicalQa(true); } });
  commandRegistry.upsert({ id: 'parity.runAudit', label: 'Run A+ audit', description: 'Run restored scientific audit checks.', run: () => { runAPlusAudit(true); } });
  commandRegistry.upsert({ id: 'parity.runFloquetProbe', label: 'Run Floquet probe', description: 'Run a period-1 driven-pendulum Floquet stability check.', run: () => runFloquetProbe(true) });
  commandRegistry.upsert({ id: 'parity.featureIntegrity', label: 'Feature integrity details', description: 'Open restored feature integrity panel.', run: callbacks.showFeaturePanel });
  commandRegistry.upsert({ id: 'parity.exportManifest', label: 'Export parity manifest', description: 'Export the modular manifest from restored tools.', run: () => callbacks.exportManifest('pendulum_parity_manifest_v10_ts.json') });
  commandRegistry.upsert({ id: 'research.saveExperiment', label: 'Save research experiment', description: 'Save the current runtime snapshot as a research experiment.', run: saveCurrentExperiment });
  commandRegistry.upsert({ id: 'research.generateParameterStudy', label: 'Generate parameter study', description: 'Create a reproducible parameter-study plan from the current state.', run: generateParameterStudy });
  commandRegistry.upsert({ id: 'research.runStudyBatch', label: 'Run study batch', description: 'Batch-execute every study point on the chaos worker (Lyapunov, RQA, FTLE).', run: () => { void runStudyBatch(); } });
  commandRegistry.upsert({ id: 'research.rebuildComparison', label: 'Rebuild comparison matrix', description: 'Rebuild the result comparison matrix from saved experiments and run logs.', run: rebuildComparisonMatrix });
  commandRegistry.upsert({ id: 'research.exportPaperPack', label: 'Export paper pack', description: 'Export methods text, manifest, run log, study plan, and comparison matrix.', run: exportPaperPackJson });
  commandRegistry.upsert({ id: 'research.exportFigures', label: 'Export figure pack', description: 'Capture every drawn analysis canvas as a captioned PNG gallery with an embedded manifest.', run: exportPaperFiguresHtml });
  commandRegistry.upsert({ id: 'research.exportCanvasSvg', label: 'Export canvas SVG pack', description: 'Export every drawn analysis canvas as a captioned, provenance-labelled SVG container in one ZIP.', run: exportCapturedFiguresSvgZip });
  commandRegistry.upsert({ id: 'research.exportFigureManifest', label: 'Export figure manifest', description: 'Export hashes, source canvas ids, PNG/SVG files, sizes, and runtime context.', run: exportPaperFigureManifestJson });
  commandRegistry.upsert({ id: 'research.exportLatex', label: 'Export LaTeX methods', description: 'Export a LaTeX methods appendix with comparison matrix and study summary.', run: exportPaperMethodsLatex });
  commandRegistry.upsert({ id: 'research.exportNotebook', label: 'Export research notebook', description: 'Export a Jupyter notebook with paper pack and parameter-study loaders.', run: exportResearchNotebook });
  commandRegistry.upsert({ id: 'research.exportBundle', label: 'Export research bundle', description: 'Export a portable JSON bundle containing methods, notebook, manifest, data, and figure payloads.', run: exportResearchBundleJson });
}
