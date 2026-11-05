import { courses } from '../../../content/learn/curriculum';
import { loadLearnUnit } from './loader';
import type { LearnCourse, LearnUnit, UnitRef } from './schema';

export interface LearningPath {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly units: readonly UnitRef[];
}
const refs = (...ids: string[]): readonly UnitRef[] =>
  ids.map((unitId) => ({ courseId: `course-${unitId.split('.')[0]}`, unitId }));
/** Suggestions are links only. Progress never participates in routing or permissions. */
export const learningPaths: readonly LearningPath[] = [
  {
    id: 'model-to-chaos',
    title: '모델에서 카오스 측정까지',
    description: '좌표와 수치 검증을 먼저 확인하고, 구동과 카오스 지표를 연결합니다.',
    units: refs('1.1', '1.4', '2.7', '2.8', '4.2', '5.4', '5.5', '5.10')
  },
  {
    id: 'branches-and-collective-motion',
    title: '안정성에서 집단 운동까지',
    description: '국소 안정성과 분기 구조를 읽고 네트워크·확률·장·양자 모형의 차이를 비교합니다.',
    units: refs('6.1', '6.2', '6.3', '6.6', '6.9', '7.2', '7.4', '7.7', '7.10', '7.13')
  },
  {
    id: 'reproducible-inquiry',
    title: '재현 가능한 연구 만들기',
    description: '대조군과 관측 변환에서 모델 검증과 검토 패키지까지 이어갑니다.',
    units: refs('2.9', '8.1', '8.2', '8.4', '8.3', '8.5', '8.7', '8.10', '8.11', '8.12')
  }
];
export interface CurriculumIndex {
  readonly terms: readonly {
    readonly term: string;
    readonly english: string;
    readonly definition: string;
    readonly unit: UnitRef;
  }[];
  readonly references: readonly {
    readonly title: string;
    readonly authors: string;
    readonly url: string;
    readonly units: readonly UnitRef[];
  }[];
}
/** Pure extraction from validated units; citations and definitions retain their unit context. */
export function buildCurriculumIndex(units: readonly LearnUnit[]): CurriculumIndex {
  const references = new Map<string, { title: string; authors: string; url: string; units: UnitRef[] }>();
  const terms: CurriculumIndex['terms'][number][] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    const key = `${unit.courseId}/${unit.id}`;
    if (seen.has(key)) throw new Error('색인에 중복 단원이 있습니다.');
    seen.add(key);
    const ref = { courseId: unit.courseId, unitId: unit.id };
    for (const term of unit.glossary)
      terms.push({ term: term.term.ko, english: term.term.en, definition: term.definition.ko, unit: ref });
    for (const citation of unit.references) {
      const prior = references.get(citation.url);
      if (prior) {
        if (!prior.units.some((r) => r.courseId === ref.courseId && r.unitId === ref.unitId)) prior.units.push(ref);
      } else
        references.set(citation.url, {
          title: citation.title.ko,
          authors: citation.authors,
          url: citation.url,
          units: [ref]
        });
    }
  }
  return {
    terms: terms.sort((a, b) => a.term.localeCompare(b.term, 'ko')),
    references: [...references.values()].sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  };
}
export async function loadCurriculumIndex(signal?: AbortSignal): Promise<CurriculumIndex | null> {
  const units: LearnUnit[] = [];
  const availableCourses: readonly LearnCourse[] = courses;
  for (const course of availableCourses)
    for (const summary of course.units) {
      if (summary.availability === 'planned') continue;
      const result = await loadLearnUnit(course.id, summary.id, signal ? { signal } : {});
      if (signal?.aborted || result.status === 'cancelled') return null;
      if (result.status !== 'ready') throw new Error('일부 단원의 색인을 불러오지 못했습니다. 다시 시도하세요.');
      units.push(result.unit);
    }
  return buildCurriculumIndex(units);
}
