import { pythonTripleQuoted, type NotebookDocument } from '../../research/notebookBuilder';
import type { ResearchProjectBundle } from '../provenance/contracts';
import { renderResearchFigure, researchReportMarkdown } from '../provenance/render';
import { validateResearchProject } from '../provenance/validation';

export const PRODUCT_RESEARCH_API_VERSION = 'product-research-api/v1';

export function productResearchFigures(bundle: ResearchProjectBundle) {
  const project = validateResearchProject(bundle.project);
  return project.figures.map((figure) => {
    const source = project.artifacts.find((artifact) => artifact.id === figure.sourceArtifactId);
    const metadata = {
      schema: 'pendulum-product-research-figure/v1',
      ...figure,
      projectId: project.id,
      sourceSha256: source?.sha256 ?? null
    };
    try {
      return { ...metadata, status: 'available' as const, ...renderResearchFigure(bundle, figure) };
    } catch (cause) {
      return {
        ...metadata,
        status: 'unavailable' as const,
        message: cause instanceof Error ? cause.message : String(cause)
      };
    }
  });
}
export function productResearchFigureManifest(bundle: ResearchProjectBundle) {
  return {
    schema: 'pendulum-product-figure-manifest/v1',
    compatibilityAdapter: PRODUCT_RESEARCH_API_VERSION,
    projectId: bundle.project.id,
    figures: productResearchFigures(bundle).map((figure) => {
      const { svg, csv, description, ...metadata } =
        figure.status === 'available' ? figure : { ...figure, svg: undefined, csv: undefined, description: undefined };
      void svg;
      void csv;
      void description;
      return metadata;
    }),
    rendering: 'data-backed-svg',
    provenance:
      'Recorded project run and original source artifact SHA-256; no fabricated legacy canvas or DB identifiers.'
  };
}
function tex(text: string) {
  const escapes: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    '%': '\\%',
    _: '\\_',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}'
  };
  return text.replace(/[\\{}$&#%_~^]/g, (match) => escapes[match]!).replace(/[\r\n\u2028\u2029]+/g, ' ');
}
/** A versioned methods fragment describes recorded canonical inputs without claiming measured uncertainties. */
export function productResearchLatex(bundle: ResearchProjectBundle) {
  const project = validateResearchProject(bundle.project);
  return [
    `% ${PRODUCT_RESEARCH_API_VERSION}; Unicode text requires a suitable LaTeX engine.`,
    '\\section{Pendulum Lab recorded methods}',
    tex(project.title),
    '\\begin{itemize}',
    ...project.runs.map(
      (run) =>
        `\\item ${tex(`${run.label}: ${run.status}; run ${run.id}; ${run.experiment ? JSON.stringify({ system: run.experiment.systemId, modelVersion: run.experiment.modelVersion, runtime: run.experiment.runtime, integrator: run.experiment.integrator, parameters: run.experiment.parameters, initialConditions: run.experiment.initialConditions, seed: run.experiment.seed ?? null }) : 'No canonical experiment attached.'}`)}`
    ),
    '\\end{itemize}',
    tex(
      'Recorded inputs and source integrity do not certify external provenance, scientific correctness, human review, or solver-buffer continuation.'
    ),
    ''
  ].join('\n');
}
export function productResearchNotebook(
  bundle: ResearchProjectBundle,
  paperPack: unknown,
  figureManifest: unknown
): NotebookDocument {
  const payload = (value: unknown) => pythonTripleQuoted(JSON.stringify(value));
  const markdown = (text: string) => ({
    cell_type: 'markdown' as const,
    metadata: {},
    source: text.split('\n').map((line) => `${line}\n`)
  });
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '3' },
      pendulumLab: {
        schema: 'pendulum-product-research-notebook/v1',
        compatibilityAdapter: PRODUCT_RESEARCH_API_VERSION,
        projectId: bundle.project.id
      }
    },
    cells: [
      markdown(
        `# Product research adapter\n${PRODUCT_RESEARCH_API_VERSION}\nCanonical S21/S22/S24 data. Legacy browser-storage objects, PNG canvas identities, quality scores and Lyapunov uncertainties are not invented.`
      ),
      markdown(researchReportMarkdown(bundle)),
      {
        cell_type: 'code',
        metadata: {},
        execution_count: null,
        outputs: [],
        source: [
          'import json\n',
          `paper_pack = json.loads(r'''${payload(paperPack)}''')\n`,
          `figure_manifest = json.loads(r'''${payload(figureManifest)}''')\n`,
          'project = paper_pack["project"]\n',
          'print("project:", project["id"], project["schema"])\n',
          'print("recorded runs:", len(project["runs"]))\n',
          'print("figure sources:", len(figure_manifest["figures"]))\n',
          'batch = paper_pack.get("batch")\n',
          'if batch is not None:\n',
          '    print("batch status:", batch["status"], "completed:", batch["aggregate"]["completed"])\n',
          '    for metric in batch["aggregate"]["metrics"]:\n',
          '        print(metric["key"], metric["mean"], metric["unit"], "n=", metric["count"])\n'
        ]
      }
    ]
  };
}
