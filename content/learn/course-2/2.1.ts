import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.1', {
  guidance: [
    {
      key: 'learn.course-2.2.1.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.1.focus.criteria',
      ko: '같은 상태의 첫 두 도함수와 각속도는 반올림 허용오차 1e-12 rad/s 이내로 일치해야 합니다. 마지막 두 도함수는 엔진의 각가속도입니다.',
      en: 'At the same state the first two derivatives and angular velocities must agree within 1e-12 rad/s. The final two derivatives are the engine accelerations.'
    }
  ],
  tasks: [
    {
      id: 'derivative-match',
      prediction: {
        key: 'learn.course-2.2.1.task.derivative-match.prediction',
        ko: '시작 각속도를 바꾸면 도함수 표의 첫 두 성분은 어떻게 달라질까요?',
        en: 'How should changing the initial velocities alter the first two derivative entries?'
      },
      action: {
        key: 'learn.course-2.2.1.task.derivative-match.action',
        ko: '기본값으로 실행해 상태·도함수 표를 읽고 첫 각속도를 바꾼 뒤 다시 실행해 비교하세요.',
        en: 'Run the defaults and read the state/derivative table, then edit the first angular velocity and run again to compare.'
      },
      expected: {
        key: 'learn.course-2.2.1.task.derivative-match.expected',
        ko: '같은 상태의 첫 두 도함수와 각속도는 반올림 허용오차 1e-12 rad/s 이내로 일치해야 합니다. 마지막 두 도함수는 엔진의 각가속도입니다.',
        en: 'At the same state the first two derivatives and angular velocities must agree within 1e-12 rad/s. The final two derivatives are the engine accelerations.'
      },
      explanation: {
        key: 'learn.course-2.2.1.task.derivative-match.explanation',
        ko: '상태공간 변환은 근사법이 아닙니다. 오차는 이 변환 자체보다 이후의 시간 이산화에서 생깁니다.',
        en: 'The state-space conversion is exact; approximation enters during the subsequent time discretization.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.1',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.1.title',
    ko: '2차 운동방정식의 1차 상태공간 변환',
    en: 'First-order state-space form of second-order equations'
  },
  summary: {
    key: 'learn.course-2.2.1.summary',
    ko: '각가속도를 계산하는 함수에 왜 각도와 각속도를 함께 주어야 할까요? 상태의 순서·차원·도함수를 실제 이중진자 엔진에서 나란히 확인합니다.',
    en: 'Why must an acceleration function receive both angles and angular velocities? Inspect state ordering, dimensions and derivatives together in the actual double-pendulum engine.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.1.objective.0',
      ko: '2차 방정식을 네 개의 1차 방정식으로 바꾸고 초기값 개수를 설명합니다.',
      en: 'Convert two second-order equations to four first-order equations and count the initial values.'
    },
    {
      key: 'learn.course-2.2.1.objective.1',
      ko: '상태와 도함수의 서로 다른 단위를 성분별로 확인합니다.',
      en: 'Check the distinct component units of the state and its derivative.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.1.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.1.prerequisite.body',
        ko: '아래쪽 수직 기준 절대각, 시간 미분, 연립일차방정식을 사용합니다. 고정 지지점·질점·질량 없는 강체 막대의 평면 이중진자입니다. 각도 두 개만으로는 한 시각의 운동을 결정할 수 없습니다.',
        en: 'Use absolute angles from downward vertical, time derivatives and linear systems. The planar double pendulum has a fixed pivot, point masses and massless rigid rods. Two angles alone do not determine the motion at an instant.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.4'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'state-order',
      title: {
        key: 'learn.course-2.2.1.concept.state-order.title',
        ko: '좌표를 늘려 미분 차수 낮추기',
        en: 'Introduce state variables'
      },
      body: {
        key: 'learn.course-2.2.1.concept.state-order.body',
        ko: 'omega1과 omega2를 각도의 시간 미분으로 정의하면 원래 해를 잃지 않고 1차계로 쓸 수 있습니다. 이 adapter의 배열 순서는 theta1,theta2,omega1,omega2입니다. 각도와 각속도를 번갈아 배열한 다른 코드와 혼동하면 계산은 유한해도 물리는 달라집니다.',
        en: 'Define omega1 and omega2 as angular time derivatives to obtain an equivalent first-order system. This adapter orders components as theta1,theta2,omega1,omega2. Interleaving angles and velocities as in another code can produce finite but physically different results.'
      },
      citationIds: ['fnc-systems']
    },
    {
      id: 'acceleration-solve',
      title: {
        key: 'learn.course-2.2.1.concept.acceleration-solve.title',
        ko: '가속도는 질량행렬 문제',
        en: 'Acceleration is a mass-matrix solve'
      },
      body: {
        key: 'learn.course-2.2.1.concept.acceleration-solve.body',
        ko: '각도와 각속도가 주어지면 기존 엔진은 중력·속도 결합항을 구성하고 양의 질량·길이에서 질량행렬을 풀어 두 가속도를 구합니다. 여기서는 그 도함수를 읽으며 운동방정식을 다시 구현하지 않습니다. 시간 적분기는 이 동일한 함수를 반복 호출합니다.',
        en: 'Given angles and velocities, the existing engine forms gravity and velocity-coupling terms and solves the mass matrix for both accelerations. The lesson reads that derivative without reimplementing the equations. Every time integrator repeatedly calls the same function.'
      },
      citationIds: ['fnc-systems']
    },
    {
      id: 'limits',
      title: {
        key: 'learn.course-2.2.1.concept.limits.title',
        ko: '상태와 도함수를 더하기 전',
        en: 'Before adding state and derivative'
      },
      body: {
        key: 'learn.course-2.2.1.concept.limits.body',
        ko: '도함수 앞에는 반드시 초 단위의 시간 간격이 곱해져야 합니다. 감쇠 없는 정지 상태라도 각도가 평형이 아니면 각가속도는 일반적으로 0이 아닙니다. 제약식이 있는 Cartesian 기술은 독립 초기값 개수가 다르며 이 4성분 상태를 그대로 복사할 수 없습니다.',
        en: 'Multiply a derivative by a step measured in seconds before adding it to state. Zero angular velocity away from equilibrium generally gives nonzero angular acceleration. A constrained Cartesian formulation has different independent initial data, so its state cannot be copied from this four-component vector.'
      },
      citationIds: ['fnc-systems']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.1.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.1.concept.synthesis.body',
        ko: '네 상태와 네 도함수의 대응을 정했으므로 2.2에서는 가장 단순한 시간 이산화가 어떤 항을 버리는지 조사합니다.',
        en: 'With the state/derivative correspondence fixed, investigate in 2.2 which terms the simplest time discretization omits.'
      },
      citationIds: ['fnc-systems']
    }
  ],
  equations: [
    {
      id: 'state-derivative',
      title: {
        key: 'learn.course-2.2.1.equation.state-derivative.title',
        ko: '1. 상태 정의에서 첫 두 도함수',
        en: '1. Derive the first two components'
      },
      expression: 'qdot1 = omega1; qdot2 = omega2',
      accessibleText: {
        key: 'learn.course-2.2.1.equation.state-derivative.accessible',
        ko: '새 변수의 정의 때문에 첫 두 도함수는 각속도 자체입니다.',
        en: 'By definition of the added state variables, the first two derivatives equal the angular velocities.'
      },
      symbols: [
        {
          symbol: 'qdot1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.1.equation.state-derivative.symbol.qdot1',
            ko: '첫 각도의 시간 미분',
            en: 'Time derivative of angle one'
          }
        },
        {
          symbol: 'qdot2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.1.equation.state-derivative.symbol.qdot2',
            ko: '둘째 각도의 시간 미분',
            en: 'Time derivative of angle two'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.1.equation.state-derivative.symbol.omega1',
            ko: '첫 각속도',
            en: 'Angular velocity one'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.1.equation.state-derivative.symbol.omega2',
            ko: '둘째 각속도',
            en: 'Angular velocity two'
          }
        }
      ],
      citationIds: ['fnc-systems']
    },
    {
      id: 'mass-solve',
      title: {
        key: 'learn.course-2.2.1.equation.mass-solve.title',
        ko: '2. 남은 두 도함수는 행렬 풀이',
        en: '2. Obtain acceleration from a linear solve'
      },
      expression: 'M11*alpha1+M12*alpha2 = b1; M12*alpha1+M22*alpha2 = b2',
      accessibleText: {
        key: 'learn.course-2.2.1.equation.mass-solve.accessible',
        ko: '질량행렬과 각가속도의 곱이 일반화 토크 우변과 같습니다. 라디안은 SI에서 무차원입니다.',
        en: 'The mass matrix times angular acceleration equals the generalized torque right-hand side; radians are dimensionless in SI.'
      },
      symbols: [
        {
          symbol: 'M11',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.M11',
            ko: '첫 일반화 관성',
            en: 'First generalized inertia'
          }
        },
        {
          symbol: 'M12',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.M12',
            ko: '교차 관성',
            en: 'Cross inertia'
          }
        },
        {
          symbol: 'M22',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.M22',
            ko: '둘째 일반화 관성',
            en: 'Second generalized inertia'
          }
        },
        {
          symbol: 'alpha1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.alpha1',
            ko: '첫 각가속도',
            en: 'Angular acceleration one'
          }
        },
        {
          symbol: 'alpha2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.alpha2',
            ko: '둘째 각가속도',
            en: 'Angular acceleration two'
          }
        },
        {
          symbol: 'b1',
          unit: 'J',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.b1',
            ko: '첫 일반화 토크의 우변',
            en: 'First generalized torque right-hand side'
          }
        },
        {
          symbol: 'b2',
          unit: 'J',
          meaning: {
            key: 'learn.course-2.2.1.equation.mass-solve.symbol.b2',
            ko: '둘째 일반화 토크의 우변',
            en: 'Second generalized torque right-hand side'
          }
        }
      ],
      citationIds: ['fnc-systems']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'state-vector',
      term: {
        key: 'learn.course-2.2.1.glossary.state-vector.term',
        ko: '상태 벡터',
        en: 'State vector'
      },
      definition: {
        key: 'learn.course-2.2.1.glossary.state-vector.definition',
        ko: '한 시각의 미래 운동을 정하는 독립 초기값의 순서 있는 묶음입니다. 이 adapter는 두 각도 다음에 두 각속도를 둡니다.',
        en: 'An ordered set of independent initial values specifying motion at an instant. This adapter places two angles before two angular velocities.'
      }
    }
  ],
  checks: [
    {
      id: 'initial-data',
      prompt: {
        key: 'learn.course-2.2.1.check.initial-data.prompt',
        ko: '두 각도가 같으면 미래 운동도 반드시 같을까요?',
        en: 'Do equal angles necessarily imply the same future motion?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.1.check.initial-data.explanation',
        ko: '같은 위치를 통과하는 서로 다른 속도의 궤적을 구분하려면 네 초기값이 필요합니다.',
        en: 'Four initial values distinguish trajectories crossing the same configuration with different velocities.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.1.check.initial-data.supported.label',
            ko: '각속도도 같아야 합니다.',
            en: 'The angular velocities must also agree.'
          },
          feedback: {
            key: 'learn.course-2.2.1.check.initial-data.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 같은 위치를 통과하는 서로 다른 속도의 궤적을 구분하려면 네 초기값이 필요합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Four initial values distinguish trajectories crossing the same configuration with different velocities.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.1.check.initial-data.unsupported.label',
            ko: '각도만 같으면 충분합니다.',
            en: 'Angles alone are sufficient.'
          },
          feedback: {
            key: 'learn.course-2.2.1.check.initial-data.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 같은 위치를 통과하는 서로 다른 속도의 궤적을 구분하려면 네 초기값이 필요합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Four initial values distinguish trajectories crossing the same configuration with different velocities.'
          }
        }
      ]
    },
    {
      id: 'units',
      prompt: {
        key: 'learn.course-2.2.1.check.units.prompt',
        ko: '각도에 직접 더할 수 있는 양은 무엇인가요?',
        en: 'Which quantity can be added directly to an angle?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.1.check.units.explanation',
        ko: '단위를 맞춰야 상태 갱신이 의미를 갖습니다. 가속도에는 시간 제곱이 필요합니다.',
        en: 'A state update must preserve units; an acceleration contribution to angle needs time squared.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.1.check.units.supported.label',
            ko: '시간 간격 곱하기 각속도입니다.',
            en: 'A time step multiplied by angular velocity.'
          },
          feedback: {
            key: 'learn.course-2.2.1.check.units.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 단위를 맞춰야 상태 갱신이 의미를 갖습니다. 가속도에는 시간 제곱이 필요합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. A state update must preserve units; an acceleration contribution to angle needs time squared.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.1.check.units.unsupported.label',
            ko: '각가속도 자체입니다.',
            en: 'Angular acceleration on its own.'
          },
          feedback: {
            key: 'learn.course-2.2.1.check.units.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 단위를 맞춰야 상태 갱신이 의미를 갖습니다. 가속도에는 시간 제곱이 필요합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. A state update must preserve units; an acceleration contribution to angle needs time squared.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.1',
    description: {
      key: 'learn.course-2.2.1.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'fnc-systems',
      title: {
        key: 'learn.course-2.2.1.reference.fnc-systems.title',
        ko: 'IVP systems — Fundamentals of Numerical Computation',
        en: 'IVP systems — Fundamentals of Numerical Computation'
      },
      authors: 'Tobin A. Driscoll; Richard J. Braun',
      url: 'https://fncbook.com/systems/',
      locator: {
        key: 'learn.course-2.2.1.reference.fnc-systems.locator',
        ko: '6.3의 고차 방정식→1차 연립계 변환. 본 단원의 상태 순서와 질량행렬 풀이는 보존된 진자 adapter와 대조했습니다.',
        en: 'Section 6.3, reduction of higher-order equations to first-order systems; state ordering and the mass-matrix solve are checked against the preserved pendulum adapter.'
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
      key: 'learn.course-2.2.1.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
