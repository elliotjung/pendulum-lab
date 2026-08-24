import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

function pngDimensions(bytes: Buffer): [number, number] {
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('PWA assets', () => {
  test('application discovery metadata points stateful URLs at one clean canonical', async () => {
    const html = await readFile('app.html', 'utf8');
    const robots = await readFile('public/robots.txt', 'utf8');
    const sitemap = await readFile('public/sitemap.xml', 'utf8');
    expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large"');
    expect(html).toContain('<link rel="canonical" href="https://elliotjung.github.io/pendulum-lab/"');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="ko"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('<meta property="og:url" content="https://elliotjung.github.io/pendulum-lab/"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain('Certified chaotic-dynamics workbench');
    expect(robots).toContain('Sitemap: https://elliotjung.github.io/pendulum-lab/sitemap.xml');
    expect(sitemap).toContain('<loc>https://elliotjung.github.io/pendulum-lab/</loc>');
    expect(sitemap).toContain('hreflang="ko"');
  });

  test('manifest exposes stable identity, shortcuts, and dedicated maskable artwork', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8')) as {
      display?: string;
      start_url?: string;
      id?: string;
      lang?: string;
      icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
      shortcuts?: unknown[];
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toMatch(/^\.\//);
    expect(manifest.id).toBe('./');
    expect(manifest.lang).toBe('en');
    expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', 'any']);
    expect(manifest.icons?.at(-1)).toMatchObject({ src: './icons/pendulum-lab-maskable.svg', purpose: 'maskable' });
    expect(manifest.shortcuts).toHaveLength(2);
    expect(pngDimensions(await readFile('public/icons/pendulum-lab-192.png'))).toEqual([192, 192]);
    expect(pngDimensions(await readFile('public/icons/pendulum-lab-512.png'))).toEqual([512, 512]);
  });

  test('service worker has versioned offline shell and same-origin fetch policy', async () => {
    const source = await readFile('public/sw.js', 'utf8');
    expect(source).toContain("const VERSION = 'pendulum-lab-v10.36.0-__BUILD_REVISION__'");
    expect(source).toContain('url.origin !== self.location.origin');
    expect(source).toContain("matchCurrentCaches('./index.html')");
    expect(source).toContain('event.waitUntil(settle(cacheUpdate');
    expect(source).toContain('if (!response.ok || response.status !== 200) return');
    expect(source).toContain('const RUNTIME_CACHE_LIMIT = 96');
    expect(source).toContain('cache.keys()');
    expect(source).toContain('cache.delete(record.request)');
    expect(source).toContain('MAX_RUNTIME_RESPONSE_BYTES');
    expect(source).toContain('RUNTIME_CACHE_MAX_BYTES');
    expect(source).toContain('lastAccess');
    expect(source).toContain('trimQueue.catch(() => undefined)');
    expect(source).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(source).toContain("url.search = ''");
    expect(source).toContain('const BUILD_ASSETS = [/* __BUILD_ASSETS__ */]');
    const buildConfig = await readFile('vite.config.ts', 'utf8');
    expect(buildConfig).toContain("fileName.startsWith('assets/')");
    expect(buildConfig).toContain("replace('/* __BUILD_ASSETS__ */'");
  });

  test('client updates require explicit consent and preserve a validated recovery point', async () => {
    const source = await readFile('src/app/PwaLifecycle.ts', 'utf8');
    const recovery = await readFile('src/app/PwaUpdateRecovery.ts', 'utf8');
    expect(recovery).toContain('UPDATE_RECOVERY_KEY');
    expect(source).toContain('PWA_UPDATE_REQUESTED_KEY');
    expect(source).toContain('persistUpdateRecovery()');
    expect(source).toContain('storage.flushResearchStateForUpdate()');
    expect(source).toContain('design.flushDesignStudyForUpdate()');
    expect(recovery).toContain('StateStore.validate(record.snapshot)');
    expect(recovery).toContain("PWA_UPDATE_RECOVERY_SCHEMA = 'pendulum-pwa-update-recovery/v2'");
    expect(recovery).toContain('PWA_UPDATE_RECOVERY_MAX_BYTES');
    expect(recovery).toContain('PWA_UPDATE_RECOVERY_TTL_MS');
    expect(source).toContain("restorePolicy: 'paused-safe-mode'");
    expect(source).toContain("view.textContent = korean ? '요약 보기' : 'View summary'");
    expect(source).toContain("remove.textContent = korean ? '복구 데이터 삭제' : 'Delete recovery'");
    expect(source).toContain("registration.waiting?.postMessage({ type: 'SKIP_WAITING' })");
    expect(source).toContain('if (updateRequested && !reloading)');
    expect(source).not.toContain(
      "navigator.serviceWorker.addEventListener('controllerchange', () => location.reload())"
    );
    expect(source).toContain('isViteDevelopmentShell()');
    expect(source).toContain('registration.unregister()');
    expect(source).toContain("'./reports/evidence-summary.json'");
    expect(source).toContain('report.provenance?.expiresAt');
    expect(source).toContain("dataset.evidenceFreshness = expired ? 'expired' : 'current'");
    expect(source).not.toContain('ageDays > 30');

    const storage = await readFile('src/app/parity/storage-local-cache.ts', 'utf8');
    const design = await readFile('src/app/parity/research-workbench-design-study.ts', 'utf8');
    expect(storage).toContain('export async function flushResearchStateForUpdate()');
    expect(storage).toContain('await mirrorResearchStateToDbNow()');
    expect(design).toContain('export async function flushDesignStudyForUpdate()');
    expect(design).toContain("await db.put('parameterStudies'");
  });

  test('ships localized install metadata and a wide product screenshot', async () => {
    const english = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8')) as {
      screenshots?: Array<{ src?: string; sizes?: string; form_factor?: string }>;
    };
    const korean = JSON.parse(await readFile('public/manifest.ko.webmanifest', 'utf8')) as {
      id?: string;
      lang?: string;
      start_url?: string;
      screenshots?: unknown[];
    };
    expect(english.screenshots).toContainEqual(
      expect.objectContaining({
        src: './reports/modern-demo-screenshot.png',
        sizes: '1280x820',
        form_factor: 'wide'
      })
    );
    expect(korean).toMatchObject({ id: './', lang: 'ko' });
    expect(korean.start_url).toContain('lang=ko');
    expect(korean.screenshots).toHaveLength(1);
  });

  test('Cloudflare mirror opts into the isolation headers required by SAB', async () => {
    const headers = await readFile('public/_headers', 'utf8');
    expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(headers).toContain('Cross-Origin-Embedder-Policy: require-corp');
  });
});
