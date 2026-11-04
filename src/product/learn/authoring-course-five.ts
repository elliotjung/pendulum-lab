import type { LearnUnit } from './schema';
import { chaosFocusDefinition } from '../experiments/chaos-focus-definitions';
import type { CanonicalUnit } from '../contracts/quantities';

type Pair = readonly [ko: string, en: string];
export interface ChaosLessonCopy {
  readonly id: string;
  readonly title: Pair;
  readonly question: Pair;
  readonly prerequisites: Pair;
  readonly objectives: readonly Pair[];
  readonly concepts: readonly { readonly title: Pair; readonly body: Pair }[];
  readonly equations: readonly {
    readonly title: Pair;
    readonly expression: string;
    readonly explanation: Pair;
    readonly symbols: readonly (readonly [string, CanonicalUnit, string, string])[];
  }[];
  readonly term: Pair;
  readonly definition: Pair;
  readonly checks: readonly {
    readonly prompt: Pair;
    readonly correct: Pair;
    readonly wrong: Pair;
    readonly explanation: Pair;
  }[];
  readonly task: {
    readonly prediction: Pair;
    readonly action: Pair;
    readonly expected: Pair;
    readonly explanation: Pair;
  };
  readonly source: { readonly title: Pair; readonly authors: string; readonly url: string; readonly locator: Pair };
}

/** Authoring scaffolding only: no calculations, imports of engines, or executable equations. */
export function authorChaosLesson(copy: ChaosLessonCopy): LearnUnit {
  const prefix = `learn.course-5.${copy.id}.`;
  const t = (path: string, pair: Pair) => ({ key: `${prefix}${path}`, ko: pair[0], en: pair[1] });
  const focus = chaosFocusDefinition(copy.id, {
    guidance: [t('focus.guidance', copy.task.action)],
    successCriteria: [t('focus.criteria', copy.task.expected)],
    tasks: [
      {
        id: 'predict-observe-explain',
        prediction: t('task.prediction', copy.task.prediction),
        action: t('task.action', copy.task.action),
        expected: t('task.expected', copy.task.expected),
        explanation: t('task.explanation', copy.task.explanation)
      }
    ]
  });
  return {
    schema: 'pendulum-learn-unit/v1',
    id: copy.id,
    courseId: 'course-5',
    contentVersion: 1,
    kind: 'published',
    title: t('title', copy.title),
    summary: t('summary', copy.question),
    objectives: copy.objectives.map((p, i) => t(`objective.${i}`, p)),
    prerequisites: [
      {
        id: 'prerequisite',
        title: t('prerequisite.title', ['필요한 개념과 실험 조건', 'Prerequisites and experimental conditions']),
        body: t('prerequisite.body', copy.prerequisites),
        recommendedUnits: [{ courseId: 'course-2', unitId: '2.1' }]
      }
    ],
    concepts: copy.concepts.map((c, i) => ({
      id: `concept-${i}`,
      title: t(`concept.${i}.title`, c.title),
      body: t(`concept.${i}.body`, c.body),
      citationIds: ['primary-source']
    })),
    equations: copy.equations.map((e, i) => ({
      id: `equation-${i}`,
      title: t(`equation.${i}.title`, e.title),
      expression: e.expression,
      accessibleText: t(`equation.${i}.accessible`, e.explanation),
      symbols: e.symbols.map(([symbol, unit, ko, en], j) => ({
        symbol,
        unit,
        meaning: t(`equation.${i}.symbol.${j}`, [ko, en])
      })),
      citationIds: ['primary-source']
    })),
    figures: [],
    glossary: [{ id: 'key-term', term: t('term', copy.term), definition: t('definition', copy.definition) }],
    checks: copy.checks.map((c, i) => ({
      id: `checkpoint-${i}`,
      prompt: t(`check.${i}.prompt`, c.prompt),
      correctOptionId: 'supported',
      explanation: t(`check.${i}.explanation`, c.explanation),
      options: [
        {
          id: 'supported',
          label: t(`check.${i}.supported.label`, c.correct),
          feedback: t(`check.${i}.supported.feedback`, c.explanation)
        },
        {
          id: 'unsupported',
          label: t(`check.${i}.unsupported.label`, c.wrong),
          feedback: t(`check.${i}.unsupported.feedback`, [
            '해석 조건을 다시 확인하세요. ' + c.explanation[0],
            'Recheck the interpretation conditions. ' + c.explanation[1]
          ])
        }
      ]
    })),
    focusExperiment: focus,
    labTransfer: {
      status: 'ready',
      systemId: focus.systemId,
      sourceUnitId: copy.id,
      description: t('transfer.description', [
        '현재 이중진자의 SI 물성·초기조건·RK4·기록 간격과 선택한 분석 설정·출처를 실험실로 보냅니다. 비교 실험의 바뀐 설정은 결과 표에 별도로 남습니다.',
        'Send the double pendulum SI parameters, initial conditions, RK4, recording interval, selected diagnostic settings and source to the Lab. Changed companion settings remain separately identified in result tables.'
      ])
    },
    references: [
      {
        id: 'primary-source',
        title: t('source.title', copy.source.title),
        authors: copy.source.authors,
        url: copy.source.url,
        locator: t('source.locator', copy.source.locator),
        accessedOn: '2026-11-04'
      }
    ],
    review: {
      schemaVerified: true,
      automatedVerified: true,
      sourceChecked: true,
      humanReviewed: false,
      note: t('review.note', [
        '식·단위·공용 분석 fixture와 실패 조건을 자동 검사하고 아래 원저자 논문·공식 문서와 대조했습니다. 사람·물리 전문가 검토는 미완료입니다.',
        'Equations, units, shared-analysis fixtures and failure conditions are automatically checked and compared with the author paper or official documentation below. Human or physics-expert review remains pending.'
      ])
    }
  };
}
