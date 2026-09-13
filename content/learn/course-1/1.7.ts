import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.7',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.7.title',
    ko: '에너지 교환과 모드 혼합',
    en: 'Energy exchange and mode mixing'
  },
  summary: {
    key: 'learn.course-1.1.7.summary',
    ko: '전체 에너지는 일정한데 한 링크가 조용해졌다 다시 움직일 수 있을까요? 대각 에너지와 결합항을 함께 추적합니다.',
    en: 'Can one link quiet down and later revive while total energy stays constant? Track diagonal energy assignments together with the coupling term.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.7.objective.0',
      ko: '링크별 배분과 전체 에너지 보존을 구분합니다.',
      en: 'Distinguish per-link assignments from total conservation.'
    },
    {
      key: 'learn.course-1.1.7.objective.1',
      ko: '여러 모드의 중첩과 비선형 혼합을 해석합니다.',
      en: 'Interpret modal superposition and nonlinear mixing.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.7.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.7.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.6'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'energy-assignment',
      title: {
        key: 'learn.course-1.1.7.concept.energy-assignment.title',
        ko: '에너지를 나누는 약속',
        en: 'An explicit energy assignment'
      },
      body: {
        key: 'learn.course-1.1.7.concept.energy-assignment.body',
        ko: 'E1은 첫 대각 운동항과 첫 각도의 중력항, E2는 둘째 대각 운동항과 둘째 중력항, Ec는 교차 운동항으로 정의합니다. E1에는 첫 회전에 함께 움직이는 둘째 질량의 효과도 들어가므로 첫 질점만의 물리 에너지라고 부르면 안 됩니다. 교차항을 각 링크에 절반씩 나누는 다른 약속도 가능하지만 전체 합은 같습니다.',
        en: 'Define E1 as the first diagonal kinetic term plus the first-angle gravitational term, E2 analogously for angle two, and Ec as cross kinetic energy. E1 includes the second mass moving with the first rotation, so it is not the energy of particle one alone. Other assignments can split Ec between links while preserving the same total.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'conservation',
      title: {
        key: 'learn.course-1.1.7.concept.conservation.title',
        ko: '교환은 전체 보존과 양립한다',
        en: 'Exchange is compatible with conservation'
      },
      body: {
        key: 'learn.course-1.1.7.concept.conservation.body',
        ko: '각 배분 에너지는 변할 수 있지만 보존계의 E1+E2+Ec는 일정합니다. 이 실험은 아래 평형을 위치에너지 영점으로 사용하므로 E1과 E2는 음이 아니며 Ec는 음수일 수 있습니다. 지지점 높이가 영점인 실험실 총에너지에는 일정한 차이가 있지만 드리프트는 같습니다. 결합항을 빼고 두 곡선만 더하면 가짜 에너지 손실처럼 보일 수 있습니다.',
        en: 'Assigned energies vary while E1+E2+Ec stays constant. This experiment uses hanging-equilibrium potential zero, so E1 and E2 are nonnegative while Ec can be negative. Laboratory total energy with pivot-height zero differs by a constant but has the same drift. Omitting the cross term can falsely suggest energy loss.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'mode-mixing',
      title: {
        key: 'learn.course-1.1.7.concept.mode-mixing.title',
        ko: '한 링크를 놓는 것은 두 모드를 섞는다',
        en: 'Displacing one link mixes modes'
      },
      body: {
        key: 'learn.course-1.1.7.concept.mode-mixing.body',
        ko: '작은 진폭에서 한 링크만 변위시키면 일반적으로 두 선형 정상모드가 모두 여기됩니다. 서로 다른 주파수가 겹치면 링크 진폭과 에너지 배분이 변합니다. 큰 진폭에서는 정상모드의 선형 중첩이 정확하지 않습니다. 두 주파수가 충분히 가깝지 않으면 느리고 단순한 맥놀이로 해석하지 말고 실제 시간 곡선을 확인하세요.',
        en: 'Displacing only one link generally excites both linear modes at small amplitude. Their distinct frequencies change link amplitudes and energy assignments. At large amplitude linear superposition is no longer exact. When frequencies are not close, avoid assuming a simple slow beat envelope; inspect the actual time series.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.7.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.7.concept.synthesis.body',
        ko: '두 대각 에너지와 결합항의 합이 전체 보존량이며 영점 변경은 드리프트에 영향을 주지 않습니다. 다음으로 에너지 보존이 가까운 두 궤적의 일치까지 보장하는지 1.8에서 시험하세요.',
        en: 'The conserved total includes both diagonal assignments and coupling; shifting zero leaves drift unchanged. In 1.8, test whether conservation also guarantees agreement of nearby trajectories.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'diagonal-assignment',
      title: {
        key: 'learn.course-1.1.7.equation.diagonal-assignment.title',
        ko: '1. 아래 평형을 기준으로 두 에너지 배분',
        en: '1. Two assignments relative to hanging equilibrium'
      },
      expression:
        'E1 = (m1+m2)*l1^2*omega1^2/2+(m1+m2)*g*l1*(1-cos(theta1)); E2 = m2*l2^2*omega2^2/2+m2*g*l2*(1-cos(theta2))',
      accessibleText: {
        key: 'learn.course-1.1.7.equation.diagonal-assignment.accessible',
        ko: '각 배분은 대각 운동항과 아래 평형에서 높아진 위치에너지의 합입니다. 첫 배분에는 첫 링크 회전에 함께 움직이는 둘째 질량도 포함됩니다.',
        en: 'Each assignment sums diagonal kinetic energy and potential rise from hanging equilibrium. The first includes the second mass moving with the first rotation.'
      },
      symbols: [
        {
          symbol: 'E1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.E1',
            ko: '1번 대각 운동항과 해당 중력항의 합; 독립 보존량 아님',
            en: 'Diagonal kinetic plus assigned gravitational energy 1; not independently conserved'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'E2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.E2',
            ko: '2번 대각 운동항과 해당 중력항의 합; 독립 보존량 아님',
            en: 'Diagonal kinetic plus assigned gravitational energy 2; not independently conserved'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.7.equation.diagonal-assignment.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'coupled-total',
      title: {
        key: 'learn.course-1.1.7.equation.coupled-total.title',
        ko: '2. 결합항과 에너지 영점 변환',
        en: '2. Coupling and energy-reference conversion'
      },
      expression:
        'Ec = m2*l1*l2*cos(theta1-theta2)*omega1*omega2; Emin = -(m1+m2)*g*l1-m2*g*l2; Eshift = E1+E2+Ec; Eshift = E-Emin; Eshift = Eshift0',
      accessibleText: {
        key: 'learn.course-1.1.7.equation.coupled-total.accessible',
        ko: '두 배분과 결합항의 합은 지지점 영점의 전체 에너지에서 아래 평형 에너지를 뺀 값입니다. 정확한 보존계 해에서는 이 합이 시작 값과 같습니다.',
        en: 'The sum of both assignments and coupling equals pivot-reference total energy minus hanging-equilibrium energy. It equals its initial value on an exact conservative trajectory.'
      },
      symbols: [
        {
          symbol: 'Ec',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.Ec',
            ko: '배분하지 않은 속도 결합 에너지',
            en: 'Unassigned cross kinetic energy'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'Emin',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.Emin',
            ko: '아래 평형에서의 에너지; 지지점 높이 영점',
            en: 'Hanging-equilibrium energy with the pivot-height reference'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'Eshift',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.Eshift',
            ko: '아래 평형을 영점으로 바꾼 전체 에너지',
            en: 'Total energy shifted to the hanging-equilibrium zero'
          }
        },
        {
          symbol: 'E1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.E1',
            ko: '1번 대각 운동항과 해당 중력항의 합; 독립 보존량 아님',
            en: 'Diagonal kinetic plus assigned gravitational energy 1; not independently conserved'
          }
        },
        {
          symbol: 'E2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.E2',
            ko: '2번 대각 운동항과 해당 중력항의 합; 독립 보존량 아님',
            en: 'Diagonal kinetic plus assigned gravitational energy 2; not independently conserved'
          }
        },
        {
          symbol: 'E',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.E',
            ko: '전체 역학적 에너지',
            en: 'Total mechanical energy'
          }
        },
        {
          symbol: 'Eshift0',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.7.equation.coupled-total.symbol.Eshift0',
            ko: '아래 평형 영점으로 계산한 시작 에너지',
            en: 'Initial energy relative to the hanging-equilibrium zero'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'mode-mixture',
      term: {
        key: 'learn.course-1.1.7.glossary.mode-mixture.term',
        ko: '모드 혼합',
        en: 'Mode mixture'
      },
      definition: {
        key: 'learn.course-1.1.7.glossary.mode-mixture.definition',
        ko: '초기 변위나 속도가 여러 정상모드에 성분을 가지는 상태입니다. 큰 진폭에서는 선형 중첩이 정확하지 않습니다.',
        en: 'An initial displacement or velocity with components along multiple normal modes; linear superposition is not exact at large amplitude.'
      }
    },
    {
      id: 'energy-reference',
      term: {
        key: 'learn.course-1.1.7.glossary.energy-reference.term',
        ko: '에너지 영점',
        en: 'Energy reference'
      },
      definition: {
        key: 'learn.course-1.1.7.glossary.energy-reference.definition',
        ko: '위치에너지에 더하는 상수의 선택입니다. 힘과 에너지 변화량은 이 선택에 영향을 받지 않습니다.',
        en: 'The choice of additive constant in potential energy; forces and energy changes are unaffected.'
      }
    }
  ],
  checks: [
    {
      id: 'coupling-needed',
      prompt: {
        key: 'learn.course-1.1.7.check.coupling-needed.prompt',
        ko: 'E1+E2가 변하면 전체 에너지가 사라진 것인가요?',
        en: 'If E1+E2 varies, has total energy been lost?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.7.check.coupling-needed.explanation',
        ko: '전체 에너지는 세 항의 합입니다. 보존계에서도 부분합은 변합니다.',
        en: 'Total energy contains all three terms. A partial sum can vary in a conservative system.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.7.check.coupling-needed.yes',
            ko: 'Ec를 포함한 합과 수치 드리프트를 확인해야 합니다.',
            en: 'Check the sum including Ec and numerical drift.'
          },
          feedback: {
            key: 'learn.course-1.1.7.check.coupling-needed.yes-feedback',
            ko: '전체 에너지는 세 항의 합입니다. 보존계에서도 부분합은 변합니다.',
            en: 'Total energy contains all three terms. A partial sum can vary in a conservative system.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.7.check.coupling-needed.no',
            ko: '언제나 실제 에너지 손실입니다.',
            en: 'It always means physical energy loss.'
          },
          feedback: {
            key: 'learn.course-1.1.7.check.coupling-needed.no-feedback',
            ko: '다시 생각해 보세요. 전체 에너지는 세 항의 합입니다. 보존계에서도 부분합은 변합니다.',
            en: 'Reconsider. Total energy contains all three terms. A partial sum can vary in a conservative system.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'energy-exchange',
    plotIds: ['energy-exchange', 'angular'],
    systemId: 'system:double',
    exposedFields: ['theta1', 'theta2', 'omega1', 'omega2'],
    fixedFields: [
      {
        id: 'm1',
        value: 1,
        unit: 'kg'
      },
      {
        id: 'm2',
        value: 1,
        unit: 'kg'
      },
      {
        id: 'l1',
        value: 1,
        unit: 'm'
      },
      {
        id: 'l2',
        value: 1,
        unit: 'm'
      },
      {
        id: 'g',
        value: 9.81,
        unit: 'm/s^2'
      },
      {
        id: 'gamma',
        value: 0,
        unit: 'kg*m^2/s'
      },
      {
        id: 'duration',
        value: 8,
        unit: 's'
      },
      {
        id: 'step',
        value: 0.002,
        unit: 's'
      }
    ],
    defaultPreset: {
      integratorId: 'integrator:rk4',
      fields: [
        {
          id: 'm1',
          value: 1,
          unit: 'kg'
        },
        {
          id: 'm2',
          value: 1,
          unit: 'kg'
        },
        {
          id: 'l1',
          value: 1,
          unit: 'm'
        },
        {
          id: 'l2',
          value: 1,
          unit: 'm'
        },
        {
          id: 'g',
          value: 9.81,
          unit: 'm/s^2'
        },
        {
          id: 'gamma',
          value: 0,
          unit: 'kg*m^2/s'
        },
        {
          id: 'theta1',
          value: 0.3,
          unit: 'rad'
        },
        {
          id: 'theta2',
          value: 0,
          unit: 'rad'
        },
        {
          id: 'omega1',
          value: 0,
          unit: 'rad/s'
        },
        {
          id: 'omega2',
          value: 0,
          unit: 'rad/s'
        },
        {
          id: 'duration',
          value: 8,
          unit: 's'
        },
        {
          id: 'step',
          value: 0.002,
          unit: 's'
        }
      ]
    },
    analysisIds: ['analysis:energy'],
    guidance: [
      {
        key: 'learn.course-1.1.7.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.7.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'exchange-total',
        prediction: {
          key: 'learn.course-1.1.7.task.exchange-total.prediction',
          ko: '첫 링크만 0.3 rad로 놓으면 두 대각 에너지가 각각 보존될까요?',
          en: 'Are the two assigned energies separately conserved when only rod one is displaced by 0.3 rad?'
        },
        action: {
          key: 'learn.course-1.1.7.task.exchange-total.action',
          ko: '기본값으로 8초 실행하고 E1, E2, Ec 곡선과 총에너지 드리프트를 비교하세요.',
          en: 'Run the default for eight seconds and compare E1, E2, Ec and total energy drift.'
        },
        expected: {
          key: 'learn.course-1.1.7.task.exchange-total.expected',
          ko: '기본 fixture에서 각 표본의 분해 합은 엔진 총에너지에서 아래 평형 에너지를 뺀 값과 1e-10 J 이내, 총에너지 최대 드리프트는 1e-5 J 미만입니다. 개별 에너지 곡선은 변합니다.',
          en: 'For the default fixture, each decomposition sum matches engine total minus hanging-equilibrium energy within 1e-10 J; maximum total-energy drift is below 1e-5 J. Individual assigned energies vary.'
        },
        explanation: {
          key: 'learn.course-1.1.7.task.exchange-total.explanation',
          ko: '세 곡선의 교환을 함께 읽어야 합니다. 색별 곡선이 변한다는 사실과 전체 보존이 깨졌다는 주장은 다릅니다.',
          en: 'Read all three exchanging contributions. Varying component curves do not by themselves imply a violation of total conservation.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.7',
    description: {
      key: 'learn.course-1.1.7.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.7.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.7.reference.tong-mechanics.locator',
        ko: '2.2–2.3 좌표·구속, 2.5.2 이중진자, 2.6.1 정상모드. 원문의 아래쪽 양의 y를 이 과정의 위쪽 양의 y로 변환했습니다.',
        en: 'Sections 2.2–2.3 coordinates/constraints, 2.5.2 double pendulum and 2.6.1 normal modes. Converted the source downward-positive y to this course upward-positive y.'
      },
      accessedOn: '2026-09-14'
    }
  ],
  review: {
    schemaVerified: true,
    automatedVerified: true,
    sourceChecked: true,
    humanReviewed: false,
    note: {
      key: 'learn.course-1.1.7.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
