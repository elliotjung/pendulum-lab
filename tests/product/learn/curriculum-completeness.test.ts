import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { courses } from '../../../content/learn/curriculum';
import { learnModules } from '../../../content/learn/modules';
import { loadLearnUnit } from '../../../src/product/learn/loader';
import { buildCurriculumIndex, learningPaths, loadCurriculumIndex } from '../../../src/product/learn/index-data';
import { validateLearnUnit } from '../../../src/product/learn/validation';
import { parseProductRoute } from '../../../src/product/contracts/routes';
import { parseExperiment, serializeExperiment } from '../../../src/product/persistence/serialization';
import { decodeShareToken } from '../../../src/product/persistence/share';
import { createFocusRuntime, focusPresetConfig } from '../../../src/product/experiments/runtime';
import { focusCanonical, focusLabHref } from '../../../src/product/experiments/transfer';
import { extendedCanonical, extendedPresetFields } from '../../../src/product/experiments/extended-config';
import { executeExtendedExperiment } from '../../../src/product/experiments/extended-science';
import { extendedFocusLabHref } from '../../../src/product/experiments/extended-transfer';
import { researchCanonical } from '../../../src/product/experiments/research-focus-config';
import { researchPresetFields } from '../../../src/product/experiments/research-focus-definitions';
import { executeResearchFocus } from '../../../src/product/experiments/research-focus-science';
import { executeS27ResearchFocus } from '../../../src/product/experiments/s27-science';
import { researchFocusLabHref } from '../../../src/product/experiments/research-focus-transfer';
import { validateResearchResult } from '../../../src/product/experiments/research-focus-validation';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import type { LearnUnit } from '../../../src/product/learn/schema';
import { focusScheduler, unwrap } from '../experiments/fixtures';

const ids = [8, 9, 9, 10, 13, 12, 13, 12].flatMap((count, i) =>
  Array.from({ length: count }, (_, j) => `${i + 1}.${j + 1}`)
);
describe('S27 all86 independent public learning journeys', () => {
  it('has exactly8 courses and86 published, reachable, unconditionally available units', () => {
    expect(courses).toHaveLength(8);
    expect(courses.flatMap((c) => c.units.map((u) => u.id))).toEqual(ids);
    expect(Object.keys(learnModules)).toHaveLength(86);
    expect(courses.flatMap((c) => c.units).every((u) => u.availability === 'published' && u.contentVersion === 1)).toBe(
      true
    );
  });
  it.each(ids)('%s loads, executes the shared engine and preserves its exact versioned Lab state', async (id) => {
    const courseId = `course-${id.split('.')[0]}`;
    const loaded = await loadLearnUnit(courseId, id);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') throw new Error('Missing published unit.');
    const unit = loaded.unit;
    expect(validateLearnUnit(unit)).toEqual({ ok: true, value: unit });
    expect(parseProductRoute(`#/learn/${courseId}/${id}`).ok).toBe(true);
    expect(unit.review).toMatchObject({ automatedVerified: true, sourceChecked: true, humanReviewed: false });
    let canonical: ExperimentStateV1, href: string;
    if (id.startsWith('1.')) {
      const scheduler = focusScheduler(),
        runtime = createFocusRuntime(unit.focusExperiment, { schedule: scheduler.schedule });
      runtime.run();
      scheduler.flush();
      expect(runtime.getSnapshot().status).toBe('completed');
      runtime.dispose();
      const config = unwrap(focusPresetConfig(unit.focusExperiment));
      canonical = focusCanonical(unit, config);
      href = focusLabHref(unit, config);
    } else if (/^[23]\./.test(id)) {
      const fields = extendedPresetFields(id),
        result = executeExtendedExperiment(id, fields);
      expect(result.trace.length).toBeGreaterThan(1);
      canonical = extendedCanonical(unit, fields);
      expect(result.canonical).toEqual(canonical);
      href = extendedFocusLabHref(unit, fields);
    } else {
      const fields = researchPresetFields(id),
        progress: number[] = [];
      const result = await (id.startsWith('8.')
        ? executeS27ResearchFocus(id, fields, (v) => progress.push(v))
        : executeResearchFocus(id, fields, (v) => progress.push(v)));
      expect(validateResearchResult(result, { id: `census_${id.replace('.', '_')}`, unitId: id, fields })).toEqual(
        result
      );
      expect(result.metrics.length).toBeGreaterThan(0);
      expect(result.tables.length + result.charts.length).toBeGreaterThan(0);
      expect(progress.every((v, i) => v >= 0 && v <= 1 && (i === 0 || v >= progress[i - 1]!))).toBe(true);
      canonical = researchCanonical(unit, fields);
      href = researchFocusLabHref(unit, fields);
    }
    expect(canonical.systemId).toBe(unit.labTransfer.systemId);
    expect(canonical.provenance?.source.id).toBe(`learn:${courseId}:${id}:v1`);
    expect(unwrap(parseExperiment(unwrap(serializeExperiment(canonical))))).toEqual(canonical);
    const token = new URLSearchParams(href.split('?')[1]).get('state');
    expect(unwrap(decodeShareToken(token))).toEqual(canonical);
    for (const reference of unit.references)
      if (reference.url.includes('/blob/9cfd9842570cdd3137e3ea866a1266de2585b941/'))
        expect(existsSync(reference.url.split('/9cfd9842570cdd3137e3ea866a1266de2585b941/')[1]!)).toBe(true);
  });
  it('builds a linked glossary/reference index and recommended paths from all86 validated units', async () => {
    const units = await Promise.all(
      ids.map(async (id) => (await learnModules[`course-${id[0]}/${id}`]!()).default as LearnUnit)
    );
    const index = buildCurriculumIndex(units);
    expect(index.terms.length).toBeGreaterThanOrEqual(86);
    expect(index.references.length).toBeGreaterThan(20);
    expect(new Set(index.references.map((r) => r.url)).size).toBe(index.references.length);
    expect(await loadCurriculumIndex()).toEqual(index);
    for (const path of learningPaths) for (const ref of path.units) expect(ids).toContain(ref.unitId);
    for (const entry of index.terms) expect(ids).toContain(entry.unit.unitId);
    for (const entry of index.references) for (const ref of entry.units) expect(ids).toContain(ref.unitId);
    expect(() => buildCurriculumIndex([units[0]!, units[0]!])).toThrow('중복');
    const controller = new AbortController();
    controller.abort();
    expect(await loadCurriculumIndex(controller.signal)).toBeNull();
  });
});
