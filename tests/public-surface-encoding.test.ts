import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Public first-impression guard: the files an npm consumer or reviewer opens
 * first must be clean UTF-8 (no replacement characters, no double-encoded
 * mojibake), and src/lib.ts additionally pins ASCII-only content so legacy
 * terminal encodings (cp949/cp1252) can never render its doc comments as `??`.
 *
 * Patterns mirror scripts/audit-mojibake.ts. They are constructed from char
 * codes so this test file itself stays pure ASCII and can never trip the
 * repo-wide mojibake audit.
 */
const PUBLIC_SURFACE_FILES = [
  'src/lib.ts',
  'src/lib/core.ts',
  'src/lib/analysis.ts',
  'src/lib/research.ts',
  'src/lib/experimental.ts',
  'README.md',
  'CHANGELOG.md',
  'CITATION.cff',
  'docs/api-overview.md',
  'docs/v11-api-migration.md'
];

const ch = (code: number): string => String.fromCharCode(code);
const range = (from: number, to: number): string => `[${ch(from)}-${ch(to)}]`;
const CONTINUATION = range(0x80, 0xbf);

const MOJIBAKE_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'replacement character U+FFFD', regex: new RegExp(ch(0xfffd)) },
  { label: 'double-encoded latin-1 (U+00C3 + continuation)', regex: new RegExp(ch(0xc3) + CONTINUATION) },
  { label: 'stray continuation prefix (U+00C2)', regex: new RegExp(ch(0xc2) + CONTINUATION + '?') },
  { label: 'double-encoded cp1252 punctuation (U+00E2 + continuations)', regex: new RegExp(ch(0xe2) + range(0x80, 0x2122) + '{1,2}') },
  { label: 'double-encoded emoji (U+00F0 U+0178)', regex: new RegExp(ch(0xf0) + ch(0x178) + CONTINUATION + '?') }
];

describe('public surface encoding', () => {
  it.each(PUBLIC_SURFACE_FILES)('%s round-trips as UTF-8 without mojibake', (file) => {
    const bytes = readFileSync(file);
    const text = bytes.toString('utf8');
    // Round-trip: if the file were not valid UTF-8, decoding inserts U+FFFD
    // and re-encoding would not reproduce the original bytes.
    expect(Buffer.from(text, 'utf8').equals(bytes)).toBe(true);
    for (const { label, regex } of MOJIBAKE_PATTERNS) {
      const match = text.match(regex);
      expect(match, `${file}: ${label}${match ? ` near "${text.slice(Math.max(0, match.index! - 40), match.index! + 40)}"` : ''}`).toBeNull();
    }
  });

  it('src/lib.ts stays ASCII-only (renders safely in any terminal encoding)', () => {
    const text = readFileSync('src/lib.ts', 'utf8');
    const lines = text.split(/\r?\n/);
    const offenders = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => [...line].some((c) => c.codePointAt(0)! > 0x7f))
      .map(({ line, index }) => `line ${index + 1}: ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});
