/** Focused publication-export responsibility extracted from figure-export.ts. */
/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { $ } from './shared';
import { downloadJson } from '../../export/manifest';

import { collectEnvironment, ProvenanceBuilder, type ProvenanceGraph } from '../../research/provenance';

import { clear, currentSnapshot, html, state } from './shared';
import { RESEARCH_STORAGE_SCHEMA_VERSION } from './storage-sync';
import { logResearchRun, renderResearchTable, renderResearchWorkbench, studyPlanHash } from './research-workbench';

import { collectPaperFigures } from './paper-figure-capture';
import { RESEARCH_APP_VERSION, RESEARCH_BUNDLE_ZIP_SCHEMA } from './figure-export';

export function buildResearchProvenance(figures = collectPaperFigures()): ProvenanceGraph {
  const snapshot = currentSnapshot();
  const builder = new ProvenanceBuilder(collectEnvironment(RESEARCH_APP_VERSION));
  const snapshotNodeId = `snapshot:${snapshot.hash}`;
  builder.addNode({
    id: snapshotNodeId,
    kind: 'snapshot',
    label: `Runtime snapshot (${snapshot.systemType}, ${snapshot.method}, dt=${snapshot.dt})`,
    content: snapshot,
    schemaVersion: 'pendulum-snapshot/v2',
    sourceCommand: 'workbench:currentSnapshot',
    metadata: { system: snapshot.systemType, method: snapshot.method, dt: snapshot.dt, damping: snapshot.damping }
  });
  for (const experiment of state.research.experiments) {
    const parentId = `snapshot:${experiment.snapshot.hash}`;
    if (!builder.has(parentId)) {
      builder.addNode({
        id: parentId,
        kind: 'snapshot',
        label: `Saved snapshot ${experiment.snapshot.hash}`,
        content: experiment.snapshot,
        schemaVersion: 'pendulum-snapshot/v2',
        sourceCommand: 'workbench:saveExperiment',
        generatedAt: experiment.createdAt
      });
    }
    builder.addNode({
      id: `experiment:${experiment.id}`,
      kind: 'experiment',
      label: experiment.name,
      content: experiment,
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      parentIds: [parentId],
      sourceCommand: 'workbench:saveExperiment',
      generatedAt: experiment.createdAt,
      metadata: { qualityScore: experiment.metrics.qualityScore, tags: experiment.tags.join('|') }
    });
  }
  const study = state.research.parameterStudy;
  if (study) {
    const studyNodeId = `study:${study.id}`;
    builder.addNode({
      id: studyNodeId,
      kind: 'study',
      label: `Parameter study ${study.variable} (${study.strategy}, ${study.count} points)`,
      content: { id: study.id, hash: studyPlanHash(study) },
      schemaVersion: 'pendulum-parameter-study/v1',
      parentIds: [snapshotNodeId],
      sourceCommand: 'workbench:generateParameterStudy',
      generatedAt: study.generatedAt,
      metadata: {
        variable: study.variable,
        strategy: study.strategy,
        points: study.count,
        planHash: studyPlanHash(study)
      }
    });
    const checkpoint = state.research.batchCheckpoint;
    if (checkpoint && checkpoint.planId === study.id) {
      builder.addNode({
        id: `worker-job:${checkpoint.id}`,
        kind: 'worker-job',
        label: `Study batch (${checkpoint.status}, ${checkpoint.completed}/${checkpoint.total})`,
        content: checkpoint,
        schemaVersion: 'pendulum-batch-checkpoint/v1',
        parentIds: [studyNodeId],
        sourceCommand: 'workbench:runStudyBatch',
        generatedAt: checkpoint.startedAt,
        metadata: { status: checkpoint.status, timeoutMs: checkpoint.timeoutMs, planHash: checkpoint.planHash }
      });
      const completed = study.experiments.filter((point) => point.results);
      if (completed.length > 0) {
        builder.addNode({
          id: `result:${study.id}`,
          kind: 'result',
          label: `Study results (${completed.length}/${study.experiments.length} points)`,
          content: completed.map((point) => [point.id, point.results]),
          schemaVersion: 'pendulum-parameter-study-results/v1',
          parentIds: [`worker-job:${checkpoint.id}`],
          sourceCommand: 'workbench:runStudyBatch',
          metadata: { completed: completed.length, failed: study.experiments.filter((point) => point.error).length }
        });
      }
    }
  }
  const figureParents = [snapshotNodeId, ...(study && builder.has(`result:${study.id}`) ? [`result:${study.id}`] : [])];
  for (const figure of figures) {
    builder.addNode({
      id: `figure:${figure.id}`,
      kind: 'figure',
      label: figure.caption,
      content: figure.dataHash,
      schemaVersion: 'pendulum-paper-figures/v2',
      parentIds: figureParents,
      sourceCommand: 'workbench:collectPaperFigures',
      metadata: { width: figure.width, height: figure.height, dataHash: figure.dataHash }
    });
  }
  const paperNodeId = 'paper-pack:current';
  builder.addNode({
    id: paperNodeId,
    kind: 'paper-pack',
    label: 'Paper export pack',
    content: { snapshot: snapshot.hash, figures: figures.map((figure) => figure.dataHash) },
    schemaVersion: 'pendulum-paper-pack/v2',
    parentIds: [snapshotNodeId, ...figures.map((figure) => `figure:${figure.id}`)],
    sourceCommand: 'workbench:buildPaperExportPack'
  });
  builder.addNode({
    id: 'bundle:current',
    kind: 'bundle',
    label: 'Research bundle (ZIP)',
    content: { snapshot: snapshot.hash, generatedAt: new Date().toISOString() },
    schemaVersion: RESEARCH_BUNDLE_ZIP_SCHEMA,
    parentIds: [paperNodeId],
    sourceCommand: 'workbench:exportResearchBundleZip'
  });
  return builder.build();
}

export function exportProvenanceJson(): void {
  downloadJson('pendulum_provenance.json', buildResearchProvenance());
  logResearchRun(
    'export',
    'Provenance graph export',
    'Artifact DAG with hashes, schema versions, and environment metadata.',
    'pendulum_provenance.json'
  );
  renderResearchWorkbench();
}

/** Layered text viewer for the provenance DAG: nodes grouped by kind, parents inline. */
export function renderProvenanceViewer(): void {
  const target = $('rwProvenanceView');
  if (!target) return;
  if (target.childElementCount > 0) {
    clear(target);
    return;
  }
  const graph = buildResearchProvenance();
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label] as const));
  const rows = graph.nodes.map((node) => [
    node.kind,
    node.label.slice(0, 44),
    node.hash.slice(0, 10),
    node.parentIds.map((parentId) => (labelById.get(parentId) ?? parentId).slice(0, 32)).join('; ') || '(root)',
    node.sourceCommand.replace('workbench:', '')
  ]);
  renderResearchTable(
    'rwProvenanceView',
    ['kind', 'artifact', 'hash', 'derived from', 'source'],
    rows,
    'No provenance nodes yet.'
  );
  const summary = html('div', {
    className: 'research-summary',
    text: `Provenance: ${graph.nodes.length} nodes, ${graph.edges.length} edges; graph hash ${graph.graphHash}; environment ${graph.environment.appVersion}.`
  });
  target.prepend(summary);
}
