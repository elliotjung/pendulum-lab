import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { courses, findCourse, findUnitSummary } from '../../../content/learn/curriculum';
import sample from '../../../content/learn/course-1/1.1';
import { validateLearnCourses, validateLearnUnit } from '../../../src/product/learn/validation';
import { loadLearnUnit } from '../../../src/product/learn/loader';
import { validateCurriculumMap, validateLearnContent } from '../../../scripts/redesign/validate-learn';
import { defaultPlanarConfig } from '../../../src/product/adapters/physics/planar-schema';
import { planarPositions } from '../../../src/product/adapters/physics/planar';
import { emptyLearnProgress, LEARN_PROGRESS_LIMITS } from '../../../src/product/learn/progress';
import {
  learnText,
  MAX_LEARN_CHECKPOINTS,
  type ChoiceCheckpoint,
  type UnitSummary
} from '../../../src/product/learn/schema';

function replace(path: string, value: unknown): unknown {
  const fixture = structuredClone(sample);
  const parts = path.split('.');
  let cursor = fixture as unknown as Record<string, unknown>;
  for (const key of parts.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  if (value === undefined) delete cursor[parts.at(-1)!];
  else cursor[parts.at(-1)!] = value;
  return fixture;
}

function checkpointCountFixture(count: number) {
  const checks = Array.from({ length: count }, (_, index): ChoiceCheckpoint => {
    const text = (part: string) => learnText(`learn.course-1.1.1.limit-${index}.${part}`, '확인', 'Check');
    return {
      id: `limit-${index}`,
      prompt: text('prompt'),
      explanation: text('explanation'),
      correctOptionId: 'yes',
      options: ['yes', 'no'].map((id) => ({ id, label: text(`${id}-label`), feedback: text(`${id}-feedback`) }))
    };
  });
  return { ...sample, checks };
}

const fixtures: string[] = [];
function contentFixture(unit: unknown = sample, modules = readFileSync('content/learn/modules.ts', 'utf8')): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pendulum-learn-content-')));
  fixtures.push(root);
  mkdirSync(join(root, 'content/learn/course-1'), { recursive: true });
  mkdirSync(join(root, 'documents/redesign'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'content/learn/curriculum.ts'), `export const courses = ${JSON.stringify(courses)};`);
  writeFileSync(join(root, 'content/learn/modules.ts'), modules);
  cpSync('content/learn/course-1', join(root, 'content/learn/course-1'), { recursive: true });
  writeFileSync(join(root, 'content/learn/course-1/1.1.ts'), `export default ${JSON.stringify(unit)};`);
  cpSync('documents/redesign/curriculum-map-ko.md', join(root, 'documents/redesign/curriculum-map-ko.md'));
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    const relativePath = relative(realpathSync(tmpdir()), resolve(root));
    if (
      isAbsolute(relativePath) ||
      relativePath.startsWith('..') ||
      !relativePath.startsWith('pendulum-learn-content-')
    ) {
      throw new Error('Refusing to remove a Learn fixture outside its temporary directory.');
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Learn content schema and authoritative curriculum', () => {
  it('reserves exactly 8 courses and 86 units, with the eight S09 course-one units available', () => {
    expect(validateLearnCourses(courses).ok).toBe(true);
    expect(courses).toHaveLength(8);
    expect(courses.map((course) => course.units.length)).toEqual([8, 9, 9, 10, 13, 12, 13, 12]);
    expect(
      courses
        .flatMap<UnitSummary>((course) => course.units)
        .filter((unit) => unit.availability !== 'planned')
        .map((unit) => unit.id)
    ).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8']);
    expect(findCourse('course-9')).toBeUndefined();
    expect(findUnitSummary('course-2', '1.1')).toBeUndefined();
  });

  it('validates all registered modules, disk coverage, titles and Markdown order', async () => {
    expect(await validateLearnContent(process.cwd())).toEqual([]);
    expect(validateLearnUnit(sample)).toEqual({ ok: true, value: sample });
  });

  it('accepts the exact shared 64-checkpoint boundary in both content and progress contracts', () => {
    expect(MAX_LEARN_CHECKPOINTS).toBe(64);
    expect(LEARN_PROGRESS_LIMITS.checks).toBe(MAX_LEARN_CHECKPOINTS);
    const unit = checkpointCountFixture(MAX_LEARN_CHECKPOINTS);
    expect(validateLearnUnit(unit)).toEqual({ ok: true, value: unit });
    expect(emptyLearnProgress(unit)).toMatchObject({ status: 'not-started', totalChecks: 64, completedChecks: 0 });
  });

  it('rejects a 65-checkpoint unit during content validation before progress creation can fail', () => {
    const result = validateLearnUnit(checkpointCountFixture(MAX_LEARN_CHECKPOINTS + 1));
    expect(result).toEqual({ ok: false, errors: ['unit.checks: Expected array of 1–64 entries.'] });
  });

  it('rejects a reserved checkpoint ID during content validation', () => {
    const result = validateLearnUnit(replace('checks.0.id', 'constructor'));
    expect(result).toEqual({
      ok: false,
      errors: ['unit.checks[0].id: Expected a non-reserved block or option identifier.']
    });
  });

  it('rejects a reserved option ID during content validation', () => {
    const result = validateLearnUnit(replace('checks.0.options.0.id', 'prototype'));
    expect(result).toEqual({
      ok: false,
      errors: ['unit.checks[0].options[0].id: Expected a non-reserved block or option identifier.']
    });
  });

  it('rejects own fields named after inherited Object members at root and nested content boundaries', () => {
    expect(validateLearnUnit(replace('toString', 'unrecognized'))).toEqual({
      ok: false,
      errors: ['unit.toString: Unknown field.']
    });
    expect(validateLearnUnit(replace('summary.valueOf', 'unrecognized'))).toEqual({
      ok: false,
      errors: ['unit.summary.valueOf: Unknown field.']
    });
  });

  it('runs the CLI in a fresh process and reports content validation instead of silently succeeding', () => {
    const root = contentFixture();
    const command = ['--import', import.meta.resolve('tsx'), resolve('scripts/redesign/validate-learn.ts')];
    const valid = spawnSync(process.execPath, command, { cwd: root, encoding: 'utf8', timeout: 20000 });
    expect(valid.error).toBeUndefined();
    expect(valid.status, valid.stderr).toBe(0);
    expect(valid.stdout).toContain('Learn content check ok: 8 courses / 86');
    writeFileSync(
      join(root, 'content/learn/course-1/1.1.ts'),
      `export default ${JSON.stringify(replace('equations.0.symbols.0.meaning.ko', ''))};`
    );
    const invalid = spawnSync(process.execPath, command, { cwd: root, encoding: 'utf8', timeout: 20000 });
    expect(invalid.error).toBeUndefined();
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Learn content check FAILED');
    expect(invalid.stderr).toContain('symbols[0].meaning.ko');
  }, 45000);

  it.each([
    ['missing registration', 'export const learnModules = {};', 'available unit has no loader registration'],
    [
      'duplicate registration',
      "export const learnModules = { 'course-1/1.1': () => import('./course-1/1.1'), 'course-1/1.1': () => import('./course-1/1.1') };",
      'duplicate module registration'
    ],
    [
      'path traversal',
      "export const learnModules = { 'course-1/1.1': () => import('../outside') };",
      'module path must match'
    ],
    [
      'unavailable unit',
      "export const learnModules = { 'course-2/2.1': () => import('./course-2/2.1') };",
      'module is not an available curriculum unit'
    ],
    [
      'computed module',
      "export const learnModules = { 'course-1/1.1': () => import('./course-1/' + '1.1') };",
      'one literal dynamic import'
    ]
  ])('rejects %s in the authored module manifest', async (_name, modules, error) => {
    expect(await validateLearnContent(contentFixture(sample, modules))).toEqual(
      expect.arrayContaining([expect.stringContaining(error)])
    );
  });

  it('detects a missing file, orphan file and broken curriculum metadata at the supplied content root', async () => {
    const missingRoot = contentFixture();
    rmSync(join(missingRoot, 'content/learn/course-1/1.1.ts'));
    expect(await validateLearnContent(missingRoot)).toContain('course-1/1.1: content file is missing.');
    const orphanRoot = contentFixture();
    writeFileSync(join(orphanRoot, 'content/learn/course-1/orphan.ts'), 'export default {};');
    expect(await validateLearnContent(orphanRoot)).toContain(
      'content/learn/course-1/orphan.ts: orphan or unsupported content module.'
    );
    const metadataRoot = contentFixture();
    writeFileSync(join(metadataRoot, 'content/learn/curriculum.ts'), 'export const courses = [];');
    expect(await validateLearnContent(metadataRoot)).toEqual(
      expect.arrayContaining([expect.stringContaining('Expected array')])
    );
  });

  it('compares every reserved ID, title and order with the authoritative map without duplicate hard-coded limits', () => {
    const markdown = readFileSync('documents/redesign/curriculum-map-ko.md', 'utf8');
    const changed = structuredClone(courses);
    changed[0]!.units[1]!.id = '1.99';
    expect(validateCurriculumMap(markdown, changed)).toContain('unit 1.2 metadata differs from the authoritative map.');
    const reordered = [...courses[0]!.units];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(validateCurriculumMap(markdown, [{ ...courses[0]!, units: reordered }, ...courses.slice(1)])).toEqual([
      'unit 1.1 metadata differs from the authoritative map.',
      'unit 1.2 metadata differs from the authoritative map.'
    ]);
  });

  it('stops the actual npm build lifecycle on a bad content fixture before output is emitted', () => {
    const root = contentFixture(replace('equations.0.expression', 'x1 = unexplained'));
    // Copy only build-gate inputs. The real package lifecycle must stop before Vite needs app assets.
    cpSync('src', join(root, 'src'), { recursive: true });
    cpSync('scripts/redesign', join(root, 'scripts/redesign'), { recursive: true });
    cpSync('documents/redesign/baseline', join(root, 'documents/redesign/baseline'), { recursive: true });
    cpSync('package.json', join(root, 'package.json'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const npm = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const result = spawnSync(process.execPath, [npm, 'run', 'build'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('prebuild');
    expect(result.stdout).toContain('redesign:catalog:check');
    expect(result.stderr).toContain('missing variable description/unit for unexplained');
    expect(result.stdout).not.toContain('vite build');
    expect(existsSync(join(root, 'dist'))).toBe(false);
  }, 75000);

  it('rejects metadata missing, duplicate, moved or renamed units and unknown fields', () => {
    expect(validateLearnCourses([...courses, courses[0]])).toMatchObject({ ok: false });
    expect(validateLearnCourses([{ ...courses[0], unknown: true }])).toMatchObject({ ok: false });
    const changed = structuredClone(courses);
    changed[0]!.units[1]!.id = '1.1';
    expect(validateLearnCourses(changed)).toMatchObject({ ok: false });
    const markdown = readFileSync('documents/redesign/curriculum-map-ko.md', 'utf8');
    expect(
      validateCurriculumMap(markdown.replace('이중진자의 일반화좌표와 구성공간', '다른 제목'), courses).length
    ).toBeGreaterThan(0);
    expect(validateCurriculumMap(markdown.replace('| 1.1 |', '| 9.1 |'), courses).length).toBeGreaterThan(0);
    expect(validateCurriculumMap(markdown, courses.slice(1)).length).toBeGreaterThan(0);
  });

  it.each([
    ['schema', 'pendulum-learn-unit/v99'],
    ['id', '1.99'],
    ['courseId', '../course-1'],
    ['contentVersion', 0],
    ['contentVersion', 1.5],
    ['kind', 'sample'],
    ['summary.en', ''],
    ['summary.key', 'learn.wrong.key'],
    ['summary.key', sample.title.key],
    ['objectives', []],
    ['prerequisites', null],
    ['concepts.0.body.ko', undefined],
    ['concepts.0.id', sample.equations[0]!.id],
    ['concepts.0.citationIds', ['missing']],
    ['equations.0.symbols', []],
    ['equations.0.symbols.0.meaning.ko', ''],
    ['equations.0.symbols.0.unit', 'cm'],
    ['equations.0.symbols.0.symbol', 'unused'],
    ['equations.0.expression', 'x1 = unknown * theta1'],
    ['equations.0.expression', 'x1 = sin + l1 * theta1; y1 = 0'],
    ['equations.0.expression', '<script>alert(1)</script>'],
    ['equations.0.accessibleText.en', ''],
    ['figures.0.alt.ko', ''],
    ['figures.0.nodes.0.x', 1.01],
    ['figures.0.nodes.1.id', 'pivot'],
    ['figures.0.lines.0.to', 'missing'],
    ['checks.0.correctOptionId', 'missing'],
    ['checks.0.options.1.id', 'one'],
    ['checks.0.options', []],
    ['focusExperiment.systemId', 'system:missing'],
    ['focusExperiment.systemId', 'system:triple'],
    ['focusExperiment.defaultPreset.integratorId', 'integrator:missing'],
    ['focusExperiment.analysisIds', ['analysis:missing']],
    ['focusExperiment.exposedFields', ['theta1', 'theta1']],
    ['focusExperiment.exposedFields', ['l1']],
    ['focusExperiment.fixedFields.0.value', 2],
    ['focusExperiment.fixedFields.0.unit', 's'],
    ['focusExperiment.defaultPreset.fields.0.value', -1],
    ['focusExperiment.defaultPreset.fields.0.id', 'unknown'],
    ['focusExperiment.defaultPreset.fields', []],
    ['focusExperiment.defaultPreset.fields.10.value', 300],
    ['focusExperiment.status', 'planned'],
    ['labTransfer.sourceUnitId', '1.2'],
    ['labTransfer.systemId', 'system:compound-double'],
    ['references.0.url', 'javascript:alert(1)'],
    ['references.0.url', 'https://u:p@example.org'],
    ['references.0.accessedOn', '2026-02-30'],
    ['review.humanReviewed', true],
    ['review.automatedVerified', false],
    ['review.sourceChecked', false],
    ['review.schemaVerified', false],
    ['unknownField', true]
  ])('rejects invalid %s = %s', (path, value) => {
    expect(validateLearnUnit(replace(path, value)).ok).toBe(false);
  });

  it('rejects missing prerequisites, duplicate symbols and unused citations', () => {
    expect(
      validateLearnUnit(replace('prerequisites.0.recommendedUnits', [{ courseId: 'course-1', unitId: '1.99' }])).ok
    ).toBe(false);
    expect(
      validateLearnUnit(replace('prerequisites.0.recommendedUnits', [{ courseId: 'course-1', unitId: '1.1' }])).ok
    ).toBe(false);
    expect(
      validateLearnUnit(
        replace('equations.0.symbols', [...sample.equations[0]!.symbols, sample.equations[0]!.symbols[0]!])
      ).ok
    ).toBe(false);
    expect(
      validateLearnUnit(replace('references', [...sample.references, { ...sample.references[0], id: 'unused' }])).ok
    ).toBe(false);
  });

  it('takes a safe snapshot and rejects accessors without invoking them', () => {
    const getter = vi.fn(() => 'malicious');
    const unsafe = { ...sample };
    Object.defineProperty(unsafe, 'summary', { get: getter, enumerable: true });
    expect(validateLearnUnit(unsafe).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const valid = validateLearnUnit(sample);
    expect(valid.ok && valid.value).not.toBe(sample);
  });

  it.each([
    null,
    [],
    42,
    new Date(),
    { ...sample, injected: () => true },
    JSON.parse('{"__proto__":{"polluted":true}}'),
    replace('contentVersion', NaN),
    replace('summary.ko', 'x'.repeat(5000))
  ])('rejects unsafe or malformed content %s', (value) => {
    expect(validateLearnUnit(value).ok).toBe(false);
  });

  it('preserves the former sample position answer and exposes pending human scientific review', () => {
    const positions = planarPositions(defaultPlanarConfig(), [0, 0, 0, 0]);
    expect(positions.first.x).toBeCloseTo(0, 14);
    expect(positions.first.y).toBe(-1);
    expect(sample.checks[1]?.correctOptionId).toBe('below');
    expect(sample.review).toMatchObject({
      schemaVerified: true,
      sourceChecked: true,
      automatedVerified: true,
      humanReviewed: false
    });
  });
});

describe('Learn asynchronous loading', () => {
  it('loads the sample as a safe ready snapshot and keeps planned routes explicit', async () => {
    expect(await loadLearnUnit('course-1', '1.1')).toEqual({ status: 'ready', unit: sample });
    const importUnit = vi.fn();
    expect(await loadLearnUnit('course-8', '8.12', { importUnit })).toMatchObject({ status: 'planned' });
    expect(importUnit).not.toHaveBeenCalled();
  });
  it.each([
    ['course-9', '9.1'],
    ['course-2', '1.1'],
    ['../course-1', '1.1'],
    ['course-1', '__proto__']
  ])('never imports an unknown route %s/%s', async (course, unit) => {
    const importUnit = vi.fn();
    expect(await loadLearnUnit(course, unit, { importUnit })).toEqual({ status: 'missing' });
    expect(importUnit).not.toHaveBeenCalled();
  });
  it('provides recoverable network/content failures and allows retry', async () => {
    expect(
      await loadLearnUnit('course-1', '1.1', { importUnit: () => Promise.reject(new Error('private exception')) })
    ).toMatchObject({ status: 'error' });
    expect(
      await loadLearnUnit('course-1', '1.1', { importUnit: async () => ({ default: replace('id', '1.2') }) })
    ).toMatchObject({ status: 'error' });
    expect(await loadLearnUnit('course-1', '1.1', { importUnit: async () => ({ default: sample }) })).toMatchObject({
      status: 'ready'
    });
  });
  it('accepts module live bindings while rejecting accessors inside the authored content', async () => {
    const module = Object.defineProperty({}, 'default', { get: () => sample }) as { default: unknown };
    expect(await loadLearnUnit('course-1', '1.1', { importUnit: async () => module })).toMatchObject({
      status: 'ready'
    });
    const getter = vi.fn(() => sample.summary);
    const content = Object.defineProperty({ ...sample }, 'summary', { get: getter, enumerable: true });
    expect(await loadLearnUnit('course-1', '1.1', { importUnit: async () => ({ default: content }) })).toMatchObject({
      status: 'error'
    });
    expect(getter).not.toHaveBeenCalled();
  });
  it('cancels before import and while a chunk stays pending', async () => {
    const controller = new AbortController();
    const importUnit = vi.fn(() => new Promise<{ default: unknown }>(() => {}));
    controller.abort();
    expect(await loadLearnUnit('course-1', '1.1', { signal: controller.signal, importUnit })).toEqual({
      status: 'cancelled'
    });
    expect(importUnit).not.toHaveBeenCalled();
    const running = new AbortController();
    const result = loadLearnUnit('course-1', '1.1', { signal: running.signal, importUnit });
    await Promise.resolve();
    expect(importUnit).toHaveBeenCalledOnce();
    running.abort();
    expect(await result).toEqual({ status: 'cancelled' });
  });
  it('ignores a late network rejection after cancellation', async () => {
    let reject: (error: Error) => void = () => {};
    const controller = new AbortController();
    const result = loadLearnUnit('course-1', '1.1', {
      signal: controller.signal,
      importUnit: () =>
        new Promise((_, failed) => {
          reject = failed;
        })
    });
    await Promise.resolve();
    controller.abort();
    expect(await result).toEqual({ status: 'cancelled' });
    reject(new Error('late network failure'));
    await Promise.resolve();
  });
});
