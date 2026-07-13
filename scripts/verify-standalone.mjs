// Verify the generated standalone/index.html opens from the file system
// (double-click scenario): the modern shell boots and no page errors fire.
//   node scripts/verify-standalone.mjs
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = pathToFileURL(resolve('standalone/index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(target);
await page.waitForFunction(() => Boolean(window.__modernShell), undefined, { timeout: 20_000 });
await page.waitForTimeout(1500);

// The portable file deliberately falls back to the main thread when Chromium
// refuses module workers from a file:// origin. Capture the real toast calls
// (and the text rendered into #toast) before running the public worker smoke
// command so this user-facing double-click contract cannot silently regress.
const fallback = await page.evaluate(async () => {
  const runtime = window.PendulumLab;
  if (!runtime?.commands?.run) {
    return { rendered: [], event: null, error: 'runtime command API unavailable' };
  }
  const rendered = [];
  let event = null;
  const onFallback = (rawEvent) => {
    event = rawEvent.detail;
  };
  window.addEventListener('pendulum-lab:worker-fallback', onFallback, { once: true });
  try {
    await runtime.commands.run('index.workerSmoke');
    rendered.push(document.getElementById('toast')?.textContent ?? '');
    return { rendered, event, error: null };
  } catch (error) {
    return { rendered, event, error: error instanceof Error ? error.message : String(error) };
  }
});

const canvasDrawn = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return Boolean(canvas && canvas.width > 0);
});

await browser.close();

if (pageErrors.length > 0) {
  console.error(`standalone FAILED: ${pageErrors.length} page error(s):\n${pageErrors.join('\n')}`);
  process.exit(1);
}
if (!canvasDrawn) {
  console.error('standalone FAILED: no drawn canvas');
  process.exit(1);
}
if (fallback.error) {
  console.error(`standalone FAILED: worker fallback probe failed: ${fallback.error}`);
  process.exit(1);
}
const fallbackText = 'Web Worker unavailable over file://; using main thread.';
if (fallback.event?.protocol !== 'file:' || fallback.event?.mainThread !== true) {
  console.error(`standalone FAILED: no file:// worker-fallback event: ${JSON.stringify(fallback.event)}`);
  process.exit(1);
}
if (!fallback.rendered.some((message) => message.includes(fallbackText))) {
  console.error(`standalone FAILED: file:// fallback toast was not rendered: ${JSON.stringify(fallback.rendered)}`);
  process.exit(1);
}
console.log(`standalone OK: ${target} boots, draws, and renders the file:// worker-fallback toast with no page errors`);
