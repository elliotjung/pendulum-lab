import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bytesToText, crc32, hashBytes, parseZip } from '../src/research/zipBundle';

test('ZIP research bundle downloads with expected layout, binary PNGs, and valid checksums', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  // Let the lab draw a few frames so canvases have content for binary figures.
  await page.waitForTimeout(600);

  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchWorkbench')).toBeVisible();

  // Generate a study so data/parameter-study-results.csv is included.
  await page.locator('#rwStudyVariable').selectOption('theta1');
  await page.locator('#rwStudyMin').fill('-0.4');
  await page.locator('#rwStudyMax').fill('0.4');
  await page.locator('#rwStudyCount').fill('3');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('3 points');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportBundleZip').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pendulum_research_bundle.zip');
  const path = await download.path();
  expect(path).toBeTruthy();

  const bytes = new Uint8Array(await readFile(path!));
  // Real ZIP magic, not JSON.
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);

  const entries = parseZip(bytes); // throws on CRC mismatch -> integrity verified
  const paths = entries.map((entry) => entry.path);
  for (const required of [
    'manifest/submission.json',
    'manifest/provenance.json',
    'manifest/checksums.json',
    'paper/paper-pack.json',
    'paper/methods.md',
    'paper/methods.tex',
    'paper/notebook.ipynb',
    'data/parameter-study-results.csv',
    'data/comparison-matrix.csv',
    'data/run-log.json',
    'data/experiments.json',
    'figures/figure-manifest.json'
  ]) {
    expect(paths, `bundle must contain ${required}`).toContain(required);
  }

  // At least one binary PNG figure with a real PNG signature.
  const pngs = entries.filter((entry) => entry.path.startsWith('figures/') && entry.path.endsWith('.png'));
  expect(pngs.length).toBeGreaterThan(0);
  for (const png of pngs) {
    expect(Array.from(png.data.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  // checksums.json covers every other member with matching crc32, content hash,
  // and a cryptographic SHA-256 (verified independently with Node's crypto).
  const checksums = JSON.parse(bytesToText(entries.find((entry) => entry.path === 'manifest/checksums.json')!.data)) as {
    schemaVersion: string;
    files: { path: string; bytes: number; crc32: string; hash: string; sha256: string }[];
  };
  expect(checksums.schemaVersion).toBe('pendulum-bundle-checksums/v2');
  const others = entries.filter((entry) => entry.path !== 'manifest/checksums.json');
  expect(checksums.files).toHaveLength(others.length);
  const { createHash } = await import('node:crypto');
  for (const entry of others) {
    const row = checksums.files.find((file) => file.path === entry.path);
    expect(row, `checksum row for ${entry.path}`).toBeTruthy();
    expect(row!.bytes).toBe(entry.data.length);
    expect(row!.crc32).toBe(crc32(entry.data).toString(16).padStart(8, '0'));
    expect(row!.hash).toBe(hashBytes(entry.data));
    expect(row!.sha256).toBe(createHash('sha256').update(entry.data).digest('hex'));
  }

  // Notebook inside the ZIP is valid nbformat-4 JSON.
  const notebook = JSON.parse(bytesToText(entries.find((entry) => entry.path === 'paper/notebook.ipynb')!.data));
  expect(notebook.nbformat).toBe(4);

  // Provenance graph is structurally valid and links bundle back to snapshot.
  const provenance = JSON.parse(bytesToText(entries.find((entry) => entry.path === 'manifest/provenance.json')!.data));
  expect(provenance.schemaVersion).toBe('pendulum-provenance/v1');
  const kinds = provenance.nodes.map((node: { kind: string }) => node.kind);
  expect(kinds).toContain('snapshot');
  expect(kinds).toContain('study');
  expect(kinds).toContain('paper-pack');
  expect(kinds).toContain('bundle');
  expect(provenance.nodes.every((node: { hash: string; schemaVersion: string }) => node.hash && node.schemaVersion)).toBe(true);
});
