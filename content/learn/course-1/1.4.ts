import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.4',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.4.title',
    ko: '라그랑주 방정식의 완전 유도',
    en: 'Full derivation of the Lagrange equations'
  },
  summary: {
    key: 'learn.course-1.1.4.summary',
    ko: '에너지 식에서 두 가속도는 어떤 미분과 소거를 거쳐 나올까요? 생략 없이 두 라그랑주 방정식을 만들고 공용 엔진의 순간 값과 연결합니다.',
    en: 'How do energy expressions become two accelerations? Form both Lagrange equations through explicit derivatives and elimination and connect them to instantaneous shared-engine values.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.4.objective.0',
      ko: '두 일반화 운동량의 시간 미분을 전개합니다.',
      en: 'Expand time derivatives of both generalized momenta.'
    },
    {
      key: 'learn.course-1.1.4.objective.1',
      ko: '편미분에서 소거되는 항을 확인하고 연립 가속도를 구합니다.',
      en: 'Identify cancellations and solve the coupled accelerations.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.4.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.4.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.3'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'derivation-recipe',
      title: {
        key: 'learn.course-1.1.4.concept.derivation-recipe.title',
        ko: '미분 순서: 좌표와 속도를 독립으로',
        en: 'Differentiation order'
      },
      body: {
        key: 'learn.course-1.1.4.concept.derivation-recipe.body',
        ko: 'L=T-V에서 편미분할 때 theta1, theta2, omega1, omega2를 독립 변수로 취급합니다. 먼저 속도 편미분으로 p1,p2를 만든 다음 실제 경로를 따라 시간 미분합니다. 이때 delta의 시간 미분은 omega1-omega2입니다. 좌표 편미분은 다른 좌표와 모든 속도를 고정하고 취합니다. 외부 일반화 토크가 없으므로 dp1-dL1과 dp2-dL2는 0입니다.',
        en: 'Treat both angles and both angular velocities as independent when taking partial derivatives of L=T-V. First differentiate with respect to velocity to obtain each momentum, then differentiate along the actual trajectory. Delta changes at omega1 minus omega2. Coordinate partial derivatives hold other coordinates and velocities fixed. With no external generalized torque, each momentum derivative minus the coordinate derivative vanishes.'
      },
      citationIds: ['tong-mechanics', 'mit-multibody']
    },
    {
      id: 'cancellation',
      title: {
        key: 'learn.course-1.1.4.concept.cancellation.title',
        ko: '엇갈린 속도곱의 소거',
        en: 'Cancellation of mixed products'
      },
      body: {
        key: 'learn.course-1.1.4.concept.cancellation.body',
        ko: '첫 방정식에서 시간 미분의 -B sin(delta) omega1 omega2와 좌표 편미분을 빼며 생기는 +B sin(delta) omega1 omega2가 상쇄됩니다. 둘째 방정식에서도 혼합곱이 상쇄되고 첫 각속도 제곱만 남습니다. 결과의 서로 다른 부호는 delta=theta1-theta2를 미분하는 방향에서 옵니다. 부호를 외우기보다 이 소거를 따라가세요.',
        en: 'In equation one the negative mixed-velocity term from the time derivative cancels the positive term from subtracting the coordinate derivative. Mixed products cancel in equation two as well, leaving a square of omega1. The opposite signs follow from differentiating delta in opposite coordinate directions. Follow the cancellation instead of memorizing signs.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'solve-and-limits',
      title: {
        key: 'learn.course-1.1.4.concept.solve-and-limits.title',
        ko: '연립식 풀이와 해석용 항 선택',
        en: 'Solve and inspect selected terms'
      },
      body: {
        key: 'learn.course-1.1.4.concept.solve-and-limits.body',
        ko: '두 방정식은 가속도에 선형이므로 첫 식에서 alpha1을 소거한 뒤 alpha2를 구할 수 있습니다. 양의 질량·길이에서 소거 분모는 양수입니다. 화면의 항 켜기/끄기는 동일한 상태의 유도와 기여를 강조하는 기능이며 물리계에서 중력이나 관성을 제거하는 조작이 아닙니다. 외력·마찰을 넣으려면 이 단원의 무토크 유도를 그대로 쓰면 안 됩니다.',
        en: 'Both equations are linear in acceleration: eliminate alpha1 from the first to solve alpha2. Positive masses and lengths give a positive elimination denominator. Term toggles highlight a derivation or contribution at the same state; they do not remove gravity or inertia from the simulated system. Added forcing or friction requires extra generalized torques.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.4.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.4.concept.synthesis.body',
        ko: '곱의 미분과 좌표 편미분을 모두 포함해야 올바른 속도 제곱항과 중력항이 남습니다. 다음으로 같은 상태에서 중력과 속도항의 가속도 기여를 1.5에서 분리하세요.',
        en: 'Both product and coordinate derivatives are needed for the correct velocity-square and gravity terms. In 1.5, split their acceleration contributions at one fixed state.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'lagrange-start',
      title: {
        key: 'learn.course-1.1.4.equation.lagrange-start.title',
        ko: '1. 라그랑지안과 축약 기호',
        en: '1. Lagrangian and abbreviations'
      },
      expression: 'L = T-V; A = (m1+m2)*l1^2; B = m2*l1*l2; D = m2*l2^2; delta = theta1-theta2',
      accessibleText: {
        key: 'learn.course-1.1.4.equation.lagrange-start.accessible',
        ko: '라그랑지안은 운동에너지에서 위치에너지를 뺀 값입니다. A, B, D는 일정한 관성 계수이며 delta만 자세에 따라 바뀝니다.',
        en: 'The Lagrangian is kinetic minus potential energy. A, B and D are constant inertia coefficients; delta changes with posture.'
      },
      symbols: [
        {
          symbol: 'L',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.L',
            ko: '라그랑지안 T-V',
            en: 'Lagrangian T minus V'
          }
        },
        {
          symbol: 'T',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.T',
            ko: '전체 운동에너지',
            en: 'Total kinetic energy'
          }
        },
        {
          symbol: 'V',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.V',
            ko: '전체 중력 위치에너지; 지지점 높이 기준',
            en: 'Total gravitational potential energy, with pivot-height zero'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.lagrange-start.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'momenta',
      title: {
        key: 'learn.course-1.1.4.equation.momenta.title',
        ko: '2. 속도에 대한 두 편미분',
        en: '2. Both velocity partial derivatives'
      },
      expression: 'p1 = A*omega1+B*cos(delta)*omega2; p2 = D*omega2+B*cos(delta)*omega1',
      accessibleText: {
        key: 'learn.course-1.1.4.equation.momenta.accessible',
        ko: '각 일반화 운동량은 자기 각속도의 대각 관성과 다른 각속도의 교차 관성의 합입니다. 따라서 각속도와 운동량은 같은 양이 아닙니다.',
        en: 'Each generalized momentum combines its diagonal inertia times own angular velocity and cross inertia times the other velocity. Momentum and angular velocity are different quantities.'
      },
      symbols: [
        {
          symbol: 'p1',
          unit: 'kg*m^2/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.p1',
            ko: 'L의 omega1 편미분인 일반화 운동량',
            en: 'Generalized momentum, partial derivative of L with respect to omega1'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'p2',
          unit: 'kg*m^2/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.p2',
            ko: 'L의 omega2 편미분인 일반화 운동량',
            en: 'Generalized momentum, partial derivative of L with respect to omega2'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momenta.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'momentum-derivatives',
      title: {
        key: 'learn.course-1.1.4.equation.momentum-derivatives.title',
        ko: '3. 경로를 따른 시간 미분',
        en: '3. Time derivatives along a trajectory'
      },
      expression:
        'dp1 = A*alpha1+B*cos(delta)*alpha2-B*sin(delta)*(omega1-omega2)*omega2; dp2 = D*alpha2+B*cos(delta)*alpha1-B*sin(delta)*(omega1-omega2)*omega1',
      accessibleText: {
        key: 'learn.course-1.1.4.equation.momentum-derivatives.accessible',
        ko: '곱의 미분에는 다른 링크 가속도뿐 아니라 코사인의 시간 미분도 있습니다. 코사인 delta의 미분은 음의 사인 delta 곱하기 omega1-omega2입니다.',
        en: 'Product differentiation includes the other acceleration and the time derivative of cosine delta, which is negative sine delta times omega1 minus omega2.'
      },
      symbols: [
        {
          symbol: 'dp1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.dp1',
            ko: 'p1의 시간 미분',
            en: 'Time derivative of p1'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'alpha1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.alpha1',
            ko: 'omega1의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega1'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'alpha2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.alpha2',
            ko: 'omega2의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega2'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'dp2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.dp2',
            ko: 'p2의 시간 미분',
            en: 'Time derivative of p2'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.momentum-derivatives.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'coordinate-derivatives',
      title: {
        key: 'learn.course-1.1.4.equation.coordinate-derivatives.title',
        ko: '4. 좌표 편미분과 중력항',
        en: '4. Coordinate derivatives and gravity'
      },
      expression:
        'G1 = (m1+m2)*g*l1*sin(theta1); G2 = m2*g*l2*sin(theta2); dL1 = -B*sin(delta)*omega1*omega2-G1; dL2 = B*sin(delta)*omega1*omega2-G2',
      accessibleText: {
        key: 'learn.course-1.1.4.equation.coordinate-derivatives.accessible',
        ko: '좌표 편미분에는 속도 교차항의 각도 의존성과 음의 위치에너지 미분이 들어갑니다. 첫째와 둘째 각도에서 교차항 부호가 반대입니다.',
        en: 'Coordinate derivatives include the angle dependence of cross kinetic energy and negative potential derivatives. The cross term has opposite signs for the two angles.'
      },
      symbols: [
        {
          symbol: 'G1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.G1',
            ko: '1번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'G2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.G2',
            ko: '2번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 2'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'dL1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.dL1',
            ko: 'L의 theta1 편미분',
            en: 'Partial derivative of L with respect to theta1'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'dL2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coordinate-derivatives.symbol.dL2',
            ko: 'L의 theta2 편미분',
            en: 'Partial derivative of L with respect to theta2'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'coupled-balance',
      title: {
        key: 'learn.course-1.1.4.equation.coupled-balance.title',
        ko: '5. 빼기와 항 소거',
        en: '5. Subtract and cancel'
      },
      expression:
        'dp1-dL1 = 0; dp2-dL2 = 0; A*alpha1+B*cos(delta)*alpha2+B*sin(delta)*omega2^2+G1 = 0; B*cos(delta)*alpha1+D*alpha2-B*sin(delta)*omega1^2+G2 = 0',
      accessibleText: {
        key: 'learn.course-1.1.4.equation.coupled-balance.accessible',
        ko: '운동량 시간 미분에서 좌표 편미분을 빼면 혼합 속도곱이 소거됩니다. 첫 식에는 양의 둘째 속도 제곱항, 둘째 식에는 음의 첫째 속도 제곱항이 남습니다.',
        en: 'Subtracting the coordinate derivatives from momentum derivatives cancels the mixed products. A positive omega2-square term remains in equation one and a negative omega1-square term in equation two.'
      },
      symbols: [
        {
          symbol: 'dp1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.dp1',
            ko: 'p1의 시간 미분',
            en: 'Time derivative of p1'
          }
        },
        {
          symbol: 'dL1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.dL1',
            ko: 'L의 theta1 편미분',
            en: 'Partial derivative of L with respect to theta1'
          }
        },
        {
          symbol: 'dp2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.dp2',
            ko: 'p2의 시간 미분',
            en: 'Time derivative of p2'
          }
        },
        {
          symbol: 'dL2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.dL2',
            ko: 'L의 theta2 편미분',
            en: 'Partial derivative of L with respect to theta2'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'alpha1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.alpha1',
            ko: 'omega1의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega1'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'alpha2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.alpha2',
            ko: 'omega2의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega2'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'G1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.G1',
            ko: '1번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'G2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.coupled-balance.symbol.G2',
            ko: '2번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 2'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'acceleration-solve',
      title: {
        key: 'learn.course-1.1.4.equation.acceleration-solve.title',
        ko: '6. 연립 가속도 소거',
        en: '6. Eliminate to solve accelerations'
      },
      expression:
        'M12 = B*cos(delta); b1 = -B*sin(delta)*omega2^2-G1; b2 = B*sin(delta)*omega1^2-G2; alpha2 = (b2-M12*b1/A)/(D-M12^2/A); alpha1 = (b1-M12*alpha2)/A',
      accessibleText: {
        key: 'learn.course-1.1.4.equation.acceleration-solve.accessible',
        ko: '우변을 b1,b2라 하고 첫 식으로 alpha1을 소거합니다. alpha2 분모는 D-M12 제곱 나누기 A입니다. 구한 alpha2를 첫 식에 대입해 alpha1을 얻습니다.',
        en: 'Let the right sides be b1 and b2. Eliminate alpha1 using the first equation. Divide by D minus M12 squared over A to obtain alpha2, then substitute back for alpha1.'
      },
      symbols: [
        {
          symbol: 'M12',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.M12',
            ko: '질량행렬 성분 M12',
            en: 'Mass-matrix component M12'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'b1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.b1',
            ko: '1번 방정식의 우변 일반화 토크',
            en: 'Right-hand generalized torque of equation 1'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'G1',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.G1',
            ko: '1번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 1'
          }
        },
        {
          symbol: 'b2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.b2',
            ko: '2번 방정식의 우변 일반화 토크',
            en: 'Right-hand generalized torque of equation 2'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'G2',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.G2',
            ko: '2번 방정식 좌변의 중력 일반화 토크',
            en: 'Gravity generalized torque on the left of equation 2'
          }
        },
        {
          symbol: 'alpha2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.alpha2',
            ko: 'omega2의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega2'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        },
        {
          symbol: 'alpha1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.4.equation.acceleration-solve.symbol.alpha1',
            ko: 'omega1의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega1'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'generalized-momentum',
      term: {
        key: 'learn.course-1.1.4.glossary.generalized-momentum.term',
        ko: '일반화 운동량',
        en: 'Generalized momentum'
      },
      definition: {
        key: 'learn.course-1.1.4.glossary.generalized-momentum.definition',
        ko: '라그랑지안을 해당 일반화 속도로 편미분한 값이며, 결합계에서는 다른 속도의 영향도 포함합니다.',
        en: 'The partial derivative of the Lagrangian with respect to one generalized velocity, including cross-velocity effects in a coupled system.'
      }
    },
    {
      id: 'euler-lagrange',
      term: {
        key: 'learn.course-1.1.4.glossary.euler-lagrange.term',
        ko: '오일러–라그랑주 방정식',
        en: 'Euler–Lagrange equation'
      },
      definition: {
        key: 'learn.course-1.1.4.glossary.euler-lagrange.definition',
        ko: '일반화 운동량의 시간 미분에서 좌표 편미분을 뺀 값이 외부 일반화 토크와 같다는 식입니다.',
        en: 'The time derivative of generalized momentum minus the coordinate derivative equals external generalized torque.'
      }
    }
  ],
  checks: [
    {
      id: 'chain-derivative',
      prompt: {
        key: 'learn.course-1.1.4.check.chain-derivative.prompt',
        ko: 'cos(theta1-theta2)의 시간 미분은?',
        en: 'What is the time derivative of cos(theta1-theta2)?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.4.check.chain-derivative.explanation',
        ko: '두 각도가 모두 시간에 따라 변하므로 각속도의 차가 필요합니다.',
        en: 'Both angles vary in time, so their angular-velocity difference is required.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.4.check.chain-derivative.yes',
            ko: '-sin(delta) 곱하기 (omega1-omega2)',
            en: '-sin(delta) times (omega1-omega2)'
          },
          feedback: {
            key: 'learn.course-1.1.4.check.chain-derivative.yes-feedback',
            ko: '두 각도가 모두 시간에 따라 변하므로 각속도의 차가 필요합니다.',
            en: 'Both angles vary in time, so their angular-velocity difference is required.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.4.check.chain-derivative.no',
            ko: '-sin(delta) 곱하기 omega1만',
            en: '-sin(delta) times omega1 only'
          },
          feedback: {
            key: 'learn.course-1.1.4.check.chain-derivative.no-feedback',
            ko: '다시 생각해 보세요. 두 각도가 모두 시간에 따라 변하므로 각속도의 차가 필요합니다.',
            en: 'Reconsider. Both angles vary in time, so their angular-velocity difference is required.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'lagrange',
    plotIds: ['derivation', 'acceleration'],
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
          value: 0.7,
          unit: 'rad/s'
        },
        {
          id: 'omega2',
          value: -0.4,
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
        key: 'learn.course-1.1.4.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.4.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'derivation-balance',
        prediction: {
          key: 'learn.course-1.1.4.task.derivation-balance.prediction',
          ko: '좌표 편미분과 운동량 시간 미분은 공용 엔진 가속도에서 일치할까요?',
          en: 'Do the coordinate and momentum-time derivatives agree for shared-engine accelerations?'
        },
        action: {
          key: 'learn.course-1.1.4.task.derivation-balance.action',
          ko: '기본 설정으로 실행한 뒤 유도 항을 차례로 선택하며 처음 순간의 좌변·우변과 가속도를 비교하세요.',
          en: 'Run the default settings, select derivation terms in order and compare initial equation sides and accelerations.'
        },
        expected: {
          key: 'learn.course-1.1.4.task.derivation-balance.expected',
          ko: '두 방정식의 관성+속도+중력 잔차는 기본 설정에서 1e-10 J 이내입니다. 선택한 항을 모두 합하면 공용 엔진 가속도와 1e-10 rad/s² 이내로 일치합니다.',
          en: 'Both inertia plus velocity plus gravity residuals stay within 1e-10 J at the default initial state. Summed contributions match shared-engine acceleration within 1e-10 rad/s².'
        },
        explanation: {
          key: 'learn.course-1.1.4.task.derivation-balance.explanation',
          ko: '항 선택은 유도를 읽는 보조 기능입니다. 잔차가 작다는 사실은 동일 상태에서 연립식이 일치함을 보여 주며 장시간 수치 정확성 전체를 보장하지 않습니다.',
          en: 'Term selection helps read the derivation. A small residual checks the coupled equations at one state, not all aspects of long-time numerical accuracy.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.4',
    description: {
      key: 'learn.course-1.1.4.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.4.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.4.reference.tong-mechanics.locator',
        ko: '2.2–2.3 좌표·구속, 2.5.2 이중진자, 2.6.1 정상모드. 원문의 아래쪽 양의 y를 이 과정의 위쪽 양의 y로 변환했습니다.',
        en: 'Sections 2.2–2.3 coordinates/constraints, 2.5.2 double pendulum and 2.6.1 normal modes. Converted the source downward-positive y to this course upward-positive y.'
      },
      accessedOn: '2026-09-14'
    },
    {
      id: 'mit-multibody',
      title: {
        key: 'learn.course-1.1.4.reference.mit-multibody.title',
        ko: 'Underactuated Robotics — Multi-Body Dynamics',
        en: 'Underactuated Robotics — Multi-Body Dynamics'
      },
      authors: 'Russ Tedrake',
      url: 'https://underactuated.mit.edu/multibody.html',
      locator: {
        key: 'learn.course-1.1.4.reference.mit-multibody.locator',
        ko: 'Simple Double Pendulum과 Manipulator Equations. MIT의 둘째 상대각을 theta2-theta1로 변환해 대조했습니다.',
        en: 'Simple Double Pendulum and Manipulator Equations. Converted the MIT second relative joint angle to theta2 minus theta1.'
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
      key: 'learn.course-1.1.4.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
