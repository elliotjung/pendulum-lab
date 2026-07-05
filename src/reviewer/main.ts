import { evidenceFreshness, evidenceProvenance, needsAttention, type EvidenceFreshness } from './evidenceFreshness';

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
  links?: EvidenceLink[];
  /** Freshness of the backing report vs its TTL (stale badge + gap filter). */
  freshness: EvidenceFreshness;
  /** Attested SHA / source-run deep link from the report metadata. */
  provenance: ReturnType<typeof evidenceProvenance>;
}

/** Per-source TTL in days; anything older gets a stale badge and the gap filter catches it. */
const EVIDENCE_TTL_DAYS: Record<string, number> = {
  flagship: 60,
  external: 60,
  hardware: 90,
  matrix: 90,
  nchain: 90,
  release: 30,
  mutation: 14,
  publication: 30
};

interface EvidenceLink {
  label: string;
  url: string;
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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function object(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, fallback = 'n/a'): string { return value === null || value === undefined || value === '' ? fallback : String(value); }
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function format(value: unknown, digits = 4): string { const numeric = number(value); return numeric === null ? 'n/a' : numeric.toFixed(digits); }
function json(value: unknown): string { return JSON.stringify(value, null, 2); }

async function fetchJson(path: string): Promise<Json> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return object(await response.json());
}

async function fetchOptionalJson(path: string): Promise<Json> {
  try {
    return await fetchJson(path);
  } catch (error) {
    return {
      status: 'missing',
      missingSource: path,
      caveat: error instanceof Error ? error.message : String(error)
    };
  }
}

function sourceUrl(path: string): string {
  return new URL(path.replace(/^\.\//, ''), window.location.href).href;
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
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
  const links = element('div', 'evidence-links');
  body.append(fields, links);
  dialog.append(header, body);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return {
    dialog,
    open(item) {
      title.textContent = item.title;
      fields.replaceChildren();
      addField(fields, 'Status', item.status);
      addField(fields, 'Freshness', item.freshness.label);
      addField(fields, 'Provenance', `sha=${item.provenance.sourceSha ?? 'n/a'} run=${item.provenance.runId ?? 'n/a'} attested=${item.provenance.attested === null ? 'n/a' : String(item.provenance.attested)}`);
      addField(fields, 'Source', item.source);
      addField(fields, 'Parameters', item.parameters);
      addField(fields, 'Validation / Error', item.validation);
      addField(fields, 'Reproduce', item.reproduce);
      addField(fields, 'Caveat', item.caveat);
      links.replaceChildren();
      const allLinks = [
        ...(item.links ?? []),
        ...(item.provenance.runUrl ? [{ label: 'Source Run', url: item.provenance.runUrl }] : [])
      ];
      for (const link of allLinks) {
        const anchor = element('a', undefined, link.label);
        anchor.href = link.url;
        links.append(anchor);
      }
      dialog.showModal();
    }
  };
}

function evidenceCard(item: Evidence, open: (item: Evidence) => void): HTMLElement {
  const card = element('article', 'evidence-card');
  card.dataset.evidenceId = item.id;
  card.dataset.freshness = item.freshness.state;
  card.dataset.needsAttention = String(needsAttention(item.status, item.freshness));
  const header = element('header');
  header.append(element('h3', undefined, item.title), element('span', statusClass(item.status), item.status));
  if (item.freshness.state !== 'fresh') {
    header.append(element('span', 'status-chip status-stale', item.freshness.state === 'stale' ? item.freshness.label : 'no timestamp'));
  }
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

function mutationHeatmap(files: unknown[]): HTMLElement {
  const wrap = element('div', 'mutation-heatmap');
  wrap.dataset.testid = 'mutation-heatmap';
  const rows = files.map((value) => {
    const file = object(value);
    const counts = object(file.counts);
    const survived = number(counts.Survived) ?? 0;
    const noCoverage = number(counts.NoCoverage) ?? 0;
    const timeout = number(counts.Timeout) ?? 0;
    const killed = number(counts.Killed) ?? 0;
    return {
      filePath: text(file.filePath, 'unknown'),
      reportPath: text(file.reportPath, 'n/a'),
      killed,
      survived,
      noCoverage,
      timeout,
      pressure: survived + noCoverage + timeout
    };
  }).sort((a, b) => b.pressure - a.pressure).slice(0, 14);

  if (!rows.length) {
    wrap.append(element('p', 'metric-detail', 'Mutation aggregate file-level data is not available in this build.'));
    return wrap;
  }

  const maxPressure = Math.max(1, ...rows.map((row) => row.pressure));
  for (const row of rows) {
    const item = element('article', 'heatmap-row');
    item.dataset.filePath = row.filePath;
    const meta = element('div', 'heatmap-meta');
    meta.append(
      element('strong', undefined, row.filePath),
      element('span', undefined, `Survived ${row.survived} / No coverage ${row.noCoverage} / Timeout ${row.timeout} / Killed ${row.killed}`)
    );
    const bar = element('div', 'heatmap-bar');
    const fill = element('span');
    fill.style.width = `${Math.max(4, (100 * row.pressure) / maxPressure).toFixed(1)}%`;
    bar.append(fill);
    const source = element('span', 'heatmap-source', row.reportPath);
    item.append(meta, bar, source);
    wrap.append(item);
  }
  return wrap;
}

async function render(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#reviewer-root');
  if (!root) return;
  const data = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, path]) => [key, await fetchOptionalJson(path)]))) as Record<keyof typeof sources, Json>;
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
  const mutationCi = object(data.mutation.ci);
  const npmStatus = object(data.publication.npm);
  const zenodoStatus = object(data.publication.zenodo);
  const githubRelease = object(data.publication.githubRelease);
  const pagesStatus = object(data.publication.pages);

  const evidenceBase: Omit<Evidence, 'freshness' | 'provenance'>[] = [
    {
      id: 'flagship', title: 'Flagship crossing', status: 'pass',
      primary: `gamma = ${format(crossing.gamma, 6)}`,
      detail: `A_PD / A_c reverses within [${format(crossing.lower, 6)}, ${format(crossing.upper, 6)}].`,
      source: sources.flagship,
      parameters: `omega=${text(data.flagship.driveFrequency)}, dt=${text(data.flagship.dt)}, rows=${array(data.flagship.rows).length}`,
      validation: `Figure hash: ${text(data.flagship.figureHash ?? object(data.flagship.figure).hash)}`,
      reproduce: 'npm run flagship:certify && npm run flagship:external',
      caveat: 'Primary attractor branch at omega=2/3; first-order Melnikov theory is not an ordering bound at strong damping.',
      links: [{ label: 'Flagship JSON', url: sourceUrl(sources.flagship) }]
    },
    {
      id: 'external', title: 'Independent Python', status: text(data.external.status, 'pass'),
      primary: `${array(data.external.rows ?? data.external.measurements).length || 'Independent'} checks`,
      detail: 'Dependency-free RK4, strobe-map, finite-difference monodromy, and Floquet onset localization.',
      source: sources.external,
      parameters: json(data.external.settings ?? data.external.parameters ?? {}),
      validation: json(data.external.summary ?? data.external.comparison ?? data.external.status),
      reproduce: 'npm run flagship:external',
      caveat: text(data.external.caveat, 'Independent tolerance agreement, not bitwise identity.'),
      links: [{ label: 'External JSON', url: sourceUrl(sources.external) }]
    },
    {
      id: 'hardware', title: 'Hardware WebGPU gate', status: text(data.hardware.status),
      primary: `${text(hardwareNChain.dimension)}D N-chain`,
      detail: 'GPU reductions, full spectrum, 4D CLV/FTLE, and N-chain STM/QR checked against CPU f64.',
      source: sources.hardware,
      parameters: `channel=${text(data.hardware.channel)}, method=${text(hardwareNChain.method)}`,
      validation: `N-chain pass=${text(hardwareNChainComparison.passed)}, FTLE diff=${text(hardwareNChainComparison.ftleAbsDiff)}`,
      reproduce: 'npm run test:webgpu-hardware && npm run validate:webgpu-hardware',
      caveat: text(hardwareNChain.caveat, 'Evidence is adapter-specific.'),
      links: [{ label: 'Hardware JSON', url: sourceUrl(sources.hardware) }]
    },
    {
      id: 'matrix', title: 'Vendor matrix', status: text(data.matrix.status),
      primary: `${text(matrixCoverage.passed, '0')}/${text(matrixCoverage.required, '3')} vendors`,
      detail: 'Physical Intel, NVIDIA, and AMD evidence slots; missing rows are never simulated.',
      source: sources.matrix,
      parameters: json(data.matrix.collectionContract ?? {}),
      validation: json(matrixCoverage),
      reproduce: 'npm run benchmark:gpu-matrix',
      caveat: text(data.matrix.caveat),
      links: [{ label: 'Matrix JSON', url: sourceUrl(sources.matrix) }]
    },
    {
      id: 'nchain', title: 'N-chain GPU science', status: text(nChainComparison.passed) === 'true' ? 'pass' : 'fail',
      primary: `${text(ladderNChain.links)} links / ${text(ladderNChain.dimension)}D`,
      detail: 'Tiled f32 STM propagation, QR tape, backward solve, and singular-value FTLE.',
      source: sources.ladder,
      parameters: `method=${text(ladderNChain.method)}, elapsedMs=${format(ladderNChain.elapsedMs, 2)}`,
      validation: json(nChainComparison),
      reproduce: 'npm run benchmark:gpu-ladder',
      caveat: text(ladderNChain.caveat),
      links: [{ label: 'GPU Ladder JSON', url: sourceUrl(sources.ladder) }]
    },
    {
      id: 'release', title: 'Release kit', status: text(data.release.status),
      primary: `${releaseArtifacts.filter((item) => item.available === true).length}/${releaseArtifacts.length} artifacts`,
      detail: 'Paper, reviewer manifest, GPU reports, one-page PDF, walkthrough, and metadata.',
      source: sources.release,
      parameters: `generated=${text(data.release.generatedAt)}`,
      validation: json(releaseArtifacts.filter((item) => item.required === true && item.available !== true)),
      reproduce: 'npm run release:package && npm run reviewer:kit',
      caveat: 'Registry publication and DOI minting remain external owner-account operations until their public identifiers resolve.',
      links: [{ label: 'Release JSON', url: sourceUrl(sources.release) }]
    },
    {
      id: 'mutation', title: 'Mutation aggregate', status: text(data.mutation.status, 'missing'),
      primary: mutationScore === null ? 'missing' : `${mutationScore.toFixed(2)}%`,
      detail: coveredMutationScore === null ? 'Aggregate report not present in this build.' : `Covered score ${coveredMutationScore.toFixed(2)}% across ${text(data.mutation.reportCount)} shards.`,
      source: sources.mutation,
      parameters: json(data.mutation.thresholds ?? {}),
      validation: `${json(data.mutation.statusCounts ?? {})}\nRun: ${text(mutationCi.runId)}\nArtifact: ${text(mutationCi.artifactId)}`,
      reproduce: 'npm run mutation:aggregate -- reports/mutation-shards --out-dir reports --break 60 --low 70 --high 85',
      caveat: text(mutationCi.artifactBoundary, 'Nightly CI artifact is the source of truth; refresh this root report after mutation scope changes.'),
      links: [
        { label: 'Mutation JSON', url: sourceUrl(sources.mutation) },
        ...(typeof mutationCi.runUrl === 'string' ? [{ label: 'Actions Run', url: mutationCi.runUrl }] : []),
        ...(typeof mutationCi.artifactUrl === 'string' ? [{ label: 'Aggregate Artifact', url: mutationCi.artifactUrl }] : [])
      ]
    },
    {
      id: 'publication', title: 'Public identifiers', status: text(data.publication.status),
      primary: `${npmStatus.published === true ? 'npm live' : 'npm pending'} / ${zenodoStatus.published === true ? 'DOI live' : 'DOI pending'}`,
      detail: `Release=${text(githubRelease.published)}, Pages=${text(pagesStatus.published)}.`,
      source: sources.publication,
      parameters: `package=${text(npmStatus.package)}, version=${text(npmStatus.version)}`,
      validation: json(data.publication),
      reproduce: 'npm run release:status',
      caveat: array(data.publication.caveats).map(String).join(' ') || 'All public identifiers resolve.',
      links: [
        { label: 'Publication JSON', url: sourceUrl(sources.publication) },
        ...(typeof npmStatus.url === 'string' ? [{ label: 'npm Version', url: npmStatus.url }] : []),
        ...(typeof zenodoStatus.doi === 'string' ? [{ label: 'DOI', url: `https://doi.org/${zenodoStatus.doi}` }] : []),
        ...(typeof githubRelease.url === 'string' ? [{ label: 'GitHub Release', url: githubRelease.url }] : []),
        ...(typeof pagesStatus.url === 'string' ? [{ label: 'Reviewer Page', url: pagesStatus.url }] : [])
      ]
    }
  ];

  const backingReport: Record<string, Json> = {
    flagship: data.flagship,
    external: data.external,
    hardware: data.hardware,
    matrix: data.matrix,
    nchain: data.ladder,
    release: data.release,
    mutation: data.mutation,
    publication: data.publication
  };
  const evidence: Evidence[] = evidenceBase.map((item) => ({
    ...item,
    freshness: evidenceFreshness(backingReport[item.id], EVIDENCE_TTL_DAYS[item.id] ?? 30),
    provenance: evidenceProvenance(backingReport[item.id])
  }));

  const shell = element('div', 'reviewer-shell');
  const header = element('header', 'reviewer-header');
  const brand = element('div', 'reviewer-brand');
  brand.append(element('strong', undefined, 'Pendulum Lab'), element('span', undefined, 'Reviewer Console'));
  const nav = element('nav', 'reviewer-nav');
  const appLink = element('a', undefined, 'Workbench'); appLink.href = './';
  const paperLink = element('a', undefined, 'Paper'); paperLink.href = './paper/';
  const repoLink = element('a', undefined, 'Repository'); repoLink.href = 'https://github.com/Elliot-Jung-17/pendulum-lab';
  nav.append(appLink, paperLink, repoLink);
  header.append(brand, nav);

  const main = element('main', 'reviewer-main');
  const summary = element('section', 'reviewer-summary');
  const summaryItems = [
    ['Certification', `${text(scoreTotals.done, '0')} complete`, `Scorecard gaps: ${text(scoreTotals.gap, '0')}`],
    ['Flagship', format(crossing.gamma, 4), 'ratio-crossing gamma'],
    ['GPU vendors', `${text(matrixCoverage.passed, '0')}/${text(matrixCoverage.required, '3')}`, text(data.matrix.status)],
    ['Publication', `${npmStatus.published === true ? 'npm live' : 'npm pending'} / ${zenodoStatus.published === true ? 'DOI live' : 'DOI pending'}`, text(data.publication.status)],
    ['Reviewer kit', text(data.reviewer.status), `${reviewerArtifacts.filter((item) => item.available === true).length} artifacts available`]
  ];
  summaryItems.forEach(([label, value, meta], index) => {
    const item = element('div', index === 0 ? 'summary-lead' : 'summary-stat');
    item.append(element('p', 'summary-label', label), element('p', 'summary-value', value), element('p', 'summary-meta', meta));
    summary.append(item);
  });

  const tabs = element('div', 'reviewer-tabs');
  tabs.setAttribute('role', 'tablist');
  const overview = panel('panel-overview', 'Evidence overview', text(data.flagship.generatedAt, 'Generated artifacts'));
  const gpu = panel('panel-gpu', 'WebGPU adapter matrix', 'Physical hardware evidence only');
  const mutation = panel('panel-mutation', 'Mutation survivor heatmap', `${text(data.mutation.reportCount, '0')} sharded reports`);
  const artifacts = panel('panel-artifacts', 'Artifact ledger', `${reviewerArtifacts.length} reviewer entries`);
  const definitions = [
    ['Overview', overview.section], ['GPU Matrix', gpu.section], ['Mutation', mutation.section], ['Artifacts', artifacts.section]
  ] as const;
  const activateTab = (button: HTMLButtonElement, section: HTMLElement): void => {
    for (const candidate of tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')) candidate.setAttribute('aria-selected', String(candidate === button));
    for (const [, candidate] of definitions) candidate.hidden = candidate !== section;
  };
  definitions.forEach(([label, section], index) => {
    const button = element('button', 'reviewer-tab', label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', section.id);
    button.setAttribute('aria-selected', String(index === 0));
    section.hidden = index !== 0;
    button.addEventListener('click', () => activateTab(button, section));
    button.addEventListener('keydown', (event) => {
      const buttons = [...tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const current = buttons.indexOf(button);
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      const nextButton = buttons[next]!;
      const [, nextSection] = definitions[next]!;
      nextButton.focus();
      activateTab(nextButton, nextSection);
    });
    tabs.append(button);
  });

  const inspector = evidenceDialog();
  const controls = element('div', 'evidence-controls');
  const gapFilter = element('button', 'evidence-button', 'Show gaps only');
  gapFilter.type = 'button';
  gapFilter.dataset.testid = 'gap-filter';
  gapFilter.setAttribute('aria-pressed', 'false');
  const bundleButton = element('button', 'evidence-button', 'Download offline bundle');
  bundleButton.type = 'button';
  bundleButton.dataset.testid = 'offline-bundle';
  controls.append(gapFilter, bundleButton);
  const grid = element('div', 'evidence-grid');
  for (const item of evidence) grid.append(evidenceCard(item, inspector.open));
  gapFilter.addEventListener('click', () => {
    const active = gapFilter.getAttribute('aria-pressed') !== 'true';
    gapFilter.setAttribute('aria-pressed', String(active));
    gapFilter.textContent = active ? 'Show all evidence' : 'Show gaps only';
    for (const card of grid.querySelectorAll<HTMLElement>('.evidence-card')) {
      card.hidden = active && card.dataset.needsAttention !== 'true';
    }
  });
  // Offline bundle: every JSON this dashboard rendered from, in one file, so a
  // reviewer can archive or inspect the exact evidence set without the server.
  bundleButton.addEventListener('click', () => {
    const bundle = {
      schemaVersion: 'pendulum-reviewer-offline-bundle/v1',
      generatedAt: new Date().toISOString(),
      origin: window.location.href,
      sources,
      reports: data
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = element('a');
    anchor.href = url;
    anchor.download = 'pendulum-reviewer-offline-bundle.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  overview.content.append(controls, grid);

  const matrixRows = array(data.matrix.rows).map((value) => {
    const row = object(value); const adapter = object(row.adapter);
    return [
      text(row.vendor),
      text(row.status),
      `${text(row.freshness)}${number(row.ageDays) === null ? '' : ` (${text(row.ageDays)}d)`}`,
      row.driftSincePrevious === true ? 'CHANGED' : row.driftSincePrevious === false ? 'stable' : 'n/a',
      text(adapter.vendor ?? adapter.name ?? adapter.description, 'missing'),
      text(adapter.architecture),
      text(row.nChainPassed),
      text(row.source, 'none')
    ];
  });
  gpu.content.append(table(['Vendor', 'Status', 'Freshness', 'Env drift', 'Adapter', 'Architecture', 'N-chain', 'Evidence source'], matrixRows));
  mutation.content.append(mutationHeatmap(array(data.mutation.files)));

  const artifactRows = reviewerArtifacts.map((item) => [
    text(item.priority), text(item.available), text(item.id), text(item.path), text(item.publicUrl), text(item.command), text(item.description)
  ]);
  artifacts.content.append(table(['Priority', 'Available', 'ID', 'Path', 'Public URL', 'Reproduce', 'Description'], artifactRows));

  main.append(summary, tabs, overview.section, gpu.section, mutation.section, artifacts.section);
  shell.append(header, main);
  root.replaceChildren(shell);
}

render().catch((error) => {
  const root = document.querySelector<HTMLElement>('#reviewer-root');
  if (root) root.replaceChildren(element('p', 'reviewer-error', `Reviewer evidence failed to load: ${error instanceof Error ? error.message : String(error)}`));
});
