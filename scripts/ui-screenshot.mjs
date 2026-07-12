// Ad-hoc design-review screenshots of the running dev server (not part of any
// gate; reads PORT/BASE from args). Usage: node scripts/ui-screenshot.mjs 5173
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = 'reports/analysis-screenshots';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1. Workspace chooser (fresh visit, no stored mode).
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/lab-chooser.png` });

// 2. Research workspace (stored mode boots straight in under automation).
await page.evaluate(() => localStorage.setItem('pendulum-lab/ui/audience-mode', 'research'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/lab-workspace.png` });

// 3. Rail submenu open (Analysis).
await page.locator('.rail-menu-button[data-rail-section-button="analysis"]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/lab-rail-analysis.png` });

// 4. Govern submenu (two-column, viewport-anchored).
await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/lab-rail-govern.png` });

await browser.close();
console.log('screenshots written to', out);
