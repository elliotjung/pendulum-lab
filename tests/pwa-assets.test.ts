import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

function pngDimensions(bytes: Buffer): [number, number] {
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('PWA assets', () => {
  test('manifest exposes installable local PNG icons', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8')) as {
      display?: string;
      start_url?: string;
      icons?: Array<{ src?: string; sizes?: string }>;
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toMatch(/^\.\//);
    expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    expect(pngDimensions(await readFile('public/icons/pendulum-lab-192.png'))).toEqual([192, 192]);
    expect(pngDimensions(await readFile('public/icons/pendulum-lab-512.png'))).toEqual([512, 512]);
  });

  test('service worker has versioned offline shell and same-origin fetch policy', async () => {
    const source = await readFile('public/sw.js', 'utf8');
    expect(source).toContain("const VERSION = 'pendulum-lab-v10.36.0'");
    expect(source).toContain('url.origin !== self.location.origin');
    expect(source).toContain("caches.match('./index.html')");
    expect(source).toContain('event.waitUntil(settle(cacheUpdate');
    expect(source).toContain('if (!response.ok) return');
    expect(source).toContain('const RUNTIME_CACHE_LIMIT = 96');
    expect(source).toContain('cache.keys()');
    expect(source).toContain('cache.delete(request)');
  });

  test('Cloudflare mirror opts into the isolation headers required by SAB', async () => {
    const headers = await readFile('public/_headers', 'utf8');
    expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(headers).toContain('Cross-Origin-Embedder-Policy: require-corp');
  });
});
