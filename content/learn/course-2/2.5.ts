import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.5', {
  guidance: [
    {
      key: 'learn.course-2.2.5.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.5.focus.criteria',
      ko: '채택된 TR-BDF2 run은 모든 implicit stage가 수렴해야 하며 표시된 최대 잔차는 설정 tolerance 이내여야 합니다. Euler의 큰 오차는 결과에서 확인합니다. 큰 간격에서 baseline 또는 비교 계산이 실패하면 완료 결과로 채택하지 않으며 간격을 줄여 재실행합니다.',
      en: 'Every stage of an accepted TR-BDF2 run must converge, with maximum reported residual within the configured tolerance. Large Euler error remains visible. If the baseline or comparison fails at a coarse step, no completed result is accepted; reduce the step and rerun.'
    }
  ],
  tasks: [
    {
      id: 'stiffness-scan',
      prediction: {
        key: 'learn.course-2.2.5.task.stiffness-scan.prediction',
        ko: 'k를 올리면 고정 간격 Euler와 TR-BDF2의 에너지 오차가 어떻게 달라질까요?',
        en: 'How will increasing k change energy error of fixed-step Euler and TR-BDF2?'
      },
      action: {
        key: 'learn.course-2.2.5.task.stiffness-scan.action',
        ko: '같은 spring 초기조건·시간 간격으로 두 solver를 실행하고 k를 올립니다. 상태 유한성, Newton 수렴, 에너지 변화와 호출 비용을 함께 읽습니다.',
        en: 'Run both solvers with the same spring initial values and step, then increase k. Read finite-state checks, Newton convergence, energy change and derivative-call cost together.'
      },
      expected: {
        key: 'learn.course-2.2.5.task.stiffness-scan.expected',
        ko: '채택된 TR-BDF2 run은 모든 implicit stage가 수렴해야 하며 표시된 최대 잔차는 설정 tolerance 이내여야 합니다. Euler의 큰 오차는 결과에서 확인합니다. 큰 간격에서 baseline 또는 비교 계산이 실패하면 완료 결과로 채택하지 않으며 간격을 줄여 재실행합니다.',
        en: 'Every stage of an accepted TR-BDF2 run must converge, with maximum reported residual within the configured tolerance. Large Euler error remains visible. If the baseline or comparison fails at a coarse step, no completed result is accepted; reduce the step and rerun.'
      },
      explanation: {
        key: 'learn.course-2.2.5.task.stiffness-scan.explanation',
        ko: '비선형 풀이가 실패하면 h를 줄여 재시도합니다. 유한한 에너지 손실도 실제 감쇠로 해석하기 전에 시간 해상도를 확인합니다.',
        en: 'On nonlinear-solve failure, retry with smaller h. Check time resolution before interpreting even finite energy loss as physical damping.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.5',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.5.title',
    ko: 'implicit 적분과 강성 문제',
    en: 'Implicit integration and stiffness'
  },
  summary: {
    key: 'learn.course-2.2.5.summary',
    ko: '용수철을 단단하게 하면 같은 시간 간격이 왜 위험해질까요? 실제 spring RHS에서 Euler와 native TR-BDF2를 비교하고 수치 감쇠·물리 감쇠·Newton 잔차를 구별합니다.',
    en: 'Why can the same time step become unsafe with a harder spring? Compare Euler and native TR-BDF2 on the actual spring RHS and distinguish numerical damping, physical damping and Newton residual.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.5.objective.0',
      ko: '방사 진동수의 질량·강성 의존성을 유도하고 시간척도 분리를 설명합니다.',
      en: 'Derive radial-frequency dependence on mass and stiffness and explain separated time scales.'
    },
    {
      key: 'learn.course-2.2.5.objective.1',
      ko: 'implicit 안정성이 정확도나 비선형 풀이 수렴을 보장하지 않음을 확인합니다.',
      en: 'Verify that implicit stability guarantees neither accuracy nor nonlinear-solve convergence.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.5.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.5.prerequisite.body',
        ko: '양의 질량과 자연 길이를 가진 용수철 진자, 작은 방사 교란, 선형 안정성 시험을 사용합니다. 이 실험의 spring 모델에는 물리 감쇠가 없으며, 고주파 진동의 분해능과 감쇠형 강성을 구분합니다.',
        en: 'Use a spring pendulum with positive mass/rest length, small radial perturbations and a linear stability test. This spring experiment has no physical damping; distinguish fast oscillation resolution from dissipative stiffness.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.4'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'fast-mode',
      title: {
        key: 'learn.course-2.2.5.concept.fast-mode.title',
        ko: '강성을 올리면 빠른 방사 모드',
        en: 'Stiffness raises the fast radial mode'
      },
      body: {
        key: 'learn.course-2.2.5.concept.fast-mode.body',
        ko: '평형 길이 근처에서 각도 결합을 잠시 무시하면 방사 교란은 질량 m과 스프링 상수 k의 조화진동자와 같습니다. k를 네 배로 하면 이 근사 진동수는 두 배입니다. 전체 용수철 진자는 방사·각 모드가 결합하므로 이 값은 국소 시간척도이지 모든 궤적의 정확한 주기가 아닙니다.',
        en: 'Near an equilibrium length, temporarily neglecting angular coupling gives a radial harmonic oscillator of mass m and spring constant k. Quadrupling k doubles this approximate frequency. The full spring pendulum couples radial and angular motion, so this is a local time scale rather than every trajectory period.'
      },
      citationIds: ['fnc-stiffness']
    },
    {
      id: 'implicit-stages',
      title: {
        key: 'learn.course-2.2.5.concept.implicit-stages.title',
        ko: '두 implicit stage를 풀기',
        en: 'Solve two implicit stages'
      },
      body: {
        key: 'learn.course-2.2.5.concept.implicit-stages.body',
        ko: 'TR-BDF2는 먼저 trapezoidal stage를 거친 뒤 비균등 BDF2 stage를 풉니다. 기존 native 구현의 gamma=2-sqrt(2)를 사용하고 각 stage를 Newton으로 풉니다. 수렴 실패는 이전 상태를 그대로 보존하는 실패로 처리하며 작은 잔차만으로 시간 이산화 오차가 작다고 말하지 않습니다.',
        en: 'TR-BDF2 first solves a trapezoidal stage and then a nonuniform BDF2 stage. The existing native implementation uses gamma=2-sqrt(2) and Newton solves both stages. Nonconvergence preserves the prior state as a failure; a small nonlinear residual alone does not imply small time-discretization error.'
      },
      citationIds: ['hosea-trbdf2']
    },
    {
      id: 'damping-limit',
      title: {
        key: 'learn.course-2.2.5.concept.damping-limit.title',
        ko: '수치 안정과 실제 운동',
        en: 'Numerical stability and physical motion'
      },
      body: {
        key: 'learn.course-2.2.5.concept.damping-limit.body',
        ko: 'L-stability는 매우 빠른 수치 성분을 감쇠시키는 장점이 있지만 감쇠 없는 실제 빠른 진동을 보존한다는 뜻은 아닙니다. 여기서 에너지가 줄면 TR-BDF2의 수치 감쇠인지 해상도를 줄여 확인합니다. 큰 k는 빠른 진동을 만들며 이 보존 예제를 순수한 음의 실수 고유값의 강성 문제와 같다고 하지 않습니다.',
        en: 'L-stability damps very fast numerical components but does not promise preservation of genuine undamped fast oscillations. If energy decreases, refine time resolution to distinguish TR-BDF2 numerical damping. Large k creates rapid oscillation; this conservative example is not identical to a stiff problem with negative-real eigenvalues.'
      },
      citationIds: ['fnc-stiffness', 'hosea-trbdf2']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.5.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.5.concept.synthesis.body',
        ko: 'implicit 방법도 계산 비용과 해상도·풀이 잔차를 함께 판단해야 합니다. 2.6에서는 step 사이에 일어나는 사건의 시각을 찾습니다.',
        en: 'Judge implicit methods by cost, resolution and solve residual together. In 2.6, locate an event occurring between steps.'
      },
      citationIds: ['fnc-stiffness']
    }
  ],
  equations: [
    {
      id: 'radial-scale',
      title: {
        key: 'learn.course-2.2.5.equation.radial-scale.title',
        ko: '1. 평형 근처 방사 모드의 척도',
        en: '1. Radial time scale near equilibrium'
      },
      expression: 'nu^2 = k/m; tau = 1/nu',
      accessibleText: {
        key: 'learn.course-2.2.5.equation.radial-scale.accessible',
        ko: '방사 각진동수 제곱은 강성 나누기 질량이며 시간척도는 그 역수입니다. 전체 결합 운동의 정확한 주기식은 아닙니다.',
        en: 'The radial frequency squared is stiffness divided by mass, and its inverse sets a time scale; this is not an exact period formula for the full coupled motion.'
      },
      symbols: [
        {
          symbol: 'nu',
          unit: 's^-1',
          meaning: {
            key: 'learn.course-2.2.5.equation.radial-scale.symbol.nu',
            ko: '국소 방사 각진동수 척도',
            en: 'Local radial angular-frequency scale'
          }
        },
        {
          symbol: 'k',
          unit: 'N/m',
          meaning: {
            key: 'learn.course-2.2.5.equation.radial-scale.symbol.k',
            ko: '스프링 상수',
            en: 'Spring constant'
          }
        },
        {
          symbol: 'm',
          unit: 'kg',
          meaning: {
            key: 'learn.course-2.2.5.equation.radial-scale.symbol.m',
            ko: '질점 질량',
            en: 'Point mass'
          }
        },
        {
          symbol: 'tau',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.5.equation.radial-scale.symbol.tau',
            ko: '방사 시간척도',
            en: 'Radial time scale'
          }
        }
      ],
      citationIds: ['fnc-stiffness']
    },
    {
      id: 'trbdf-stages',
      title: {
        key: 'learn.course-2.2.5.equation.trbdf-stages.title',
        ko: '2. 한 위치 성분의 두 stage',
        en: '2. Two stages for a position component'
      },
      expression:
        'gamma = 2-sqrt(2); xGamma = xOld+gamma*h*(vOld+vGamma)/2; xNew = xGamma/(gamma*(2-gamma))-(1-gamma)^2*xOld/(gamma*(2-gamma))+(1-gamma)*h*vNew/(2-gamma)',
      accessibleText: {
        key: 'learn.course-2.2.5.equation.trbdf-stages.accessible',
        ko: '첫 stage는 두 끝 속도의 평균으로 위치를 갱신하고 둘째는 BDF2의 비균등 간격 조합을 풉니다. 실제 solver는 위치와 속도 전체를 함께 풉니다.',
        en: 'The first stage averages endpoint velocities and the second solves a nonuniform BDF2 combination; the actual solver solves the full position/velocity state together.'
      },
      symbols: [
        {
          symbol: 'gamma',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.gamma',
            ko: 'TR-BDF2 내부 stage 비율',
            en: 'TR-BDF2 internal stage fraction'
          }
        },
        {
          symbol: 'xGamma',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.xGamma',
            ko: '내부 stage 위치',
            en: 'Internal-stage position'
          }
        },
        {
          symbol: 'xOld',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.xOld',
            ko: '이전 위치',
            en: 'Old position'
          }
        },
        {
          symbol: 'xNew',
          unit: 'm',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.xNew',
            ko: '새 위치',
            en: 'New position'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.h',
            ko: '시간 간격',
            en: 'Time step'
          }
        },
        {
          symbol: 'vOld',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.vOld',
            ko: '이전 속도',
            en: 'Old velocity'
          }
        },
        {
          symbol: 'vGamma',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.vGamma',
            ko: '내부 stage 속도',
            en: 'Internal-stage velocity'
          }
        },
        {
          symbol: 'vNew',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-2.2.5.equation.trbdf-stages.symbol.vNew',
            ko: '새 속도',
            en: 'New velocity'
          }
        }
      ],
      citationIds: ['hosea-trbdf2']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'nonlinear-residual',
      term: {
        key: 'learn.course-2.2.5.glossary.nonlinear-residual.term',
        ko: '비선형 풀이 잔차',
        en: 'Nonlinear solve residual'
      },
      definition: {
        key: 'learn.course-2.2.5.glossary.nonlinear-residual.definition',
        ko: 'implicit stage 방정식에 현재 반복값을 넣었을 때 남는 불일치입니다. 참궤적과의 시간 적분 오차를 뜻하지 않습니다.',
        en: 'The mismatch left when the current iterate is substituted into an implicit-stage equation. It is not the time-integration error from the exact trajectory.'
      }
    }
  ],
  checks: [
    {
      id: 'newton-error',
      prompt: {
        key: 'learn.course-2.2.5.check.newton-error.prompt',
        ko: 'Newton 잔차가 작으면 시간 해상도도 충분한가요?',
        en: 'Does a small Newton residual ensure sufficient time resolution?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.5.check.newton-error.explanation',
        ko: 'h를 줄인 결과와 비교하고 빠른 모드의 위상·에너지를 확인해야 합니다.',
        en: 'Compare with a refined h and inspect fast-mode phase and energy.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.5.check.newton-error.supported.label',
            ko: '아닙니다. stage 방정식 풀이 오차와 절단오차는 다릅니다.',
            en: 'No. Stage-solve error differs from truncation error.'
          },
          feedback: {
            key: 'learn.course-2.2.5.check.newton-error.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. h를 줄인 결과와 비교하고 빠른 모드의 위상·에너지를 확인해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Compare with a refined h and inspect fast-mode phase and energy.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.5.check.newton-error.unsupported.label',
            ko: '그렇습니다. 참해 오차도 0입니다.',
            en: 'Yes. Exact-solution error is zero too.'
          },
          feedback: {
            key: 'learn.course-2.2.5.check.newton-error.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. h를 줄인 결과와 비교하고 빠른 모드의 위상·에너지를 확인해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Compare with a refined h and inspect fast-mode phase and energy.'
          }
        }
      ]
    },
    {
      id: 'numerical-damping',
      prompt: {
        key: 'learn.course-2.2.5.check.numerical-damping.prompt',
        ko: '물리 감쇠가 없는 이 예제에서 implicit 에너지 감소는?',
        en: 'What can implicit energy loss mean in this undamped example?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.5.check.numerical-damping.explanation',
        ko: '안정적으로 유한한 결과와 물리적으로 정확한 결과는 다른 조건입니다.',
        en: 'A stable finite result and a physically accurate result are different requirements.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.5.check.numerical-damping.supported.label',
            ko: '수치 감쇠일 수 있어 간격 수렴 검사가 필요합니다.',
            en: 'It may be numerical damping, requiring a step-convergence check.'
          },
          feedback: {
            key: 'learn.course-2.2.5.check.numerical-damping.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 안정적으로 유한한 결과와 물리적으로 정확한 결과는 다른 조건입니다.',
            en: 'This interpretation accounts for settings, units and assumptions. A stable finite result and a physically accurate result are different requirements.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.5.check.numerical-damping.unsupported.label',
            ko: '반드시 실제 마찰입니다.',
            en: 'It must be physical friction.'
          },
          feedback: {
            key: 'learn.course-2.2.5.check.numerical-damping.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 안정적으로 유한한 결과와 물리적으로 정확한 결과는 다른 조건입니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. A stable finite result and a physically accurate result are different requirements.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.5',
    description: {
      key: 'learn.course-2.2.5.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'fnc-stiffness',
      title: {
        key: 'learn.course-2.2.5.reference.fnc-stiffness.title',
        ko: 'Stiffness — Fundamentals of Numerical Computation',
        en: 'Stiffness — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/stiffness/',
      locator: {
        key: 'learn.course-2.2.5.reference.fnc-stiffness.locator',
        ko: '11.4의 정확도보다 강한 안정성 step 제한과 Jacobian 선형화. 보존 진자의 고주파 분해능 문제와 감쇠 강성을 구분합니다.',
        en: 'Section 11.4, stability restrictions stronger than accuracy requirements and Jacobian linearization; distinguish oscillatory frequency resolution from dissipative stiffness.'
      },
      accessedOn: '2026-11-04'
    },
    {
      id: 'hosea-trbdf2',
      title: {
        key: 'learn.course-2.2.5.reference.hosea-trbdf2.title',
        ko: 'Analysis and implementation of TR-BDF2',
        en: 'Analysis and implementation of TR-BDF2'
      },
      authors: 'M. E. Hosea; L. F. Shampine',
      url: 'https://pages.mtu.edu/~struther/Courses/OLD/Other/LessOld/5628_11/TRBDF2_Hosea_AppNumMath_20_pp21-37_1996.pdf',
      locator: {
        key: 'learn.course-2.2.5.reference.hosea-trbdf2.locator',
        ko: 'Applied Numerical Mathematics 20 (1996) 21–37, 2–3절의 두 implicit stage와 L-stability. 원문의 오차 추정기는 여기의 Newton 잔차와 다릅니다.',
        en: 'Applied Numerical Mathematics 20 (1996), pages 21–37, sections 2–3: two implicit stages and L-stability; its truncation estimator is distinct from the Newton residual shown here.'
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
      key: 'learn.course-2.2.5.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
