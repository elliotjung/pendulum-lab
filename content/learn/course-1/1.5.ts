import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.5',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.5.title',
    ko: '결합항·코리올리형 항·중력항',
    en: 'Coupling, Coriolis-type and gravitational terms'
  },
  summary: {
    key: 'learn.course-1.1.5.summary',
    ko: '중력과 속도 제곱항은 각각 두 링크 가속도에 얼마나 기여할까요? 같은 상태를 고정해 항별 효과를 더하고 비교합니다.',
    en: 'How much do gravity and quadratic velocity terms contribute to each acceleration? Hold one state fixed and compare and sum contributions.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.5.objective.0',
      ko: '일반화 토크와 각가속도를 구분합니다.',
      en: 'Distinguish generalized torque from angular acceleration.'
    },
    {
      key: 'learn.course-1.1.5.objective.1',
      ko: '순간 분해의 합과 시간 궤적의 비선형성을 구분합니다.',
      en: 'Distinguish instantaneous superposition from nonlinear trajectories.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.5.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.5.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
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
      id: 'terms',
      title: {
        key: 'learn.course-1.1.5.concept.terms.title',
        ko: 'M alpha + C + G = 0의 세 부분',
        en: 'Three parts of the balance'
      },
      body: {
        key: 'learn.course-1.1.5.concept.terms.body',
        ko: '관성행렬은 두 가속도를 섞습니다. C는 속도 제곱에 따른 기하학적 토크 벡터, G는 위치에너지 기울기입니다. 여기서 C라는 기호는 행렬이 아니라 벡터를 가리킵니다. 일반적인 C 행렬 표현은 유일하지 않지만 그 곱으로 얻는 토크 벡터는 고정됩니다.',
        en: 'The inertia matrix mixes the two accelerations. C here denotes the vector of velocity-quadratic geometric torques; G is the potential gradient. C is a vector in this notation. A general Coriolis matrix representation is not unique, but its resulting torque vector is fixed.'
      },
      citationIds: ['mit-multibody', 'tong-mechanics']
    },
    {
      id: 'instantaneous-split',
      title: {
        key: 'learn.course-1.1.5.concept.instantaneous-split.title',
        ko: '같은 M으로 각각 풀기',
        en: 'Solve each contribution with the same M'
      },
      body: {
        key: 'learn.course-1.1.5.concept.instantaneous-split.body',
        ko: '중력 토크를 행렬로 풀면 중력 가속도 기여, 속도 토크를 풀면 속도 가속도 기여가 됩니다. 같은 상태의 M을 사용하므로 두 가속도 벡터를 더하면 총 가속도입니다. 토크를 그냥 자기 질량으로 나누거나 두 독립 run의 궤적을 더하는 것은 이 분해와 다릅니다.',
        en: 'Solve the gravity and velocity torque vectors through the same instantaneous mass matrix. Their acceleration vectors sum to the total. Dividing torque by particle mass or adding trajectories from independently modified systems does not perform this decomposition.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'limits',
      title: {
        key: 'learn.course-1.1.5.concept.limits.title',
        ko: '0속도와 방향 반전의 검사',
        en: 'Zero speed and velocity reversal'
      },
      body: {
        key: 'learn.course-1.1.5.concept.limits.body',
        ko: '두 각속도가 0이면 속도항은 0입니다. 두 속도의 부호를 동시에 뒤집어도 제곱항은 같으므로 보존계의 순간 가속도는 같습니다. 각도 차가 0일 때도 사인에 비례한 속도항이 사라집니다. 속도항이 0이라는 사실은 비대각 관성 결합까지 0이라는 뜻이 아닙니다. 코리올리형이라는 이름만 보고 반드시 두 서로 다른 속도의 곱이어야 한다고 오해하지 마세요.',
        en: 'At zero velocities the quadratic vector vanishes. Reversing both velocities preserves their squares and therefore the instantaneous conservative acceleration. The sine-dependent terms also vanish for aligned rods. This does not remove off-diagonal inertia. The name Coriolis-type does not require a product of two distinct velocities in every coordinate convention.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.5.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.5.concept.synthesis.body',
        ko: '같은 상태에서는 항별 가속도를 더할 수 있지만 서로 다른 비선형 궤적의 합은 해가 아닙니다. 다음으로 작은 진폭에서 선형 중첩이 성립하는 조건을 1.6에서 확인하세요.',
        en: 'Instantaneous acceleration contributions add, while sums of distinct nonlinear trajectories generally do not solve the system. In 1.6, test when small-amplitude linear superposition applies.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'torque-vectors',
      title: {
        key: 'learn.course-1.1.5.equation.torque-vectors.title',
        ko: '1. 속도 및 중력 토크 벡터',
        en: '1. Velocity and gravity torque vectors'
      },
      expression:
        'delta = theta1-theta2; B = m2*l1*l2; C1 = B*sin(delta)*omega2^2; C2 = -B*sin(delta)*omega1^2; G1 = (m1+m2)*g*l1*sin(theta1); G2 = m2*g*l2*sin(theta2)',
      accessibleText: {
        key: 'learn.course-1.1.5.equation.torque-vectors.accessible',
        ko: '첫 속도 토크는 양의 둘째 각속도 제곱, 둘째는 음의 첫 각속도 제곱에 비례합니다. G는 중력 위치에너지의 각도 미분입니다.',
        en: 'The first velocity torque is proportional to positive omega2 squared and the second to negative omega1 squared. G is the angular gradient of gravitational potential.'
      },
      symbols: [
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'C1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.C1',
            ko: '1번 방정식 좌변의 속도 제곱 일반화 토크',
            en: 'Velocity-quadratic generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'C2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.C2',
            ko: '2번 방정식 좌변의 속도 제곱 일반화 토크',
            en: 'Velocity-quadratic generalized torque on the left of equation 2'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'G1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.G1',
            ko: '1번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'G2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.torque-vectors.symbol.G2',
            ko: '2번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 2'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'component-sum',
      title: {
        key: 'learn.course-1.1.5.equation.component-sum.title',
        ko: '2. 순간 가속도 기여의 합',
        en: '2. Sum instantaneous contributions'
      },
      expression:
        'alpha1 = alphaG1+alphaC1; alpha2 = alphaG2+alphaC2; M11*alphaG1+M12*alphaG2 = -G1; M21*alphaG1+M22*alphaG2 = -G2; M11*alphaC1+M12*alphaC2 = -C1; M21*alphaC1+M22*alphaC2 = -C2',
      accessibleText: {
        key: 'learn.course-1.1.5.equation.component-sum.accessible',
        ko: '같은 질량행렬로 음의 중력 벡터와 음의 속도 벡터를 각각 풉니다. 얻은 각가속도 기여를 성분별로 더하면 전체 가속도입니다.',
        en: 'Solve the negative gravity and velocity vectors with the same mass matrix. Add the resulting angular acceleration contributions component by component.'
      },
      symbols: [
        {
          symbol: 'alpha1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.alpha1',
            ko: 'omega1의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega1'
          }
        },
        {
          symbol: 'alphaG1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.alphaG1',
            ko: '중력만의 1번 순간 가속도 기여',
            en: 'Instantaneous gravity contribution to acceleration 1'
          }
        },
        {
          symbol: 'alphaC1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.alphaC1',
            ko: '속도항만의 1번 순간 가속도 기여',
            en: 'Instantaneous velocity-term contribution to acceleration 1'
          }
        },
        {
          symbol: 'alpha2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.alpha2',
            ko: 'omega2의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega2'
          }
        },
        {
          symbol: 'alphaG2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.alphaG2',
            ko: '중력만의 2번 순간 가속도 기여',
            en: 'Instantaneous gravity contribution to acceleration 2'
          }
        },
        {
          symbol: 'alphaC2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.alphaC2',
            ko: '속도항만의 2번 순간 가속도 기여',
            en: 'Instantaneous velocity-term contribution to acceleration 2'
          }
        },
        {
          symbol: 'M11',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.M11',
            ko: '질량행렬 성분 M11',
            en: 'Mass-matrix component M11'
          }
        },
        {
          symbol: 'M12',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.M12',
            ko: '질량행렬 성분 M12',
            en: 'Mass-matrix component M12'
          }
        },
        {
          symbol: 'G1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.G1',
            ko: '1번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'M21',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.M21',
            ko: '질량행렬 성분 M21',
            en: 'Mass-matrix component M21'
          }
        },
        {
          symbol: 'M22',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.M22',
            ko: '질량행렬 성분 M22',
            en: 'Mass-matrix component M22'
          }
        },
        {
          symbol: 'G2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.G2',
            ko: '2번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 2'
          }
        },
        {
          symbol: 'C1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.C1',
            ko: '1번 방정식 좌변의 속도 제곱 일반화 토크',
            en: 'Velocity-quadratic generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'C2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.5.equation.component-sum.symbol.C2',
            ko: '2번 방정식 좌변의 속도 제곱 일반화 토크',
            en: 'Velocity-quadratic generalized torque on the left of equation 2'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'velocity-torque',
      term: {
        key: 'learn.course-1.1.5.glossary.velocity-torque.term',
        ko: '속도 제곱 토크',
        en: 'Velocity-quadratic torque'
      },
      definition: {
        key: 'learn.course-1.1.5.glossary.velocity-torque.definition',
        ko: '곡선 좌표에서 운동에너지를 미분할 때 나타나는 속도 제곱의 일반화 토크 벡터입니다.',
        en: 'The generalized torque vector quadratic in velocity that arises from differentiating kinetic energy in curved coordinates.'
      }
    },
    {
      id: 'frozen-state',
      term: {
        key: 'learn.course-1.1.5.glossary.frozen-state.term',
        ko: '같은 상태의 기여 분해',
        en: 'Frozen-state decomposition'
      },
      definition: {
        key: 'learn.course-1.1.5.glossary.frozen-state.definition',
        ko: '질량행렬과 상태를 고정한 채 각 토크 벡터가 만드는 가속도를 나누어 계산하는 해석입니다.',
        en: 'Splitting acceleration by torque source while keeping the instantaneous state and mass matrix fixed.'
      }
    }
  ],
  checks: [
    {
      id: 'zero-speed',
      prompt: {
        key: 'learn.course-1.1.5.check.zero-speed.prompt',
        ko: 'omega1=omega2=0이면 반드시 0인 항은?',
        en: 'Which term must vanish when both velocities are zero?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.5.check.zero-speed.explanation',
        ko: '중력과 자세에 따른 관성 결합은 그대로 남으므로 정지에서 놓아도 가속할 수 있습니다.',
        en: 'Gravity and posture-dependent inertial coupling remain, so release from rest can still accelerate.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.5.check.zero-speed.yes',
            ko: '속도 제곱 토크 벡터 C',
            en: 'Quadratic velocity torque vector C'
          },
          feedback: {
            key: 'learn.course-1.1.5.check.zero-speed.yes-feedback',
            ko: '중력과 자세에 따른 관성 결합은 그대로 남으므로 정지에서 놓아도 가속할 수 있습니다.',
            en: 'Gravity and posture-dependent inertial coupling remain, so release from rest can still accelerate.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.5.check.zero-speed.no',
            ko: '중력 벡터와 가속도 전부',
            en: 'All gravity terms and accelerations'
          },
          feedback: {
            key: 'learn.course-1.1.5.check.zero-speed.no-feedback',
            ko: '다시 생각해 보세요. 중력과 자세에 따른 관성 결합은 그대로 남으므로 정지에서 놓아도 가속할 수 있습니다.',
            en: 'Reconsider. Gravity and posture-dependent inertial coupling remain, so release from rest can still accelerate.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'term-balance',
    plotIds: ['acceleration'],
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
          value: 0.5,
          unit: 'rad'
        },
        {
          id: 'theta2',
          value: -0.3,
          unit: 'rad'
        },
        {
          id: 'omega1',
          value: 1,
          unit: 'rad/s'
        },
        {
          id: 'omega2',
          value: 2,
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
        key: 'learn.course-1.1.5.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.5.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'zero-velocity',
        prediction: {
          key: 'learn.course-1.1.5.task.zero-velocity.prediction',
          ko: '정지에서 출발하면 속도항의 가속도 기여는 얼마일까요?',
          en: 'What is the velocity-term acceleration contribution at release from rest?'
        },
        action: {
          key: 'learn.course-1.1.5.task.zero-velocity.action',
          ko: '각도는 기본값 0.5,-0.3 rad로 두고 omega1=omega2=0 rad/s로 설정해 처음 항별 가속도를 읽으세요.',
          en: 'Keep default angles 0.5,-0.3 rad and set both velocities to zero. Read the initial acceleration contributions.'
        },
        expected: {
          key: 'learn.course-1.1.5.task.zero-velocity.expected',
          ko: '속도항의 두 가속도 기여는 1e-12 rad/s² 이내에서 0이고 중력 기여의 합은 전체 가속도와 1e-10 rad/s² 이내로 일치합니다.',
          en: 'Both velocity contributions are zero within 1e-12 rad/s². Gravity contributions reproduce total acceleration within 1e-10 rad/s².'
        },
        explanation: {
          key: 'learn.course-1.1.5.task.zero-velocity.explanation',
          ko: 'C는 각속도 제곱에 비례합니다. 각속도를 다시 넣으면 같은 자세에서도 추가 기여가 나타납니다.',
          en: 'C is quadratic in angular velocity. Restoring nonzero velocities changes acceleration even at the same posture.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.5',
    description: {
      key: 'learn.course-1.1.5.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'mit-multibody',
      title: {
        key: 'learn.course-1.1.5.reference.mit-multibody.title',
        ko: 'Underactuated Robotics — Multi-Body Dynamics',
        en: 'Underactuated Robotics — Multi-Body Dynamics'
      },
      authors: 'Russ Tedrake',
      url: 'https://underactuated.mit.edu/multibody.html',
      locator: {
        key: 'learn.course-1.1.5.reference.mit-multibody.locator',
        ko: 'Simple Double Pendulum과 Manipulator Equations. MIT의 둘째 상대각을 theta2-theta1로 변환해 대조했습니다.',
        en: 'Simple Double Pendulum and Manipulator Equations. Converted the MIT second relative joint angle to theta2 minus theta1.'
      },
      accessedOn: '2026-09-14'
    },
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.5.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.5.reference.tong-mechanics.locator',
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
      key: 'learn.course-1.1.5.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
