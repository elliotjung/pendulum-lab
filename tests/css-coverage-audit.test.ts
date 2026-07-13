import { describe, expect, it } from 'vitest';
import {
  extractStyleRuleRanges,
  mergeRanges,
  rangesOverlap,
  unusedCandidatesForEntry
} from '../scripts/css-coverage-audit';

describe('CSS coverage audit', () => {
  it('extracts top-level and conditional selectors but not at-rule declarations', () => {
    const css =
      '.used { color: red; } @media (min-width: 1px) { .nested, .pair { display: grid; } } @font-face { font-family: x; }';
    expect(extractStyleRuleRanges(css).map((rule) => rule.selector)).toEqual(['.used', '.nested, .pair']);
  });

  it('uses half-open range overlap semantics', () => {
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 9, end: 12 })).toBe(true);
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 10, end: 12 })).toBe(false);
  });

  it('merges overlapping precise-coverage byte ranges', () => {
    expect(
      mergeRanges([
        { start: 4, end: 10 },
        { start: 0, end: 5 },
        { start: 20, end: 21 }
      ])
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 21 }
    ]);
  });

  it('reports only wholly uncovered rules as candidates', () => {
    const text = '.used { color: red; }\n.unused { color: blue; }';
    const firstEnd = text.indexOf('}') + 1;
    const candidates = unusedCandidatesForEntry({ url: 'app.css', text, ranges: [{ start: 0, end: firstEnd }] });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ source: 'app.css', selector: '.unused', line: 2 });
  });
});
