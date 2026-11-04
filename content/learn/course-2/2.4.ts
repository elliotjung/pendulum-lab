import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.4', {
  guidance: [
    {
      key: 'learn.course-2.2.4.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.4.focus.criteria',
      ko: 'midpoint가 수렴한 기본 fixture에서 symplectic 잔차가 1e-5 이내여야 합니다. 에너지 오차를 0이라고 요구하지 않으며 유한차분·반복 오차보다 작은 차이는 과해석하지 않습니다.',
      en: 'For the converged default midpoint fixture, symplectic residual should be within 1e-5. Do not require zero energy error or overinterpret differences below differencing/iteration error.'
    }
  ],
  tasks: [
    {
      id: 'canonical-residual',
      prediction: {
        key: 'learn.course-2.2.4.task.canonical-residual.prediction',
        ko: 'RK4보다 차수가 낮은 midpoint가 canonical 기하를 더 잘 보존할 수 있을까요?',
        en: 'Can lower-order midpoint preserve canonical geometry better than RK4?'
      },
      action: {
        key: 'learn.course-2.2.4.task.canonical-residual.action',
        ko: '기본 설정으로 실행하고 4차원 Jacobian의 symplectic 잔차, 에너지 변화, implicit 수렴 상태를 비교하세요. 간격을 줄여 다시 검사합니다.',
        en: 'Run defaults and compare the four-dimensional Jacobian symplectic residual, energy change and implicit convergence status. Repeat with a smaller step.'
      },
      expected: {
        key: 'learn.course-2.2.4.task.canonical-residual.expected',
        ko: 'midpoint가 수렴한 기본 fixture에서 symplectic 잔차가 1e-5 이내여야 합니다. 에너지 오차를 0이라고 요구하지 않으며 유한차분·반복 오차보다 작은 차이는 과해석하지 않습니다.',
        en: 'For the converged default midpoint fixture, symplectic residual should be within 1e-5. Do not require zero energy error or overinterpret differences below differencing/iteration error.'
      },
      explanation: {
        key: 'learn.course-2.2.4.task.canonical-residual.explanation',
        ko: '화면은 모든 canonical 좌표의 변환을 검사합니다. 2차원 그림 하나의 면적이나 에너지 drift만으로 4차원 symplectic성을 증명할 수 없습니다.',
        en: 'The diagnostic checks the map in all canonical coordinates; one projected area or energy drift alone cannot establish four-dimensional symplecticity.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.4',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.4.title',
    ko: 'symplectic 적분과 위상공간 보존',
    en: 'Symplectic integration and phase-space preservation'
  },
  summary: {
    key: 'learn.course-2.2.4.summary',
    ko: '작은 에너지 오차만으로 좋은 Hamiltonian 적분기라고 할 수 있을까요? 실제 이중진자를 운동량으로 변환해 native implicit midpoint와 RK4의 symplectic 잔차·에너지 변화를 비교합니다.',
    en: 'Does small energy error certify a good Hamiltonian integrator? Convert the actual double pendulum to momentum coordinates and compare native implicit midpoint with RK4 using symplectic residual and energy change.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.4.objective.0',
      ko: '각속도와 canonical 운동량을 구분하고 비분리형 Hamiltonian의 의미를 설명합니다.',
      en: 'Distinguish angular velocity from canonical momentum and explain a nonseparable Hamiltonian.'
    },
    {
      key: 'learn.course-2.2.4.objective.1',
      ko: 'symplectic성·에너지 보존·시간 대칭을 각각 다른 성질로 확인합니다.',
      en: 'Check symplecticity, energy preservation and time symmetry as separate properties.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.4.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.4.prerequisite.body',
        ko: '감쇠와 외력이 없는 고정 지지점의 이중진자, 질량행렬, Hamiltonian과 수치 Jacobian을 사용합니다. canonical 상태는 theta1,theta2,p1,p2이며 p의 단위는 kg*m^2/s입니다.',
        en: 'Use an undamped unforced double pendulum, the mass matrix, a Hamiltonian and a numerical Jacobian. The canonical state is theta1,theta2,p1,p2, with momentum in kg*m^2/s.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.3'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'canonical',
      title: {
        key: 'learn.course-2.2.4.concept.canonical.title',
        ko: '속도 그림과 canonical 기하는 다름',
        en: 'Velocity plots and canonical geometry differ'
      },
      body: {
        key: 'learn.course-2.2.4.concept.canonical.body',
        ko: 'p=M(q)*omega이므로 자세에 따라 속도→운동량 변환이 바뀝니다. theta–omega 평면의 면적을 보았다고 canonical 면적 보존을 증명할 수 없습니다. 이 실험은 기존 omegaToMomentum과 canonicalRhs를 사용하며 4차원 symplectic 조건을 유한차분으로 검사합니다.',
        en: 'Since p=M(q)*omega, the velocity-to-momentum conversion depends on posture. Area in a theta–omega plot does not establish canonical area preservation. This experiment uses existing omegaToMomentum and canonicalRhs and checks the four-dimensional symplectic condition by finite differences.'
      },
      citationIds: ['hairer-geometric']
    },
    {
      id: 'midpoint',
      title: {
        key: 'learn.course-2.2.4.concept.midpoint.title',
        ko: '중점에서 implicit하게 평가',
        en: 'Evaluate implicitly at the midpoint'
      },
      body: {
        key: 'learn.course-2.2.4.concept.midpoint.body',
        ko: 'implicit midpoint는 이전·다음 canonical 상태의 중점에서 Hamiltonian 도함수를 평가합니다. 일반 이중진자의 운동에너지는 q에도 의존하므로 단순한 속도 kick-drift를 그대로 적용하면 symplectic이라는 보장이 없습니다. 반복 풀이가 수렴한 경우에만 비교 결과를 채택합니다.',
        en: 'Implicit midpoint evaluates the Hamiltonian derivative at the midpoint of old and new canonical states. Double-pendulum kinetic energy depends on q, so a naive velocity kick-drift has no symplectic guarantee. Accept comparison results only after the iterative solve converges.'
      },
      citationIds: ['hairer-geometric']
    },
    {
      id: 'limits',
      title: {
        key: 'learn.course-2.2.4.concept.limits.title',
        ko: '에너지는 진동할 수 있음',
        en: 'Energy may oscillate'
      },
      body: {
        key: 'learn.course-2.2.4.concept.limits.body',
        ko: 'symplectic 적분기는 원 Hamiltonian 값을 매 step 정확히 보존한다는 뜻이 아닙니다. 적당히 작은 고정 간격의 긴 시간에서 에너지 오차가 제한적으로 진동하는 경향을 볼 수 있지만 20초 Focus만으로 무한 시간 정리를 증명하지 않습니다. 유한차분 잔차는 차분 간격과 반복 tolerance에도 의존합니다.',
        en: 'A symplectic method need not preserve the original Hamiltonian exactly each step. Small fixed steps can show bounded oscillatory energy error over long intervals, but a bounded Focus run does not prove an infinite-time theorem. Finite-difference residual also depends on differencing scale and solver tolerance.'
      },
      citationIds: ['hairer-geometric']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.4.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.4.concept.synthesis.body',
        ko: '정확도·기하·반복 수렴은 각각 점검해야 합니다. 2.5에서는 빠른 시간척도 때문에 안정성이 지배하는 설정을 다룹니다.',
        en: 'Check accuracy, geometry and iterative convergence separately. In 2.5, investigate settings where fast time scales dominate stability.'
      },
      citationIds: ['hairer-geometric']
    }
  ],
  equations: [
    {
      id: 'momentum',
      title: {
        key: 'learn.course-2.2.4.equation.momentum.title',
        ko: '1. 질량행렬에서 운동량 얻기',
        en: '1. Obtain momenta from the mass matrix'
      },
      expression: 'p1 = M11*omega1+M12*omega2; p2 = M12*omega1+M22*omega2',
      accessibleText: {
        key: 'learn.course-2.2.4.equation.momentum.accessible',
        ko: '각속도 벡터에 자세 의존 질량행렬을 곱한 것이 canonical 운동량입니다.',
        en: 'Multiplying angular velocities by the posture-dependent mass matrix gives canonical momenta.'
      },
      symbols: [
        {
          symbol: 'p1',
          unit: 'kg*m^2/s',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.p1',
            ko: '첫 canonical 운동량',
            en: 'First canonical momentum'
          }
        },
        {
          symbol: 'p2',
          unit: 'kg*m^2/s',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.p2',
            ko: '둘째 canonical 운동량',
            en: 'Second canonical momentum'
          }
        },
        {
          symbol: 'M11',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.M11',
            ko: '첫 관성 계수',
            en: 'First inertia coefficient'
          }
        },
        {
          symbol: 'M12',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.M12',
            ko: '교차 관성 계수',
            en: 'Cross inertia coefficient'
          }
        },
        {
          symbol: 'M22',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.M22',
            ko: '둘째 관성 계수',
            en: 'Second inertia coefficient'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.omega1',
            ko: '첫 각속도',
            en: 'Angular velocity one'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.4.equation.momentum.symbol.omega2',
            ko: '둘째 각속도',
            en: 'Angular velocity two'
          }
        }
      ],
      citationIds: ['hairer-geometric']
    },
    {
      id: 'implicit-position',
      title: {
        key: 'learn.course-2.2.4.equation.implicit-position.title',
        ko: '2. 중점 조건의 좌표 성분',
        en: '2. Position component of the midpoint condition'
      },
      expression: 'qMid = (qOld+qNew)/2; qNew = qOld+h*vMid',
      accessibleText: {
        key: 'learn.course-2.2.4.equation.implicit-position.accessible',
        ko: '미지의 새 상태로 중점이 정해지므로 새 상태를 반복해서 풀어야 합니다. 운동량 성분도 같은 중점의 음의 dH/dq를 사용합니다.',
        en: 'The unknown new state determines the midpoint, so the step requires iteration; momentum uses minus dH/dq at that same midpoint.'
      },
      symbols: [
        {
          symbol: 'qMid',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.4.equation.implicit-position.symbol.qMid',
            ko: 'implicit 중점 좌표',
            en: 'Implicit midpoint angle'
          }
        },
        {
          symbol: 'qOld',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.4.equation.implicit-position.symbol.qOld',
            ko: '이전 좌표',
            en: 'Old angle'
          }
        },
        {
          symbol: 'qNew',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.4.equation.implicit-position.symbol.qNew',
            ko: '새 좌표',
            en: 'New angle'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.4.equation.implicit-position.symbol.h',
            ko: '고정 시간 간격',
            en: 'Fixed time step'
          }
        },
        {
          symbol: 'vMid',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.4.equation.implicit-position.symbol.vMid',
            ko: '중점 canonical 상태에서 dH/dp',
            en: 'dH/dp evaluated at the midpoint canonical state'
          }
        }
      ],
      citationIds: ['hairer-geometric']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'canonical-momentum',
      term: {
        key: 'learn.course-2.2.4.glossary.canonical-momentum.term',
        ko: 'Canonical 운동량',
        en: 'Canonical momentum'
      },
      definition: {
        key: 'learn.course-2.2.4.glossary.canonical-momentum.definition',
        ko: '라그랑지안의 일반화속도 미분으로 정의합니다. 진자의 자세 의존 질량행렬을 각속도에 곱해 얻으며 각속도 자체와 다릅니다.',
        en: 'Defined by differentiating the Lagrangian with respect to generalized velocity. For the pendulum it is the posture-dependent mass matrix times angular velocity.'
      }
    }
  ],
  checks: [
    {
      id: 'area',
      prompt: {
        key: 'learn.course-2.2.4.check.area.prompt',
        ko: '어느 좌표에서 symplectic 조건을 검사해야 하나요?',
        en: 'In which coordinates should the symplectic condition be checked?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.4.check.area.explanation',
        ko: 'p=M(q)*omega이므로 각속도는 일반적으로 canonical 운동량과 다릅니다.',
        en: 'Because p=M(q)*omega, angular velocity is generally not canonical momentum.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.4.check.area.supported.label',
            ko: '일반화좌표와 그 conjugate 운동량입니다.',
            en: 'Generalized coordinates and their conjugate momenta.'
          },
          feedback: {
            key: 'learn.course-2.2.4.check.area.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. p=M(q)*omega이므로 각속도는 일반적으로 canonical 운동량과 다릅니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Because p=M(q)*omega, angular velocity is generally not canonical momentum.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.4.check.area.unsupported.label',
            ko: '아무 좌표·속도 투영이면 됩니다.',
            en: 'Any coordinate–velocity projection will do.'
          },
          feedback: {
            key: 'learn.course-2.2.4.check.area.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. p=M(q)*omega이므로 각속도는 일반적으로 canonical 운동량과 다릅니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Because p=M(q)*omega, angular velocity is generally not canonical momentum.'
          }
        }
      ]
    },
    {
      id: 'energy-exact',
      prompt: {
        key: 'learn.course-2.2.4.check.energy-exact.prompt',
        ko: 'symplectic이면 매 step 에너지가 정확히 같나요?',
        en: 'Does symplecticity make energy identical every step?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.4.check.energy-exact.explanation',
        ko: '기하 검사와 에너지 검사를 함께 읽고 고정 간격·수렴 조건을 확인해야 합니다.',
        en: 'Read geometric and energy diagnostics together and verify fixed-step and solve-convergence conditions.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.4.check.energy-exact.supported.label',
            ko: '아닙니다. 기하 보존과 원 에너지의 정확 보존은 다릅니다.',
            en: 'No. Geometric preservation differs from exact preservation of the original energy.'
          },
          feedback: {
            key: 'learn.course-2.2.4.check.energy-exact.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 기하 검사와 에너지 검사를 함께 읽고 고정 간격·수렴 조건을 확인해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Read geometric and energy diagnostics together and verify fixed-step and solve-convergence conditions.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.4.check.energy-exact.unsupported.label',
            ko: '그렇습니다. 에너지 오차는 항상 0입니다.',
            en: 'Yes. Energy error is always zero.'
          },
          feedback: {
            key: 'learn.course-2.2.4.check.energy-exact.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 기하 검사와 에너지 검사를 함께 읽고 고정 간격·수렴 조건을 확인해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Read geometric and energy diagnostics together and verify fixed-step and solve-convergence conditions.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.4',
    description: {
      key: 'learn.course-2.2.4.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'hairer-geometric',
      title: {
        key: 'learn.course-2.2.4.reference.hairer-geometric.title',
        ko: 'Geometric Numerical Integration, Lecture 2: Symplectic integrators',
        en: 'Geometric Numerical Integration, Lecture 2: Symplectic integrators'
      },
      authors: 'Ernst Hairer',
      url: 'https://www.unige.ch/~hairer/poly_geoint/week2.pdf',
      locator: {
        key: 'learn.course-2.2.4.reference.hairer-geometric.locator',
        ko: '2010 강의 1절 정리3의 implicit midpoint, 2절의 symplectic RK 조건, 3절의 adjoint와 시간 대칭. 일반 Hamiltonian은 비분리형일 수 있습니다.',
        en: '2010 lecture, section 1 theorem 3 (implicit midpoint), section 2 (symplectic RK), section 3 (adjoint and symmetry); general Hamiltonians need not be separable.'
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
      key: 'learn.course-2.2.4.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
