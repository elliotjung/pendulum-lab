import { describe, expect, it } from 'vitest';
import {
  buildNotebookV2,
  NOTEBOOK_SCHEMA_VERSION,
  pythonTripleQuoted,
  validateNotebook,
  type NotebookInput
} from '../src/research/notebookBuilder';

const baseInput: NotebookInput = {
  stateHash: 'hash-1',
  generatedAt: '2026-06-10T00:00:00Z',
  methodsMarkdown: '# Methods\n\nSystem: double pendulum.',
  paperPackJson: JSON.stringify({
    schemaVersion: 'pendulum-paper-pack/v2',
    currentSnapshot: { hash: 'hash-1' },
    runLog: []
  }),
  figureManifestJson: JSON.stringify({ figureCount: 0, totalBytes: 0, figures: [] }),
  studyCsv: 'point_id,value,lambda_max,lambda_block_std_error\np0,1.5,0.8,0.02',
  comparisonCsv: 'id,label\nrow1,baseline',
  studyVariable: 'theta1'
};

describe('notebook builder v2', () => {
  it('produces a valid nbformat-4 document that passes validation', () => {
    const notebook = buildNotebookV2(baseInput);
    expect(notebook.nbformat).toBe(4);
    const validation = validateNotebook(notebook);
    expect(validation.problems).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(validation.codeCells).toBeGreaterThanOrEqual(5);
  });

  it('embeds the study CSV and emits the lambda-vs-parameter plot cell', () => {
    const notebook = buildNotebookV2(baseInput);
    const allSource = notebook.cells.map((cell) => cell.source.join('')).join('\n');
    expect(allSource).toContain('study_rows = load_csv');
    expect(allSource).toContain('errorbar');
    expect(allSource).toContain('lambda_block_std_error');
    expect(allSource).toContain('"theta1"');
    expect(allSource).toContain('figure_manifest');
    expect(allSource).toContain('comparison_rows');
  });

  it('omits the plot cell gracefully without a study', () => {
    const notebook = buildNotebookV2({ ...baseInput, studyCsv: null, studyVariable: null });
    const allSource = notebook.cells.map((cell) => cell.source.join('')).join('\n');
    expect(allSource).not.toContain('study_rows = load_csv');
    expect(allSource).toContain('No parameter study was generated');
    expect(validateNotebook(notebook).ok).toBe(true);
  });

  it('survives hostile embedded text (triple quotes) without breaking the Python literal', () => {
    const hostile = buildNotebookV2({
      ...baseInput,
      paperPackJson: JSON.stringify({ note: "contains ''' a triple quote" }),
      methodsMarkdown: "methods with ''' inside"
    });
    expect(validateNotebook(hostile).ok).toBe(true);
    expect(pythonTripleQuoted("a'''b")).toBe("a''' + \"'''\" + r'''b");
  });

  it('validator rejects structural damage', () => {
    expect(validateNotebook(null).ok).toBe(false);
    expect(validateNotebook({ nbformat: 3, cells: [] }).ok).toBe(false);
    const notebook = buildNotebookV2(baseInput);
    const broken = JSON.parse(JSON.stringify(notebook));
    broken.cells[2].execution_count = 7;
    const verdict = validateNotebook(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join(' ')).toContain('execution_count');
    const wrongMeta = JSON.parse(JSON.stringify(notebook));
    wrongMeta.metadata.pendulumLab.schemaVersion = 'old';
    expect(validateNotebook(wrongMeta).problems.join(' ')).toContain('schema');
  });

  it('stamps the v2 schema version', () => {
    const notebook = buildNotebookV2(baseInput);
    expect((notebook.metadata as { pendulumLab: { schemaVersion: string } }).pendulumLab.schemaVersion).toBe(
      NOTEBOOK_SCHEMA_VERSION
    );
  });
});
