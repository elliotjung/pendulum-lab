/**
 * Notebook validation gate. Builds a representative research notebook from
 * fixture data (or validates one passed with --in), checks nbformat-4
 * structure, and — when a Jupyter toolchain is available on PATH — executes it
 * headlessly with `jupyter nbconvert --execute` as a CI-like smoke test.
 *
 *   npx tsx scripts/validate-notebook.ts
 *   npx tsx scripts/validate-notebook.ts --in pendulum_research_notebook.ipynb
 *   npx tsx scripts/validate-notebook.ts --execute   (force execution attempt)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildNotebookV2, validateNotebook, NOTEBOOK_SCHEMA_VERSION } from '../src/research/notebookBuilder';

function fixtureNotebook(): unknown {
  const studyCsv = [
    '# schemaVersion=pendulum-parameter-study-results/v1',
    'point_id,label,variable,value,lambda_max,lambda_block_std_error,rqa_determinism,rqa_divergence,ftle,duration_ms,attempts,error,snapshot_hash',
    'p0,theta1=1.5,theta1,1.5,0.8123,0.0210,0.91,0.04,1.10,900,1,,abc123',
    'p1,theta1=2.0,theta1,2.0,1.2345,0.0190,0.88,0.06,1.31,910,1,,def456',
    'p2,theta1=2.5,theta1,2.5,1.5012,0.0240,0.85,0.07,1.45,905,1,,fed789'
  ].join('\n');
  const comparisonCsv = [
    '# schemaVersion=pendulum-comparison-matrix-csv/v1',
    'id,label,source,timestamp,method,system,dt,damping,drift,lambda_max,fps,score,hash',
    'row1,baseline,experiment,2026-01-01T00:00:00Z,rk4,double,0.003,0,1e-9,1.1,60,95,abc'
  ].join('\n');
  return buildNotebookV2({
    stateHash: 'fixture-hash',
    generatedAt: new Date().toISOString(),
    methodsMarkdown: "# Methods\n\nFixture methods text. Includes a tricky literal: ''' triple quote.",
    paperPackJson: JSON.stringify({
      schemaVersion: 'pendulum-paper-pack/v2',
      currentSnapshot: { hash: 'fixture-hash' },
      parameterStudy: { id: 's1', variable: 'theta1', strategy: 'grid', count: 3 },
      parameterStudySummary: { complete: 3, failed: 0, pending: 0, planHash: 'h' },
      runLog: []
    }),
    figureManifestJson: JSON.stringify({
      schemaVersion: 'pendulum-paper-figures/v2',
      figureCount: 1,
      totalBytes: 1234,
      figures: [
        { file: 'figures/figure-01-main.png', width: 800, height: 500, dataHash: 'fh', caption: 'Main trajectory' }
      ]
    }),
    studyCsv,
    comparisonCsv,
    studyVariable: 'theta1'
  });
}

function jupyterAvailable(): { command: string[]; available: boolean } {
  for (const candidate of [
    ['jupyter', '--version'],
    ['python', '-m', 'jupyter', '--version'],
    ['py', '-m', 'jupyter', '--version']
  ]) {
    const probe = spawnSync(candidate[0]!, candidate.slice(1), {
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });
    if (probe.status === 0) return { command: candidate, available: true };
  }
  return { command: [], available: false };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inIndex = argv.indexOf('--in');
  const inputPath = inIndex >= 0 ? argv[inIndex + 1] : undefined;
  const forceExecute = argv.includes('--execute');

  const notebook = inputPath ? (JSON.parse(await readFile(inputPath, 'utf8')) as unknown) : fixtureNotebook();
  const validation = validateNotebook(notebook);
  const report: Record<string, unknown> = {
    schemaVersion: 'pendulum-notebook-validation/v1',
    notebookSchema: NOTEBOOK_SCHEMA_VERSION,
    source: inputPath ?? 'fixture',
    generatedAt: new Date().toISOString(),
    structural: validation
  };
  if (!validation.ok) {
    console.error(`notebook structural validation FAILED: ${validation.problems.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log(`notebook structure OK (${validation.cellCount} cells, ${validation.codeCells} code cells)`);
  }

  await mkdir('reports', { recursive: true });
  const notebookPath = 'reports/notebook-validation-sample.ipynb';
  await writeFile(notebookPath, JSON.stringify(notebook, null, 2), 'utf8');

  const jupyter = jupyterAvailable();
  report.jupyterAvailable = jupyter.available;
  if (validation.ok && jupyter.available) {
    console.log(`jupyter detected (${jupyter.command.join(' ')}); executing notebook headlessly…`);
    const exec = spawnSync(
      jupyter.command[0]!,
      [
        ...jupyter.command.slice(1, -1),
        'nbconvert',
        '--to',
        'notebook',
        '--execute',
        '--output',
        'notebook-validation-executed.ipynb',
        notebookPath
      ],
      { encoding: 'utf8', timeout: 180_000, shell: process.platform === 'win32' }
    );
    report.execution = { status: exec.status, stderr: (exec.stderr ?? '').slice(-2000) };
    if (exec.status === 0) {
      console.log('notebook EXECUTED successfully');
    } else {
      console.error(
        `notebook execution failed (status ${exec.status}); structural validation still ${validation.ok ? 'passed' : 'failed'}`
      );
      if (forceExecute) process.exitCode = 1;
    }
  } else if (!jupyter.available) {
    // Fallback: the notebook's code cells are stdlib-only (matplotlib guarded
    // by try/except), so concatenating them into a plain script and running
    // python is a faithful execution test without a Jupyter install.
    const python = ['python', 'py'].find(
      (candidate) =>
        spawnSync(candidate, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).status === 0
    );
    if (python && validation.ok) {
      const cells = (notebook as { cells: { cell_type: string; source: string[] }[] }).cells;
      const script = cells
        .filter((cell) => cell.cell_type === 'code')
        .map((cell) => cell.source.join(''))
        .join('\n\n');
      const scriptPath = 'reports/notebook-validation-cells.py';
      await writeFile(scriptPath, script, 'utf8');
      const exec = spawnSync(python, [scriptPath], {
        encoding: 'utf8',
        timeout: 120_000,
        shell: process.platform === 'win32'
      });
      report.execution = { runner: 'plain-python', status: exec.status, stderr: (exec.stderr ?? '').slice(-2000) };
      if (exec.status === 0) {
        console.log(`code cells EXECUTED successfully with plain ${python} (jupyter not installed)`);
      } else {
        console.error(`plain-python execution failed (status ${exec.status}):\n${(exec.stderr ?? '').slice(-1500)}`);
        process.exitCode = 1;
      }
    } else {
      console.log('no jupyter or python on PATH — skipping execution (structural validation only)');
      if (forceExecute) {
        console.error('--execute requested but no Python toolchain found');
        process.exitCode = 1;
      }
    }
  }

  await writeFile('reports/notebook-validation.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('report written to reports/notebook-validation.json');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
