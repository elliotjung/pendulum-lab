import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.3', {
  guidance: [
    {
      key: 'learn.course-2.2.3.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.3.focus.criteria',
      ko: '완료된 적응 run의 모든 수락 step은 eta<=1이고 마지막 시각은 목표 시각과 부동소수 허용오차 이내로 일치해야 합니다. 비용은 거절을 포함한 호출 수로 읽으세요.',
      en: 'Every accepted step of a completed adaptive run must satisfy eta<=1, and final time must match target within floating-point tolerance. Read cost as derivative calls including rejected attempts.'
    }
  ],
  tasks: [
    {
      id: 'accepted-steps',
      prediction: {
        key: 'learn.course-2.2.3.task.accepted-steps.prediction',
        ko: '허용오차를 줄이면 수락 step과 호출 비용은 어떻게 달라질까요?',
        en: 'How should tightening tolerance affect accepted steps and derivative-call cost?'
      },
      action: {
        key: 'learn.course-2.2.3.task.accepted-steps.action',
        ko: '기본값으로 고정 RK4와 적응형 companion을 실행하고 수락 dt·거절 수·호출 수를 읽으세요. 허용오차를 줄여 다시 비교합니다.',
        en: 'Run fixed RK4 and the adaptive companion and inspect accepted dt, rejection count and derivative calls. Tighten the tolerance and compare again.'
      },
      expected: {
        key: 'learn.course-2.2.3.task.accepted-steps.expected',
        ko: '완료된 적응 run의 모든 수락 step은 eta<=1이고 마지막 시각은 목표 시각과 부동소수 허용오차 이내로 일치해야 합니다. 비용은 거절을 포함한 호출 수로 읽으세요.',
        en: 'Every accepted step of a completed adaptive run must satisfy eta<=1, and final time must match target within floating-point tolerance. Read cost as derivative calls including rejected attempts.'
      },
      explanation: {
        key: 'learn.course-2.2.3.task.accepted-steps.explanation',
        ko: '허용오차가 더 엄격하면 보통 작은 간격이 필요하지만 step 수의 단조 증가는 보편 법칙이 아닙니다. 실제 기록으로 판단합니다.',
        en: 'Tighter tolerances typically require smaller steps, but monotonic step counts are not a universal law; inspect the actual trace.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.3',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.3.title',
    ko: 'Runge–Kutta 계열과 적응형 시간 간격',
    en: 'Runge–Kutta methods and adaptive time steps'
  },
  summary: {
    key: 'learn.course-2.2.3.summary',
    ko: '모든 순간에 같은 간격이 필요할까요? 동일한 이중진자 도함수에서 고정 RK4와 native Dormand–Prince 5(4)를 실행해 실제 수락 step·거절·오차 추정·호출 비용을 비교합니다.',
    en: 'Does every instant require the same step? Run fixed RK4 and native Dormand–Prince 5(4) on the same double-pendulum derivative and compare accepted steps, rejections, error estimates and derivative-call cost.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.3.objective.0',
      ko: 'RK4의 여러 기울기를 합치는 이유와 embedded 오차 추정을 설명합니다.',
      en: 'Explain why RK4 combines several slopes and how an embedded pair estimates error.'
    },
    {
      key: 'learn.course-2.2.3.objective.1',
      ko: '내부 수락 step과 출력 표본을 구별하고 허용오차를 전역 오차 상한으로 오해하지 않습니다.',
      en: 'Distinguish accepted internal steps from output samples and avoid treating tolerance as a global error bound.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.3.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.3.prerequisite.body',
        ko: '1차 상태공간·국소 오차·고정 기간 비교를 사용합니다. 각도와 각속도는 단위가 달라 성분별 절대 척도와 상대 척도가 필요합니다. Focus의 적응형 비교는 제품에 이미 있는 generic solver를 호출합니다.',
        en: 'Use first-order state space, local error and fixed-duration comparisons. Angles and angular velocities have different units and require component absolute scales plus relative scales. The adaptive companion calls the existing generic product solver.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.2'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'rk-stages',
      title: {
        key: 'learn.course-2.2.3.concept.rk-stages.title',
        ko: '기울기의 가중 평균',
        en: 'A weighted average of slopes'
      },
      body: {
        key: 'learn.course-2.2.3.concept.rk-stages.body',
        ko: 'RK4는 시작·중간 두 번·끝에서 계산한 기울기를 결합합니다. step 하나의 호출 수가 Euler보다 많으므로 step 수만으로 비용을 비교하지 않습니다. 본문 k는 h가 곱해지지 않은 도함수라는 표기를 사용합니다.',
        en: 'RK4 combines slopes at the start, two midpoint trials and the endpoint. It uses more derivative evaluations per step than Euler, so step count alone is not a cost comparison. Here k denotes a derivative without an included factor h.'
      },
      citationIds: ['fnc-rk']
    },
    {
      id: 'embedded',
      title: {
        key: 'learn.course-2.2.3.concept.embedded.title',
        ko: '같은 stage에서 두 차수',
        en: 'Two orders from shared stages'
      },
      body: {
        key: 'learn.course-2.2.3.concept.embedded.body',
        ko: 'Dormand–Prince 5(4)는 공통 stage의 다른 가중합으로 두 해를 만들고 차이로 국소 오차를 추정합니다. native solver는 정규화 오차가 1 이하일 때만 전진합니다. 거절된 시도도 실제 연산 비용에 포함되며 수락 시각 목록은 균등하지 않을 수 있습니다.',
        en: 'Dormand–Prince 5(4) combines shared stages with two weight sets and uses their difference to estimate local error. The native solver advances only when normalized error is at most one. Rejected attempts also cost work, and accepted times need not be uniform.'
      },
      citationIds: ['fnc-adaptive']
    },
    {
      id: 'adaptive-limits',
      title: {
        key: 'learn.course-2.2.3.concept.adaptive-limits.title',
        ko: '작은 tolerance가 보장하지 않는 것',
        en: 'What a small tolerance does not ensure'
      },
      body: {
        key: 'learn.course-2.2.3.concept.adaptive-limits.body',
        ko: '허용오차는 개별 step의 추정값을 제어하며 모델 오류·전역 오차·관측 불확실성을 인증하지 않습니다. 최소 간격·최대 시도 수·비유한 값으로 종료하면 target에 도달한 성공과 구분해야 합니다. Lab으로는 화면에 명시한 지원 RK4 기준 설정을 보내며 companion solver를 복원했다고 표시하지 않습니다.',
        en: 'Tolerance controls a local estimate rather than certifying model error, global error or observation uncertainty. Minimum-step, attempt-budget and nonfinite termination must be distinguished from reaching the target. Lab transfer sends the explicitly labeled supported RK4 baseline and does not claim to restore the companion solver.'
      },
      citationIds: ['fnc-adaptive', 'scipy-events']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.3.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.3.concept.synthesis.body',
        ko: '적응형은 필요한 시각에 계산을 집중합니다. 2.4에서는 국소 정확도와 별도로 canonical 기하를 보존하는지를 묻습니다.',
        en: 'Adaptivity concentrates work where needed. In 2.4, ask separately whether an integrator preserves canonical geometry.'
      },
      citationIds: ['fnc-rk']
    }
  ],
  equations: [
    {
      id: 'rk-weight',
      title: {
        key: 'learn.course-2.2.3.equation.rk-weight.title',
        ko: '1. RK4의 각도 갱신',
        en: '1. RK4 angle update'
      },
      expression: 'qNext = q+h*(k1+2*k2+2*k3+k4)/6',
      accessibleText: {
        key: 'learn.course-2.2.3.equation.rk-weight.accessible',
        ko: '네 도함수의 1,2,2,1 가중 평균에 h를 곱해 현재 각도에 더합니다. 각 stage는 전체 상태에서 계산합니다.',
        en: 'Multiply the weighted derivative average with weights one,two,two,one by h and add it to the angle; evaluate each stage on the full state.'
      },
      symbols: [
        {
          symbol: 'qNext',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.qNext',
            ko: 'RK4 다음 각도',
            en: 'Next RK4 angle'
          }
        },
        {
          symbol: 'q',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.q',
            ko: '시작 각도',
            en: 'Initial angle'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.h',
            ko: '시간 간격',
            en: 'Time step'
          }
        },
        {
          symbol: 'k1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.k1',
            ko: '시작 기울기',
            en: 'Initial slope'
          }
        },
        {
          symbol: 'k2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.k2',
            ko: '첫 중간 trial의 기울기',
            en: 'First midpoint trial slope'
          }
        },
        {
          symbol: 'k3',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.k3',
            ko: '둘째 중간 trial의 기울기',
            en: 'Second midpoint trial slope'
          }
        },
        {
          symbol: 'k4',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.3.equation.rk-weight.symbol.k4',
            ko: '끝 trial의 기울기',
            en: 'Endpoint trial slope'
          }
        }
      ],
      citationIds: ['fnc-rk']
    },
    {
      id: 'scaled-error',
      title: {
        key: 'learn.course-2.2.3.equation.scaled-error.title',
        ko: '2. 한 성분의 정규화 오차',
        en: '2. Normalize a component error'
      },
      expression: 'scale = atol+rtol*abs(qTrial); eta = abs(qHigh-qLow)/scale',
      accessibleText: {
        key: 'learn.course-2.2.3.equation.scaled-error.accessible',
        ko: '절대 척도와 상대 척도를 더해 차수별 각도 차이를 나눕니다. 실제 native 구현은 시작값과 trial값 크기의 최댓값을 척도에 쓰고 성분별 최댓값으로 수락을 결정합니다.',
        en: 'Divide the high/low angular difference by an absolute-plus-relative scale. The native implementation uses the larger magnitude of start and trial and takes the maximum normalized component error.'
      },
      symbols: [
        {
          symbol: 'scale',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.scale',
            ko: '각도 오차를 나눌 척도',
            en: 'Angular error scale'
          }
        },
        {
          symbol: 'atol',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.atol',
            ko: '해당 성분의 절대 허용오차',
            en: 'Component absolute tolerance'
          }
        },
        {
          symbol: 'rtol',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.rtol',
            ko: '상대 허용오차',
            en: 'Relative tolerance'
          }
        },
        {
          symbol: 'qTrial',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.qTrial',
            ko: '척도 설명용 trial 각도',
            en: 'Trial angle for illustrating scaling'
          }
        },
        {
          symbol: 'eta',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.eta',
            ko: '한 성분의 무차원 정규화 오차',
            en: 'Dimensionless component error'
          }
        },
        {
          symbol: 'qHigh',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.qHigh',
            ko: '고차 근사 각도',
            en: 'Higher-order angle'
          }
        },
        {
          symbol: 'qLow',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.3.equation.scaled-error.symbol.qLow',
            ko: '저차 근사 각도',
            en: 'Lower-order angle'
          }
        }
      ],
      citationIds: ['fnc-adaptive']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'embedded-pair',
      term: {
        key: 'learn.course-2.2.3.glossary.embedded-pair.term',
        ko: 'Embedded pair',
        en: 'Embedded pair'
      },
      definition: {
        key: 'learn.course-2.2.3.glossary.embedded-pair.definition',
        ko: '공통 stage의 서로 다른 가중합으로 두 차수의 근사해를 만들고 차이로 국소 오차를 추정하는 방법입니다.',
        en: 'Two different weighted combinations of shared stages produce solutions of different orders, whose difference estimates local error.'
      }
    }
  ],
  checks: [
    {
      id: 'sample-step',
      prompt: {
        key: 'learn.course-2.2.3.check.sample-step.prompt',
        ko: '출력 시각이 균등하면 내부 step도 균등한가요?',
        en: 'Do uniformly spaced outputs imply uniform internal steps?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.3.check.sample-step.explanation',
        ko: '내부 step을 보려면 출력 점의 간격 대신 수락된 dt 기록을 확인해야 합니다.',
        en: 'Inspect the recorded accepted dt sequence rather than inferring internal steps from output spacing.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.3.check.sample-step.supported.label',
            ko: '아닙니다. 출력 보간과 내부 수락 step은 다릅니다.',
            en: 'No. Output interpolation and accepted internal steps differ.'
          },
          feedback: {
            key: 'learn.course-2.2.3.check.sample-step.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 내부 step을 보려면 출력 점의 간격 대신 수락된 dt 기록을 확인해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Inspect the recorded accepted dt sequence rather than inferring internal steps from output spacing.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.3.check.sample-step.unsupported.label',
            ko: '항상 그렇습니다.',
            en: 'Always.'
          },
          feedback: {
            key: 'learn.course-2.2.3.check.sample-step.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 내부 step을 보려면 출력 점의 간격 대신 수락된 dt 기록을 확인해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Inspect the recorded accepted dt sequence rather than inferring internal steps from output spacing.'
          }
        }
      ]
    },
    {
      id: 'tolerance',
      prompt: {
        key: 'learn.course-2.2.3.check.tolerance.prompt',
        ko: '정규화 오차 1 이하의 뜻은?',
        en: 'What does normalized error at most one mean?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.3.check.tolerance.explanation',
        ko: '국소 추정의 수락은 전역 오차나 모형 정확도의 인증이 아닙니다.',
        en: 'Acceptance of a local estimate does not certify global error or model accuracy.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.3.check.tolerance.supported.label',
            ko: '그 step의 embedded 추정이 설정 척도 안이라는 뜻입니다.',
            en: 'The embedded estimate for that step meets the configured scale.'
          },
          feedback: {
            key: 'learn.course-2.2.3.check.tolerance.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 국소 추정의 수락은 전역 오차나 모형 정확도의 인증이 아닙니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Acceptance of a local estimate does not certify global error or model accuracy.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.3.check.tolerance.unsupported.label',
            ko: '전체 궤적의 참오차가 항상 tolerance 이하입니다.',
            en: 'The exact error of the whole trajectory is always below tolerance.'
          },
          feedback: {
            key: 'learn.course-2.2.3.check.tolerance.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 국소 추정의 수락은 전역 오차나 모형 정확도의 인증이 아닙니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Acceptance of a local estimate does not certify global error or model accuracy.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.3',
    description: {
      key: 'learn.course-2.2.3.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'fnc-rk',
      title: {
        key: 'learn.course-2.2.3.reference.fnc-rk.title',
        ko: 'Runge–Kutta methods — Fundamentals of Numerical Computation',
        en: 'Runge–Kutta methods — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/rk/',
      locator: {
        key: 'learn.course-2.2.3.reference.fnc-rk.locator',
        ko: '6.4의 다단계 기울기와 RK4. 본문 k는 도함수이며 원문의 h를 포함한 k와 표기만 다릅니다.',
        en: 'Section 6.4, multistage slopes and classical RK4; this lesson defines k as a derivative rather than the source convention that includes h.'
      },
      accessedOn: '2026-11-04'
    },
    {
      id: 'fnc-adaptive',
      title: {
        key: 'learn.course-2.2.3.reference.fnc-adaptive.title',
        ko: 'Adaptive Runge–Kutta — Fundamentals of Numerical Computation',
        en: 'Adaptive Runge–Kutta — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/adaptive-rk/',
      locator: {
        key: 'learn.course-2.2.3.reference.fnc-adaptive.locator',
        ko: '6.5의 embedded 오차 추정, 수락/거절과 step 제어. 책의 RK23 예제와 제품의 Dormand–Prince 5(4)를 구분합니다.',
        en: 'Section 6.5, embedded estimates, acceptance and step control; distinguish the textbook RK23 example from the product Dormand–Prince 5(4) implementation.'
      },
      accessedOn: '2026-11-04'
    },
    {
      id: 'scipy-events',
      title: {
        key: 'learn.course-2.2.3.reference.scipy-events.title',
        ko: 'solve_ivp — initial-value integration and events',
        en: 'solve_ivp — initial-value integration and events'
      },
      authors: 'SciPy developers',
      url: 'https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html',
      locator: {
        key: 'learn.course-2.2.3.reference.scipy-events.locator',
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
      key: 'learn.course-2.2.3.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
