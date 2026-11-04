import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.2', {
  guidance: [
    {
      key: 'learn.course-2.2.2.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.2.focus.criteria',
      ko: '표시된 오차는 무차원 성분 척도에 대한 차이이며 참오차 인증값은 아닙니다. 기본 짧은 기간에서 h/2 오차가 h 오차보다 작아야 하며 비율은 점근적으로 약 2입니다.',
      en: 'Displayed errors use a dimensionless component scale and are not certified exact errors. For the default short interval, h/2 error should be below h error, with a ratio approaching two asymptotically.'
    }
  ],
  tasks: [
    {
      id: 'step-halving',
      prediction: {
        key: 'learn.course-2.2.2.task.step-halving.prediction',
        ko: 'Euler의 h와 h/2 중 어느 쪽이 같은 최종 시각에서 정밀 기준에 가까울까요?',
        en: 'Which Euler result, h or h/2, should be closer to the refined reference at the same final time?'
      },
      action: {
        key: 'learn.course-2.2.2.task.step-halving.action',
        ko: '기본값으로 실행해 Euler 두 해상도와 정밀 RK4의 종점 차이·에너지 변화를 읽고 h를 줄여 반복하세요.',
        en: 'Run the default experiment, read endpoint differences and energy changes for both Euler resolutions and refined RK4, then repeat with a smaller h.'
      },
      expected: {
        key: 'learn.course-2.2.2.task.step-halving.expected',
        ko: '표시된 오차는 무차원 성분 척도에 대한 차이이며 참오차 인증값은 아닙니다. 기본 짧은 기간에서 h/2 오차가 h 오차보다 작아야 하며 비율은 점근적으로 약 2입니다.',
        en: 'Displayed errors use a dimensionless component scale and are not certified exact errors. For the default short interval, h/2 error should be below h error, with a ratio approaching two asymptotically.'
      },
      explanation: {
        key: 'learn.course-2.2.2.task.step-halving.explanation',
        ko: '두 궤적을 동일한 시각에서 비교해야 누적 오차의 차수를 읽을 수 있습니다. 한 step 뒤 서로 다른 시각을 비교하지 마세요.',
        en: 'Compare trajectories at the same physical time to infer accumulated-error order; do not compare one step ending at different times.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.2',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.2.title',
    ko: '명시적 Euler와 국소 절단오차',
    en: 'Explicit Euler and local truncation error'
  },
  summary: {
    key: 'learn.course-2.2.2.summary',
    ko: '작은 시간 간격이 정확도를 얼마나 개선할까요? Euler의 한 단계 결함과 고정 기간의 누적 오차를 구분하고 같은 엔진의 RK4 정밀 기준과 비교합니다.',
    en: 'How much does a smaller time step improve accuracy? Separate Euler one-step defect from accumulated error over a fixed interval and compare with a refined RK4 reference from the same engine.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.2.objective.0',
      ko: 'Taylor 전개에서 Euler 갱신과 버린 항의 차수를 유도합니다.',
      en: 'Derive the Euler update and the order of the omitted term from a Taylor expansion.'
    },
    {
      key: 'learn.course-2.2.2.objective.1',
      ko: '한 단계 오차와 전역 오차, 에너지 drift가 서로 다른 지표임을 설명합니다.',
      en: 'Distinguish one-step error, global error and energy drift.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.2.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.2.prerequisite.body',
        ko: '2.1의 4성분 상태와 매끄러운 해의 Taylor 전개를 사용합니다. 고정 지지점의 감쇠 없는 이중진자이며, 비교할 때 물성·초기조건·최종 시각을 고정합니다.',
        en: 'Use the four-component state from 2.1 and Taylor expansion of a smooth solution. Compare the same undamped double pendulum with fixed physical parameters, initial values and final time.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.1'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'taylor',
      title: {
        key: 'learn.course-2.2.2.concept.taylor.title',
        ko: '현재 기울기로 접선 따라가기',
        en: 'Follow the current tangent'
      },
      body: {
        key: 'learn.course-2.2.2.concept.taylor.body',
        ko: '현재 상태에서 구한 도함수에 h를 곱해 더하면 Euler가 됩니다. 진짜 해는 그 사이 곡률을 가지므로 한 번의 출발이 정확해도 h 제곱 크기의 결함이 남습니다. h로 나눈 국소 절단오차를 쓰는 문헌에서는 이를 1차라고 부릅니다.',
        en: 'Adding h times the current derivative gives Euler. Curvature of the exact solution leaves a defect of order h squared even from an exact starting value. References that divide this defect by h call the resulting local truncation error first order.'
      },
      citationIds: ['fnc-euler']
    },
    {
      id: 'accumulation',
      title: {
        key: 'learn.course-2.2.2.concept.accumulation.title',
        ko: '같은 종착 시각까지의 오차',
        en: 'Error at the same final time'
      },
      body: {
        key: 'learn.course-2.2.2.concept.accumulation.body',
        ko: '기간을 고정하고 h를 줄이면 step 수가 늘어납니다. 안정적이고 매끄러운 유한 기간에서 Euler의 전역 오차는 보통 h에 비례합니다. 따라서 한 단계 결함의 4배 감소와 전체 오차의 2배 감소를 같은 주장으로 쓰면 안 됩니다.',
        en: 'For a fixed duration, reducing h increases the step count. On a smooth stable finite interval, Euler global error typically scales with h. A fourfold decrease in one-step defect and a twofold decrease in global error are different predictions.'
      },
      citationIds: ['fnc-euler']
    },
    {
      id: 'reference-limit',
      title: {
        key: 'learn.course-2.2.2.concept.reference-limit.title',
        ko: '기준값도 수치해',
        en: 'A reference is also numerical'
      },
      body: {
        key: 'learn.course-2.2.2.concept.reference-limit.body',
        ko: '정밀 RK4는 참해가 아니므로 기준 step도 다시 반으로 줄여 안정성을 확인합니다. 카오스의 긴 궤적에서는 작은 국소 오차가 크게 증폭됩니다. 에너지 변화가 작아도 위상 오차가 클 수 있고, Euler 에너지 증가는 실제 구동력의 증거가 아닙니다.',
        en: 'Refined RK4 is not an exact solution; halve its step again to check convergence. Chaotic trajectories amplify local error over long durations. Small energy change can coexist with substantial phase error, while Euler energy growth is not evidence of physical forcing.'
      },
      citationIds: ['fnc-euler', 'fnc-stability']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.2.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.2.concept.synthesis.body',
        ko: '오차 차수는 기간·안정성·기준값과 함께 읽어야 합니다. 2.3에서는 step당 여러 기울기를 쓰고 간격을 자동 조절하는 방법으로 확장합니다.',
        en: 'Read error order together with duration, stability and reference convergence. In 2.3, extend this to multistage slopes and automatic step control.'
      },
      citationIds: ['fnc-euler']
    }
  ],
  equations: [
    {
      id: 'euler-update',
      title: {
        key: 'learn.course-2.2.2.equation.euler-update.title',
        ko: '1. 각도 성분의 Euler 갱신',
        en: '1. Euler update for an angle'
      },
      expression: 'qNext = q+h*omega',
      accessibleText: {
        key: 'learn.course-2.2.2.equation.euler-update.accessible',
        ko: '현재 각도에 시간 간격 곱하기 각속도를 더합니다.',
        en: 'Add the step multiplied by current angular velocity to the current angle.'
      },
      symbols: [
        {
          symbol: 'qNext',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.2.equation.euler-update.symbol.qNext',
            ko: '다음 각도 근사값',
            en: 'Next angle approximation'
          }
        },
        {
          symbol: 'q',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.2.equation.euler-update.symbol.q',
            ko: '현재 각도',
            en: 'Current angle'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.2.equation.euler-update.symbol.h',
            ko: '시간 간격',
            en: 'Time step'
          }
        },
        {
          symbol: 'omega',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.2.equation.euler-update.symbol.omega',
            ko: '현재 각속도',
            en: 'Current angular velocity'
          }
        }
      ],
      citationIds: ['fnc-euler']
    },
    {
      id: 'leading-defect',
      title: {
        key: 'learn.course-2.2.2.equation.leading-defect.title',
        ko: '2. Taylor 전개의 선도 결함',
        en: '2. Leading defect from Taylor expansion'
      },
      expression: 'defect = h^2*alpha/2; globalEstimate = C*h',
      accessibleText: {
        key: 'learn.course-2.2.2.equation.leading-defect.accessible',
        ko: '첫 식은 h 제곱 선도항만 표시하며 더 높은 항을 생략합니다. 둘째는 전역 오차의 점근 근사이며 보편적 상한이 아닙니다.',
        en: 'The first relation keeps the leading h-squared term and omits higher terms; the second is an asymptotic global estimate rather than a universal bound.'
      },
      symbols: [
        {
          symbol: 'defect',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.2.equation.leading-defect.symbol.defect',
            ko: '출발이 정확할 때 각도의 선도 한 단계 결함',
            en: 'Leading angular one-step defect from an exact start'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.2.equation.leading-defect.symbol.h',
            ko: '시간 간격',
            en: 'Time step'
          }
        },
        {
          symbol: 'alpha',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-2.2.2.equation.leading-defect.symbol.alpha',
            ko: '출발점 각가속도',
            en: 'Initial angular acceleration'
          }
        },
        {
          symbol: 'globalEstimate',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.2.equation.leading-defect.symbol.globalEstimate',
            ko: '유한 기간 각도 오차의 선도 근사',
            en: 'Leading finite-interval angular error estimate'
          }
        },
        {
          symbol: 'C',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.2.equation.leading-defect.symbol.C',
            ko: '문제와 기간에 의존하는 오차 계수',
            en: 'Problem- and interval-dependent error coefficient'
          }
        }
      ],
      citationIds: ['fnc-euler']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'one-step-defect',
      term: {
        key: 'learn.course-2.2.2.glossary.one-step-defect.term',
        ko: '한 단계 결함',
        en: 'One-step defect'
      },
      definition: {
        key: 'learn.course-2.2.2.glossary.one-step-defect.definition',
        ko: '출발값을 참해로 두고 한 step만 전진했을 때 생기는 차이입니다. h로 나눈 국소 절단오차와 구분합니다.',
        en: 'The difference after a single step started from the exact solution. Distinguish it from local truncation error divided by h.'
      }
    }
  ],
  checks: [
    {
      id: 'local-global',
      prompt: {
        key: 'learn.course-2.2.2.check.local-global.prompt',
        ko: 'h를 반으로 할 때 예상하는 감소율은?',
        en: 'What decrease is expected when h is halved?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.2.check.local-global.explanation',
        ko: '매끄러운 유한 기간의 점근 구간에서만 차수 예측이 유효하며 상수와 고차항은 달라집니다.',
        en: 'Order predictions apply in the smooth finite-interval asymptotic regime; constants and higher-order terms vary.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.2.check.local-global.supported.label',
            ko: '한 단계 결함 약 4배, 전역 오차 약 2배입니다.',
            en: 'About fourfold for one-step defect and twofold for global error.'
          },
          feedback: {
            key: 'learn.course-2.2.2.check.local-global.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 매끄러운 유한 기간의 점근 구간에서만 차수 예측이 유효하며 상수와 고차항은 달라집니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Order predictions apply in the smooth finite-interval asymptotic regime; constants and higher-order terms vary.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.2.check.local-global.unsupported.label',
            ko: '둘 다 항상 정확히 4배입니다.',
            en: 'Both are always exactly fourfold.'
          },
          feedback: {
            key: 'learn.course-2.2.2.check.local-global.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 매끄러운 유한 기간의 점근 구간에서만 차수 예측이 유효하며 상수와 고차항은 달라집니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Order predictions apply in the smooth finite-interval asymptotic regime; constants and higher-order terms vary.'
          }
        }
      ]
    },
    {
      id: 'energy',
      prompt: {
        key: 'learn.course-2.2.2.check.energy.prompt',
        ko: 'Euler run의 에너지가 증가하면 무엇부터 의심하나요?',
        en: 'What should be checked first if Euler energy increases?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.2.check.energy.explanation',
        ko: '감쇠·구동이 없는 모델에서 에너지 변화는 수치 건전성 경고이며 외력의 발견이 아닙니다.',
        en: 'For an unforced undamped model, energy change is a numerical warning rather than discovery of a force.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.2.check.energy.supported.label',
            ko: '시간 간격을 줄여 수치 drift의 수렴을 확인합니다.',
            en: 'Reduce the step and check convergence of numerical drift.'
          },
          feedback: {
            key: 'learn.course-2.2.2.check.energy.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 감쇠·구동이 없는 모델에서 에너지 변화는 수치 건전성 경고이며 외력의 발견이 아닙니다.',
            en: 'This interpretation accounts for settings, units and assumptions. For an unforced undamped model, energy change is a numerical warning rather than discovery of a force.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.2.check.energy.unsupported.label',
            ko: '모델에 외부 에너지 공급이 있다고 단정합니다.',
            en: 'Conclude that the model contains external energy input.'
          },
          feedback: {
            key: 'learn.course-2.2.2.check.energy.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 감쇠·구동이 없는 모델에서 에너지 변화는 수치 건전성 경고이며 외력의 발견이 아닙니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. For an unforced undamped model, energy change is a numerical warning rather than discovery of a force.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.2',
    description: {
      key: 'learn.course-2.2.2.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'fnc-euler',
      title: {
        key: 'learn.course-2.2.2.reference.fnc-euler.title',
        ko: 'Euler’s method — Fundamentals of Numerical Computation',
        en: 'Euler’s method — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/euler/',
      locator: {
        key: 'learn.course-2.2.2.reference.fnc-euler.locator',
        ko: '6.2의 Taylor 전개와 수렴. 원문의 h로 나눈 국소 절단오차와 이 단원의 나누지 않은 한 단계 결함을 명시적으로 구분합니다.',
        en: 'Section 6.2, Taylor expansion and convergence; the source divides local truncation error by h, whereas this lesson explicitly names the unscaled one-step defect.'
      },
      accessedOn: '2026-11-04'
    },
    {
      id: 'fnc-stability',
      title: {
        key: 'learn.course-2.2.2.reference.fnc-stability.title',
        ko: 'Absolute stability — Fundamentals of Numerical Computation',
        en: 'Absolute stability — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/absstab-diffusion/',
      locator: {
        key: 'learn.course-2.2.2.reference.fnc-stability.locator',
        ko: '11.3의 y′=lambda*y 시험 방정식과 Euler 안정 영역. 진자에는 허수 고유값이 있어 음의 실수축 조건만 적용할 수 없습니다.',
        en: 'Section 11.3, the scalar test equation and Euler stability region; pendulum eigenvalues can be imaginary, so a negative-real-axis condition alone is insufficient.'
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
      key: 'learn.course-2.2.2.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
