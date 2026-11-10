import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { integratorRegistry } from '../../src/physics/integratorRegistry';

test.describe('complete native expansion compatibility consumer', () => {
  test.setTimeout(90_000);
  const source = `#expansion=${Buffer.from(
    JSON.stringify({ model: 'driven', methods: Object.keys(integratorRegistry), dt: 0.01, horizon: 0.1 })
  )
    .toString('base64')
    .replace(/=+$/, '')}`;
  async function preview(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (
        this: Worker,
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions
      ) {
        const transfer = options as StructuredSerializeOptions;
        if (
          (window as Window & { delayNativeSuite?: boolean }).delayNativeSuite &&
          (message as { schema?: string })?.schema === 'pendulum-legacy-expansion-request/v1'
        )
          setTimeout(() => original.call(this, message, transfer), 500);
        else original.call(this, message, transfer);
      };
    });
    await page.goto('/next.html#/lab');
    await page.locator('#legacy-migration > summary').click();
    await page.locator('#legacy-migration-source').fill(source);
    await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
    const panel = page.locator('.legacy-expansion-native');
    await expect(panel).toBeVisible();
    await panel.locator(':scope > summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    return panel;
  }
  test('executes all16 original methods, plots complete diagnostics, and previews/adopts exact exported outputs', async ({
    page
  }, testInfo) => {
    const panel = await preview(page);
    await expect(panel).toContainText('native 기본값·실효 범위');
    await panel.getByRole('button', { name: '전체 native 확장 suite 실행', exact: true }).click();
    await expect(panel).toHaveAttribute('data-suite-status', 'completed');
    await expect(panel.locator('.legacy-expansion-output tbody tr')).toHaveCount(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(panel.getByRole('combobox', { name: 'native 적분기 궤적' }).locator('option')).toHaveCount(16);
    await panel.getByRole('combobox', { name: 'native 적분기 궤적' }).selectOption('gauss2');
    await expect(panel.getByRole('img', { name: 'native 위상 heatmap', exact: true })).toBeVisible();
    await expect(panel.getByRole('img', { name: 'native 분기 기록', exact: true })).toBeVisible();
    await panel.getByRole('slider', { name: 'native replay 프레임' }).focus();
    await panel.getByRole('slider', { name: 'native replay 프레임' }).press('ArrowRight');
    await expect(panel.getByRole('slider', { name: 'native replay 프레임' })).toHaveValue('1');
    const downloading = page.waitForEvent('download');
    await panel.getByRole('button', { name: '전체 native 설정·결과 JSON 저장' }).click();
    const downloaded = await downloading,
      path = await downloaded.path();
    const saved = JSON.parse(await readFile(path!, 'utf8')) as {
      schema: string;
      request: { resolved: { methods: string[] } };
      resultSha256: string;
    };
    expect(saved.schema).toBe('pendulum-legacy-expansion/v1');
    expect(saved.request.resolved.methods).toHaveLength(16);
    expect(saved.resultSha256).toMatch(/^[0-9a-f]{64}$/);
    const retained = testInfo.outputPath('native-expansion.json');
    await downloaded.saveAs(retained);
    await testInfo.attach('native-expansion-export', { path: retained, contentType: 'application/json' });
    await page.evaluate(() => {
      (window as Window & { delayNativeSuite?: boolean }).delayNativeSuite = true;
    });
    await panel.getByRole('button', { name: '전체 native 확장 suite 실행', exact: true }).click();
    await panel.getByRole('button', { name: 'native 확장 suite 취소', exact: true }).click();
    await expect(panel).toHaveAttribute('data-suite-status', 'cancelled');
    await expect(panel.locator('.legacy-expansion-output tbody tr')).toHaveCount(16);
    await panel.locator('input[type="file"]').setInputFiles(path!);
    await expect(panel.getByRole('button', { name: '미리 본 native suite 설정·결과 채택' })).toBeEnabled();
    await panel.getByRole('button', { name: '미리 본 native suite 설정·결과 채택' }).click();
    await expect(panel).toHaveAttribute('data-suite-status', 'imported');
    await expect(panel.locator('.legacy-expansion-output tbody tr')).toHaveCount(16);
    await expect(panel.getByRole('alert')).toBeHidden();
  });
  test('keeps imported outputs pending and rejects changed checksums without replacing completed results', async ({
    page
  }) => {
    const panel = await preview(page);
    await panel.getByRole('button', { name: '전체 native 확장 suite 실행', exact: true }).click();
    await expect(panel).toHaveAttribute('data-suite-status', 'completed');
    const downloading = page.waitForEvent('download');
    await panel.getByRole('button', { name: '전체 native 설정·결과 JSON 저장' }).click();
    const path = await (await downloading).path(),
      raw = JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>;
    raw.resultSha256 = '0'.repeat(64);
    await panel
      .locator('input[type="file"]')
      .setInputFiles({ name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
    await expect(panel.getByRole('alert')).toContainText('checksum');
    await expect(panel.getByRole('button', { name: '미리 본 native suite 설정·결과 채택' })).toBeDisabled();
    await expect(panel).toHaveAttribute('data-suite-status', 'completed');
    await expect(panel.locator('.legacy-expansion-output tbody tr')).toHaveCount(16);
  });
});
