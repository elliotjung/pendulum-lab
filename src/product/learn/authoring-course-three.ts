/** Declarative authoring helpers; no equations are evaluated here. */
import { courses } from '../../../content/learn/curriculum';
import { extendedFocusDefinition } from '../experiments/extended-definitions';
import type { CanonicalUnit } from '../contracts/quantities';
import type { LearnText, LearnUnit } from './schema';

export type Translation = readonly [ko: string, en: string];
type Symbol = readonly [name: string, unit: CanonicalUnit, ko: string, en: string];
interface Equation {
  readonly id: string;
  readonly title: Translation;
  readonly expression: string;
  readonly explanation: Translation;
  readonly symbols: readonly Symbol[];
}
interface Question {
  readonly id: string;
  readonly prompt: Translation;
  readonly correct: Translation;
  readonly distractor: Translation;
  readonly explanation: Translation;
}
export interface CourseThreeSpec {
  readonly id: `3.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
  readonly summary: Translation;
  readonly objectives: readonly Translation[];
  readonly prerequisites: Translation;
  readonly concepts: readonly { readonly id: string; readonly title: Translation; readonly body: Translation }[];
  readonly equations: readonly Equation[];
  readonly questions: readonly Question[];
  readonly prediction: Translation;
  readonly action: Translation;
  readonly expected: Translation;
  readonly explanation: Translation;
  readonly next: Translation;
  readonly source: { readonly path: string; readonly locator: Translation };
  readonly external?: {
    readonly title: string;
    readonly authors: string;
    readonly url: string;
    readonly locator: Translation;
  };
}

/** Stable localization keys and citations are assembled from authored text only. */
export function courseThreeUnit(spec: CourseThreeSpec): LearnUnit {
  const prefix = `learn.course-3.${spec.id}.`;
  const text = (key: string, value: Translation): LearnText => ({ key: prefix + key, ko: value[0], en: value[1] });
  const title = courses.find((course) => course.id === 'course-3')?.units.find((unit) => unit.id === spec.id)?.title;
  if (!title) throw new Error(`Missing curriculum title ${spec.id}`);
  const citations = spec.external ? ['preserved-engine', 'primary-source'] : ['preserved-engine'];
  const task = {
    id: 'predict-observe-explain',
    prediction: text('task.prediction', spec.prediction),
    action: text('task.action', spec.action),
    expected: text('task.expected', spec.expected),
    explanation: text('task.explanation', spec.explanation)
  };
  const focus = extendedFocusDefinition(spec.id, {
    guidance: [text('focus.guidance', spec.action)],
    successCriteria: [text('focus.success', spec.expected)],
    tasks: [task]
  });
  return {
    schema: 'pendulum-learn-unit/v1',
    id: spec.id,
    courseId: 'course-3',
    contentVersion: 1,
    kind: 'published',
    title,
    summary: text('summary', spec.summary),
    objectives: spec.objectives.map((entry, index) => text(`objective.${index}`, entry)),
    prerequisites: [
      {
        id: 'prerequisites',
        title: text('prerequisites.title', ['필요한 개념과 좌표 약속', 'Prerequisites and coordinate conventions']),
        body: text('prerequisites.body', spec.prerequisites),
        recommendedUnits: [
          { courseId: 'course-1', unitId: '1.4' },
          { courseId: 'course-2', unitId: '2.8' }
        ]
      }
    ],
    concepts: [
      ...spec.concepts.map((entry) => ({
        id: entry.id,
        title: text(`concept.${entry.id}.title`, entry.title),
        body: text(`concept.${entry.id}.body`, entry.body),
        citationIds: citations
      })),
      {
        id: 'synthesis',
        title: text('synthesis.title', ['핵심 정리와 다음 탐구', 'Synthesis and next inquiry']),
        body: text('synthesis.body', spec.next),
        citationIds: ['preserved-engine']
      }
    ],
    equations: spec.equations.map((entry) => ({
      id: entry.id,
      title: text(`equation.${entry.id}.title`, entry.title),
      expression: entry.expression,
      accessibleText: text(`equation.${entry.id}.accessible`, entry.explanation),
      symbols: entry.symbols.map(([symbol, unit, ko, en]) => ({
        symbol,
        unit,
        meaning: text(`equation.${entry.id}.symbol.${symbol}`, [ko, en])
      })),
      citationIds: ['preserved-engine']
    })),
    figures: [],
    glossary: [
      {
        id: 'central-term',
        term: text(
          'glossary.term',
          (
            {
              '3.1': ['하류 질량합', 'Downstream mass sum'],
              '3.2': ['점근적 계산 복잡도', 'Asymptotic computational complexity'],
              '3.3': ['관성모멘트', 'Moment of inertia'],
              '3.4': ['방사·각 결합', 'Radial–angular coupling'],
              '3.5': ['일방 구속', 'Unilateral constraint'],
              '3.6': ['하이브리드 모드', 'Hybrid mode'],
              '3.7': ['수직 각운동량', 'Vertical angular momentum'],
              '3.8': ['집단 세차', 'Collective precession'],
              '3.9': ['매입 좌표', 'Embedded coordinates']
            } as const
          )[spec.id]
        ),
        definition: text(
          'glossary.definition',
          (
            {
              '3.1': [
                '선택한 링크부터 마지막 질점까지의 질량합으로, 앞 관절이 함께 움직이는 질량을 셉니다.',
                'The sum of masses from a selected link through the final bob, counting masses moved by an earlier joint.'
              ],
              '3.2': [
                '입력 크기가 커질 때 지배적인 연산량의 증가율이며, 짧은 실제 실행 시간과 같지 않습니다.',
                'The dominant growth rate of work as input size increases, distinct from short measured wall-clock time.'
              ],
              '3.3': [
                '회전 축에서 질량이 얼마나 멀리 분포하는지 질량에 거리 제곱을 곱해 합한 값입니다.',
                'Mass-weighted squared distance from a specified rotation axis.'
              ],
              '3.4': [
                '반지름과 각도 운동이 서로의 가속도와 에너지 변화에 영향을 주는 현상입니다.',
                'Mutual influence of radial and angular motion on acceleration and energy transfer.'
              ],
              '3.5': [
                '등식이 항상 강제되지 않고, 경계에서만 반력이 작용하는 부등식 구속입니다.',
                'An inequality constraint whose reaction acts only at its active boundary.'
              ],
              '3.6': [
                '각각 다른 연속 운동식과 전환 규칙을 가진 이산적인 운동 상태입니다.',
                'A discrete dynamical regime with its own continuous equations and transition rules.'
              ],
              '3.7': [
                '위쪽 +y 축에 투영한 위치 벡터 외적 운동량으로, 축대칭 무감쇠 계에서 보존됩니다.',
                'The +y projection of position cross momentum, conserved for an undamped axially symmetric system.'
              ],
              '3.8': [
                '결합된 여러 링크의 수평 투영 방향이 함께 또는 서로 다른 속도로 회전하는 거동입니다.',
                'Rotation of horizontal projections of coupled links, which may turn together or at different rates.'
              ],
              '3.9': [
                '곡면 위의 점을 더 큰 Cartesian 공간의 좌표와 추가 구속식으로 표현하는 방식입니다.',
                'Representation of a point on a manifold using ambient Cartesian components and additional constraints.'
              ]
            } as const
          )[spec.id]
        )
      }
    ],
    checks: spec.questions.map((entry) => ({
      id: entry.id,
      prompt: text(`check.${entry.id}.prompt`, entry.prompt),
      options: [
        {
          id: 'supported',
          label: text(`check.${entry.id}.correct`, entry.correct),
          feedback: text(`check.${entry.id}.correct-feedback`, [
            '맞습니다. 아래 근거와 모델의 전제를 함께 확인하세요.',
            'Correct. Check the reasoning and model assumptions below.'
          ])
        },
        {
          id: 'unsupported',
          label: text(`check.${entry.id}.distractor`, entry.distractor),
          feedback: text(`check.${entry.id}.distractor-feedback`, [
            '해당 결론은 전제나 구속의 의미를 놓칩니다. 아래 해설을 확인하세요.',
            'This conclusion misses an assumption or the meaning of the constraint. Read the explanation below.'
          ])
        }
      ],
      correctOptionId: 'supported',
      explanation: text(`check.${entry.id}.explanation`, entry.explanation)
    })),
    focusExperiment: focus,
    labTransfer: {
      status: 'ready',
      systemId: focus.systemId,
      sourceUnitId: spec.id,
      description: text('transfer.description', [
        '현재 물성·초기조건·좌표계·적분 설정과 출처 단원을 실험실로 전달합니다. 비교용 동반 실행은 이 설정과 구분되며, 줄 계는 초기 각도에서 다시 시작합니다.',
        'Transfer the current physical parameters, initial conditions, coordinate representation, integration settings and source unit to Lab. Companion comparisons are separate runs; string systems restart from their initial angles.'
      ])
    },
    references: [
      {
        id: 'preserved-engine',
        title: text('reference.engine.title', [
          `Pendulum Lab — ${spec.source.path}`,
          `Pendulum Lab — ${spec.source.path}`
        ]),
        authors: 'Pendulum Lab contributors',
        url: `https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/${spec.source.path}`,
        locator: text('reference.engine.locator', spec.source.locator),
        accessedOn: '2026-11-04'
      },
      ...(spec.external
        ? [
            {
              id: 'primary-source',
              title: text('reference.primary.title', [spec.external.title, spec.external.title]),
              authors: spec.external.authors,
              url: spec.external.url,
              locator: text('reference.primary.locator', spec.external.locator),
              accessedOn: '2026-11-04'
            }
          ]
        : [])
    ],
    review: {
      schemaVerified: true,
      automatedVerified: true,
      sourceChecked: true,
      humanReviewed: false,
      note: text('review.note', [
        '식·단위·유효 범위를 보존된 실제 엔진과 아래 1차 자료에 대조했습니다. 자동 과학 fixture와 전달 검증 대상이며 사람·물리 전문가 검토는 미완료입니다.',
        'Equations, units and validity limits were checked against the preserved engine and cited primary sources. Scientific fixtures and transfer checks are automated; human and physics-expert review remains pending.'
      ])
    }
  };
}
