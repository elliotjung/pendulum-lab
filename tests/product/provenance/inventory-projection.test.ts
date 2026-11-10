import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInventory,
  inventoryFiles,
  inventoryMarkdown,
  legacySourceText,
  serializeInventory
} from '../../../scripts/redesign/inventory';
import { replayOriginalInventoryInputs } from '../../characterization/inventory-original-replay';

const mainPath = 'src/reviewer/main.ts';
const source = readFileSync(mainPath, 'utf8').replaceAll('\r\n', '\n');
const baselineJson = readFileSync('documents/redesign/baseline/inventory.json', 'utf8').replaceAll('\r\n', '\n');
const baselineMarkdown = readFileSync('documents/redesign/baseline/inventory.md', 'utf8').replaceAll('\r\n', '\n');
const baseline = JSON.parse(baselineJson) as { files: { ownerFile: string; sha256: string; bytes: number }[] };
const legacyMain = baseline.files.find((file) => file.ownerFile === mainPath)!;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const roots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pendulum-s24-inventory-projection-'));
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = path.resolve(root);
    expect(path.dirname(absolute)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(absolute).startsWith('pendulum-s24-inventory-projection-')).toBe(true);
    rmSync(absolute, { recursive: true });
  }
});

describe('S24 exact additive reviewer projection preserves the frozen legacy scanner', () => {
  it.each(['LF', 'CRLF'])(
    'matches the actual S01 reviewer SHA and byte count with only approved additions (%s)',
    (ending) => {
      const projected = legacySourceText(mainPath, ending === 'CRLF' ? source.replaceAll('\n', '\r\n') : source);
      expect(digest(projected)).toBe(legacyMain.sha256);
      expect(Buffer.byteLength(projected)).toBe(legacyMain.bytes);
      expect(projected).not.toContain('Research package');
      expect(projected).not.toContain('startReviewer');
      expect(projected).toContain('render().catch((error) => {');
    }
  );

  it.each([
    ['route predicate', "window.location.hash === '#/project'", "window.location.hash === '#/changed'"],
    ['lazy import target', "await import('./project')", "await import('./replacement')"],
    ['route mount', 'module.mountResearchReviewer(document);', 'module.mountResearchReviewer(document, true);'],
    ['legacy fallback', '} else await render();', '} else await renderOther();'],
    [
      'navigation destination',
      "researchLink.href = './reviewer.html?view=project#/project';",
      "researchLink.href = 'https://example.invalid/changed';"
    ],
    ['navigation label', "undefined, 'Research package'", "undefined, 'Unexpected package'"],
    [
      'navigation behavior',
      'nav.append(appLink, paperLink, repoLink, researchLink);',
      'nav.replaceChildren(appLink, researchLink);'
    ],
    ['existing console text', "'Evidence overview'", "'Changed legacy evidence overview'"],
    ['existing console fetch', "cache: 'no-store'", "cache: 'force-cache'"]
  ])('retains drift in %s rather than hiding it in the projection', (_label, before, after) => {
    expect(source).toContain(before);
    const changed = source.replace(before, after);
    expect(digest(legacySourceText(mainPath, changed))).not.toBe(legacyMain.sha256);
  });

  it('does not project identical snippets in another file or hide additional reviewer statements', () => {
    expect(legacySourceText('src/reviewer/unexpected.ts', source)).toBe(source);
    expect(digest(legacySourceText(mainPath, `${source}\nthrow new Error('unexpected behavior');\n`))).not.toBe(
      legacyMain.sha256
    );
  });

  it('excludes only the exact two additive files and scans unknown reviewer files and nested paths', () => {
    const root = fixture({
      'src/reviewer/main.ts': 'export const existing = 1;\n',
      'src/reviewer/reviewer.css': 'body { color: black; }\n',
      'src/reviewer/project.ts': 'throw new Error("additive project");\n',
      'src/reviewer/project.css': 'body { color: green; }\n',
      'src/reviewer/project-extra.ts': 'export const unknown = 1;\n',
      'src/reviewer/project.css.map': '{}',
      'src/reviewer/project/nested.ts': 'export const nested = 1;\n'
    });
    const files = inventoryFiles(root);
    expect(files).toEqual([
      'src/reviewer/main.ts',
      'src/reviewer/project-extra.ts',
      'src/reviewer/project.css.map',
      'src/reviewer/project/nested.ts',
      'src/reviewer/reviewer.css'
    ]);
    const first = buildInventory(root, []);
    expect(first.files.map((file) => file.ownerFile)).toEqual(files);
    expect(
      first.facts.some((fact) => fact.ownerFile === 'src/reviewer/project-extra.ts' && fact.label === 'unknown')
    ).toBe(true);
    writeFileSync(path.join(root, 'src/reviewer/project-extra.ts'), 'export const unknown = 2;\n');
    expect(buildInventory(root, []).sourceDigest).not.toBe(first.sourceDigest);
  });

  it('replays the entire immutable original JSON and Markdown while separately checking declared current S28 drifts', () => {
    const beforeJson = readFileSync('documents/redesign/baseline/inventory.json');
    const beforeMarkdown = readFileSync('documents/redesign/baseline/inventory.md');
    const inventory = buildInventory(process.cwd());
    expect(inventory.errors).toEqual([]);
    const original = replayOriginalInventoryInputs(process.cwd(), fixture({}), inventory);
    expect(original.errors).toEqual([]);
    expect(serializeInventory(original)).toBe(baselineJson);
    expect(inventoryMarkdown(original)).toBe(baselineMarkdown);
    expect(readFileSync('documents/redesign/baseline/inventory.json')).toEqual(beforeJson);
    expect(readFileSync('documents/redesign/baseline/inventory.md')).toEqual(beforeMarkdown);
  });
});
