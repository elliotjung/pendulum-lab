import { inspectSafeData } from '../persistence/safe-data';
import { renderOfflineReviewer } from '../provenance/render';
import { getProductResearch, requireProductResearch, type ProductStudyRunOptions } from './research-api-binding';
import { productPublicNamespace, replaceProductPublicNamespace } from './browser-api-publication';
import {
  PRODUCT_RESEARCH_API_VERSION,
  productResearchFigures,
  productResearchFigureManifest,
  productResearchLatex,
  productResearchNotebook
} from './research-api-export';

export type ProductResearchDownload = (filename: string, text: string, mediaType: string) => void;
function runOptions(input: unknown): ProductStudyRunOptions {
  const checked = inspectSafeData(input);
  if (!checked.ok || !checked.value || typeof checked.value !== 'object' || Array.isArray(checked.value))
    throw new Error('study 옵션은 resume/failedOnly boolean 객체여야 합니다.');
  const value = checked.value as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !['resume', 'failedOnly'].includes(key)) ||
    Object.values(value).some((entry) => typeof entry !== 'boolean') ||
    (value.resume === true && value.failedOnly === true)
  )
    throw new Error('resume 또는 failedOnly 중 하나만 boolean으로 지정하세요. 알 수 없는 옵션은 적용하지 않습니다.');
  return value as ProductStudyRunOptions;
}
export function createProductResearchApi(document: Document, download: ProductResearchDownload) {
  function projectBundle() {
    const state = requireProductResearch(document, 'project').snapshot();
    if (state.busy) throw new Error('진행 중인 연구 프로젝트 작업이 끝난 뒤 내보내세요.');
    if (!state.bundle) throw new Error('현재 도구에서 실제 연구 프로젝트를 먼저 만드세요.');
    return structuredClone(state.bundle);
  }
  function snapshot() {
    const batch = getProductResearch(document, 'batch'),
      observation = getProductResearch(document, 'observation'),
      project = getProductResearch(document, 'project');
    if (!batch && !observation && !project) requireProductResearch(document, 'project');
    return structuredClone({
      schema: 'pendulum-product-research-snapshot/v1',
      compatibilityAdapter: PRODUCT_RESEARCH_API_VERSION,
      providers: { batch: !!batch, observation: !!observation, project: !!project },
      ...(batch ? { batch: batch.snapshot() } : {}),
      ...(observation ? { observation: observation.snapshot() } : {}),
      ...(project ? { project: project.snapshot() } : {})
    });
  }
  function paperPack() {
    const bundle = projectBundle(),
      actual = snapshot();
    return {
      schema: 'pendulum-product-paper-pack/v1',
      compatibilityAdapter: PRODUCT_RESEARCH_API_VERSION,
      project: bundle.project,
      ...(actual.batch ? { batch: actual.batch } : {}),
      ...(actual.observation ? { observation: actual.observation } : {}),
      figureManifest: productResearchFigureManifest(bundle),
      provenance:
        'S21 plan/result, S22 original/transform and S24 session/run/artifact identifiers; each remains its own actual source. No legacy store writes.'
    };
  }
  const json = (filename: string, value: unknown) =>
    download(filename, JSON.stringify(value, null, 2), 'application/json');
  return Object.freeze({
    compatibilityAdapter: PRODUCT_RESEARCH_API_VERSION,
    returnContract: Object.freeze({
      snapshot: 'pendulum-product-research-snapshot/v1',
      study: 'pendulum-batch/v1',
      project: 'pendulum-research-project/v1',
      paperPack: 'pendulum-product-paper-pack/v1',
      figures: 'pendulum-product-figure-manifest/v1',
      bundle: 'ResearchProjectBundle with original Uint8Array files; exportBundle downloads the actual S24 ZIP'
    }),
    saveCurrentExperiment() {
      requireProductResearch(document, 'project').saveCurrentExperiment();
    },
    generateParameterStudy() {
      const provider = requireProductResearch(document, 'batch');
      provider.prepare();
      const result = provider.snapshot();
      if (!result) throw new Error('실제 다중 실험 계획을 만들지 못했습니다.');
      return structuredClone(result);
    },
    async runStudyBatch(options: unknown = {}) {
      return structuredClone(await requireProductResearch(document, 'batch').run(runOptions(options)));
    },
    cancelStudyBatch() {
      requireProductResearch(document, 'batch').cancel();
    },
    rebuildComparisonMatrix() {
      return structuredClone(requireProductResearch(document, 'batch').comparison());
    },
    exportPaperPack() {
      json('pendulum-product-paper-pack-v1.json', paperPack());
    },
    exportFigures() {
      download(
        'pendulum-product-research-figures-v1.html',
        renderOfflineReviewer(projectBundle()),
        'text/html;charset=utf-8'
      );
    },
    exportFigureManifest() {
      json('pendulum-product-figure-manifest-v1.json', productResearchFigureManifest(projectBundle()));
    },
    exportLatex() {
      download(
        'pendulum-product-research-methods-v1.tex',
        productResearchLatex(projectBundle()),
        'application/x-tex;charset=utf-8'
      );
    },
    exportNotebook() {
      const bundle = projectBundle();
      json(
        'pendulum-product-research-v1.ipynb',
        productResearchNotebook(bundle, paperPack(), productResearchFigureManifest(bundle))
      );
    },
    exportBundle() {
      requireProductResearch(document, 'project').exportBundle();
    },
    collectFigures() {
      return productResearchFigures(projectBundle());
    },
    figureManifest() {
      return productResearchFigureManifest(projectBundle());
    },
    bundle: projectBundle,
    snapshot
  });
}

/** A separate opt-in extends only the already-owned base namespace and protects every user global. */
export function publishProductResearchApi(document: Document) {
  const view = document.defaultView;
  if (!view) throw new Error('현재 브라우저 문서가 필요합니다.');
  const previous = productPublicNamespace(document);
  if ('research' in previous || 'PendulumResearchWorkspace' in view)
    throw new Error('기존 research namespace 또는 PendulumResearchWorkspace를 덮어쓰지 않았습니다.');
  let disposed = false;
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  const api = createProductResearchApi(document, (filename, text, mediaType) => {
    if (disposed) throw new Error('연구 스크립트 API가 해제되었습니다.');
    if (urls.size >= 8) throw new Error('동시에 만드는 다운로드가 8개를 넘었습니다. 잠시 후 다시 내보내세요.');
    const url = URL.createObjectURL(new Blob([text], { type: mediaType }));
    urls.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.delete(url);
      timers.delete(timer);
    }, 1000);
    timers.add(timer);
  });
  const published = Object.freeze({ ...previous, research: api });
  Object.defineProperty(view, 'PendulumResearchWorkspace', { configurable: true, value: api });
  try {
    replaceProductPublicNamespace(document, published);
  } catch (cause) {
    Reflect.deleteProperty(view, 'PendulumResearchWorkspace');
    throw cause;
  }
  return {
    api,
    dispose() {
      disposed = true;
      if ((view as Window & { PendulumResearchWorkspace?: unknown }).PendulumResearchWorkspace === api)
        Reflect.deleteProperty(view, 'PendulumResearchWorkspace');
      try {
        if (productPublicNamespace(document) === published) replaceProductPublicNamespace(document, previous);
      } catch {
        /* Preserve replacements and an already-disposed base namespace. */
      }
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
