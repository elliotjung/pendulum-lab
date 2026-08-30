import { describe, expect, it } from 'vitest';
import { minifyStandaloneHtml } from '../scripts/standalone-html-minify.mjs';

describe('standalone HTML minification', () => {
  it('removes shell comments and redundant whitespace while otherwise preserving raw blocks', () => {
    const source = `<!doctype html>
      <!-- generated-only note -->
      <main
        title="keep  two spaces"> hello\n       world </main>
      <pre>  keep\n  every space </pre>
      <script>const source = '  keep  '; /* keep */</script>
      <svg><text>  keep  </text></svg>`;
    const output = minifyStandaloneHtml(source);

    expect(output).not.toContain('generated-only note');
    expect(output).not.toContain('<main\n');
    expect(output).toContain('<main title="keep  two spaces">');
    expect(output).toContain('<main title="keep  two spaces"> hello world </main>');
    expect(output).toContain('<pre>  keep\n  every space </pre>');
    expect(output).toContain("<script>const source = '  keep  '; /* keep */</script>");
    expect(output).toContain('<svg><text>  keep  </text></svg>');
  });

  it('removes only literal fallbacks guaranteed by an unconditional root token', () => {
    const source = `<style>:root{--workbench-text:#fff;--font-sans:Arial;--focus:#fff}.card{color:var(--workbench-text,#f1f3f8);font-family:var(--font-sans,system-ui);outline-color:var(--focus,#b7afff);border-color:var(--workbench-warning,#f6c96a)}</style>
      <script>const css = '.nested{color:var(--workbench-text,rgba(1,2,3,.4))}'</script>`;
    const output = minifyStandaloneHtml(source);

    expect(output).toContain('color:var(--workbench-text)');
    expect(output).toContain('font-family:var(--font-sans)');
    expect(output).toContain('outline-color:var(--focus)');
    expect(output).toContain('border-color:var(--workbench-warning,#f6c96a)');
    expect(output).toContain("'.nested{color:var(--workbench-text)}'");

    const scopedOnly = minifyStandaloneHtml(
      '<style>@media(prefers-contrast:more){:root{--workbench-text:#fff}}:root{--sp:4px}.card{color:var(--workbench-text,#f1f3f8);gap:var(--sp,8px);inset:var(--custom-select-origin,0)}</style>'
    );
    expect(scopedOnly).toContain('var(--workbench-text,#f1f3f8)');
    expect(scopedOnly).toContain('var(--sp,8px)');
    expect(scopedOnly).toContain('var(--custom-select-origin,0)');
  });
});
