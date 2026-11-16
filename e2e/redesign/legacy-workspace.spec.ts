import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { nativeArchive, nativeWorkspace, tinyPng } from '../../tests/product/persistence/legacy-workspace-fixtures';

test.describe('source-preserving workspace migration and adoption', () => {
  test.setTimeout(90_000);
  async function open(page: import('@playwright/test').Page) {
    await page.goto('/next.html#/lab');
    await page.locator('#legacy-workspace-import > summary').click();
  }
  async function choose(page: import('@playwright/test').Page, name = 'workspace.json', source = nativeWorkspace()) {
    await page
      .locator('#legacy-workspace-file')
      .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    await page.getByRole('button', { name: '작업공간 미리보기', exact: true }).click();
  }
  test('previews typed records, adopts actual multipart projects, reopens a canonical run and survives reload', async ({
    page
  }, info) => {
    await open(page);
    await page.evaluate(() => localStorage.setItem('pendulum-lab/research-workbench/v1', 'legacy-sentinel'));
    const source = nativeWorkspace(100);
    await choose(page, 'workspace.json', source);
    await expect(page.locator('#legacy-workspace-parts option')).toHaveCount(3);
    const partOptions = await page
      .locator('#legacy-workspace-parts option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
    await expect(page.getByRole('status').filter({ hasText: '별도 product DB에 보관' })).toBeVisible();
    await page.locator('#legacy-workspace-parts').selectOption(partOptions[1]!);
    await expect(page.locator('#legacy-workspace-records option')).not.toHaveCount(0);
    const experiment = await page
      .locator('#legacy-workspace-records option')
      .evaluateAll((options) =>
        options.find((option) => option.textContent?.startsWith('experiment'))?.getAttribute('value')
      );
    await page.locator('#legacy-workspace-records').selectOption(experiment!);
    await expect(page.getByRole('button', { name: '이 snapshot을 실험실에서 다시 관찰' })).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '전체 원본 archive 백업' }).click();
    const backup = await download;
    expect(backup.suggestedFilename()).toBe('legacy-source-original.json');
    const bytes = await readFile((await backup.path())!);
    expect(bytes).toEqual(Buffer.from(JSON.stringify(source)));
    await info.attach('original-workspace-backup', { body: bytes, contentType: 'application/json' });
    await page.reload();
    await page.locator('#legacy-workspace-import > summary').click();
    await page.getByRole('button', { name: '채택한 자료 목록 읽기' }).click();
    await expect(page.locator('#legacy-workspace-saved option')).toHaveCount(1);
    await page.getByRole('button', { name: '선택 보관 자료 다시 미리보기' }).click();
    await expect(page.locator('#legacy-workspace-parts option')).toHaveCount(3);
    await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
    await expect(page.getByRole('status').filter({ hasText: '별도 product DB에 보관' })).toBeVisible();
    const firstExperiment = await page
      .locator('#legacy-workspace-records option')
      .evaluateAll((options) =>
        options.find((option) => option.textContent?.startsWith('experiment'))?.getAttribute('value')
      );
    await page.locator('#legacy-workspace-records').selectOption(firstExperiment!);
    await page.getByRole('button', { name: '이 snapshot을 실험실에서 다시 관찰' }).click();
    await expect(page).toHaveURL(/#\/lab\/double\?state=/);
    await expect(page.locator('#lab-field-theta1')).toHaveValue(String(7 * Math.PI));
    expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/research-workbench/v1'))).toBe(
      'legacy-sentinel'
    );
  });

  test('imports all native research DB stores, reads exact backup and typed assets, then restores adoption after reload', async ({
    page
  }, info) => {
    const source = nativeArchive(),
      original = Buffer.from(JSON.stringify(source));
    await open(page);
    await page.locator('#legacy-workspace-kind').selectOption('research-db');
    await page
      .locator('#legacy-workspace-file')
      .setInputFiles({ name: 'native-research-db.json', mimeType: 'application/json', buffer: original });
    await page.getByRole('button', { name: '작업공간 미리보기', exact: true }).click();
    const labels = await page.locator('#legacy-workspace-records option').allTextContents();
    for (const kind of [
      'project',
      'session',
      'experiment',
      'plan',
      'point',
      'run-log',
      'metrics',
      'image',
      'archive',
      'settings'
    ])
      expect(labels.some((text) => text.startsWith(`${kind} ·`))).toBe(true);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '전체 원본 archive 백업', exact: true }).click();
    const raw = await readFile((await (await download).path())!);
    expect(raw).toEqual(original);
    await info.attach('original-research-db-backup', { body: raw, contentType: 'application/json' });
    const imageId = await page
      .locator('#legacy-workspace-records option')
      .evaluateAll((options) =>
        options.find((option) => option.textContent?.startsWith('image ·'))?.getAttribute('value')
      );
    await page.locator('#legacy-workspace-records').selectOption(imageId!);
    const imageDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '원본 이미지 다운로드', exact: true }).click();
    expect(await readFile((await (await imageDownload).path())!)).toEqual(Buffer.from(tinyPng, 'base64'));
    const typedDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'typed record JSON 다운로드', exact: true }).click();
    const typedBytes = await readFile((await (await typedDownload).path())!);
    const typed = JSON.parse(typedBytes.toString('utf8'));
    expect(typed.schema).toBe('pendulum-legacy-workspace-record/v1');
    expect(typed.record.payload).toEqual(source.stores.figures[0]!.payload);
    expect(typed.record.sourceMetadata.updatedAt).toBe(source.stores.figures[0]!.updatedAt);
    await info.attach('research-db-typed-image-record', { body: typedBytes, contentType: 'application/json' });
    await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '별도 product DB에 보관' })).toBeVisible();
    await page.reload();
    await page.locator('#legacy-workspace-import > summary').click();
    await page.getByRole('button', { name: '채택한 자료 목록 읽기', exact: true }).click();
    await expect(page.locator('#legacy-workspace-saved option')).toHaveCount(1);
    await page.getByRole('button', { name: '선택 보관 자료 다시 미리보기', exact: true }).click();
    const roundtrip = page.waitForEvent('download');
    await page.getByRole('button', { name: '전체 원본 archive 백업', exact: true }).click();
    expect(await readFile((await (await roundtrip).path())!)).toEqual(original);
    await expect(page.locator('#legacy-workspace-import [role=alert]')).toBeHidden();
  });

  test('discards stale file reads and cancelled previews', async ({ page }) => {
    await page.addInitScript(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function (this: File) {
        if (this.name.startsWith('slow')) await new Promise((resolve) => setTimeout(resolve, 500));
        return original.call(this);
      };
    });
    await open(page);
    await choose(page, 'slow-old.json');
    const source = nativeWorkspace();
    source.research.experiments[0]!.name = 'newest-explicit-source';
    await page
      .locator('#legacy-workspace-file')
      .setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    await page.getByRole('button', { name: '작업공간 미리보기', exact: true }).click();
    await expect(
      page.locator('#legacy-workspace-records option').filter({ hasText: 'newest-explicit-source' })
    ).toHaveCount(1);
    await page.getByRole('button', { name: '작업공간 미리보기 취소', exact: true }).click();
    await expect(page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' })).toBeDisabled();
    await expect(page.locator('#legacy-workspace-parts')).toBeHidden();
    await expect(page.locator('.legacy-workspace-record-view')).toBeEmpty();
  });

  test('quota failure leaves the product archive index empty and canonical reopen disabled', async ({ page }) => {
    await page.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'sources') throw new DOMException('deliberate migration quota failure', 'QuotaExceededError');
        return original.call(this, value, key);
      };
    });
    await open(page);
    await choose(page);
    await expect(page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' })).toBeEnabled();
    await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'quota' })).toBeVisible();
    await page.getByRole('button', { name: '채택한 자료 목록 읽기' }).click();
    await expect(page.locator('#legacy-workspace-saved option')).toHaveCount(0);
    const experiment = await page
      .locator('#legacy-workspace-records option')
      .evaluateAll((options) =>
        options.find((option) => option.textContent?.startsWith('experiment'))?.getAttribute('value')
      );
    await page.locator('#legacy-workspace-records').selectOption(experiment!);
    await expect(page.getByRole('button', { name: '이 snapshot을 실험실에서 다시 관찰' })).toBeDisabled();
  });

  test('runs the saved parameter-study snapshot in a native worker and imports its exact completed part', async ({
    page
  }) => {
    await open(page);
    await page.locator('#legacy-workspace-duration').fill('0.02');
    await choose(page);
    const planId = await page
      .locator('#legacy-workspace-records option')
      .evaluateAll((options) =>
        options.find((option) => option.textContent?.startsWith('plan'))?.getAttribute('value')
      );
    await page.locator('#legacy-workspace-records').selectOption(planId!);
    await expect(page.getByRole('button', { name: '이 계획의 원본 조건 실행 목록 준비' })).toBeDisabled();
    await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
    await expect(page.getByRole('button', { name: '이 계획의 원본 조건 실행 목록 준비' })).toBeEnabled();
    await page.getByRole('button', { name: '이 계획의 원본 조건 실행 목록 준비' }).click();
    const queue = page.locator('.legacy-run-list');
    await expect(queue.getByRole('combobox', { name: '기존 조건 원본 run 선택' }).locator('option')).toHaveCount(1);
    await queue.getByRole('button', { name: '선택 part 실행·재개' }).click();
    await expect(queue).toHaveAttribute('data-queue-status', 'completed');
    await expect(queue.locator('tbody tr')).toHaveCount(4);
    await expect(queue).toContainText('point-a');
    await expect(queue).toContainText('seed: -42');
    await expect(queue).toContainText('10단계');
    const downloading = page.waitForEvent('download');
    await queue.getByRole('button', { name: '선택 part 입력·결과·재개 JSON 저장' }).click();
    const download = await downloading;
    const path = await download.path();
    await queue.locator('input[type="file"]').setInputFiles(path!);
    await expect(queue).toHaveAttribute('data-queue-status', 'completed');
    await expect(queue.locator('tbody tr')).toHaveCount(4);
    await expect(queue.getByRole('alert')).toBeHidden();
  });
});
