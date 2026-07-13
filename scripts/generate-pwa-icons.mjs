import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'public', 'icons');
await mkdir(output, { recursive: true });
const mark = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="5" r="2.4" fill="#18d4f8"/><path d="M16 6.5 L23 16 L19 25" fill="none" stroke="#18d4f8" stroke-width="1.4" stroke-linecap="round" opacity=".9"/><circle cx="23" cy="16" r="2" fill="#9d78ff"/><circle cx="19" cy="25" r="2.8" fill="#ff7a2c"/></svg>`;
const browser = await chromium.launch();
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>*{box-sizing:border-box}html,body{margin:0;background:#05060f}.tile{width:${size}px;height:${size}px;display:grid;place-items:center;background:radial-gradient(circle at 68% 25%,#172654,#05060f 64%)}svg{width:${Math.round(size * 0.72)}px;height:${Math.round(size * 0.72)}px;filter:drop-shadow(0 0 ${Math.round(size * 0.06)}px rgba(24,212,248,.45))}</style><div class="tile">${mark}</div>`
    );
    await page.locator('.tile').screenshot({ path: join(output, `pendulum-lab-${size}.png`) });
  }
} finally {
  await browser.close();
}
console.log('PWA icons generated (192px, 512px)');
