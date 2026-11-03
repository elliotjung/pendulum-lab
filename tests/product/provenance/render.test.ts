import { describe, expect, it } from 'vitest';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../../src/product/adapters/analysis/core/source';
import type { ResearchFigure, ResearchProjectBundle } from '../../../src/product/provenance/contracts';
import {
  researchExportEntries,
  researchReportMarkdown,
  renderOfflineReviewer,
  renderResearchFigure
} from '../../../src/product/provenance/render';
import { sha256Hex, textToBytes } from '../../../src/research/zipBundle';

async function recordedProject(): Promise<ResearchProjectBundle> {
  const config = { ...defaultPlanarConfig(), duration: 0.04, step: 0.01 };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('Invalid engine fixture');
  const simulation = createPlanarSimulation(config);
  const samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  const series = createDiagnosticSeries(canonical.value, samples);
  const data = textToBytes(
    JSON.stringify({ schema: 'pendulum-project-series/v1', experiment: canonical.value, series })
  );
  return {
    project: {
      schema: 'pendulum-research-project/v1',
      id: 'project-render',
      title: 'Recorded double pendulum',
      description: 'Does this recorded run retain its physical units?',
      createdAt: '2026-11-03T00:00:00.000Z',
      updatedAt: '2026-11-03T00:00:00.000Z',
      software: { name: 'Pendulum Lab', version: '10.36.0' },
      sessions: [{ id: 'session-render', title: 'Session A', createdAt: '2026-11-03T00:00:00.000Z' }],
      runs: [
        {
          id: 'run-render',
          sessionId: 'session-render',
          label: 'Raw engine trajectory',
          createdAt: '2026-11-03T00:00:00.000Z',
          experiment: canonical.value,
          status: 'completed',
          artifactIds: ['artifact-series'],
          note: 'Original recorded samples; no resampling.'
        }
      ],
      artifacts: [
        {
          id: 'artifact-series',
          runId: 'run-render',
          kind: 'series',
          schema: 'pendulum-project-series/v1',
          filename: 'recorded-series.json',
          path: 'artifacts/artifact-series/recorded-series.json',
          mediaType: 'application/json',
          bytes: data.byteLength,
          sha256: await sha256Hex(data),
          status: 'present',
          parentIds: [],
          note: 'Exact source retained.'
        }
      ],
      notebook: [
        {
          id: 'paragraph-render',
          title: 'Observation',
          text: 'The source contains five samples from the existing engine.',
          artifactIds: ['artifact-series']
        }
      ],
      figures: [
        {
          id: 'figure-render',
          title: 'Recorded angle',
          caption: 'No rerun is required to regenerate this figure.',
          runId: 'run-render',
          sourceArtifactId: 'artifact-series',
          xColumn: -1,
          yColumn: 0,
          theme: 'print'
        }
      ],
      citations: [{ id: 'citation-render', text: 'Pendulum Lab repository', url: 'https://example.org/reference' }],
      warnings: ['Finite recorded duration does not establish asymptotic behavior.']
    },
    files: [{ path: 'artifacts/artifact-series/recorded-series.json', data }]
  };
}

describe('S24 recorded-source figure and offline reviewer exports', () => {
  it('regenerates a deterministic vector figure and CSV from preserved physical samples', async () => {
    const bundle = await recordedProject();
    const figure = bundle.project.figures[0]!;
    const before = JSON.stringify(bundle.project);
    const output = renderResearchFigure(bundle, figure);
    expect(output).toEqual(renderResearchFigure(bundle, figure));
    expect(output.svg).toContain('<svg');
    expect(output.svg).toContain('Recorded angle');
    expect(output.svg).toContain('theta1');
    expect(output.svg).toContain('rad');
    expect(output.description).toContain('theta1');
    expect(output.description).toContain('rad');
    expect(output.description).toContain('5');
    expect(output.description).toContain('run-render');
    expect(output.description).toContain('artifact-series');
    expect(output.csv).toContain('run-render');
    expect(output.csv).toContain('artifact-series');
    const source = JSON.parse(new TextDecoder().decode(bundle.files[0]!.data));
    for (let i = 0; i < source.series.times.length; i += 1) {
      expect(output.csv).toContain(String(source.series.times[i]));
      expect(output.csv).toContain(String(source.series.states[i][0]));
    }
    expect(JSON.stringify(bundle.project)).toBe(before);
  });

  it('selects recorded phase coordinates without relabelling angular velocity as momentum', async () => {
    const bundle = await recordedProject();
    const figure: ResearchFigure = { ...bundle.project.figures[0]!, xColumn: 0, yColumn: 2 };
    bundle.project.figures = [figure];
    const result = renderResearchFigure(bundle, figure);
    expect(result.svg).toContain('theta1');
    expect(result.svg).toContain('omega1');
    expect(result.svg).toContain('rad/s');
    expect(result.description).toContain('theta1');
    expect(result.description).toContain('omega1');
    expect(result.description).toContain('rad/s');
    const source = JSON.parse(new TextDecoder().decode(bundle.files[0]!.data));
    for (const row of source.series.states) expect(result.csv).toContain(String(row[2]));
    expect(result.svg).not.toContain('momentum');
    expect(result.svg).not.toMatch(/<path\s+d=/);
  });

  it('refuses absent bytes, cross-run source ownership and out-of-range plot columns', async () => {
    const bundle = await recordedProject();
    const figure = bundle.project.figures[0]!;
    expect(() => renderResearchFigure({ ...bundle, files: [] }, figure)).toThrow();
    for (const change of [
      { sourceArtifactId: 'missing-artifact' },
      { runId: 'different-run' },
      { xColumn: -2 },
      { yColumn: 4 },
      { yColumn: 0.5 }
    ])
      expect(() => renderResearchFigure(bundle, { ...figure, ...change })).toThrow();
    const missing = structuredClone(bundle);
    missing.project.artifacts[0]!.status = 'missing';
    missing.project.artifacts[0]!.note = 'Not available in the received package.';
    expect(() => renderResearchFigure(missing, figure)).toThrow();
  });

  it('exports notebook, citations, software and exact source lineage in portable files', async () => {
    const bundle = await recordedProject();
    const report = researchReportMarkdown(bundle);
    for (const text of [
      bundle.project.title,
      bundle.project.description,
      '10.36.0',
      'run-render',
      'artifact-series',
      bundle.project.artifacts[0]!.sha256,
      bundle.project.notebook[0]!.text,
      bundle.project.citations[0]!.text
    ])
      expect(report).toContain(text);
    const files = researchExportEntries(bundle);
    const paths = files.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining(['report.md', 'notebook.json', 'reviewer.html']));
    expect(paths.some((path) => path.endsWith('.svg'))).toBe(true);
    expect(paths.some((path) => path.endsWith('.csv'))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.some((path) => /(^\/|\\|\.\.)/.test(path))).toBe(false);
    const notebook = files.find((file) => file.path === 'notebook.json')!;
    expect(new TextDecoder().decode(notebook.data)).toContain(bundle.project.notebook[0]!.text);
  });

  it('renders a self-contained reviewer without executable user markup or remote resources', async () => {
    const bundle = await recordedProject();
    const attack = '<img src="https://attacker.invalid/pixel" onerror="alert(1)"><script>alert(2)</script>';
    bundle.project.title = attack;
    bundle.project.description = attack;
    bundle.project.notebook[0]!.text = attack;
    bundle.project.figures[0]!.caption = attack;
    const html = renderOfflineReviewer(bundle);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script');
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<img[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/<iframe|<object|<embed|<link[^>]+href=/i);
    expect(html).not.toMatch(/<[^>]+\sonerror\s*=\s*["']/i);
    expect(html).toContain('artifact-series');
    expect(html).toContain('run-render');
    expect(html).toContain(bundle.project.artifacts[0]!.sha256);
    const imageAlt = html.match(/<img[^>]+alt="([^"]*)"/i)?.[1];
    expect(imageAlt).toContain('theta1');
    expect(imageAlt).toContain('rad');
    expect(imageAlt).toContain('artifact-series');
  });

  it('reports explicitly missing artifacts and keeps the remaining report usable', async () => {
    const bundle = await recordedProject();
    bundle.project.artifacts[0]!.status = 'missing';
    bundle.project.artifacts[0]!.note = 'Source was not supplied.';
    bundle.files = [];
    const report = researchReportMarkdown(bundle);
    const reviewer = renderOfflineReviewer(bundle);
    expect(report).toMatch(/missing|누락/i);
    expect(reviewer).toMatch(/missing|누락/i);
    expect(reviewer).toContain('Source was not supplied.');
  });
});
