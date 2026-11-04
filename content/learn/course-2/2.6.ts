import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.6', {
  guidance: [
    {
      key: 'learn.course-2.2.6.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.6.focus.criteria',
      ko: '선형·root 보간 시각은 대응 표본 구간 안에 있어야 합니다. 기본 횡단 fixture에서 root 단면 잔차는 1e-7 rad 이내이며 표본 지연은 구간 폭 이하입니다.',
      en: 'Linear and root times must lie in their matching sample brackets. In the default transverse fixture, root section residual should be within 1e-7 rad and sampled delay no larger than the bracket width.'
    }
  ],
  tasks: [
    {
      id: 'crossing-bracket',
      prediction: {
        key: 'learn.course-2.2.6.task.crossing-bracket.prediction',
        ko: '다음 표본 시각과 보간 교차시각 중 어느 것이 실제 통과에 가까울까요?',
        en: 'Which should better locate a crossing: the next sample time or an interpolated time?'
      },
      action: {
        key: 'learn.course-2.2.6.task.crossing-bracket.action',
        ko: '기본 run의 세 교차 추정값을 읽고 기록 간격을 줄여 다시 실행합니다. 같은 방향·같은 순번의 교차끼리 비교하세요.',
        en: 'Read the three crossing estimates for the default run and refine recording resolution. Match crossings by direction and occurrence index.'
      },
      expected: {
        key: 'learn.course-2.2.6.task.crossing-bracket.expected',
        ko: '선형·root 보간 시각은 대응 표본 구간 안에 있어야 합니다. 기본 횡단 fixture에서 root 단면 잔차는 1e-7 rad 이내이며 표본 지연은 구간 폭 이하입니다.',
        en: 'Linear and root times must lie in their matching sample brackets. In the default transverse fixture, root section residual should be within 1e-7 rad and sampled delay no larger than the bracket width.'
      },
      explanation: {
        key: 'learn.course-2.2.6.task.crossing-bracket.explanation',
        ko: '보간은 표본 시각의 양자화를 줄이지만 놓친 사건과 잘못된 동역학을 복원하지 않습니다.',
        en: 'Interpolation reduces time quantization but cannot reconstruct missed events or incorrect dynamics.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.6',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.6.title',
    ko: '사건 검출과 Poincaré 교차의 보간',
    en: 'Event detection and Poincaré crossing interpolation'
  },
  summary: {
    key: 'learn.course-2.2.6.summary',
    ko: '단면을 지나간 다음 표본이 교차점일까요? 같은 실제 궤적에서 단순 표본·선형 보간·기존 root 보간 Poincaré의 시각을 비교합니다.',
    en: 'Is the sample after a section crossing the crossing itself? Compare sampled, linearly interpolated and existing root-interpolated Poincaré times on the same actual trajectory.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.6.objective.0',
      ko: '부호 변화와 통과 방향을 이용해 사건을 정의하고 선형 교차시각을 유도합니다.',
      en: 'Define an event using sign change and direction and derive a linearly interpolated crossing time.'
    },
    {
      key: 'learn.course-2.2.6.objective.1',
      ko: '근접 접선·다중 교차·큰 표본 간격의 실패를 설명합니다.',
      en: 'Explain failure at grazing events, multiple crossings and large sampling gaps.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.6.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.6.prerequisite.body',
        ko: '단면 함수는 첫 각도 theta1이며 음→양 통과를 관찰합니다. 고정 지지점 이중진자의 같은 run을 사용하고 교차점 개수뿐 아니라 방향·초기 교차 제외·시간 단위를 함께 정합니다.',
        en: 'The section function is theta1, with negative-to-positive crossings. Use the same double-pendulum run and specify direction, treatment of an initial crossing and time units, in addition to point count.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.5'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'event-definition',
      title: {
        key: 'learn.course-2.2.6.concept.event-definition.title',
        ko: '단면의 영점과 방향',
        en: 'A section zero and its direction'
      },
      body: {
        key: 'learn.course-2.2.6.concept.event-definition.body',
        ko: '두 표본의 단면 값이 부호를 바꾸면 그 사이에 연속 함수의 영점이 있습니다. 그러나 이미 0에서 시작한 상태, 되돌아 닿기만 하는 접선 사건, 여러 번의 교차는 같은 규칙으로 처리되지 않습니다. 단면을 바꾸면 비교하는 return map도 바뀝니다.',
        en: 'A sign change between two samples brackets a zero of a continuous section function. An initial zero, a grazing contact and multiple crossings need separate treatment. Changing the section changes the return map being compared.'
      },
      citationIds: ['scipy-events']
    },
    {
      id: 'linear',
      title: {
        key: 'learn.course-2.2.6.concept.linear.title',
        ko: '직선 근사의 교차시각',
        en: 'Crossing time from a straight-line approximation'
      },
      body: {
        key: 'learn.course-2.2.6.concept.linear.body',
        ko: '두 단면 값을 직선으로 연결하고 0이 되는 보간 비율을 구한 뒤 시간과 다른 상태 성분에 같은 비율을 적용합니다. 다음 표본 시각을 그대로 쓰면 최대 한 표본 간격의 지연이 생깁니다. 선형 보간은 궤적의 곡률을 없애지 않습니다.',
        en: 'Join section values linearly, solve for the zero fraction and use that fraction for time and other state components. Using the next sample time leaves a delay up to one sample gap. Linear interpolation does not remove trajectory curvature.'
      },
      citationIds: ['scipy-events']
    },
    {
      id: 'root-limits',
      title: {
        key: 'learn.course-2.2.6.concept.root-limits.title',
        ko: 'root의 정확도에도 입력 궤적 한계',
        en: 'Root accuracy is limited by the trajectory'
      },
      body: {
        key: 'learn.course-2.2.6.concept.root-limits.body',
        ko: '기존 root 보간은 step 내부 표현의 영점을 더 정밀하게 찾습니다. 그러나 부정확한 적분해의 영점을 정확히 찾아도 참궤적의 영점이 보장되지 않습니다. 통과 속도가 작을수록 같은 각도 오차가 더 큰 시각 오차가 되며 한 간격 안의 다중 교차는 놓칠 수 있습니다.',
        en: 'Existing root interpolation locates a zero of the within-step representation more precisely. An accurate zero of an inaccurate trajectory is not a guaranteed zero of the exact trajectory. Small crossing speed magnifies timing error, and multiple crossings in a gap can be missed.'
      },
      citationIds: ['scipy-events']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.6.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.6.concept.synthesis.body',
        ko: '사건 오차에는 궤적 오차와 root 위치 오차가 함께 들어갑니다. 2.7에서 이 정확도를 얻는 데 필요한 비용까지 비교합니다.',
        en: 'Event error combines trajectory error with root-location error. In 2.7, compare the work needed to obtain a useful accuracy.'
      },
      citationIds: ['scipy-events']
    }
  ],
  equations: [
    {
      id: 'crossing-fraction',
      title: {
        key: 'learn.course-2.2.6.equation.crossing-fraction.title',
        ko: '1. 선형 단면의 영점',
        en: '1. Zero of a linear section'
      },
      expression: 'qCross = (1-lambda)*qLeft+lambda*qRight; lambda = -qLeft/(qRight-qLeft)',
      accessibleText: {
        key: 'learn.course-2.2.6.equation.crossing-fraction.accessible',
        ko: '두 단면 값의 가중 평균을 0으로 놓고 lambda를 풉니다. 분모가 0이면 이 식으로 교차를 정할 수 없습니다.',
        en: 'Set the weighted section value to zero and solve for lambda; a zero denominator cannot define a crossing this way.'
      },
      symbols: [
        {
          symbol: 'qCross',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-fraction.symbol.qCross',
            ko: '보간한 단면 각도, 교차에서 0',
            en: 'Interpolated section angle, zero at crossing'
          }
        },
        {
          symbol: 'lambda',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-fraction.symbol.lambda',
            ko: '왼쪽에서 오른쪽으로의 보간 비율',
            en: 'Interpolation fraction from left to right'
          }
        },
        {
          symbol: 'qLeft',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-fraction.symbol.qLeft',
            ko: '왼쪽 단면 값',
            en: 'Left section value'
          }
        },
        {
          symbol: 'qRight',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-fraction.symbol.qRight',
            ko: '오른쪽 단면 값',
            en: 'Right section value'
          }
        }
      ],
      citationIds: ['scipy-events']
    },
    {
      id: 'crossing-time',
      title: {
        key: 'learn.course-2.2.6.equation.crossing-time.title',
        ko: '2. 같은 비율로 시각과 오차 추정',
        en: '2. Use the fraction for time and timing sensitivity'
      },
      expression: 'tCross = tLeft+lambda*(tRight-tLeft); timingError = abs(angleError/crossingSpeed)',
      accessibleText: {
        key: 'learn.course-2.2.6.equation.crossing-time.accessible',
        ko: '시각은 표본 구간 안에서 같은 비율로 보간합니다. 작은 교란의 시각 민감도는 각도 오차 나누기 통과 속도이며 접선에서는 쓸 수 없습니다.',
        en: 'Interpolate time with the same fraction; first-order timing sensitivity is angular error divided by crossing speed and does not apply at grazing.'
      },
      symbols: [
        {
          symbol: 'tCross',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.tCross',
            ko: '선형 교차시각',
            en: 'Linearly interpolated crossing time'
          }
        },
        {
          symbol: 'tLeft',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.tLeft',
            ko: '왼쪽 표본 시각',
            en: 'Left sample time'
          }
        },
        {
          symbol: 'tRight',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.tRight',
            ko: '오른쪽 표본 시각',
            en: 'Right sample time'
          }
        },
        {
          symbol: 'lambda',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.lambda',
            ko: '보간 비율',
            en: 'Interpolation fraction'
          }
        },
        {
          symbol: 'timingError',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.timingError',
            ko: '횡단 교차에서 시각 오차의 선도 근사',
            en: 'Leading timing-error estimate at a transverse crossing'
          }
        },
        {
          symbol: 'angleError',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.angleError',
            ko: '단면 값 오차',
            en: 'Section-value error'
          }
        },
        {
          symbol: 'crossingSpeed',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.6.equation.crossing-time.symbol.crossingSpeed',
            ko: '0이 아닌 단면 통과 속도',
            en: 'Nonzero transverse crossing speed'
          }
        }
      ],
      citationIds: ['scipy-events']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'transverse-crossing',
      term: {
        key: 'learn.course-2.2.6.glossary.transverse-crossing.term',
        ko: '횡단 교차',
        en: 'Transverse crossing'
      },
      definition: {
        key: 'learn.course-2.2.6.glossary.transverse-crossing.definition',
        ko: '단면 값이 0이고 시간에 대한 변화율이 0이 아닌 교차입니다. 접선에서는 같은 위치 오차가 큰 시각 오차로 바뀔 수 있습니다.',
        en: 'A section zero with a nonzero time derivative. Near grazing, a small section-value error can produce a large timing error.'
      }
    }
  ],
  checks: [
    {
      id: 'direction',
      prompt: {
        key: 'learn.course-2.2.6.check.direction.prompt',
        ko: '양→음과 음→양 점을 섞으면?',
        en: 'What happens if both crossing directions are mixed?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.6.check.direction.explanation',
        ko: '같은 theta1=0이라도 통과 방향은 단면의 일부이며 서로 다른 점집합을 만들 수 있습니다.',
        en: 'Crossing direction is part of the section and can produce different point sets even at theta1=0.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.6.check.direction.supported.label',
            ko: '서로 다른 단면 return 규칙을 섞게 됩니다.',
            en: 'Different return-section rules are mixed.'
          },
          feedback: {
            key: 'learn.course-2.2.6.check.direction.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 같은 theta1=0이라도 통과 방향은 단면의 일부이며 서로 다른 점집합을 만들 수 있습니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Crossing direction is part of the section and can produce different point sets even at theta1=0.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.6.check.direction.unsupported.label',
            ko: '단면 정의에는 영향이 없습니다.',
            en: 'The section definition is unaffected.'
          },
          feedback: {
            key: 'learn.course-2.2.6.check.direction.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 같은 theta1=0이라도 통과 방향은 단면의 일부이며 서로 다른 점집합을 만들 수 있습니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Crossing direction is part of the section and can produce different point sets even at theta1=0.'
          }
        }
      ]
    },
    {
      id: 'tangent',
      prompt: {
        key: 'learn.course-2.2.6.check.tangent.prompt',
        ko: '통과 속도가 0에 가까우면 교차시각은?',
        en: 'What happens to timing near zero crossing speed?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.6.check.tangent.explanation',
        ko: '횡단 조건이 약해지면 오차를 속도로 나누는 시각 추정은 커지고 접선에서는 무효입니다.',
        en: 'As transversality weakens, dividing error by speed magnifies timing uncertainty and fails at grazing.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.6.check.tangent.supported.label',
            ko: '작은 단면 오차에도 매우 민감해집니다.',
            en: 'It becomes highly sensitive to small section-value errors.'
          },
          feedback: {
            key: 'learn.course-2.2.6.check.tangent.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 횡단 조건이 약해지면 오차를 속도로 나누는 시각 추정은 커지고 접선에서는 무효입니다.',
            en: 'This interpretation accounts for settings, units and assumptions. As transversality weakens, dividing error by speed magnifies timing uncertainty and fails at grazing.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.6.check.tangent.unsupported.label',
            ko: '항상 더 정확해집니다.',
            en: 'It always becomes more accurate.'
          },
          feedback: {
            key: 'learn.course-2.2.6.check.tangent.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 횡단 조건이 약해지면 오차를 속도로 나누는 시각 추정은 커지고 접선에서는 무효입니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. As transversality weakens, dividing error by speed magnifies timing uncertainty and fails at grazing.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.6',
    description: {
      key: 'learn.course-2.2.6.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'scipy-events',
      title: {
        key: 'learn.course-2.2.6.reference.scipy-events.title',
        ko: 'solve_ivp — initial-value integration and events',
        en: 'solve_ivp — initial-value integration and events'
      },
      authors: 'SciPy developers',
      url: 'https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html',
      locator: {
        key: 'learn.course-2.2.6.reference.scipy-events.locator',
        ko: 'events, direction, rtol/atol 문서. 여러 zero crossing을 한 step 안에서 놓칠 수 있다는 한계와 저장 표본·내부 step의 차이를 확인했습니다.',
        en: 'Parameters events, direction, rtol and atol; checked the warning about multiple zero crossings per step and the distinction between output samples and internal solver steps.'
      },
      accessedOn: '2026-11-04'
    }
  ],
  review: {
    schemaVerified: true,
    automatedVerified: true,
    sourceChecked: true,
    humanReviewed: false,
    note: {
      key: 'learn.course-2.2.6.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
