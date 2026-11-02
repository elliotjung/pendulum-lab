import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { legacySourceText } from '../../../scripts/redesign/inventory';

describe('S22 local recorded-media policy', () => {
  it('allows local media object URLs without adding executable blob or remote origins', () => {
    const headers = readFileSync('public/_headers', 'utf8');
    const policy = headers.match(/Content-Security-Policy: ([^\r\n]+)/)![1]!;
    const directives = new Map(
      policy.split(';').map((text) => {
        const [name, ...sources] = text.trim().split(/\s+/);
        return [name, sources.join(' ')];
      })
    );
    expect(directives.get('media-src')).toBe("'self' blob:");
    expect(directives.get('script-src')).toBe("'self' 'wasm-unsafe-eval'");
    expect(directives.get('worker-src')).toBe("'self'");
    expect(directives.get('connect-src')).toBe("'self'");
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('"media-src \'self\' blob:"');
  });

  it('retains the frozen inventory fingerprint with only the exact local-media addition projected out', () => {
    const baseline = JSON.parse(readFileSync('documents/redesign/baseline/inventory.json', 'utf8')) as {
      files: { ownerFile: string; sha256: string }[];
    };
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    for (const path of ['public/_headers', 'vite.config.ts']) {
      const text = readFileSync(path, 'utf8');
      const expected = baseline.files.find((v) => v.ownerFile === path)!.sha256;
      expect(hash(legacySourceText(path, text))).toBe(expected);
      const broadened = text.replace("media-src 'self' blob:", "media-src 'self' blob: https:");
      expect(hash(legacySourceText(path, broadened))).not.toBe(expected);
      const executable = text.replace("script-src 'self'", "script-src blob: 'self'");
      expect(hash(legacySourceText(path, executable))).not.toBe(expected);
    }
  });
});
