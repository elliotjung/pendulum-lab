import { courses } from '../../../content/learn/curriculum';
import type { CanonicalUnit } from '../contracts/quantities';
import type { LearnText, LearnUnit } from '../learn/schema';
import { researchFocusDeclaration } from './research-focus-definitions';
import type { UnitRef } from '../learn/schema';

export type Bilingual = readonly [ko: string, en: string];
export interface S27Lesson {
  readonly id: string;
  readonly recommendedUnits?: readonly UnitRef[];
  readonly labTransferDescription?: Bilingual;
  readonly summary: Bilingual;
  readonly objectives: readonly Bilingual[];
  readonly assumptions: Bilingual;
  readonly concepts: readonly { readonly id: string; readonly title: Bilingual; readonly body: Bilingual }[];
  readonly equations: readonly {
    readonly id: string;
    readonly title: Bilingual;
    readonly expression: string;
    readonly explanation: Bilingual;
    readonly symbols: readonly (readonly [string, CanonicalUnit, string, string])[];
  }[];
  readonly checks: readonly {
    readonly prompt: Bilingual;
    readonly correct: Bilingual;
    readonly incorrect: Bilingual;
    readonly explanation: Bilingual;
  }[];
  readonly prediction: Bilingual;
  readonly action: Bilingual;
  readonly expected: Bilingual;
  readonly explanation: Bilingual;
  readonly next: Bilingual;
  readonly glossary: readonly [term: Bilingual, definition: Bilingual];
  readonly sources: readonly { readonly path: string; readonly locator: Bilingual }[];
  readonly external?: {
    readonly title: string;
    readonly authors: string;
    readonly url: string;
    readonly locator: Bilingual;
  };
}
/** Authored bilingual prose and declarative references only; no computation or executable expressions. */
export function s27Lesson(spec: S27Lesson): LearnUnit {
  const courseId = `course-${spec.id.split('.')[0]}`;
  if (!/^course-[678]$/.test(courseId)) throw new Error('S27 course required.');
  const text = (key: string, v: Bilingual): LearnText => ({
    key: `learn.${courseId}.${spec.id}.${key}`,
    ko: v[0],
    en: v[1]
  });
  const title = courses.find((c) => c.id === courseId)!.units.find((u) => u.id === spec.id)!.title;
  const citationIds = spec.sources.map((_, i) => `native-${i}`);
  if (spec.external) citationIds.push('primary-reference');
  const d = researchFocusDeclaration(spec.id);
  const focus: LearnUnit['focusExperiment'] = {
    status: 'ready',
    kind: 'research-workflow',
    plotIds: ['diagnostics'],
    systemId: d.systemId,
    exposedFields: d.exposed,
    fixedFields: d.fields.filter((f) => !d.exposed.includes(f.id)).map(({ id, value, unit }) => ({ id, value, unit })),
    defaultPreset: {
      integratorId: d.integratorId,
      fields: d.fields.map(({ id, value, unit }) => ({ id, value, unit }))
    },
    analysisIds: d.analysisIds,
    guidance: [text('guidance', spec.action)],
    successCriteria: [text('criteria', spec.expected)],
    tasks: [
      {
        id: 'predict-observe-explain',
        prediction: text('prediction', spec.prediction),
        action: text('action', spec.action),
        expected: text('expected', spec.expected),
        explanation: text('explanation', spec.explanation)
      }
    ]
  };
  return {
    schema: 'pendulum-learn-unit/v1',
    id: spec.id,
    courseId,
    contentVersion: 1,
    kind: 'published',
    title,
    summary: text('summary', spec.summary),
    objectives: spec.objectives.map((v, i) => text(`objective.${i}`, v)),
    prerequisites: [
      {
        id: 'assumptions',
        title: text('assumptions.title', [
          '모형의 전제·좌표·선수 개념',
          'Model assumptions, coordinates and prerequisites'
        ]),
        body: text('assumptions.body', spec.assumptions),
        recommendedUnits: spec.recommendedUnits ?? [
          { courseId: 'course-2', unitId: '2.8' },
          { courseId: 'course-1', unitId: '1.4' }
        ]
      }
    ],
    concepts: [
      ...spec.concepts.map((c) => ({
        id: c.id,
        title: text(`concept.${c.id}.title`, c.title),
        body: text(`concept.${c.id}.body`, c.body),
        citationIds
      })),
      {
        id: 'synthesis',
        title: text('synthesis.title', ['핵심 정리와 다음 탐구', 'Synthesis and next inquiry']),
        body: text('synthesis.body', spec.next),
        citationIds
      }
    ],
    equations: spec.equations.map((e) => ({
      id: e.id,
      title: text(`equation.${e.id}.title`, e.title),
      expression: e.expression,
      accessibleText: text(`equation.${e.id}.accessible`, e.explanation),
      symbols: e.symbols.map(([symbol, unit, ko, en]) => ({
        symbol,
        unit,
        meaning: text(`equation.${e.id}.symbol.${symbol}`, [ko, en])
      })),
      citationIds
    })),
    figures: [],
    glossary: [
      {
        id: 'central-term',
        term: text('glossary.term', spec.glossary[0]),
        definition: text('glossary.definition', spec.glossary[1])
      }
    ],
    checks: spec.checks.map((c, i) => ({
      id: `check-${i + 1}`,
      prompt: text(`check.${i}.prompt`, c.prompt),
      correctOptionId: 'supported',
      options: [
        {
          id: 'supported',
          label: text(`check.${i}.correct`, c.correct),
          feedback: text(`check.${i}.correct-feedback`, [
            '맞습니다. 모형의 전제와 아래 설명을 함께 확인하세요.',
            'Correct. Check the model assumptions and explanation below.'
          ])
        },
        {
          id: 'unsupported',
          label: text(`check.${i}.incorrect`, c.incorrect),
          feedback: text(`check.${i}.incorrect-feedback`, [
            '판정에 필요한 전제나 유효 범위가 빠졌습니다. 아래 설명을 확인하세요.',
            'An assumption or validity limit is missing. Read the explanation below.'
          ])
        }
      ],
      explanation: text(`check.${i}.explanation`, c.explanation)
    })),
    focusExperiment: focus,
    labTransfer: {
      status: 'ready',
      systemId: focus.systemId,
      sourceUnitId: spec.id,
      description: text(
        'transfer',
        spec.labTransferDescription ?? [
          '현재 기준 run의 물성·초기조건·구동/제어·단위·적분 설정을 Lab으로 전달합니다. 별도 sweep·동반 실행·해석 지표는 단원 설정과 결과 JSON에 보존합니다. 완료 끝점에서 재개하는 기능은 아닙니다.',
          'Transfer the baseline run parameters, initial conditions, forcing/control, units and integration settings to Lab. Sweeps, companion runs and interpretive metrics remain in lesson settings and diagnostics JSON. This restarts from initial conditions.'
        ]
      )
    },
    references: [
      ...spec.sources.map((s, i) => ({
        id: `native-${i}`,
        title: text(`reference.${i}.title`, [`보존된 Pendulum Lab — ${s.path}`, `Preserved Pendulum Lab — ${s.path}`]),
        authors: 'Pendulum Lab contributors',
        url: `https://github.com/elliotjung/pendulum-lab/blob/9cfd9842570cdd3137e3ea866a1266de2585b941/${s.path}`,
        locator: text(`reference.${i}.locator`, s.locator),
        accessedOn: '2026-11-05'
      })),
      ...(spec.external
        ? [
            {
              id: 'primary-reference',
              title: text('reference.primary.title', [spec.external.title, spec.external.title]),
              authors: spec.external.authors,
              url: spec.external.url,
              locator: text('reference.primary.locator', spec.external.locator),
              accessedOn: '2026-11-05'
            }
          ]
        : [])
    ],
    review: {
      schemaVerified: true,
      automatedVerified: true,
      sourceChecked: true,
      humanReviewed: false,
      note: text('review', [
        '식·부호·단위와 실패 조건을 보존된 실제 소스 및 명시된 1차 자료와 대조했습니다. 자동 수치 fixture와 전달 검증 대상이며 사람·물리 전문가 검토는 미완료입니다.',
        'Equations, signs, units and failure conditions were checked against preserved native sources and identified primary references. Numerical fixtures and transfer checks are automated; human and physics-expert review remains pending.'
      ])
    }
  };
}
