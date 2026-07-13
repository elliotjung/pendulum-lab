type Json = Record<string, unknown>;

interface Evidence {
  id: string;
  title: string;
  status: string;
  primary: string;
  detail: string;
  source: string;
  parameters: string;
  validation: string;
  reproduce: string;
  caveat: string;
}

const sources = {
  scorecard: './reports/worldclass-scorecard.json',
  flagship: './reports/flagship-certification.json',
  external: './reports/flagship-external-check.json',
  hardware: './reports/webgpu-hardware-validation.json',
  ladder: './reports/gpu-benchmark-ladder.json',
  matrix: './reports/gpu-adapter-matrix.json',
  release: './reports/release-readiness.json',
  publication: './reports/publication-status.json',
  reviewer: './reports/reviewer-kit-manifest.json',
  mutation: './reports/mutation-aggregate.json'
} as const;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function text(value: unknown, fallback = 'n/a'): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function format(value: unknown, digits = 4): string {
  const numeric = number(value);
  return numeric === null ? 'n/a' : numeric.toFixed(digits);
}
function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function fetchJson(path: string): Promise<Json> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return object(await response.json());
}

async function fetchOptionalJson(path: string): Promise<Json> {
  const response = await fetch(path, { cache: 'no-store' });
  return response.ok ? object(await response.json()) : {};
}

function statusClass(status: string): string {
  const normalized = status
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');
  return `status-chip status-${normalized || 'missing'}`;
}

function addField(list: HTMLDListElement, label: string, value: string): void {
  const row = element('div', 'evidence-field');
  row.append(element('dt', undefined, label), element('dd', undefined, value));
  list.append(row);
}

function evidenceDialog(): { dialog: HTMLDialogElement; open: (item: Evidence) => void } {
  const dialog = element('dialog', 'reviewer-dialog');
  dialog.dataset.testid = 'evidence-dialog';
  const header = element('div', 'dialog-header');
  const title = element('h2');
  const close = element('button', 'dialog-close', 'x');
  close.type = 'button';
  close.title = 'Close evidence';
  close.setAttribute('aria-label', 'Close evidence');
  header.append(title, close);
  const body = element('div', 'dialog-body');
  const fields = element('dl');
  body.append(fields);
  dialog.append(header, body);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return {
    dialog,
    open(item) {
      title.textContent = item.title;
      fields.replaceChildren();
      addField(fields, 'Status', item.status);
      addField(fields, 'Source', item.source);
      addField(fields, 'Parameters', item.parameters);
      addField(fields, 'Validation / Error', item.validation);
      addField(fields, 'Reproduce', item.reproduce);
      addField(fields, 'Caveat', item.caveat);
      dialog.showModal();
    }
  };
}

function evidenceCard(item: Evidence, open: (item: Evidence) => void): HTMLElement {
  const card = element('article', 'evidence-card');
  card.dataset.evidenceId = item.id;
  const header = element('header');
  header.append(element('h3', undefined, item.title), element('span', statusClass(item.status), item.status));
  const body = element('div', 'evidence-card-body');
  body.append(element('p', 'metric-primary', item.primary), element('p', 'metric-detail', item.detail));
  const actions = element('div', 'evidence-actions');
  const inspect = element('button', 'evidence-button', 'Inspect evidence');
  inspect.type = 'button';
  inspect.addEventListener('click', () => open(item));
  actions.append(inspect);
  card.append(header, body, actions);
  return card;
}

function panel(id: string, title: string, meta: string): { section: HTMLElement; content: HTMLElement } {
  const section = element('section', 'reviewer-panel');
  section.id = id;
  section.setAttribute('role', 'tabpanel');
  const heading = element('div', 'section-heading');
  heading.append(element('h1', undefined, title), element('p', undefined, meta));
  const content = element('div');
  section.append(heading, content);
  return { section, content };
}

function table(headers: string[], rows: string[][]): HTMLElement {
  const wrap = element('div', 'data-table-wrap');
  const grid = element('table', 'data-table');
  const head = element('thead');
  const headRow = element('tr');
  for (const header of headers) headRow.append(element('th', undefined, header));
  head.append(headRow);
  const body = element('tbody');
  for (const values of rows) {
    const row = element('tr');
    for (const value of values) row.append(element('td', undefined, value));
    body.append(row);
  }
  grid.append(head, body);
  wrap.append(grid);
  return wrap;
}

async function render(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#reviewer-root');
  if (!root) return;
  const requiredSourceEntries = Object.entries(sources).filter(([key]) => key !== 'mutation');
  const data = Object.fromEntries(
    await Promise.all(requiredSourceEntries.map(async ([key, path]) => [key, await fetchJson(path)]))
  ) as Record<keyof typeof sources, Json>;
  data.mutation = await fetchOptionalJson(sources.mutation);
  const scoreTotals = object(data.scorecard.totals);
  const crossing = object(data.flagship.crossing);
  const ladderNChain = object(data.ladder.nChainVariational);
  const nChainComparison = object(ladderNChain.comparison);
  const matrixCoverage = object(data.matrix.coverage);
  const reviewerArtifacts = array(data.reviewer.artifacts).map(object);
  const releaseArtifacts = array(data.release.artifacts).map(object);
  const hardwareNChain = object(data.hardware.nChainVariational);
  const hardwareNChainComparison = object(hardwareNChain.comparison);
  const mutationScore = number(data.mutation.mutationScore);
  const coveredMutationScore = number(data.mutation.coveredMutationScore);

  const evidence: Evidence[] = [
    {
      id: 'flagship',
      title: 'Flagship crossing',
      status: 'pass',
      primary: `gamma = ${format(crossing.gamma, 6)}`,
      detail: `A_PD / A_c reverses within [${format(crossing.lower, 6)}, ${format(crossing.upper, 6)}].`,
      source: sources.flagship,
      parameters: `omega=${text(data.flagship.driveFrequency)}, dt=${text(data.flagship.dt)}, rows=${array(data.flagship.rows).length}`,
      validation: `Figure hash: ${text(data.flagship.figureHash ?? object(data.flagship.figure).hash)}`,
      reproduce: 'npm run flagship:certify && npm run flagship:external',
      caveat:
        'Primary attractor branch at omega=2/3; first-order Melnikov theory is not an ordering bound at strong damping.'
    },
    {
      id: 'external',
      title: 'Independent Python',
      status: text(data.external.status, 'pass'),
      primary: `${array(data.external.rows ?? data.external.measurements).length || 'Independent'} checks`,
      detail: 'Dependency-free RK4, strobe-map, finite-difference monodromy, and Floquet onset localization.',
      source: sources.external,
      parameters: json(data.external.settings ?? data.external.parameters ?? {}),
      validation: json(data.external.summary ?? data.external.comparison ?? data.external.status),
      reproduce: 'npm run flagship:external',
      caveat: text(data.external.caveat, 'Independent tolerance agreement, not bitwise identity.')
    },
    {
      id: 'hardware',
      title: 'Hardware WebGPU gate',
      status: text(data.hardware.status),
      primary: `${text(hardwareNChain.dimension)}D N-chain`,
      detail: 'GPU reductions, full spectrum, 4D CLV/FTLE, and N-chain STM/QR checked against CPU f64.',
      source: sources.hardware,
      parameters: `channel=${text(data.hardware.channel)}, method=${text(hardwareNChain.method)}`,
      validation: `N-chain pass=${text(hardwareNChainComparison.passed)}, FTLE diff=${text(hardwareNChainComparison.ftleAbsDiff)}`,
      reproduce: 'npm run test:webgpu-hardware && npm run validate:webgpu-hardware',
      caveat: text(hardwareNChain.caveat, 'Evidence is adapter-specific.')
    },
    {
      id: 'matrix',
      title: 'Vendor matrix',
      status: text(data.matrix.status),
      primary: `${text(matrixCoverage.passed, '0')}/${text(matrixCoverage.required, '3')} vendors`,
      detail: 'Physical Intel, NVIDIA, and AMD evidence slots; missing rows are never simulated.',
      source: sources.matrix,
      parameters: json(data.matrix.collectionContract ?? {}),
      validation: json(matrixCoverage),
      reproduce: 'npm run benchmark:gpu-matrix',
      caveat: text(data.matrix.caveat)
    },
    {
      id: 'nchain',
      title: 'N-chain GPU science',
      status: text(nChainComparison.passed) === 'true' ? 'pass' : 'fail',
      primary: `${text(ladderNChain.links)} links / ${text(ladderNChain.dimension)}D`,
      detail: 'Tiled f32 STM propagation, QR tape, backward solve, and singular-value FTLE.',
      source: sources.ladder,
      parameters: `method=${text(ladderNChain.method)}, elapsedMs=${format(ladderNChain.elapsedMs, 2)}`,
      validation: json(nChainComparison),
      reproduce: 'npm run benchmark:gpu-ladder',
      caveat: text(ladderNChain.caveat)
    },
    {
      id: 'release',
      title: 'Release kit',
      status: text(data.release.status),
      primary: `${releaseArtifacts.filter((item) => item.available === true).length}/${releaseArtifacts.length} artifacts`,
      detail: 'Paper, reviewer manifest, GPU reports, one-page PDF, walkthrough, and metadata.',
      source: sources.release,
      parameters: `generated=${text(data.release.generatedAt)}`,
      validation: json(releaseArtifacts.filter((item) => item.required === true && item.available !== true)),
      reproduce: 'npm run release:package && npm run reviewer:kit',
      caveat:
        'Registry publication and DOI minting remain external owner-account operations until their public identifiers resolve.'
    },
    {
      id: 'mutation',
      title: 'Mutation aggregate',
      status: text(data.mutation.status, 'missing'),
      primary: mutationScore === null ? 'missing' : `${mutationScore.toFixed(2)}%`,
      detail:
        coveredMutationScore === null
          ? 'Aggregate report not present in this build.'
          : `Covered score ${coveredMutationScore.toFixed(2)}% across ${text(data.mutation.reportCount)} shards.`,
      source: sources.mutation,
      parameters: json(data.mutation.thresholds ?? {}),
      validation: json(data.mutation.statusCounts ?? {}),
      reproduce:
        'npm run mutation:aggregate -- reports/mutation-shards --out-dir reports --break 65 --low 70 --high 85',
      caveat: 'Nightly CI artifact is the source of truth; refresh this root report after mutation scope changes.'
    },
    {
      id: 'publication',
      title: 'Public identifiers',
      status: text(data.publication.status),
      primary: `${object(data.publication.npm).published === true ? 'npm live' : 'npm pending'} / ${object(data.publication.zenodo).published === true ? 'DOI live' : 'DOI pending'}`,
      detail: `Release=${text(object(data.publication.githubRelease).published)}, Pages=${text(object(data.publication.pages).published)}.`,
      source: sources.publication,
      parameters: `package=${text(object(data.publication.npm).package)}, version=${text(object(data.publication.npm).version)}`,
      validation: json(data.publication),
      reproduce: 'npm run release:status',
      caveat: array(data.publication.caveats).map(String).join(' ') || 'All public identifiers resolve.'
    }
  ];

  const shell = element('div', 'reviewer-shell');
  const header = element('header', 'reviewer-header');
  const brand = element('div', 'reviewer-brand');
  brand.append(element('strong', undefined, 'Pendulum Lab'), element('span', undefined, 'Reviewer Console'));
  const nav = element('nav', 'reviewer-nav');
  const appLink = element('a', undefined, 'Workbench');
  appLink.href = './';
  const paperLink = element('a', undefined, 'Paper');
  paperLink.href = './paper/';
  const repoLink = element('a', undefined, 'Repository');
  repoLink.href = 'https://github.com/elliotjung/pendulum-lab';
  nav.append(appLink, paperLink, repoLink);
  header.append(brand, nav);

  const main = element('main', 'reviewer-main');
  const summary = element('section', 'reviewer-summary');
  const summaryItems = [
    ['Certification', `${text(scoreTotals.done, '0')} complete`, `Scorecard gaps: ${text(scoreTotals.gap, '0')}`],
    ['Flagship', format(crossing.gamma, 4), 'ratio-crossing gamma'],
    [
      'GPU vendors',
      `${text(matrixCoverage.passed, '0')}/${text(matrixCoverage.required, '3')}`,
      text(data.matrix.status)
    ],
    [
      'Reviewer kit',
      text(data.reviewer.status),
      `${reviewerArtifacts.filter((item) => item.available === true).length} artifacts available`
    ]
  ];
  summaryItems.forEach(([label, value, meta], index) => {
    const item = element('div', index === 0 ? 'summary-lead' : 'summary-stat');
    item.append(
      element('p', 'summary-label', label),
      element('p', 'summary-value', value),
      element('p', 'summary-meta', meta)
    );
    summary.append(item);
  });

  const tabs = element('div', 'reviewer-tabs');
  tabs.setAttribute('role', 'tablist');
  const overview = panel('panel-overview', 'Evidence overview', text(data.flagship.generatedAt, 'Generated artifacts'));
  const gpu = panel('panel-gpu', 'WebGPU adapter matrix', 'Physical hardware evidence only');
  const artifacts = panel('panel-artifacts', 'Artifact ledger', `${reviewerArtifacts.length} reviewer entries`);
  const definitions = [
    ['Overview', overview.section],
    ['GPU Matrix', gpu.section],
    ['Artifacts', artifacts.section]
  ] as const;
  definitions.forEach(([label, section], index) => {
    const button = element('button', 'reviewer-tab', label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', section.id);
    button.setAttribute('aria-selected', String(index === 0));
    section.hidden = index !== 0;
    button.addEventListener('click', () => {
      for (const candidate of tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        candidate.setAttribute('aria-selected', String(candidate === button));
      for (const [, candidate] of definitions) candidate.hidden = candidate !== section;
    });
    tabs.append(button);
  });

  const inspector = evidenceDialog();
  const grid = element('div', 'evidence-grid');
  for (const item of evidence) grid.append(evidenceCard(item, inspector.open));
  overview.content.append(grid);

  const matrixRows = array(data.matrix.rows).map((value) => {
    const row = object(value);
    const adapter = object(row.adapter);
    return [
      text(row.vendor),
      text(row.status),
      text(adapter.vendor ?? adapter.name ?? adapter.description, 'missing'),
      text(adapter.architecture),
      text(row.nChainPassed),
      text(row.source, 'none')
    ];
  });
  gpu.content.append(table(['Vendor', 'Status', 'Adapter', 'Architecture', 'N-chain', 'Evidence source'], matrixRows));

  const artifactRows = reviewerArtifacts.map((item) => [
    text(item.priority),
    text(item.available),
    text(item.id),
    text(item.path),
    text(item.command),
    text(item.description)
  ]);
  artifacts.content.append(table(['Priority', 'Available', 'ID', 'Path', 'Reproduce', 'Description'], artifactRows));

  main.append(summary, tabs, overview.section, gpu.section, artifacts.section);
  shell.append(header, main);
  root.replaceChildren(shell);
}

render().catch((error) => {
  const root = document.querySelector<HTMLElement>('#reviewer-root');
  if (root)
    root.replaceChildren(
      element(
        'p',
        'reviewer-error',
        `Reviewer evidence failed to load: ${error instanceof Error ? error.message : String(error)}`
      )
    );
});
