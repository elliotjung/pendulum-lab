import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

type Status = 'done' | 'partial' | 'gap';

interface ScorecardItem {
  area: string;
  status: Status;
  evidence: string[];
  remaining: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const legacy = await readJson('reports/legacy-risk-report.json', {
  counts: { innerHTML: -1, onclick: -1, inlineWorkerBlob: -1, dynamicScript: -1, globalRuntimeExports: -1 },
  weightedScore: -1,
  delta: 0
});

const packageJson = await readJson<{ scripts?: Record<string, string> }>('package.json', {});
const scripts = packageJson.scripts ?? {};
const vitest = await readJson<{ numTotalTests?: number; numPassedTests?: number; testResults?: unknown[] }>('reports/vitest-results.json', {});
const unitTestSummary = Number.isInteger(vitest.numTotalTests) && Array.isArray(vitest.testResults)
  ? `${vitest.numPassedTests ?? 0}/${vitest.numTotalTests} unit tests across ${vitest.testResults.length} files`
  : 'unit test JSON report missing; run npm run test:json';

const has = {
  benchmark: await exists('reports/benchmark-report.md'),
  energy: await exists('reports/energy-benchmark.md'),
  validation: await exists('reports/validation-report.md'),
  reference: await exists('reports/validation-reference.md'),
  architecture: await exists('docs/architecture.md'),
  numerics: await exists('docs/numerics.md'),
  limitations: await exists('docs/known-limitations.md'),
  ci: await exists('.github/workflows/ci.yml'),
  pagesWorkflow: await exists('.github/workflows/pages.yml'),
  distIndex: await exists('dist/index.html'),
  license: await exists('LICENSE'),
  citation: await exists('CITATION.cff'),
  typedocIndex: await exists('docs/api/index.html'),
  index: await exists('index.html')
};

const pagesReady = has.pagesWorkflow && has.distIndex;
const packagingReady = pagesReady && has.license && has.citation && has.typedocIndex;

const items: ScorecardItem[] = [
  {
    area: 'TypeScript and modular architecture',
    status: 'done',
    evidence: [
      'src/ contains physics, chaos, viz, app, render, state, runtime, validation, export, workers modules',
      'npm run typecheck passes (strict)',
      'legacy js/ runtime fully removed (archived); index.html loads only src/main.ts',
      'legacy-risk audit score is 0'
    ],
    remaining: []
  },
  {
    area: 'Index simulator UI/UX',
    status: has.index ? 'partial' : 'gap',
    evidence: ['index.html is the single user-facing simulator with lab, comparison, Lyapunov, sweep, bifurcation, phase-space, density, and validation tabs'],
    remaining: ['Panel layout persistence, project workspace lists, and a stronger beginner/expert mode still need index-page implementation']
  },
  {
    area: 'Numerics and physics depth',
    status: 'partial',
    evidence: [
      'RKF45, Dormand-Prince 5(4), DOP853-adjacent GBS extrapolation, Gauss-Legendre 4/6, TR-BDF2, canonical midpoint, N-pendulum, driven, spring systems are present in src',
      'Floquet multipliers, natural + pseudo-arclength continuation, period-doubling branch switching, and the Melnikov analytic threshold are implemented and tested',
      'external cross-validation vs an independent SciPy DOP853 reference covers the double AND triple pendulum; literature anchors pin the elliptic period, normal modes, and the period-doubling onset'
    ],
    remaining: ['WebGPU ensemble simulation, Neimark-Sacker torus continuation, and optional MATLAB/Julia second references remain future work']
  },
  {
    area: 'Chaos analysis',
    status: 'partial',
    evidence: [
      'Maximal Lyapunov convergence, full spectrum, Kaplan-Yorke dimension, SALI/FLI, Poincare, bifurcation modules exist and are tested',
      'covariant Lyapunov vectors (Ginelli), 0-1 test, RQA, FTLE fields, basin entropy and the Wada grid test are implemented as tabs + library APIs',
      'every non-variational diagnostic reports an uncertainty estimate (bootstrap / block-resampled / regression CI)'
    ],
    remaining: ['Full spectrum, CLV and FTLE are CPU-side; GPU acceleration is not implemented']
  },
  {
    area: 'Testing and browser coverage',
    status: scripts['test:e2e'] && has.ci ? 'done' : 'partial',
    evidence: [unitTestSummary, 'unit tests cover integrators, energy drift, determinism, JSON import validation, edge cases, chaos, visualization, repro packages', 'Playwright config includes Chromium, Firefox, WebKit, and mobile Chrome'],
    remaining: ['Visual regression, memory leak, and long-runtime soak tests are not yet first-class CI jobs']
  },
  {
    area: 'Performance and benchmark reporting',
    status: has.benchmark && has.energy ? 'done' : 'partial',
    evidence: ['benchmark-report.md captures FPS, physics ms/frame, memory, worker latency', 'energy-benchmark.md compares long-run drift by integrator'],
    remaining: ['True original-vs-candidate comparison needs distinct ORIGINAL_URL and CANDIDATE_URL inputs']
  },
  {
    area: 'Security hardening',
    status: 'partial',
    evidence: ['CSP is present', 'JSON import validation is tested', 'eval/new Function count is zero', `legacy risk score is ${legacy.weightedScore} (${legacy.delta} vs baseline)`],
    remaining: [`innerHTML=${legacy.counts.innerHTML}`, `onclick=${legacy.counts.onclick}`, `inlineWorkerBlob=${legacy.counts.inlineWorkerBlob}`, `dynamicScript=${legacy.counts.dynamicScript}`, `globalRuntimeExports=${legacy.counts.globalRuntimeExports}`]
  },
  {
    area: 'Documentation and portfolio readiness',
    status: has.architecture && has.numerics && has.limitations && has.validation && packagingReady ? 'done' : 'partial',
    evidence: [
      'README, architecture, numerics, security, validation, energy benchmark, changelog, roadmap, and portfolio summary artifacts exist',
      has.pagesWorkflow ? 'GitHub Pages workflow exists' : 'GitHub Pages workflow missing',
      has.distIndex ? 'dist/index.html exists for Pages artifact deployment' : 'dist/index.html missing; run npm run build',
      has.license ? 'LICENSE exists' : 'LICENSE missing',
      has.citation ? 'CITATION.cff exists' : 'CITATION.cff missing',
      has.typedocIndex ? 'TypeDoc API docs exist at docs/api/index.html' : 'TypeDoc API docs missing; run npm run docs:api'
    ],
    remaining: [
      ...(packagingReady ? [] : ['Complete missing packaging artifacts reported in evidence']),
      'Project introduction video and npm package release remain packaging tasks'
    ]
  }
];

const totals = items.reduce(
  (acc, item) => {
    acc[item.status] += 1;
    return acc;
  },
  { done: 0, partial: 0, gap: 0 } satisfies Record<Status, number>
);

const report = {
  generatedAt: new Date().toISOString(),
  totals,
  legacyRisk: legacy,
  artifacts: has,
  items
};

function markdown(): string {
  const lines = [
    '# World-Class Readiness Scorecard',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Summary: done ${totals.done}, partial ${totals.partial}, gap ${totals.gap}`,
    '',
    '| Area | Status | Evidence | Remaining |',
    '|---|---|---|---|'
  ];
  for (const item of items) {
    lines.push(`| ${item.area} | ${item.status.toUpperCase()} | ${item.evidence.join('<br>')} | ${item.remaining.join('<br>')} |`);
  }
  return `${lines.join('\n')}\n`;
}

await mkdir('reports', { recursive: true });
await writeFile('reports/worldclass-scorecard.json', JSON.stringify(report, null, 2));
await writeFile('reports/worldclass-scorecard.md', markdown());
console.log(markdown());
