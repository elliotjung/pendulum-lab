import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.7', {
  guidance: [
    {
      key: 'learn.course-2.2.7.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.7.focus.criteria',
      ko: '모든 비교는 같은 최종 시각을 사용해야 합니다. 고정 RK4의 h/2 비용은 동일 기간에서 대략 두 배이며 오차는 충분히 작은 h에서 감소해야 합니다. 허용오차 만족은 국소 추정에 대한 판정입니다.',
      en: 'All comparisons must share the final time. At fixed duration, RK4 with h/2 costs approximately twice as much, while error should decrease in the small-step regime. Tolerance acceptance concerns the local estimate.'
    }
  ],
  tasks: [
    {
      id: 'cost-frontier',
      prediction: {
        key: 'learn.course-2.2.7.task.cost-frontier.prediction',
        ko: 'h를 절반으로 하면 정확도 이득과 호출 비용은 각각 얼마나 바뀔까요?',
        en: 'How do accuracy gain and evaluation cost change when h is halved?'
      },
      action: {
        key: 'learn.course-2.2.7.task.cost-frontier.action',
        ko: '기본 오차–비용 결과에서 h별 종점 차이와 도함수 호출 수를 읽고 허용오차를 바꾼 companion 결과도 비교하세요.',
        en: 'Read endpoint differences and derivative evaluations at each h, then compare the companion results with changed tolerance.'
      },
      expected: {
        key: 'learn.course-2.2.7.task.cost-frontier.expected',
        ko: '모든 비교는 같은 최종 시각을 사용해야 합니다. 고정 RK4의 h/2 비용은 동일 기간에서 대략 두 배이며 오차는 충분히 작은 h에서 감소해야 합니다. 허용오차 만족은 국소 추정에 대한 판정입니다.',
        en: 'All comparisons must share the final time. At fixed duration, RK4 with h/2 costs approximately twice as much, while error should decrease in the small-step regime. Tolerance acceptance concerns the local estimate.'
      },
      explanation: {
        key: 'learn.course-2.2.7.task.cost-frontier.explanation',
        ko: '가장 비싼 설정이 필요한지 관측 목적에 맞춰 판단합니다. 실제 호출 수는 기준 run의 비용을 포함하는지 표시와 함께 읽으세요.',
        en: 'Judge whether the most expensive setting is needed for the observation objective; read whether reference-run evaluations are included in the reported cost.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.7',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.7.title',
    ko: '허용오차·step size·계산비용의 균형',
    en: 'Balancing tolerance, step size and computational cost'
  },
  summary: {
    key: 'learn.course-2.2.7.summary',
    ko: '가장 작은 step이 언제나 가장 좋은 설정일까요? 같은 목표 시각에서 step·허용오차별 오차 추정과 실제 도함수 호출 수를 비교해 필요한 정확도의 비용을 판단합니다.',
    en: 'Is the smallest step always the best setting? Compare errors and actual derivative evaluations for several step sizes and tolerances at the same target time to assess the cost of needed accuracy.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.7.objective.0',
      ko: '성분 단위를 정규화한 오차와 실제 호출 수로 오차–비용 곡선을 읽습니다.',
      en: 'Read an error–cost relation using scaled component error and actual derivative calls.'
    },
    {
      key: 'learn.course-2.2.7.objective.1',
      ko: '기준해 불확실성·roundoff·국소 tolerance의 한계를 설명합니다.',
      en: 'Explain reference uncertainty, roundoff and the limits of local tolerance.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.7.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.7.prerequisite.body',
        ko: 'Euler/RK 차수와 adaptive 수락 규칙을 알고 시작합니다. 초기조건·물성·관찰 기간을 고정하고 비교 성분의 척도를 명시합니다. 계산 비용은 장치에 따라 달라지는 wall time보다 도함수 호출 수를 우선 사용합니다.',
        en: 'Start with Euler/RK order and adaptive acceptance. Fix initial values, physical parameters and duration, and state component scales. Use derivative evaluations as a reproducible work measure before device-dependent wall time.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.6'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'cost-axis',
      title: {
        key: 'learn.course-2.2.7.concept.cost-axis.title',
        ko: 'step 수와 호출 수는 다름',
        en: 'Step count is not evaluation count'
      },
      body: {
        key: 'learn.course-2.2.7.concept.cost-axis.body',
        ko: 'RK4는 한 step에 여러 도함수 평가를 쓰고 adaptive는 거절 시도에도 비용을 씁니다. 따라서 정확도만큼 값싼 설정을 찾으려면 실제 호출 수와 수락·거절 수를 함께 기록해야 합니다. wall time은 초기화·worker·다른 작업의 영향을 받습니다.',
        en: 'RK4 evaluates several derivatives per step, and adaptive rejections also cost work. To find an economical setting at a chosen accuracy, record actual evaluations and accepted/rejected attempts. Wall time additionally depends on initialization, workers and other activity.'
      },
      citationIds: ['fnc-rk', 'fnc-adaptive']
    },
    {
      id: 'scaled-objective',
      title: {
        key: 'learn.course-2.2.7.concept.scaled-objective.title',
        ko: '목표 오차를 먼저 정하기',
        en: 'Choose an error objective first'
      },
      body: {
        key: 'learn.course-2.2.7.concept.scaled-objective.body',
        ko: '각도와 각속도의 숫자를 그대로 합치면 단위 선택에 따라 순위가 바뀝니다. 각 성분을 명시한 물리 척도로 나누어 무차원 비교값을 정의합니다. 그래프의 기준 차이는 정밀 RK4와의 차이이며 참오차의 상한이 아닙니다.',
        en: 'Adding raw angles and angular velocities makes rankings depend on units. Divide each component by an explicit physical scale to define a dimensionless comparison. Differences from refined RK4 are reference differences, not upper bounds on exact error.'
      },
      citationIds: ['fnc-adaptive']
    },
    {
      id: 'floor',
      title: {
        key: 'learn.course-2.2.7.concept.floor.title',
        ko: '더 작은 간격의 이득이 멈출 때',
        en: 'When refinement stops helping'
      },
      body: {
        key: 'learn.course-2.2.7.concept.floor.body',
        ko: '절단오차를 줄이면 부동소수 반올림과 기준해의 오차가 드러납니다. 긴 카오스 궤적에서는 종점 차이가 궤적 신뢰시간과도 연결됩니다. 최저 오차 하나를 고르기보다 원하는 관측량을 달성하는 비용 범위를 기록하고 기준 step도 수렴시킵니다.',
        en: 'As truncation error decreases, roundoff and reference error become visible. For long chaotic trajectories, endpoint differences also reflect the trust horizon. Record the cost range meeting the chosen observable objective and refine the reference rather than simply selecting the smallest displayed number.'
      },
      citationIds: ['fnc-adaptive']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.7.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.7.concept.synthesis.body',
        ko: '정확도 목표와 재현 가능한 비용 지표를 함께 정했습니다. 2.8에서는 한 숫자가 놓치는 오류를 서로 다른 검증으로 찾아봅니다.',
        en: 'Having specified accuracy objectives and reproducible work, use several independent checks in 2.8 to catch errors hidden by a single number.'
      },
      citationIds: ['fnc-rk']
    }
  ],
  equations: [
    {
      id: 'component-error',
      title: {
        key: 'learn.course-2.2.7.equation.component-error.title',
        ko: '1. 비교 성분을 무차원화',
        en: '1. Scale comparison components'
      },
      expression: 'eAngle = abs(q-qRef)/qScale; eVelocity = abs(omega-omegaRef)/omegaScale',
      accessibleText: {
        key: 'learn.course-2.2.7.equation.component-error.accessible',
        ko: '같은 단위의 오차를 양의 척도로 나누어 성분별 무차원값을 만듭니다.',
        en: 'Divide a same-unit difference by a positive scale to obtain a dimensionless component error.'
      },
      symbols: [
        {
          symbol: 'eAngle',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.eAngle',
            ko: '무차원 각도 비교 오차',
            en: 'Dimensionless angular comparison error'
          }
        },
        {
          symbol: 'eVelocity',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.eVelocity',
            ko: '무차원 각속도 비교 오차',
            en: 'Dimensionless velocity comparison error'
          }
        },
        {
          symbol: 'q',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.q',
            ko: '계산 각도',
            en: 'Computed angle'
          }
        },
        {
          symbol: 'qRef',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.qRef',
            ko: '정밀 기준 각도',
            en: 'Refined reference angle'
          }
        },
        {
          symbol: 'qScale',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.qScale',
            ko: '0보다 큰 각도 척도',
            en: 'Positive angle scale'
          }
        },
        {
          symbol: 'omega',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.omega',
            ko: '계산 각속도',
            en: 'Computed angular velocity'
          }
        },
        {
          symbol: 'omegaRef',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.omegaRef',
            ko: '정밀 기준 각속도',
            en: 'Refined reference angular velocity'
          }
        },
        {
          symbol: 'omegaScale',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.7.equation.component-error.symbol.omegaScale',
            ko: '0보다 큰 속도 척도',
            en: 'Positive velocity scale'
          }
        }
      ],
      citationIds: ['fnc-adaptive']
    },
    {
      id: 'work-growth',
      title: {
        key: 'learn.course-2.2.7.equation.work-growth.title',
        ko: '2. 고정 간격의 비용 척도',
        en: '2. Work scale for a fixed step'
      },
      expression: 'nSteps = duration/h; work = stages*nSteps; ratio = (hCoarse/hFine)^order',
      accessibleText: {
        key: 'learn.course-2.2.7.equation.work-growth.accessible',
        ko: '기간이 정확히 나누어지는 경우 step 수는 기간 나누기 h입니다. stage 수를 곱하면 단순 비용을 얻고 오차 비율은 점근 차수로 예측합니다. 실제 측정 호출 수가 우선입니다.',
        en: 'For a divisible duration, steps equal duration over h; multiply by stages for a simple work model. Error ratios follow asymptotic order. Actual measured evaluations take precedence.'
      },
      symbols: [
        {
          symbol: 'nSteps',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.nSteps',
            ko: '기간이 h의 정수배일 때 step 수',
            en: 'Step count when duration is a multiple of h'
          }
        },
        {
          symbol: 'duration',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.duration',
            ko: '고정 관찰 기간',
            en: 'Fixed observation duration'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.h',
            ko: '고정 간격',
            en: 'Fixed step'
          }
        },
        {
          symbol: 'work',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.work',
            ko: '도함수 평가의 단순 비용 모형',
            en: 'Simple derivative-evaluation work model'
          }
        },
        {
          symbol: 'stages',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.stages',
            ko: 'step당 stage 수',
            en: 'Stages per step'
          }
        },
        {
          symbol: 'ratio',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.ratio',
            ko: '점근 전역 오차 감소비의 모형',
            en: 'Asymptotic global-error reduction model'
          }
        },
        {
          symbol: 'hCoarse',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.hCoarse',
            ko: '큰 간격',
            en: 'Coarse step'
          }
        },
        {
          symbol: 'hFine',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.hFine',
            ko: '작은 간격',
            en: 'Fine step'
          }
        },
        {
          symbol: 'order',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.7.equation.work-growth.symbol.order',
            ko: '매끄러운 문제에서 방법의 수렴 차수',
            en: 'Method convergence order on a smooth problem'
          }
        }
      ],
      citationIds: ['fnc-rk']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'evaluation-count',
      term: {
        key: 'learn.course-2.2.7.glossary.evaluation-count.term',
        ko: '도함수 평가 수',
        en: 'Derivative evaluation count'
      },
      definition: {
        key: 'learn.course-2.2.7.glossary.evaluation-count.definition',
        ko: '채택·거절된 모든 trial에서 실제로 도함수를 호출한 횟수입니다. step 수나 장치 의존 wall time과 구별합니다.',
        en: 'The actual derivative calls in accepted and rejected trials. Distinguish it from step count and device-dependent wall time.'
      }
    }
  ],
  checks: [
    {
      id: 'cost',
      prompt: {
        key: 'learn.course-2.2.7.check.cost.prompt',
        ko: 'adaptive run의 비용에서 빼면 안 되는 것은?',
        en: 'What must remain in adaptive-run work?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.7.check.cost.explanation',
        ko: '수락되지 않은 trial도 실제로 도함수를 평가하므로 계산 예산에 포함해야 합니다.',
        en: 'A rejected trial still evaluates derivatives and consumes the computation budget.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.7.check.cost.supported.label',
            ko: '거절된 시도의 도함수 호출입니다.',
            en: 'Derivative evaluations in rejected attempts.'
          },
          feedback: {
            key: 'learn.course-2.2.7.check.cost.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 수락되지 않은 trial도 실제로 도함수를 평가하므로 계산 예산에 포함해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. A rejected trial still evaluates derivatives and consumes the computation budget.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.7.check.cost.unsupported.label',
            ko: '실패한 시도는 계산하지 않습니다.',
            en: 'Failed attempts cost no computation.'
          },
          feedback: {
            key: 'learn.course-2.2.7.check.cost.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 수락되지 않은 trial도 실제로 도함수를 평가하므로 계산 예산에 포함해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. A rejected trial still evaluates derivatives and consumes the computation budget.'
          }
        }
      ]
    },
    {
      id: 'reference',
      prompt: {
        key: 'learn.course-2.2.7.check.reference.prompt',
        ko: '오차가 더 줄지 않으면 무엇을 확인하나요?',
        en: 'What should be checked if error stops decreasing?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.7.check.reference.explanation',
        ko: '표시값의 바닥은 참해에 도달했다는 증거가 아니며 다른 오차원인이 지배할 수 있습니다.',
        en: 'A displayed error floor is not proof of reaching the exact solution; other error sources can dominate.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.7.check.reference.supported.label',
            ko: '기준해 수렴·roundoff·관측량의 척도를 확인합니다.',
            en: 'Check reference convergence, roundoff and observable scaling.'
          },
          feedback: {
            key: 'learn.course-2.2.7.check.reference.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 표시값의 바닥은 참해에 도달했다는 증거가 아니며 다른 오차원인이 지배할 수 있습니다.',
            en: 'This interpretation accounts for settings, units and assumptions. A displayed error floor is not proof of reaching the exact solution; other error sources can dominate.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.7.check.reference.unsupported.label',
            ko: '방법이 정확해져 참오차가 0이라고 단정합니다.',
            en: 'Conclude that exact error has reached zero.'
          },
          feedback: {
            key: 'learn.course-2.2.7.check.reference.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 표시값의 바닥은 참해에 도달했다는 증거가 아니며 다른 오차원인이 지배할 수 있습니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. A displayed error floor is not proof of reaching the exact solution; other error sources can dominate.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.7',
    description: {
      key: 'learn.course-2.2.7.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'fnc-rk',
      title: {
        key: 'learn.course-2.2.7.reference.fnc-rk.title',
        ko: 'Runge–Kutta methods — Fundamentals of Numerical Computation',
        en: 'Runge–Kutta methods — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/rk/',
      locator: {
        key: 'learn.course-2.2.7.reference.fnc-rk.locator',
        ko: '6.4의 다단계 기울기와 RK4. 본문 k는 도함수이며 원문의 h를 포함한 k와 표기만 다릅니다.',
        en: 'Section 6.4, multistage slopes and classical RK4; this lesson defines k as a derivative rather than the source convention that includes h.'
      },
      accessedOn: '2026-11-04'
    },
    {
      id: 'fnc-adaptive',
      title: {
        key: 'learn.course-2.2.7.reference.fnc-adaptive.title',
        ko: 'Adaptive Runge–Kutta — Fundamentals of Numerical Computation',
        en: 'Adaptive Runge–Kutta — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/adaptive-rk/',
      locator: {
        key: 'learn.course-2.2.7.reference.fnc-adaptive.locator',
        ko: '6.5의 embedded 오차 추정, 수락/거절과 step 제어. 책의 RK23 예제와 제품의 Dormand–Prince 5(4)를 구분합니다.',
        en: 'Section 6.5, embedded estimates, acceptance and step control; distinguish the textbook RK23 example from the product Dormand–Prince 5(4) implementation.'
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
      key: 'learn.course-2.2.7.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
