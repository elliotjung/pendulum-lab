import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildZip, checksumEntriesSha256, parseZip, textToBytes } from '../../src/research/zipBundle';
import { openModernTab } from '../shell';
import { researchNativeAttachment, researchVisualPackage } from './research-project-fixtures';

const projectName = 'Short double pendulum study';
const question = 'Can the original five recorded samples regenerate a figure without rerunning physics?';

async function open(page: Page) {
  await page.goto('/next.html#/lab/double');
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#research-project-workflow > summary').click();
  await expect(page.locator('#project-title')).toBeVisible();
}

async function record(page: Page, duration = '0.04') {
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  await page.getByLabel('관찰 시간 · duration (s)', { exact: true }).fill(duration);
  await page.getByText('상세 조건 펼치기', { exact: true }).click();
  await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill('0.01');
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
  await page.getByRole('tab', { name: '분석', exact: true }).click();
}

async function makeProject(page: Page) {
  await page.locator('#project-title').fill(projectName);
  await page.locator('#project-description').fill(question);
  await page.getByRole('button', { name: '연구 프로젝트 만들기', exact: true }).click();
  await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'ready');
}

async function capture(page: Page) {
  await page.locator('#project-session-title').fill('Replicate B');
  await page.getByRole('button', { name: '세션 추가', exact: true }).click();
  await page.locator('#project-session-select').selectOption({ label: 'Replicate B' });
  await page.locator('#project-run-label').fill('Recorded run A');
  await page.getByRole('button', { name: '현재 기록을 연구 run으로 보존', exact: true }).click();
  await expect(page.locator('#project-run-list')).toContainText('Recorded run A');
  await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'ready');
}

async function compose(page: Page) {
  const source = page.locator('#project-figure-source');
  const artifactId = await source.locator('option').evaluateAll((options) => {
    const option = options.find((node) => (node as HTMLOptionElement).value !== '') as HTMLOptionElement | undefined;
    return option?.value;
  });
  expect(artifactId).toBeTruthy();
  await source.selectOption(artifactId!);
  await page.locator('#project-notebook-title').fill('Recorded observation');
  await page
    .locator('#project-notebook-text')
    .fill('These values are preserved observations from the existing engine.');
  await page.locator('#project-notebook-refs').fill(artifactId!);
  await page.getByRole('button', { name: '노트북 문단 저장', exact: true }).click();
  await page.locator('#project-citation-text').fill('S24 automated test fixture reference');
  await page.locator('#project-citation-url').fill('https://example.org/reference');
  await page.getByRole('button', { name: '참고문헌 추가', exact: true }).click();
  await page.locator('#project-figure-title').fill('Recorded theta1');
  await page.locator('#project-figure-caption').fill('Exact samples with angular units; no interpolation.');
  await page.locator('#project-figure-x').selectOption('-1');
  await page.locator('#project-figure-y').selectOption('0');
  await page.locator('#project-figure-theme').selectOption('print');
  await page.getByRole('button', { name: '출처를 연결해 그림 저장', exact: true }).click();
  await expect(page.locator('#project-figure-list')).toContainText('Recorded theta1');
  await expect(page.locator('#project-figure-list img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
}

async function download(page: Page, label = '재현 ZIP 다운로드') {
  const started = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const downloaded = await started;
  expect(await downloaded.failure()).toBeNull();
  return readFile((await downloaded.path())!);
}

async function upload(page: Page, bytes: Uint8Array, name = 'study.zip') {
  await page
    .locator('#project-zip-import')
    .setInputFiles({ name, mimeType: 'application/zip', buffer: Buffer.from(bytes) });
}

function projectFromZip(bytes: Uint8Array) {
  const entries = parseZip(bytes);
  const project = JSON.parse(
    new TextDecoder().decode(entries.find((entry) => entry.path === 'manifest/project.json')!.data)
  );
  return { entries, project };
}

async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(
    result.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S24 research project and reproducible package', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const found: string[] = [];
    errors.set(page, found);
    page.on('pageerror', (error) => found.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') found.push(message.text());
    });
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

  test('captures real runs, composes a sourced figure and exports independently checked raw bytes', async ({
    page
  }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await compose(page);
    const zip = await download(page);
    const { entries, project } = projectFromZip(zip);
    expect(project.title).toBe(projectName);
    expect(project.description).toBe(question);
    expect(project.sessions.map((session: { title: string }) => session.title)).toContain('Replicate B');
    expect(project.runs).toHaveLength(1);
    expect(project.runs[0].experiment.systemId).toBe('system:double');
    expect(project.runs[0].experiment.runtime.step).toEqual({ value: 0.01, unit: 's' });
    expect(project.runs[0].experiment.runtime.duration).toEqual({ value: 0.04, unit: 's' });
    for (const artifact of project.artifacts) {
      const data = entries.find((entry) => entry.path === artifact.path)!.data;
      expect(data.byteLength).toBe(artifact.bytes);
      expect(createHash('sha256').update(data).digest('hex')).toBe(artifact.sha256);
    }
    const checksums = JSON.parse(
      new TextDecoder().decode(entries.find((entry) => entry.path === 'manifest/checksums.json')!.data)
    );
    expect(checksums.schemaVersion).toBe('pendulum-bundle-checksums/v2');
    expect(checksums.files.map((entry: { path: string }) => entry.path).sort()).toEqual(
      entries
        .filter((entry) => entry.path !== 'manifest/checksums.json')
        .map((entry) => entry.path)
        .sort()
    );
    for (const entry of checksums.files) {
      const data = entries.find((candidate) => candidate.path === entry.path)!.data;
      expect(entry.bytes).toBe(data.byteLength);
      expect(entry.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    }
    const seriesArtifact = project.artifacts.find((artifact: { kind: string }) => artifact.kind === 'series');
    const series = JSON.parse(
      new TextDecoder().decode(entries.find((entry) => entry.path === seriesArtifact.path)!.data)
    );
    expect(series.series.times).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
    expect(series.series.units).toEqual(['rad', 'rad', 'rad/s', 'rad/s']);
    expect(project.figures[0].sourceArtifactId).toBe(seriesArtifact.id);
    expect(project.figures[0].runId).toBe(project.runs[0].id);
    expect(project.notebook[0].artifactIds).toEqual([seriesArtifact.id]);
    expect(entries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['report.md', 'notebook.json', 'reviewer.html', 'manifest/checksums.json'])
    );
    expect((await download(page, '연구 보고서 다운로드')).toString('utf8')).toContain('Recorded observation');
    expect(JSON.parse((await download(page, '노트북 JSON 다운로드')).toString('utf8')).blocks[0].text).toContain(
      'preserved observations'
    );
    expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0.04');
    await audit(page);
  });

  test('a fresh browser opens the verified ZIP only after preview and preserves its source identity', async ({
    page,
    browser
  }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await compose(page);
    const originalBytes = await download(page);
    const original = projectFromZip(originalBytes);
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const fresh = await context.newPage();
    try {
      await open(fresh);
      await upload(fresh, originalBytes);
      await expect(fresh.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'preview');
      await expect(fresh.locator('#project-preview')).toContainText(projectName);
      await expect(fresh.locator('#project-run-list')).not.toContainText('Recorded run A');
      await fresh.getByRole('button', { name: '검증 미리보기 채택', exact: true }).click();
      await expect(fresh.locator('#project-run-list')).toContainText('Recorded run A');
      const restored = projectFromZip(await download(fresh));
      expect(restored.project).toEqual(original.project);
      for (const artifact of original.project.artifacts) {
        expect(restored.entries.find((entry) => entry.path === artifact.path)!.data).toEqual(
          original.entries.find((entry) => entry.path === artifact.path)!.data
        );
      }
      expect(await fresh.locator('#lab-time').getAttribute('data-time')).toBe('0');
      await audit(fresh);
    } finally {
      await context.close();
    }
  });

  test('one project keeps distinct double and compound runs across library navigation', async ({ page }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.getByRole('link', { name: '균일 막대 복합 이중 진자 선택하고 설정하기', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('균일 막대 복합 이중 진자');
    await record(page);
    await page.locator('#research-project-workflow > summary').click();
    await expect(page.locator('#project-summary-title')).toHaveText(projectName);
    await expect(page.locator('#project-run-list')).toContainText('Recorded run A');
    await page.locator('#project-run-label').fill('Recorded compound B');
    await page.getByRole('button', { name: '현재 기록을 연구 run으로 보존', exact: true }).click();
    await expect(page.locator('#project-run-list')).toContainText('Recorded compound B');
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.getByRole('link', { name: '점질량 이중 진자 선택하고 설정하기', exact: true }).click();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#research-project-workflow > summary').click();
    await expect(page.locator('#project-summary-title')).toHaveText(projectName);
    await expect(page.locator('#project-run-list')).toContainText('Recorded run A');
    await expect(page.locator('#project-run-list')).toContainText('Recorded compound B');
    const { entries, project } = projectFromZip(await download(page));
    expect(project.runs).toHaveLength(2);
    expect(project.runs.map((run: { experiment: { systemId: string } }) => run.experiment.systemId)).toEqual([
      'system:double',
      'system:compound-double'
    ]);
    expect(project.artifacts).toHaveLength(4);
    for (const artifact of project.artifacts.filter((item: { kind: string }) => item.kind === 'series')) {
      const source = JSON.parse(new TextDecoder().decode(entries.find((entry) => entry.path === artifact.path)!.data));
      expect(source.series.times).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
      expect(source.series.units).toEqual(['rad', 'rad', 'rad/s', 'rad/s']);
      expect(source.experiment.systemId).toBe(
        project.runs.find((run: { id: string }) => run.id === artifact.runId).experiment.systemId
      );
    }
    expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0.04');
  });

  test('real legacy research export opens through the compatibility adapter without losing any original member', async ({
    page
  }) => {
    await page.goto('/app.html');
    await openModernTab(page, 'research', '#researchWorkbench');
    const started = page.waitForEvent('download');
    await page.locator('#rwExportBundleZip').click();
    const originalDownload = await started;
    expect(await originalDownload.failure()).toBeNull();
    expect(originalDownload.suggestedFilename()).toBe('pendulum_research_bundle.zip');
    const originalBytes = new Uint8Array(await readFile((await originalDownload.path())!));
    const originalMembers = parseZip(originalBytes);
    expect(originalMembers.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        'manifest/submission.json',
        'manifest/provenance.json',
        'manifest/checksums.json',
        'paper/paper-pack.json',
        'paper/notebook.ipynb',
        'figures/figure-manifest.json'
      ])
    );
    expect(originalMembers.some((entry) => entry.path.endsWith('.png'))).toBe(true);
    await open(page);
    await upload(page, originalBytes, 'pendulum_research_bundle.zip');
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'preview');
    await expect(page.locator('#project-preview')).toContainText('가져온 기존 연구 ZIP');
    await expect(page.locator('#project-preview')).toContainText(/canonical migration.*수행하지 않았습니다/);
    await page.getByRole('button', { name: '검증 미리보기 채택', exact: true }).click();
    const { entries, project } = projectFromZip(await download(page));
    expect(project.runs).toHaveLength(1);
    expect(project.runs[0].status).toBe('partial');
    expect(project.runs[0].experiment).toBeUndefined();
    const original = project.artifacts.find((artifact: { kind: string }) => artifact.kind === 'legacy');
    expect(entries.find((entry) => entry.path === original.path)!.data).toEqual(originalBytes);
    expect(original.sha256).toBe(createHash('sha256').update(originalBytes).digest('hex'));
    expect(project.artifacts).toHaveLength(originalMembers.length + 1);
    for (const member of originalMembers) {
      const preserved = project.artifacts.find((artifact: { note: string }) =>
        artifact.note.startsWith(`기존 archive 멤버 ${member.path}.`)
      );
      expect(preserved).toBeTruthy();
      expect(preserved.parentIds).toEqual([original.id]);
      expect(preserved.bytes).toBe(member.data.byteLength);
      expect(preserved.sha256).toBe(createHash('sha256').update(member.data).digest('hex'));
      expect(entries.find((entry) => entry.path === preserved.path)!.data).toEqual(member.data);
    }
    await expect(page.locator('#project-artifact-list')).toContainText('legacy-research.zip');
    await audit(page);
  });

  test('an existing native analysis artifact joins the same run with its exact original bytes and lineage', async ({
    page
  }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await page.locator('#core-diagnostics > summary').click();
    await page.locator('#core-diagnostic-kind').selectOption('state-time');
    await page.getByRole('button', { name: '핵심 진단 계산', exact: true }).click();
    await expect(page.locator('#core-diagnostics')).toHaveAttribute('data-core-diagnostic-status', 'completed');
    const artifactBytes = await download(page, '진단 artifact JSON 다운로드');
    const native = JSON.parse(artifactBytes.toString('utf8'));
    await page.locator('#project-artifact-import').setInputFiles({
      name: 'native-state-time.json',
      mimeType: 'application/json',
      buffer: artifactBytes
    });
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'ready');
    await expect(page.locator('#project-artifact-list')).toContainText('native-state-time.json');
    const { entries, project } = projectFromZip(await download(page));
    const imported = project.artifacts.find(
      (artifact: { filename: string }) => artifact.filename === 'native-state-time.json'
    );
    expect(imported.kind).toBe('core');
    expect(imported.schema).toBe(native.schema);
    expect(imported.nativeId).toBe(native.artifactId);
    expect(imported.nativeInputRunId).toBe(native.inputRunId);
    expect(imported.runId).toBe(project.runs[0].id);
    expect(Buffer.from(entries.find((entry) => entry.path === imported.path)!.data)).toEqual(artifactBytes);
    const forged = structuredClone(native);
    forged.request.experiment.initialConditions.theta1.value += 0.1;
    await page.locator('#project-artifact-import').setInputFiles({
      name: 'inconsistent-native.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(forged))
    });
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'error');
    await expect(page.locator('#project-artifact-list')).toContainText('native-state-time.json');
    expect(projectFromZip(await download(page)).project).toEqual(project);
  });

  for (const kind of ['batch', 'model'] as const)
    test(`${kind}: a native nested source must match its project run before association`, async ({ page }) => {
      const matching = await researchNativeAttachment(kind, 9.81);
      const different = await researchNativeAttachment(kind, 9.7);
      await open(page);
      await record(page, kind === 'model' ? '1.59' : '0.04');
      await makeProject(page);
      await capture(page);
      const original = projectFromZip(await download(page)).project;
      expect(original.runs[0].experiment).toEqual(matching.experiment);
      await page.locator('#project-artifact-import').setInputFiles({
        name: `different-${kind}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(different.bytes)
      });
      await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'error');
      await expect(page.locator('#project-error')).toContainText(/다릅니다/);
      expect(projectFromZip(await download(page)).project).toEqual(original);
      await page.locator('#project-artifact-import').setInputFiles({
        name: `matching-${kind}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(matching.bytes)
      });
      await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'ready');
      await expect(page.locator('#project-artifact-list')).toContainText(`matching-${kind}.json`);
      const saved = projectFromZip(await download(page));
      const artifact = saved.project.artifacts.find(
        (item: { filename: string }) => item.filename === `matching-${kind}.json`
      );
      expect(artifact.nativeId).toBe(matching.nativeId);
      expect(artifact.nativeInputRunId).toBe(matching.nativeInputRunId);
      expect(artifact.runId).toBe(original.runs[0].id);
      expect(saved.entries.find((entry) => entry.path === artifact.path)!.data).toEqual(matching.bytes);
    });

  test('malformed, changed-checksum and traversal packages leave the adopted project intact', async ({ page }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    const original = await download(page);
    const entries = parseZip(original);
    const changed = buildZip(
      entries.map((entry) =>
        entry.path === 'report.md' ? { path: entry.path, data: textToBytes('Changed report bytes') } : entry
      )
    );
    const traversal = Uint8Array.from(original);
    const from = Buffer.from('report.md'),
      to = Buffer.from('../bad.md');
    for (let offset = 0; offset <= traversal.length - from.length; offset += 1) {
      if (from.every((byte, index) => traversal[offset + index] === byte)) traversal.set(to, offset);
    }
    for (const bytes of [textToBytes('not a zip'), changed, traversal]) {
      await upload(page, bytes);
      await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'error');
      await expect(page.locator('#project-error')).toBeVisible();
      await expect(page.locator('#project-run-list')).toContainText('Recorded run A');
      expect(projectFromZip(await download(page)).project).toEqual(projectFromZip(original).project);
    }
  });

  test('an explicitly missing source stays visible and cannot regenerate a misleading figure', async ({ page }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await compose(page);
    const { entries, project } = projectFromZip(await download(page));
    const series = project.artifacts.find((artifact: { kind: string }) => artifact.kind === 'series');
    series.status = 'missing';
    series.note = 'The recorded source was not supplied with this received package.';
    project.runs[0].status = 'partial';
    const packageEntry = entries.find((entry) => entry.path === 'manifest/package.json')!;
    const metadata = JSON.parse(new TextDecoder().decode(packageEntry.data));
    metadata.files = metadata.files.filter((path: string) => path !== series.path);
    const preserved = entries
      .filter((entry) => entry.path !== series.path && entry.path !== 'manifest/checksums.json')
      .map((entry) => ({
        path: entry.path,
        data:
          entry.path === 'manifest/project.json'
            ? textToBytes(JSON.stringify(project))
            : entry.path === 'manifest/package.json'
              ? textToBytes(JSON.stringify(metadata))
              : Uint8Array.from(entry.data)
      }));
    const bytes = buildZip([
      ...preserved,
      {
        path: 'manifest/checksums.json',
        data: textToBytes(
          JSON.stringify({
            schemaVersion: 'pendulum-bundle-checksums/v2',
            generatedAt: project.updatedAt,
            algorithm: 'sha256 + crc32 + fnv1a64',
            files: await checksumEntriesSha256(preserved)
          })
        )
      }
    ]);
    await upload(page, bytes, 'missing-source.zip');
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'preview');
    await expect(page.locator('#project-preview')).toContainText('누락 1');
    await page.getByRole('button', { name: '검증 미리보기 채택', exact: true }).click();
    await expect(page.locator('#project-artifact-list')).toContainText(series.note);
    await expect(page.locator('#project-figure-list')).toContainText(/재생성할 수 없습니다|누락/);
    await expect(page.locator('#project-figure-list img')).toHaveCount(0);
    const next = projectFromZip(await download(page));
    expect(next.entries.some((entry) => entry.path.endsWith('-unavailable.txt'))).toBe(true);
    expect(next.entries.some((entry) => entry.path === series.path)).toBe(false);
  });

  test('separate local storage requires explicit validated restore and keeps legacy keys unchanged', async ({
    page
  }) => {
    await open(page);
    await page.evaluate(() =>
      localStorage.setItem('pendulum-lab/s24-legacy-preservation-fixture', 'original legacy bytes')
    );
    await record(page);
    await makeProject(page);
    await capture(page);
    const original = projectFromZip(await download(page)).project;
    await page.getByRole('button', { name: '로컬 프로젝트 저장', exact: true }).click();
    await expect(page.locator('#project-status')).toContainText(/저장/);
    expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/s24-legacy-preservation-fixture'))).toBe(
      'original legacy bytes'
    );
    await page.reload();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#research-project-workflow > summary').click();
    await page.getByRole('button', { name: '로컬 프로젝트 복원 미리보기', exact: true }).click();
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'preview');
    await expect(page.locator('#project-preview')).toContainText(projectName);
    await page.getByRole('button', { name: '검증 미리보기 채택', exact: true }).click();
    expect(projectFromZip(await download(page)).project).toEqual(original);
    expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/s24-legacy-preservation-fixture'))).toBe(
      'original legacy bytes'
    );
  });

  test('the extracted reviewer opens offline in a new context without executing user text', async ({
    page,
    browser
  }, testInfo) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await compose(page);
    await page.getByRole('button', { name: '새 노트북 문단 편집', exact: true }).click();
    await page.locator('#project-notebook-title').fill('Unsafe text remains text');
    await page
      .locator('#project-notebook-text')
      .fill('<img src="https://attacker.invalid/pixel" onerror="alert(1)"><script>alert(2)</script>');
    await page.getByRole('button', { name: '노트북 문단 저장', exact: true }).click();
    const { entries } = projectFromZip(await download(page));
    const html = entries.find((entry) => entry.path === 'reviewer.html')!.data;
    const path = testInfo.outputPath('offline-reviewer.html');
    await writeFile(path, html);
    const context = await browser.newContext({ offline: true });
    const offline = await context.newPage();
    const requests: string[] = [];
    offline.on('request', (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    const dialogs: string[] = [];
    offline.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    try {
      await offline.goto(pathToFileURL(path).href);
      await expect(offline.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
      await expect(offline.locator('main')).toContainText('Recorded observation');
      await expect(offline.locator('main')).toContainText('<script>alert(2)</script>');
      await expect(offline.locator('img')).toHaveCount(1);
      expect(await offline.locator('img').evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(
        0
      );
      expect(await offline.locator('script,iframe,object,embed').count()).toBe(0);
      expect(requests).toEqual([]);
      expect(dialogs).toEqual([]);
      await audit(offline);
    } finally {
      await context.close();
    }
  });

  test('the reviewer application verifies a package without fetching deployment reports', async ({ page }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await compose(page);
    const zip = await download(page);
    const fetchedReports: string[] = [];
    page.on('request', (request) => {
      if (/\/reports\//.test(request.url())) fetchedReports.push(request.url());
    });
    await page.goto('/reviewer.html#/project');
    await page
      .locator('#research-reviewer-file')
      .setInputFiles({ name: 'study.zip', mimeType: 'application/zip', buffer: zip });
    await expect(page.locator('#research-reviewer-status')).toContainText(/검증/);
    await expect(page.locator('#research-reviewer-preview')).toContainText(projectName);
    await expect(page.locator('#research-reviewer-preview')).toContainText('Recorded run A');
    await expect(page.locator('#research-reviewer-preview img')).toBeVisible();
    expect(fetchedReports).toEqual([]);
    await audit(page);
  });

  test('worker startup errors and cancellation preserve the current project and pending preview isolation', async ({
    page
  }) => {
    await page.addInitScript(() => {
      const Native = window.Worker;
      const fixture = { fail: false, hold: false };
      Object.defineProperty(window, '__s24PackageFixture', { value: fixture });
      window.Worker = new Proxy(Native, {
        construct(target, args) {
          const packageWorker = String(args[0]).includes('package.worker');
          if (packageWorker && fixture.fail) {
            fixture.fail = false;
            throw new DOMException('S24 package startup fixture', 'SecurityError');
          }
          const worker = Reflect.construct(target, args) as Worker;
          if (packageWorker && fixture.hold) {
            const send = worker.postMessage.bind(worker);
            Object.defineProperty(worker, 'postMessage', {
              value(message: unknown) {
                setTimeout(() => send(message), 1500);
              }
            });
          }
          return worker;
        }
      });
    });
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    const original = await download(page);
    const previous = projectFromZip(original).project;
    await page.evaluate(() => {
      (window as unknown as { __s24PackageFixture: { fail: boolean } }).__s24PackageFixture.fail = true;
    });
    await upload(page, original);
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'error');
    await expect(page.locator('#project-error')).toBeVisible();
    await expect(page.locator('#project-run-list')).toContainText('Recorded run A');
    await page.evaluate(() => {
      (window as unknown as { __s24PackageFixture: { hold: boolean } }).__s24PackageFixture.hold = true;
    });
    const started = page.waitForEvent('worker');
    await upload(page, original, 'cancelled-study.zip');
    await started;
    await page.getByRole('button', { name: '패키지 작업 취소', exact: true }).click();
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'cancelled');
    await expect(page.locator('#project-preview')).not.toContainText(projectName);
    await expect(page.locator('#project-run-list')).toContainText('Recorded run A');
    await page.evaluate(() => {
      (window as unknown as { __s24PackageFixture: { hold: boolean } }).__s24PackageFixture.hold = false;
    });
    expect(projectFromZip(await download(page)).project).toEqual(previous);
  });

  test('keyboard, 320px and light/dark figure views retain accessible controls', async ({ page }, testInfo) => {
    // The same real engine samples and fixed upstream metadata keep all
    // mobile line boxes at one origin without masking or changing tolerance.
    const fixture = await researchVisualPackage(projectName, question);
    expect(await researchVisualPackage(projectName, question)).toEqual(fixture);
    await open(page);
    await upload(page, fixture, 's24-visual-fixed.zip');
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'preview');
    await page.getByRole('button', { name: '검증 미리보기 채택', exact: true }).click();
    await page.locator('#project-notebook-cell').selectOption('narrative-s24-visual');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('#project-notebook-title').fill('Keyboard note');
    await page.locator('#project-notebook-text').fill('Saved by keyboard.');
    await page.getByRole('button', { name: '노트북 문단 저장', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#project-status')).toContainText(/노트북/);
    await audit(page);
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('화면 테마', { exact: true }).selectOption(theme);
      await page.locator('#project-figure-list').scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const figure = document.querySelector('#project-figure-list')!;
        const description = figure.querySelector('.lab-muted')!;
        const summary = document.querySelector('#project-summary')!;
        const range = document.createRange();
        range.selectNodeContents(description);
        const rect = (node: Element) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        const font = getComputedStyle(description);
        return {
          scrollY,
          devicePixelRatio,
          fontStatus: document.fonts.status,
          figure: rect(figure),
          description: rect(description),
          summary: rect(summary),
          summaryText: summary.textContent,
          font: { family: font.fontFamily, size: font.fontSize, lineHeight: font.lineHeight },
          lines: Array.from(range.getClientRects(), (box) => ({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          }))
        };
      });
      await testInfo.attach(`s24-visual-geometry-${theme}`, {
        body: Buffer.from(JSON.stringify(geometry, null, 2)),
        contentType: 'application/json'
      });
      await expect(page.locator('#project-figure-list')).toHaveScreenshot(`s24-research-figure-${theme}.png`);
    }
  });

  test('200 percent zoom retains project editing, source descriptions and all controls', async ({ page }) => {
    await open(page);
    await record(page);
    await makeProject(page);
    await capture(page);
    await compose(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await expect(page.locator('#project-figure-list')).toContainText('theta1');
    await expect(page.locator('#project-figure-list')).toContainText('rad');
    await page.getByRole('button', { name: '노트북 문단 저장', exact: true }).focus();
    await expect(page.getByRole('button', { name: '노트북 문단 저장', exact: true })).toBeFocused();
    await audit(page);
  });
});
