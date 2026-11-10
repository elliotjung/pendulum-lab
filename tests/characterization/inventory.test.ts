import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInventory,
  inventoryFiles,
  inventoryMarkdown,
  resolveRelativeImport,
  serializeInventory
} from '../../scripts/redesign/inventory';
import { capabilitySeeds } from '../../scripts/redesign/inventory-map';
import { replayOriginalInventoryInputs } from './inventory-original-replay';

const temporaryRoots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pendulum-s01-inventory-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  // Delete only fixture directories created by this test, after containment checks.
  for (const root of temporaryRoots.splice(0)) {
    const absolute = path.resolve(root);
    expect(path.dirname(absolute)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(absolute).startsWith('pendulum-s01-inventory-')).toBe(true);
    rmSync(absolute, { recursive: true });
  }
});

describe('S01 read-only capability inventory', () => {
  it('checks current inputs and replays the immutable original baseline with only explicitly declared S28 copies replaced', () => {
    const inventory = buildInventory(process.cwd());
    expect(inventory.errors).toEqual([]);
    expect(inventory.summary.orphans).toBe(0);
    expect(inventory.summary.brokenImports).toBe(0);
    expect(inventory.capabilities).toHaveLength(capabilitySeeds.length);
    expect(inventory.capabilities.every((item) => item.line > 0)).toBe(true);
    expect(inventory.facts.filter((item) => item.category === 'integrator')).toHaveLength(16);
    expect(inventory.facts.filter((item) => item.category === 'public-entrypoint')).toHaveLength(8);
    for (const ownerFile of [
      'src/worker/sim.worker.ts',
      'src/runtime/wasm/pendulum-kernel.wasm',
      'scripts/research-cli.ts',
      'app.html',
      'public/sw.js',
      'tests/fixtures/storage-import/workspace-v1.json'
    ]) {
      expect(inventory.files.find((file) => file.ownerFile === ownerFile)).toBeDefined();
    }
    const original = replayOriginalInventoryInputs(process.cwd(), fixture({}), inventory);
    expect(original.errors).toEqual([]);
    expect(serializeInventory(original)).toBe(
      readFileSync('documents/redesign/baseline/inventory.json', 'utf8').replaceAll('\r\n', '\n')
    );
    expect(inventoryMarkdown(original)).toBe(
      readFileSync('documents/redesign/baseline/inventory.md', 'utf8').replaceAll('\r\n', '\n')
    );
  });

  it('fails for a missing module, a removed named export, and a non-module used as a namespace', () => {
    const root = fixture({
      'src/physics/consumer.ts':
        "import { removed } from './provider'; import { absent } from './script'; export * from './missing';",
      'src/physics/provider.ts': 'export const retained = 1;',
      'src/physics/script.ts': 'const noExports = 1;'
    });
    const inventory = buildInventory(root, []);
    expect(inventory.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Broken export: src/physics/consumer.ts'),
        expect.stringContaining('./provider#removed'),
        expect.stringContaining('./script#absent')
      ])
    );
    expect(inventory.summary.brokenImports).toBe(3);
  });

  it('resolves aliases and barrel exports while never executing side effects', () => {
    const root = fixture({
      'package.json': JSON.stringify({ version: '1', exports: { '.': {} } }),
      'src/lib.ts': "export { actual as stable } from './physics/model'; export type { State } from './physics/model';",
      'src/physics/model.ts':
        "throw new Error('SCANNER MUST NOT EXECUTE THIS'); export const actual = 3; export interface State { x: number }",
      'src/physics/consumer.ts':
        "import { stable as alias } from '../lib'; // import './fake-comment';\nconst text = \"import './fake-string'\";"
    });
    const before = inventoryFiles(root).map((file) => [file, readFileSync(path.join(root, file), 'utf8')]);
    const inventory = buildInventory(root, []);
    expect(inventory.errors).toEqual([]);
    expect(
      inventory.facts.filter((item) => item.category === 'public-api').map((item) => [item.label, item.ownerFile])
    ).toEqual([
      ['.#stable', 'src/physics/model.ts'],
      ['.#State', 'src/physics/model.ts']
    ]);
    expect(inventory.imports.some((edge) => edge.specifier.includes('fake'))).toBe(false);
    expect(inventoryFiles(root).map((file) => [file, readFileSync(path.join(root, file), 'utf8')])).toEqual(before);
    expect(readdirSync(root)).toEqual(['package.json', 'src']);
  });

  it('rejects an unowned system registration, unknown source family, and deleted semantic anchor', () => {
    const root = fixture({
      'src/physics/systemSpec.ts': "export const SYSTEM_SPEC_KINDS = ['new-unassigned-system'];",
      'src/new-engine/secret.ts': 'export const newPhysics = 42;',
      'src/physics/double.ts': 'export const renamed = 1;'
    });
    const inventory = buildInventory(root, [capabilitySeeds[0]!]);
    expect(inventory.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing semantic capability declaration: system:double'),
        expect.stringContaining('Orphan registered system:'),
        expect.stringContaining('Unassigned source/asset family: src/new-engine/secret.ts')
      ])
    );
  });

  it('distinguishes source-relative worker assets from runtime URL bases and computed imports', () => {
    const root = fixture({
      'src/physics/urls.ts':
        "const a = new URL('./runtime-only', window.location.href); const b = new URL('./kernel.wasm', import.meta.url); const c = import('./provider'); const d = import(modulePath);",
      'src/physics/provider.ts': 'export const ok = 1;',
      'src/physics/kernel.wasm': 'fixture'
    });
    const inventory = buildInventory(root, []);
    expect(inventory.errors).toEqual([]);
    expect(inventory.imports.map((edge) => [edge.kind, edge.target])).toEqual([
      ['asset-url', 'src/physics/kernel.wasm'],
      ['dynamic-import', 'src/physics/provider.ts']
    ]);
    expect(inventory.unresolvedDynamicImports).toEqual([
      { ownerFile: 'src/physics/urls.ts', line: 1, expression: 'import(modulePath)' }
    ]);
  });

  it('resolves directory barrels, emitted JS references and asset queries without escaping the root', () => {
    const root = fixture({
      'src/physics/model.ts': '',
      'src/physics/barrel/index.ts': '',
      'src/physics/data.json': '{}'
    });
    expect(resolveRelativeImport(root, 'src/physics/consumer.ts', './model.js')).toBe('src/physics/model.ts');
    expect(resolveRelativeImport(root, 'src/physics/consumer.ts', './barrel')).toBe('src/physics/barrel/index.ts');
    expect(resolveRelativeImport(root, 'src/physics/consumer.ts', './data.json?raw')).toBe('src/physics/data.json');
    expect(resolveRelativeImport(root, 'src/physics/consumer.ts', '../../../outside')).toBeNull();
  });

  it('ignores harness aliases and platform line endings while retaining package API drift', () => {
    const first = fixture({
      'package.json': JSON.stringify({ version: '1', scripts: { test: 'old' }, exports: {} }),
      'src/physics/model.ts': 'export const value = 1;\r\n'
    });
    const second = fixture({
      'package.json': JSON.stringify({
        version: '1',
        scripts: { test: 'old', 'redesign:inventory': 'tsx' },
        exports: {}
      }),
      'src/physics/model.ts': 'export const value = 1;\n'
    });
    const firstInventory = buildInventory(first, []);
    const secondInventory = buildInventory(second, []);
    expect(secondInventory.sourceDigest).toBe(firstInventory.sourceDigest);
    expect(serializeInventory(secondInventory)).toBe(serializeInventory(firstInventory));
    writeFileSync(path.join(second, 'package.json'), JSON.stringify({ version: '1', scripts: {}, exports: {} }));
    expect(buildInventory(second, []).sourceDigest).not.toBe(firstInventory.sourceDigest);
  });
});
