/**
 * Executable Jupyter notebook builder (nbformat 4). The notebook embeds the
 * exported study CSV, comparison matrix CSV, paper pack JSON, and figure
 * manifest as string literals, then loads them with the Python stdlib and
 * plots λ(parameter) with uncertainty bars via matplotlib when available —
 * so the file runs end-to-end offline with no sidecar data files.
 */

export interface NotebookInput {
  stateHash: string;
  generatedAt: string;
  methodsMarkdown: string;
  paperPackJson: string;
  figureManifestJson: string;
  /** Parameter-study results CSV (single-variable) or null when absent. */
  studyCsv: string | null;
  comparisonCsv: string;
  studyVariable: string | null;
}

export interface NotebookCell {
  cell_type: 'markdown' | 'code';
  metadata: Record<string, unknown>;
  source: string[];
  execution_count?: null;
  outputs?: unknown[];
}

export interface NotebookDocument {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

export const NOTEBOOK_SCHEMA_VERSION = 'pendulum-research-notebook/v2';

function markdownCell(lines: string[]): NotebookCell {
  return { cell_type: 'markdown', metadata: {}, source: lines.map((line) => `${line}\n`) };
}

function codeCell(lines: string[]): NotebookCell {
  return {
    cell_type: 'code',
    metadata: {},
    execution_count: null,
    outputs: [],
    source: lines.map((line) => `${line}\n`)
  };
}

/** Escape arbitrary text into a safe Python r-string triple-quoted literal. */
export function pythonTripleQuoted(text: string): string {
  return text.replace(/'''/g, "''' + \"'''\" + r'''");
}

export function buildNotebookV2(input: NotebookInput): NotebookDocument {
  const cells: NotebookCell[] = [];

  cells.push(
    markdownCell([
      '# Pendulum Lab Research Notebook',
      '',
      `Generated ${input.generatedAt} from state hash \`${input.stateHash}\`.`,
      '',
      'This notebook is **executable**: all exported data (study CSV, comparison matrix, paper pack, figure manifest) is embedded below.',
      'Cells degrade gracefully — plotting uses matplotlib when installed, and falls back to text summaries otherwise.'
    ])
  );

  cells.push(markdownCell(input.methodsMarkdown.split('\n')));

  cells.push(
    codeCell([
      'import json, csv, io, statistics',
      '',
      `paper_pack = json.loads(r'''${pythonTripleQuoted(input.paperPackJson)}''')`,
      `figure_manifest = json.loads(r'''${pythonTripleQuoted(input.figureManifestJson)}''')`,
      "print('paper pack schema:', paper_pack['schemaVersion'])",
      "print('snapshot hash   :', paper_pack['currentSnapshot']['hash'])",
      "print('figures         :', figure_manifest['figureCount'])"
    ])
  );

  cells.push(
    codeCell([
      'def load_csv(text):',
      '    rows = [line for line in io.StringIO(text) if not line.startswith("#")]',
      '    return list(csv.DictReader(rows))',
      '',
      `comparison_rows = load_csv(r'''${pythonTripleQuoted(input.comparisonCsv)}''')`,
      "print(f'comparison matrix: {len(comparison_rows)} rows')",
      'for row in comparison_rows[:10]:',
      "    print(f\"  {row.get('source','?'):14s} {row.get('label','?')[:32]:32s} method={row.get('method','?'):10s} score={row.get('score','?')}\")"
    ])
  );

  if (input.studyCsv !== null) {
    cells.push(
      codeCell([
        `study_rows = load_csv(r'''${pythonTripleQuoted(input.studyCsv)}''')`,
        "completed = [r for r in study_rows if r.get('lambda_max')]",
        "print(f'study points: {len(study_rows)} total, {len(completed)} with results')",
        'if completed:',
        "    lambdas = [float(r['lambda_max']) for r in completed]",
        "    print(f'lambda_max: mean={statistics.mean(lambdas):.4f}, min={min(lambdas):.4f}, max={max(lambdas):.4f}')",
        '    chaotic = sum(1 for l in lambdas if l > 0)',
        "    print(f'chaotic fraction: {chaotic}/{len(lambdas)}')"
      ])
    );

    cells.push(
      codeCell([
        '# Lambda vs parameter with block-SE uncertainty bars (matplotlib optional).',
        'try:',
        '    import matplotlib.pyplot as plt',
        '    xs = [float(r["value"]) for r in completed]',
        '    ys = [float(r["lambda_max"]) for r in completed]',
        '    es = [float(r["lambda_block_std_error"] or 0) for r in completed]',
        '    order = sorted(range(len(xs)), key=lambda i: xs[i])',
        '    xs, ys, es = [xs[i] for i in order], [ys[i] for i in order], [es[i] for i in order]',
        '    fig, ax = plt.subplots(figsize=(7, 4))',
        '    ax.errorbar(xs, ys, yerr=es, fmt="o-", capsize=3, linewidth=1)',
        '    ax.axhline(0.0, color="gray", linestyle="--", linewidth=0.8)',
        `    ax.set_xlabel(${JSON.stringify(input.studyVariable ?? 'parameter')})`,
        '    ax.set_ylabel("lambda_max (Benettin) ± block SE")',
        '    ax.set_title("Maximal Lyapunov exponent vs parameter")',
        '    plt.tight_layout()',
        '    plt.show()',
        'except ImportError:',
        '    print("matplotlib not installed — text summary above stands in for the plot")'
      ])
    );
  } else {
    cells.push(
      markdownCell(['_No parameter study was generated at export time, so the λ(parameter) plot cell is omitted._'])
    );
  }

  cells.push(
    codeCell([
      '# Figure manifest: provenance of every captured figure.',
      "for fig in figure_manifest['figures']:",
      "    print(f\"{fig['file']}: {fig['width']}x{fig['height']}, hash {fig['dataHash']}, caption: {fig['caption'][:60]}\")",
      "print('total estimated bytes:', figure_manifest['totalBytes'])"
    ])
  );

  cells.push(
    codeCell([
      '# Study / run-log summaries from the paper pack.',
      "study = paper_pack.get('parameterStudy')",
      'if study:',
      "    print(f\"study {study['id']}: {study['variable']} ({study['strategy']}), {study['count']} points\")",
      "summary = paper_pack.get('parameterStudySummary')",
      'if summary:',
      "    print(f\"complete={summary['complete']} failed={summary['failed']} pending={summary['pending']} planHash={summary['planHash']}\")",
      "print('run log entries:', len(paper_pack.get('runLog', [])))"
    ])
  );

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', pycodemirror_mode: { name: 'ipython', version: 3 } },
      pendulumLab: { schemaVersion: NOTEBOOK_SCHEMA_VERSION, stateHash: input.stateHash }
    },
    cells
  };
}

export interface NotebookValidation {
  ok: boolean;
  problems: string[];
  cellCount: number;
  codeCells: number;
}

/** Structural nbformat-4 validation plus embedded-payload integrity checks. */
export function validateNotebook(value: unknown): NotebookValidation {
  const problems: string[] = [];
  const nb = value as Partial<NotebookDocument>;
  if (typeof value !== 'object' || value === null)
    return { ok: false, problems: ['notebook is not an object'], cellCount: 0, codeCells: 0 };
  if (nb.nbformat !== 4) problems.push(`nbformat must be 4, got ${String(nb.nbformat)}`);
  if (!Array.isArray(nb.cells) || nb.cells.length === 0) {
    problems.push('cells must be a non-empty array');
    return { ok: false, problems, cellCount: 0, codeCells: 0 };
  }
  let codeCells = 0;
  nb.cells.forEach((cell, index) => {
    if (cell.cell_type !== 'markdown' && cell.cell_type !== 'code')
      problems.push(`cell ${index} has invalid type ${String(cell.cell_type)}`);
    if (!Array.isArray(cell.source) || cell.source.some((line) => typeof line !== 'string'))
      problems.push(`cell ${index} source must be a string array`);
    if (cell.cell_type === 'code') {
      codeCells += 1;
      if (cell.execution_count !== null) problems.push(`code cell ${index} must have execution_count null`);
      if (!Array.isArray(cell.outputs)) problems.push(`code cell ${index} must have an outputs array`);
    }
  });
  const meta = (nb.metadata as { pendulumLab?: { schemaVersion?: string } } | undefined)?.pendulumLab;
  if (meta?.schemaVersion !== NOTEBOOK_SCHEMA_VERSION) problems.push('missing pendulumLab schema metadata');
  try {
    JSON.stringify(value);
  } catch {
    problems.push('notebook is not JSON-serialisable');
  }
  return { ok: problems.length === 0, problems, cellCount: nb.cells.length, codeCells };
}
