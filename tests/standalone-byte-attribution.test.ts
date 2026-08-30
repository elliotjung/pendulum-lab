import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { attributeHtml } from '../scripts/standalone-byte-attribution';

describe('standalone byte attribution', () => {
  it('attributes every UTF-8 byte exactly while separating script, style, JSON, and shell', () => {
    const bytes = Buffer.from(
      '<!doctype html><html><head><style>.a{color:red}</style></head><body>진자<script type="application/json">{"x":1}</script><script>run()</script></body></html>',
      'utf8'
    );
    const parts = attributeHtml(bytes);

    expect(parts.map((part) => part.id)).toEqual(['html-shell', 'inline-javascript', 'inline-css', 'inline-json']);
    expect(parts.reduce((sum, part) => sum + part.raw, 0)).toBe(bytes.length);
    expect(parts.every((part) => part.gzip > 0 && part.brotli > 0)).toBe(true);
  });

  it('rejects a document that cannot be round-tripped as canonical UTF-8', () => {
    expect(() => attributeHtml(Buffer.from([0xff, 0xfe, 0xfd]))).toThrow(/canonical UTF-8/);
  });
});
