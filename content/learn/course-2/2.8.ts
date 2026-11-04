import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.8', {
  guidance: [
    {
      key: 'learn.course-2.2.8.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.8.focus.criteria',
      ko: '기본 각좌표 fixture의 막대 잔차는 1e-10 m 이내여야 합니다. 에너지·왕복 오차는 0을 강제하지 않고 h 감소에 따른 수렴을 검사합니다. 감쇠·충돌은 이 기대의 범위 밖입니다.',
      en: 'Default angle-coordinate rod residual should be within 1e-10 m. Do not force energy or round-trip error to zero; check convergence under smaller h. Damping and collisions lie outside this expectation.'
    }
  ],
  tasks: [
    {
      id: 'three-checks',
      prediction: {
        key: 'learn.course-2.2.8.task.three-checks.prediction',
        ko: '큰 step에서도 막대 길이는 정확할 수 있을까요?',
        en: 'Can rod length remain accurate even with a large step?'
      },
      action: {
        key: 'learn.course-2.2.8.task.three-checks.action',
        ko: '기본 run의 세 검사를 읽고 step을 늘렸다가 줄입니다. 왕복은 같은 기간이며 두 각속도를 모두 반전하는지 확인하세요.',
        en: 'Read all three checks, increase then decrease the step, and verify that the return run uses the same duration and negates both velocities.'
      },
      expected: {
        key: 'learn.course-2.2.8.task.three-checks.expected',
        ko: '기본 각좌표 fixture의 막대 잔차는 1e-10 m 이내여야 합니다. 에너지·왕복 오차는 0을 강제하지 않고 h 감소에 따른 수렴을 검사합니다. 감쇠·충돌은 이 기대의 범위 밖입니다.',
        en: 'Default angle-coordinate rod residual should be within 1e-10 m. Do not force energy or round-trip error to zero; check convergence under smaller h. Damping and collisions lie outside this expectation.'
      },
      explanation: {
        key: 'learn.course-2.2.8.task.three-checks.explanation',
        ko: '한 검사만 통과했다고 전체 계산을 인증하지 않습니다. 작은 길이 오차와 큰 왕복 오차가 동시에 나타나는 이유를 설명하세요.',
        en: 'No single passed check certifies the computation. Explain how small rod residual and large return error can coexist.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.8',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.8.title',
    ko: '에너지·구속·시간역전 검증',
    en: 'Energy, constraint and time-reversal checks'
  },
  summary: {
    key: 'learn.course-2.2.8.summary',
    ko: '에너지가 보존되면 계산이 올바를까요? 하나의 실제 run에서 에너지 변화·막대 길이 구속·속도 반전 후 복귀를 함께 확인해 각 검사의 사각지대를 찾습니다.',
    en: 'Does energy conservation imply a correct computation? Inspect energy change, rod-length constraints and velocity-reversal return for the same actual run and identify what each check misses.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.8.objective.0',
      ko: '에너지·구속·시간역전 검사가 각각 측정하는 오류를 구분합니다.',
      en: 'Distinguish the error detected by energy, constraint and time-reversal checks.'
    },
    {
      key: 'learn.course-2.2.8.objective.1',
      ko: '절대 에너지와 양의 excitation 척도를 구분하고 허용오차·관찰 기간을 기록합니다.',
      en: 'Distinguish absolute energy from a positive excitation scale and record tolerances and observation duration.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.8.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.8.prerequisite.body',
        ko: '고정 지지점의 감쇠·구동 없는 강체 이중진자를 사용합니다. 역전 실험은 최종 각속도를 모두 반대로 하고 같은 양의 기간을 다시 적분합니다. 마찰·구동·비탄성 충돌에는 같은 대칭을 가정하지 않습니다.',
        en: 'Use a rigid undamped unforced double pendulum with fixed pivot. The reversal experiment negates both final angular velocities and integrates again for the same positive duration. Do not assume this symmetry with friction, forcing or inelastic impacts.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.7'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'energy-check',
      title: {
        key: 'learn.course-2.2.8.concept.energy-check.title',
        ko: '에너지 변화는 동역학 검사',
        en: 'Energy change checks dynamics'
      },
      body: {
        key: 'learn.course-2.2.8.concept.energy-check.body',
        ko: '같은 모형의 에너지를 모든 표본에서 계산하고 시작값과 비교합니다. 위치에너지의 0점은 임의이므로 시작 에너지 자체가 0에 가까울 때 단순 상대오차는 불안정합니다. 절대 변화와 명시한 양의 에너지 척도로 나눈 값을 함께 읽습니다.',
        en: 'Evaluate the same model energy at each sample and compare with the start. Potential zero is arbitrary, so relative error using near-zero initial energy is unstable. Read absolute change and a ratio using an explicitly positive energy scale.'
      },
      citationIds: ['hairer-geometric']
    },
    {
      id: 'constraint-check',
      title: {
        key: 'learn.course-2.2.8.concept.constraint-check.title',
        ko: '길이 구속은 기하 검사',
        en: 'Rod length checks geometry'
      },
      body: {
        key: 'learn.course-2.2.8.concept.constraint-check.body',
        ko: '각도로 Cartesian 위치를 재구성하면 막대 길이는 삼각함수 항등식 때문에 거의 정확합니다. 따라서 작은 구속 잔차는 올바른 위치 변환을 확인하지만 큰 step의 운동 오차를 배제하지 못합니다. Cartesian 구속 solver에서는 다른 수치 문제가 되어 잔차를 직접 감시해야 합니다.',
        en: 'Reconstructing Cartesian positions from angles enforces rod lengths nearly exactly by trigonometric identities. Small residual checks position reconstruction but cannot rule out large time-integration error. Cartesian constrained solvers face a different numerical problem and must monitor residual directly.'
      },
      citationIds: ['fnc-systems']
    },
    {
      id: 'reversal',
      title: {
        key: 'learn.course-2.2.8.concept.reversal.title',
        ko: '속도를 뒤집어 돌아오기',
        en: 'Reverse velocities and return'
      },
      body: {
        key: 'learn.course-2.2.8.concept.reversal.body',
        ko: '보존 역학의 참해는 시간역전 대칭을 가집니다. 그러나 RK4는 정확히 대칭인 방법이 아니므로 왕복 오차가 0일 필요는 없습니다. h를 줄여 복귀 오차의 수렴을 확인하며 오래가는 카오스 오차 증폭은 별도로 해석합니다.',
        en: 'The exact conservative flow is time reversible, but RK4 is not an exactly symmetric method, so its round-trip error need not vanish. Refine h to check convergence, and interpret long chaotic error amplification separately.'
      },
      citationIds: ['hairer-geometric']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.8.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.8.concept.synthesis.body',
        ko: '각 검사가 보이는 것과 놓치는 것을 구분했습니다. 2.9에서는 같은 입력과 검사 규칙을 여러 적분기에 공정하게 적용하고 기록합니다.',
        en: 'Having separated what each check detects and misses, apply the same inputs and diagnostics fairly to several integrators in 2.9.'
      },
      citationIds: ['fnc-systems']
    }
  ],
  equations: [
    {
      id: 'energy-constraint',
      title: {
        key: 'learn.course-2.2.8.equation.energy-constraint.title',
        ko: '1. 서로 다른 보존 검사',
        en: '1. Different preservation checks'
      },
      expression: 'energyError = E-E0; rodError = abs(sqrt(dx^2+dy^2)-length)',
      accessibleText: {
        key: 'learn.course-2.2.8.equation.energy-constraint.accessible',
        ko: '에너지와 길이 오차는 다른 단위를 가지므로 별도 허용오차로 판정합니다.',
        en: 'Energy and length residuals have different units and require separate tolerances.'
      },
      symbols: [
        {
          symbol: 'energyError',
          unit: 'J',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.energyError',
            ko: '현재와 초기 에너지의 차이',
            en: 'Current-minus-initial energy'
          }
        },
        {
          symbol: 'E',
          unit: 'J',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.E',
            ko: '현재 전체 역학에너지',
            en: 'Current total mechanical energy'
          }
        },
        {
          symbol: 'E0',
          unit: 'J',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.E0',
            ko: '초기 전체 역학에너지',
            en: 'Initial total mechanical energy'
          }
        },
        {
          symbol: 'rodError',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.rodError',
            ko: '막대 길이의 절대 잔차',
            en: 'Absolute rod-length residual'
          }
        },
        {
          symbol: 'dx',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.dx',
            ko: '해당 막대 끝점들의 수평 차이',
            en: 'Horizontal endpoint displacement'
          }
        },
        {
          symbol: 'dy',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.dy',
            ko: '해당 막대 끝점들의 수직 차이',
            en: 'Vertical endpoint displacement'
          }
        },
        {
          symbol: 'length',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.8.equation.energy-constraint.symbol.length',
            ko: '설정한 막대 길이',
            en: 'Configured rod length'
          }
        }
      ],
      citationIds: ['fnc-systems', 'hairer-geometric']
    },
    {
      id: 'reversal-map',
      title: {
        key: 'learn.course-2.2.8.equation.reversal-map.title',
        ko: '2. 최종 상태에서 속도 반전',
        en: '2. Reverse velocities at the final state'
      },
      expression: 'qReverse = qFinal; omegaReverse = -omegaFinal',
      accessibleText: {
        key: 'learn.course-2.2.8.equation.reversal-map.accessible',
        ko: '각도는 그대로 두고 두 각속도 모두의 부호를 바꿉니다. 다시 같은 기간을 적분하면 초기 각도와 부호가 뒤집힌 초기 속도로 돌아와야 합니다.',
        en: 'Keep angles and negate both velocities. After the same duration, the exact flow returns to initial angles and negated initial velocities.'
      },
      symbols: [
        {
          symbol: 'qReverse',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.8.equation.reversal-map.symbol.qReverse',
            ko: '돌아오는 run의 초기 각도',
            en: 'Initial return-run angle'
          }
        },
        {
          symbol: 'qFinal',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.8.equation.reversal-map.symbol.qFinal',
            ko: '정방향 run의 최종 각도',
            en: 'Forward-run final angle'
          }
        },
        {
          symbol: 'omegaReverse',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.8.equation.reversal-map.symbol.omegaReverse',
            ko: '돌아오는 run의 초기 각속도',
            en: 'Initial return-run angular velocity'
          }
        },
        {
          symbol: 'omegaFinal',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.8.equation.reversal-map.symbol.omegaFinal',
            ko: '정방향 run의 최종 각속도',
            en: 'Forward-run final angular velocity'
          }
        }
      ],
      citationIds: ['hairer-geometric']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'time-reversal',
      term: {
        key: 'learn.course-2.2.8.glossary.time-reversal.term',
        ko: '시간역전',
        en: 'Time reversal'
      },
      definition: {
        key: 'learn.course-2.2.8.glossary.time-reversal.definition',
        ko: '보존 역학에서 같은 위치의 모든 속도를 반대로 하여 같은 기간을 추적하는 대칭입니다. 수치 방법의 정확한 시간 대칭과는 별도 조건입니다.',
        en: 'A conservative-dynamics symmetry obtained by negating all velocities at fixed positions and tracing the same duration. Exact numerical symmetry is a separate property.'
      }
    }
  ],
  checks: [
    {
      id: 'rod-accurate',
      prompt: {
        key: 'learn.course-2.2.8.check.rod-accurate.prompt',
        ko: '막대 길이 오차가 0에 가까우면 시간 적분도 정확한가요?',
        en: 'Does nearly zero rod-length error imply accurate time integration?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.8.check.rod-accurate.explanation',
        ko: '기하 구속과 시간 이산화는 다른 오류원인이므로 에너지·종점·수렴을 따로 검사해야 합니다.',
        en: 'Geometry and time discretization are different error sources; inspect energy, endpoints and refinement separately.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.8.check.rod-accurate.supported.label',
            ko: '아닙니다. 각좌표 재구성은 길이를 기하적으로 고정합니다.',
            en: 'No. Angle-based reconstruction enforces lengths geometrically.'
          },
          feedback: {
            key: 'learn.course-2.2.8.check.rod-accurate.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 기하 구속과 시간 이산화는 다른 오류원인이므로 에너지·종점·수렴을 따로 검사해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Geometry and time discretization are different error sources; inspect energy, endpoints and refinement separately.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.8.check.rod-accurate.unsupported.label',
            ko: '항상 그렇습니다.',
            en: 'Always.'
          },
          feedback: {
            key: 'learn.course-2.2.8.check.rod-accurate.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 기하 구속과 시간 이산화는 다른 오류원인이므로 에너지·종점·수렴을 따로 검사해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Geometry and time discretization are different error sources; inspect energy, endpoints and refinement separately.'
          }
        }
      ]
    },
    {
      id: 'reverse-speed',
      prompt: {
        key: 'learn.course-2.2.8.check.reverse-speed.prompt',
        ko: '왕복의 참해가 돌아오는 속도는?',
        en: 'What velocity does the exact round trip return to?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.8.check.reverse-speed.explanation',
        ko: '최종 속도를 한 번 뒤집었으므로 복귀한 상태에서도 시간역전 연산을 고려해야 합니다.',
        en: 'After reversing once at the endpoint, the returned state must still be compared using the reversal operation.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.8.check.reverse-speed.supported.label',
            ko: '초기 각속도의 반대 부호입니다.',
            en: 'The negative of the initial angular velocity.'
          },
          feedback: {
            key: 'learn.course-2.2.8.check.reverse-speed.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 최종 속도를 한 번 뒤집었으므로 복귀한 상태에서도 시간역전 연산을 고려해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. After reversing once at the endpoint, the returned state must still be compared using the reversal operation.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.8.check.reverse-speed.unsupported.label',
            ko: '무조건 처음 속도와 같은 부호입니다.',
            en: 'Always the same sign as the initial velocity.'
          },
          feedback: {
            key: 'learn.course-2.2.8.check.reverse-speed.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 최종 속도를 한 번 뒤집었으므로 복귀한 상태에서도 시간역전 연산을 고려해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. After reversing once at the endpoint, the returned state must still be compared using the reversal operation.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.8',
    description: {
      key: 'learn.course-2.2.8.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'fnc-systems',
      title: {
        key: 'learn.course-2.2.8.reference.fnc-systems.title',
        ko: 'IVP systems — Fundamentals of Numerical Computation',
        en: 'IVP systems — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/systems/',
      locator: {
        key: 'learn.course-2.2.8.reference.fnc-systems.locator',
        ko: '6.3의 고차 방정식→1차 연립계 변환. 본 단원의 상태 순서와 질량행렬 풀이는 보존된 진자 adapter와 대조했습니다.',
        en: 'Section 6.3, reduction of higher-order equations to first-order systems; state ordering and the mass-matrix solve are checked against the preserved pendulum adapter.'
      },
      accessedOn: '2026-11-04'
    },
    {
      id: 'hairer-geometric',
      title: {
        key: 'learn.course-2.2.8.reference.hairer-geometric.title',
        ko: 'Geometric Numerical Integration, Lecture 2: Symplectic integrators',
        en: 'Geometric Numerical Integration, Lecture 2: Symplectic integrators'
      },
      authors: 'Ernst Hairer',
      url: 'https://www.unige.ch/~hairer/poly_geoint/week2.pdf',
      locator: {
        key: 'learn.course-2.2.8.reference.hairer-geometric.locator',
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
      key: 'learn.course-2.2.8.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
