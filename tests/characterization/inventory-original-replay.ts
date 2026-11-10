/** Replay immutable S01 inputs without hiding the explicitly declared current S28 drifts. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildInventory, inventoryFiles, type Inventory } from '../../scripts/redesign/inventory';

const originalInputs = [
  {
    path: 'src/app/SimulationClock.ts',
    blob: '965d58020a3511cf095868591407143baa4edea7',
    originalSha256: '774773472c1b0fcc66fffc307cc72e1c0781400da38fa49d837501a9fcb723d7',
    currentSha256: 'f1198ad55f87fde974c0119bccd58c4f6e4e73d8cd648a900879b8f5a8bc6327'
  },
  {
    path: 'scripts/copy-legacy-assets.mjs',
    blob: '1e31f46f77a649e9d518f9015cc74ccba4a2bfe8',
    originalSha256: '160fbc530dc74ba35c40c83f483c03f0833bb9b2bbaa077708b8c83a799c4e17',
    currentSha256: 'b216624c9097dcd6a7a31b7008f37f1a88069bdababe6fb2bfc4886241d1bd41'
  },
  {
    path: 'scripts/public-vitest-report.mjs',
    blob: '396bf1b6a5ab27b9a81588156a519daea68a70aa',
    originalSha256: 'da24ac815b49997ee79d4278ec6f26f0e8d508dc2895655b6b2269630beb45e8',
    currentSha256: 'f9830bcf4746607297e6c88aae95ac56a634ad9b67c7cdda9163a91b01afdfee'
  }
] as const;
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

/** The caller owns this newly created empty fixture and its existing containment-checked cleanup. */
export function replayOriginalInventoryInputs(
  repositoryRoot: string,
  emptyFixtureRoot: string,
  current: Inventory
): Inventory {
  const root = path.resolve(repositoryRoot),
    target = path.resolve(emptyFixtureRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.match(path.basename(target), /^pendulum-(?:s01-inventory|s24-inventory-projection)-/);
  assert.equal(lstatSync(target).isSymbolicLink(), false);
  assert.deepEqual(readdirSync(target), []);
  const baselineJson = readFileSync(path.join(root, 'documents/redesign/baseline/inventory.json')),
    baselineMarkdown = readFileSync(path.join(root, 'documents/redesign/baseline/inventory.md')),
    baseline = JSON.parse(baselineJson.toString('utf8')) as Inventory,
    names = inventoryFiles(root),
    expectedNames = baseline.files.map((file) => file.ownerFile).sort();
  assert.equal(expectedNames.length, 883);
  // Unknown additions and missing files fail before any fixture copies; never filter current paths to baseline.
  assert.deepEqual(names, expectedNames);
  assert.deepEqual(current.files.map((file) => file.ownerFile).sort(), expectedNames);
  const exceptions = JSON.parse(
    readFileSync(path.join(root, 'documents/redesign/parity/S28-preservation-exceptions.json'), 'utf8')
  ) as {
    exceptions: { path: string; baselineSha256: string; currentSha256: string; before: { gitBlob: string } }[];
  };
  assert.deepEqual(
    exceptions.exceptions.map((entry) => entry.path).sort(),
    originalInputs.map((entry) => entry.path).sort()
  );
  const changed = new Set(originalInputs.map((entry) => entry.path));
  for (const file of current.files) {
    const frozen = baseline.files.find((entry) => entry.ownerFile === file.ownerFile)!;
    if (!changed.has(file.ownerFile as (typeof originalInputs)[number]['path'])) {
      assert.equal(file.sha256, frozen.sha256, `Unexpected current S01 input drift: ${file.ownerFile}`);
      assert.equal(file.bytes, frozen.bytes, `Unexpected current S01 input byte-count drift: ${file.ownerFile}`);
    }
  }
  // The scanner resolves these real assets/configs without listing them as scanned inputs.
  // Copy exact current targets, then prove the scanner still sees only the frozen883 paths.
  const scanned = new Set(names);
  const resolutionTargets = (inventory: Inventory) =>
    [
      ...new Set(inventory.imports.flatMap((edge) => (edge.target && !scanned.has(edge.target) ? [edge.target] : [])))
    ].sort();
  const support = resolutionTargets(current);
  assert.deepEqual(support, resolutionTargets(baseline));
  for (const name of [...names, ...support]) {
    const destination = path.resolve(target, name);
    assert.ok(destination.startsWith(`${target}${path.sep}`));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(root, name), destination);
  }
  for (const input of originalInputs) {
    const ledger = exceptions.exceptions.find((entry) => entry.path === input.path)!;
    assert.equal(ledger.before.gitBlob, input.blob);
    assert.equal(ledger.baselineSha256, input.originalSha256);
    assert.equal(ledger.currentSha256, input.currentSha256);
    assert.equal(baseline.files.find((entry) => entry.ownerFile === input.path)!.sha256, input.originalSha256);
    const actual = readFileSync(path.join(root, input.path), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(sha256(actual), input.currentSha256, `Current declared exception changed: ${input.path}`);
    const original = execFileSync('git', ['cat-file', 'blob', input.blob], { cwd: root });
    assert.equal(sha256(original), input.originalSha256);
    writeFileSync(path.join(target, input.path), original);
  }
  const replay = buildInventory(target);
  assert.deepEqual(inventoryFiles(target), expectedNames);
  assert.deepEqual(readFileSync(path.join(root, 'documents/redesign/baseline/inventory.json')), baselineJson);
  assert.deepEqual(readFileSync(path.join(root, 'documents/redesign/baseline/inventory.md')), baselineMarkdown);
  return replay;
}
