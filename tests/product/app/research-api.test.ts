import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProductResearchApi, publishProductResearchApi } from '../../../src/product/app/research-api-runtime';
import {
  bindProductResearch,
  getProductResearch,
  requireProductResearch,
  type ProductResearchBatchProvider
} from '../../../src/product/app/research-api-binding';
import { publishProductRuntimeApi } from '../../../src/product/app/browser-api-runtime';
import { productResearchNotebook, productResearchLatex } from '../../../src/product/app/research-api-export';
import { productPublicNamespace } from '../../../src/product/app/browser-api-publication';
import { buildBatch } from '../../../src/product/lab/experiments/builders';
import { createBatchQueue } from '../../../src/product/lab/experiments/queue';
import { executeBatchRun } from '../../../src/product/lab/experiments/execute';
import { bundleFixture, nativeFixture } from '../provenance/fixtures';
import { previewObservationImport } from '../../../src/product/observations';
import { renderResearchFigure } from '../../../src/product/provenance/render';

afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const document = {} as Document;
  const downloads: Array<{ name: string; text: string; type: string }> = [];
  const api = createProductResearchApi(document, (name, text, type) => downloads.push({ name, text, type }));
  const bundle = await bundleFixture();
  const project = {
    snapshot: () => ({ bundle, busy: false }),
    saveCurrentExperiment: vi.fn(),
    exportBundle: vi.fn()
  };
  const unbindProject = bindProductResearch(document, 'project', project);
  return { document, downloads, api, bundle, project, unbindProject };
}
describe('S28 explicit versioned live research scripting adapter', () => {
  it('has all 15 exact original method names and refuses missing live providers', () => {
    const document = {} as Document;
    const api = createProductResearchApi(document, vi.fn());
    expect(
      Object.entries(api)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => name)
        .sort()
    ).toEqual(
      [
        'bundle',
        'cancelStudyBatch',
        'collectFigures',
        'exportBundle',
        'exportFigureManifest',
        'exportFigures',
        'exportLatex',
        'exportNotebook',
        'exportPaperPack',
        'figureManifest',
        'generateParameterStudy',
        'rebuildComparisonMatrix',
        'runStudyBatch',
        'saveCurrentExperiment',
        'snapshot'
      ].sort()
    );
    expect(() => api.snapshot()).toThrow('먼저 여세요');
    expect(() => api.generateParameterStudy()).toThrow('다중 실험');
    expect(() => api.bundle()).toThrow('연구 프로젝트');
    expect(Object.isFrozen(api)).toBe(true);
  });
  it('delegates to a real S21 queue and native kernel, returns detached plans/results, and strictly rejects unknown run options', async () => {
    const f = await setup();
    let queue: ReturnType<typeof createBatchQueue> | undefined;
    const provider: ProductResearchBatchProvider = {
      snapshot: () => queue?.snapshot(),
      prepare() {
        const plan = buildBatch(nativeFixture().experiment, {
          kind: 'paired',
          axes: [{ group: 'initialConditions', key: 'theta1', start: 0.1, end: 0.2, count: 2 }],
          count: 2,
          seed: 'research-api-test',
          concurrency: 1,
          integratorIds: []
        });
        queue = createBatchQueue(plan, {
          executor(request, emit) {
            let cancelled = false;
            queueMicrotask(() => {
              if (!cancelled) emit({ type: 'result', id: request.run.id, result: executeBatchRun(request) });
            });
            return {
              cancel() {
                cancelled = true;
              },
              dispose() {
                cancelled = true;
              }
            };
          }
        });
      },
      run(options) {
        if (!queue) throw new Error('no queue');
        const active = queue;
        return new Promise((resolve, reject) => {
          const off = active.subscribe((state) => {
            if (state.status !== 'running' && state.status !== 'ready') {
              off();
              resolve(state);
            }
          });
          if (!(options.failedOnly ? active.retryFailed() : options.resume ? active.resume() : active.start())) {
            off();
            reject(new Error('not runnable'));
          }
        });
      },
      cancel() {
        queue?.cancel();
      },
      comparison() {
        if (!queue) throw new Error('no queue');
        return queue.snapshot().aggregate;
      }
    };
    bindProductResearch(f.document, 'batch', provider);
    const prepared = f.api.generateParameterStudy();
    expect(prepared.schema).toBe('pendulum-batch/v1');
    const completed = await f.api.runStudyBatch();
    expect(completed.status).toBe('completed');
    expect(completed.runs.every((run) => run.result?.summary.steps === 8)).toBe(true);
    expect(f.api.rebuildComparisonMatrix()).toEqual(completed.aggregate);
    expect(f.api.snapshot().batch).toEqual(completed);
    for (const invalid of [{ resume: 1 }, { unknown: true }, { resume: true, failedOnly: true }, []])
      await expect(f.api.runStudyBatch(invalid)).rejects.toThrow('옵션');
    const altered = f.api.snapshot();
    Reflect.set(altered.batch!.plan.source.parameters, 'm1', { kind: 'scalar', value: 999, unit: 'kg' });
    expect(f.api.snapshot().batch!.plan.source.parameters.m1).not.toEqual(altered.batch!.plan.source.parameters.m1);
    queue?.dispose();
  });
  it('exposes actual S22 original/preview relationships and detached S24 original bytes without touching legacy stores', async () => {
    const f = await setup();
    const preview = await previewObservationImport({
      text: 'time,angle\n0,0.1\n0.1,0.2',
      name: 'sensor.csv',
      kind: 'sensor',
      mapping: { time: 'time', theta1: 'angle' }
    });
    const unbindObservation = bindProductResearch(f.document, 'observation', { snapshot: () => ({ preview }) });
    expect(f.api.snapshot().observation!.preview!.artifact.original.text).toBe(preview.artifact.original.text);
    const first = f.api.bundle();
    first.files[0]!.data[0] = 0;
    expect(f.api.bundle().files[0]!.data).toEqual(f.bundle.files[0]!.data);
    f.api.saveCurrentExperiment();
    f.api.exportBundle();
    expect(f.project.saveCurrentExperiment).toHaveBeenCalledOnce();
    expect(f.project.exportBundle).toHaveBeenCalledOnce();
    unbindObservation();
    f.unbindProject();
    expect(() => f.api.bundle()).toThrow('먼저 여세요');
  });
  it('renders real S24 vector figure sources, keeps provenance and exports explicit new schemas', async () => {
    const f = await setup();
    f.bundle.project.figures.push({
      id: 'recorded-figure',
      title: 'Actual trajectory',
      caption: 'No invented uncertainty',
      runId: f.bundle.project.runs[0]!.id,
      sourceArtifactId: f.bundle.project.artifacts.find((entry) => entry.kind === 'series')!.id,
      xColumn: -1,
      yColumn: 0,
      theme: 'print'
    });
    const figure = f.api.collectFigures()[0]!;
    expect(figure.status).toBe('available');
    if (figure.status === 'available')
      expect(figure.svg).toBe(renderResearchFigure(f.bundle, f.bundle.project.figures[0]!).svg);
    expect(f.api.figureManifest()).toMatchObject({
      schema: 'pendulum-product-figure-manifest/v1',
      rendering: 'data-backed-svg',
      figures: [{ runId: 'run-test', status: 'available' }]
    });
    f.api.exportPaperPack();
    f.api.exportFigureManifest();
    f.api.exportFigures();
    f.api.exportLatex();
    f.api.exportNotebook();
    expect(f.downloads).toHaveLength(5);
    expect(JSON.parse(f.downloads[0]!.text).schema).toBe('pendulum-product-paper-pack/v1');
    expect(JSON.parse(f.downloads[1]!.text).figures[0].sourceSha256).toBe(figure.sourceSha256);
    expect(f.downloads[2]!.text).toContain("default-src 'none'");
    expect(f.downloads[2]!.text).toContain('data:image/svg+xml');
    const notebook = JSON.parse(f.downloads[4]!.text);
    expect(notebook.nbformat).toBe(4);
    expect(
      notebook.cells
        .filter((cell: { cell_type: string }) => cell.cell_type === 'code')
        .every(
          (cell: { execution_count: null; outputs: unknown[] }) =>
            cell.execution_count === null && cell.outputs.length === 0
        )
    ).toBe(true);
    expect(notebook.metadata.pendulumLab.compatibilityAdapter).toBe('product-research-api/v1');
    expect(notebook.cells.flatMap((cell: { source: string[] }) => cell.source).join('')).not.toContain('lambda_max');
  });
  it('preserves user strings inertly in LaTeX and executable notebook payload literals', async () => {
    const f = await setup();
    f.bundle.project.title = "\\end{itemize} $escape_ '''\nprint('injected')";
    const latex = productResearchLatex(f.bundle);
    expect(latex).toContain('\\textbackslash{}end\\{itemize\\}');
    expect(latex).not.toContain('\\end{itemize} $escape_');
    const notebook = productResearchNotebook(f.bundle, { project: f.bundle.project }, { figures: [] });
    expect(notebook.cells.flatMap((cell) => cell.source).join('')).toContain("''' + \"'''\" + r'''");
  });
  it('guards busy project reads and removes only the active provider binding', async () => {
    const f = await setup();
    const current = bindProductResearch(f.document, 'project', {
      ...f.project,
      snapshot: () => ({ bundle: f.bundle, busy: true })
    });
    f.unbindProject();
    expect(getProductResearch(f.document, 'project')).toBeDefined();
    expect(() => f.api.bundle()).toThrow('진행 중');
    current();
    expect(() => requireProductResearch(f.document, 'project')).toThrow('먼저 여세요');
  });
  it('publishes the alias only after separate opt-in, updates the owned base safely and restores it on disposal', () => {
    const view = {} as Window,
      document = { defaultView: view } as Document;
    vi.stubGlobal('window', view);
    expect(() => publishProductResearchApi(document)).toThrow('먼저 활성화');
    const base = publishProductRuntimeApi(document);
    const before = productPublicNamespace(document);
    expect('PendulumResearchWorkspace' in view).toBe(false);
    const research = publishProductResearchApi(document);
    expect((productPublicNamespace(document) as { research: unknown }).research).toBe(research.api);
    expect((view as Window & { PendulumResearchWorkspace?: unknown }).PendulumResearchWorkspace).toBe(research.api);
    research.dispose();
    expect(productPublicNamespace(document)).toBe(before);
    expect('PendulumResearchWorkspace' in view).toBe(false);
    base.dispose();
    expect('PendulumLab' in view).toBe(false);
  });
  it('never overwrites user aliases or replacement base namespaces and handles base-first disposal', () => {
    const view = {} as Window,
      document = { defaultView: view } as Document;
    vi.stubGlobal('window', view);
    const base = publishProductRuntimeApi(document);
    const user = { user: 'preserve' };
    Object.defineProperty(view, 'PendulumResearchWorkspace', { configurable: true, value: user });
    expect(() => publishProductResearchApi(document)).toThrow('덮어쓰지');
    expect((view as Window & { PendulumResearchWorkspace?: unknown }).PendulumResearchWorkspace).toBe(user);
    Reflect.deleteProperty(view, 'PendulumResearchWorkspace');
    const research = publishProductResearchApi(document);
    base.dispose();
    research.dispose();
    expect('PendulumLab' in view).toBe(false);
    const second = publishProductRuntimeApi(document);
    Object.defineProperty(view, 'PendulumLab', { configurable: true, value: user });
    expect(() => publishProductResearchApi(document)).toThrow('다른 소유자');
    second.dispose();
    expect((view as Window & { PendulumLab?: unknown }).PendulumLab).toBe(user);
  });
});
