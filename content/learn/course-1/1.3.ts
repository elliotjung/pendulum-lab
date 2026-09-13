import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.3',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.3.title',
    ko: '운동에너지·위치에너지와 질량행렬',
    en: 'Kinetic energy, potential energy and the mass matrix'
  },
  summary: {
    key: 'learn.course-1.1.3.summary',
    ko: '각속도가 같아도 자세에 따라 운동에너지가 달라지는 이유는 무엇일까요? 교차항을 찾아 질량행렬과 에너지를 연결합니다.',
    en: 'Why does kinetic energy depend on posture even at the same angular velocities? Find the cross term and connect energy to the mass matrix.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.3.objective.0',
      ko: '속도 제곱을 전개해 교차 운동항을 찾습니다.',
      en: 'Expand squared velocities to identify cross kinetic energy.'
    },
    {
      key: 'learn.course-1.1.3.objective.1',
      ko: '대칭 질량행렬과 에너지 영점의 의미를 설명합니다.',
      en: 'Explain a symmetric mass matrix and the energy reference.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.3.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.3.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.2'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'kinetic-expansion',
      title: {
        key: 'learn.course-1.1.3.concept.kinetic-expansion.title',
        ko: '속도 제곱에서 생기는 교차항',
        en: 'A cross term from squared velocity'
      },
      body: {
        key: 'learn.course-1.1.3.concept.kinetic-expansion.body',
        ko: '각 질점의 운동에너지는 질량 곱하기 속력 제곱의 절반입니다. 둘째 속도의 합을 제곱하면 두 링크 속도의 내적이 나옵니다. 이 내적은 두 각도 차의 코사인에 비례하므로 자세와 두 각속도 부호 모두 중요합니다. 교차항 자체가 음수여도 총 운동에너지가 음수가 되지는 않습니다.',
        en: 'Each particle contributes half its mass times squared speed. Squaring the second velocity sum produces a dot product of link velocities. It depends on the cosine of the angle difference and both velocity signs. A negative cross term does not imply negative total kinetic energy.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'matrix-meaning',
      title: {
        key: 'learn.course-1.1.3.concept.matrix-meaning.title',
        ko: '질량행렬은 각운동의 관성',
        en: 'The mass matrix is rotational inertia'
      },
      body: {
        key: 'learn.course-1.1.3.concept.matrix-meaning.body',
        ko: '각속도 제곱과 곱의 계수를 모으면 질량행렬 M이 됩니다. 각도 좌표이므로 성분 단위는 kg가 아니라 kg m²입니다. 대각은 양수이며 M12=M21입니다. 양의 질량과 길이에서는 모든 비영 각속도에 대해 T가 양수입니다. 두 링크가 직각이면 순간 교차 성분이 0이지만 그 뒤에도 두 독립 진자로 움직인다는 뜻은 아닙니다.',
        en: 'Collect the coefficients of angular-velocity products into M. With angle coordinates its entries have units kg m² rather than kg. Diagonal entries are positive and off-diagonals are symmetric. Positive masses and lengths give positive T for any nonzero angular velocity. Zero cross inertia at a right angle is an instantaneous statement, not independent subsequent motion.'
      },
      citationIds: ['tong-mechanics', 'mit-multibody']
    },
    {
      id: 'potential-reference',
      title: {
        key: 'learn.course-1.1.3.concept.potential-reference.title',
        ko: '위치에너지 기준과 보존 검사',
        en: 'Reference potential and conservation'
      },
      body: {
        key: 'learn.course-1.1.3.concept.potential-reference.body',
        ko: '위쪽을 양의 y로 쓰면 위치에너지는 각 질량의 mgy 합입니다. 여기서는 지지점 높이를 영점으로 삼아 아래 평형에서 V가 음수입니다. 최저 자세를 영점으로 바꾸어도 가속도는 같습니다. 총 에너지 E=T+V가 0 근처일 수 있으므로 단순한 상대 오차만으로 품질을 판단하지 말고 절대 J 오차도 확인하세요. 전용 실험의 색별 위치에너지 항은 읽기 쉽게 아래 평형을 영점으로 표시합니다. 따라서 그 합은 위 식의 E에서 아래 평형 에너지를 뺀 값입니다. 총에너지 드리프트는 어느 영점에서나 같습니다.',
        en: 'Potential energy is the sum of mgy with upward-positive y. The pivot-height reference makes V negative at the bottom. Shifting zero to the lowest configuration does not change acceleration. Total E can be near zero, so inspect absolute error in joules as well as relative drift. The focused color-coded potential terms use the hanging equilibrium as zero. Their total is E minus the hanging-equilibrium energy; total-energy drift is the same with either reference.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.3.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.3.concept.synthesis.body',
        ko: '질량행렬은 자세에 의존하지만 양의 질량·길이에서 운동에너지는 양의 이차 형식입니다. 다음으로 이 에너지 식의 편미분이 가속도를 어떻게 결정하는지 1.4에서 유도하세요.',
        en: 'The posture-dependent mass matrix defines a positive kinetic quadratic form for positive masses and lengths. In 1.4, derive how energy derivatives determine acceleration.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'mass-coefficients',
      title: {
        key: 'learn.course-1.1.3.equation.mass-coefficients.title',
        ko: '1. 관성 계수와 자세',
        en: '1. Inertia coefficients and posture'
      },
      expression:
        'A = (m1+m2)*l1^2; B = m2*l1*l2; D = m2*l2^2; delta = theta1-theta2; M11 = A; M12 = B*cos(delta); M21 = M12; M22 = D',
      accessibleText: {
        key: 'learn.course-1.1.3.equation.mass-coefficients.accessible',
        ko: 'A는 두 질량이 첫 막대 회전에 주는 관성, D는 둘째 막대 관성입니다. 대칭 비대각 성분은 B 곱하기 각도 차의 코사인입니다.',
        en: 'A is the first-rod rotational inertia from both masses; D is the second-rod inertia. Symmetric off-diagonal entries equal B times the cosine of the angle difference.'
      },
      symbols: [
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'M11',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.M11',
            ko: '질량행렬 성분 M11',
            en: 'Mass-matrix component M11'
          }
        },
        {
          symbol: 'M12',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.M12',
            ko: '질량행렬 성분 M12',
            en: 'Mass-matrix component M12'
          }
        },
        {
          symbol: 'M21',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.M21',
            ko: '질량행렬 성분 M21',
            en: 'Mass-matrix component M21'
          }
        },
        {
          symbol: 'M22',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.mass-coefficients.symbol.M22',
            ko: '질량행렬 성분 M22',
            en: 'Mass-matrix component M22'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'energy-form',
      title: {
        key: 'learn.course-1.1.3.equation.energy-form.title',
        ko: '2. 운동 및 위치에너지',
        en: '2. Kinetic and potential energy'
      },
      expression:
        'T = A*omega1^2/2+D*omega2^2/2+B*cos(delta)*omega1*omega2; V = -(m1+m2)*g*l1*cos(theta1)-m2*g*l2*cos(theta2); E = T+V',
      accessibleText: {
        key: 'learn.course-1.1.3.equation.energy-form.accessible',
        ko: '운동에너지는 두 대각 제곱항과 하나의 교차항입니다. 위치에너지는 첫 각도에 두 질량, 둘째 각도에 둘째 질량의 높이를 반영합니다. 총 에너지는 둘의 합입니다.',
        en: 'Kinetic energy has two diagonal square terms and one cross term. Potential energy includes both masses in the first height and only the second mass in the second height. Total energy is their sum.'
      },
      symbols: [
        {
          symbol: 'T',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.T',
            ko: '전체 운동에너지',
            en: 'Total kinetic energy'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'B',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.B',
            ko: 'm2 l1 l2',
            en: 'm2 times l1 times l2'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        },
        {
          symbol: 'V',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.V',
            ko: '전체 중력 위치에너지; 지지점 높이 기준',
            en: 'Total gravitational potential energy, with pivot-height zero'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'E',
          unit: 'J',
          meaning: {
            key: 'learn.course-1.1.3.equation.energy-form.symbol.E',
            ko: '전체 역학적 에너지',
            en: 'Total mechanical energy'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'positive-inertia',
      title: {
        key: 'learn.course-1.1.3.equation.positive-inertia.title',
        ko: '3. 퇴화하지 않는 관성',
        en: '3. Nonsingular inertia'
      },
      expression: 'D-M12^2/A = m2*l2^2*(m1+m2*sin(delta)^2)/(m1+m2) > 0',
      accessibleText: {
        key: 'learn.course-1.1.3.equation.positive-inertia.accessible',
        ko: 'A로 첫 변수를 소거한 나머지 관성은 양수입니다. 오른쪽 분자는 양의 첫 질량에 음이 아닌 사인 제곱항을 더한 값이므로 양의 질량·길이에서 특이하지 않습니다.',
        en: 'After eliminating the first coordinate with A, the remaining inertia is positive. Its numerator adds positive m1 to a nonnegative sine-square term, so positive masses and lengths avoid singularity.'
      },
      symbols: [
        {
          symbol: 'D',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.D',
            ko: 'm2 l2 제곱',
            en: 'm2 times l2 squared'
          }
        },
        {
          symbol: 'M12',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.M12',
            ko: '질량행렬 성분 M12',
            en: 'Mass-matrix component M12'
          }
        },
        {
          symbol: 'A',
          unit: 'kg*m^2',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.A',
            ko: '(m1+m2) l1 제곱',
            en: '(m1+m2) times l1 squared'
          }
        },
        {
          symbol: 'm2',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.m2',
            ko: '2번 질점의 양의 질량',
            en: 'Positive mass of point particle 2'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'm1',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.m1',
            ko: '1번 질점의 양의 질량',
            en: 'Positive mass of point particle 1'
          }
        },
        {
          symbol: 'delta',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.3.equation.positive-inertia.symbol.delta',
            ko: '두 절대각의 차 theta1-theta2',
            en: 'Difference theta1 minus theta2'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'mass-matrix',
      term: {
        key: 'learn.course-1.1.3.glossary.mass-matrix.term',
        ko: '질량행렬',
        en: 'Mass matrix'
      },
      definition: {
        key: 'learn.course-1.1.3.glossary.mass-matrix.definition',
        ko: '각속도의 이차 형식으로 운동에너지를 만드는 대칭 관성행렬입니다. 여기서는 성분 단위가 kg m²입니다.',
        en: 'The symmetric inertia matrix of the angular-velocity quadratic kinetic form, with entries measured in kg m² here.'
      }
    },
    {
      id: 'cross-energy',
      term: {
        key: 'learn.course-1.1.3.glossary.cross-energy.term',
        ko: '교차 운동항',
        en: 'Cross kinetic term'
      },
      definition: {
        key: 'learn.course-1.1.3.glossary.cross-energy.definition',
        ko: '두 링크 속도의 내적에서 생기는 에너지 항으로 자세와 속도 방향에 따라 부호가 바뀝니다.',
        en: 'The energy term from the dot product of link velocities; its sign depends on posture and velocity directions.'
      }
    }
  ],
  checks: [
    {
      id: 'negative-cross',
      prompt: {
        key: 'learn.course-1.1.3.check.negative-cross.prompt',
        ko: '교차 운동항이 음수이면 무엇을 뜻하나요?',
        en: 'What does a negative cross kinetic term mean?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.3.check.negative-cross.explanation',
        ko: '교차항은 분해의 일부입니다. 실제 질점 속력 제곱의 합인 총 T는 음수가 아닙니다.',
        en: 'The cross term is one part of a decomposition. Total T is a sum of mass-weighted squared speeds and cannot be negative.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.3.check.negative-cross.yes',
            ko: '속도 성분 내적이 음수이며 전체 T는 음수가 아닙니다.',
            en: 'The velocity dot product is negative; total T remains nonnegative.'
          },
          feedback: {
            key: 'learn.course-1.1.3.check.negative-cross.yes-feedback',
            ko: '교차항은 분해의 일부입니다. 실제 질점 속력 제곱의 합인 총 T는 음수가 아닙니다.',
            en: 'The cross term is one part of a decomposition. Total T is a sum of mass-weighted squared speeds and cannot be negative.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.3.check.negative-cross.no',
            ko: '전체 운동에너지가 음수입니다.',
            en: 'Total kinetic energy is negative.'
          },
          feedback: {
            key: 'learn.course-1.1.3.check.negative-cross.no-feedback',
            ko: '다시 생각해 보세요. 교차항은 분해의 일부입니다. 실제 질점 속력 제곱의 합인 총 T는 음수가 아닙니다.',
            en: 'Reconsider. The cross term is one part of a decomposition. Total T is a sum of mass-weighted squared speeds and cannot be negative.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'energy-matrix',
    plotIds: ['mass-matrix', 'energy-terms'],
    systemId: 'system:double',
    exposedFields: ['theta1', 'theta2', 'omega1', 'omega2', 'm2'],
    fixedFields: [
      {
        id: 'm1',
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
          value: -0.5,
          unit: 'rad'
        },
        {
          id: 'omega1',
          value: 1,
          unit: 'rad/s'
        },
        {
          id: 'omega2',
          value: 1,
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
        key: 'learn.course-1.1.3.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.3.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'matrix-posture',
        prediction: {
          key: 'learn.course-1.1.3.task.matrix-posture.prediction',
          ko: '같은 방향의 두 각속도에서 두 링크가 나란할 때 교차항은 얼마일까요?',
          en: 'With equal same-sign angular velocities, what is the cross term for aligned links?'
        },
        action: {
          key: 'learn.course-1.1.3.task.matrix-posture.action',
          ko: 'm2=1 kg, theta1=theta2=0 rad, omega1=omega2=1 rad/s로 설정하고 처음 행렬과 에너지 항을 읽으세요.',
          en: 'Set m2=1 kg, both angles to 0 rad and both velocities to 1 rad/s. Read the initial matrix and energy terms.'
        },
        expected: {
          key: 'learn.course-1.1.3.task.matrix-posture.expected',
          ko: 'M11=2, M12=M21=1, M22=1 kg m², T=2.5 J입니다. 허용 오차는 각각 1e-12 kg m²와 1e-12 J입니다.',
          en: 'M11=2, M12=M21=1, M22=1 kg m² and T=2.5 J, within 1e-12 kg m² and 1e-12 J.'
        },
        explanation: {
          key: 'learn.course-1.1.3.task.matrix-posture.explanation',
          ko: '대각 운동항 1 J와 0.5 J에 교차항 1 J가 더해집니다. 자세를 바꿀 때 비대각만 코사인에 따라 달라집니다.',
          en: 'The 1 J and 0.5 J diagonal terms add to a 1 J cross term. At fixed masses and lengths only the off-diagonal entries vary with posture.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.3',
    description: {
      key: 'learn.course-1.1.3.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.3.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.3.reference.tong-mechanics.locator',
        ko: '2.2–2.3 좌표·구속, 2.5.2 이중진자, 2.6.1 정상모드. 원문의 아래쪽 양의 y를 이 과정의 위쪽 양의 y로 변환했습니다.',
        en: 'Sections 2.2–2.3 coordinates/constraints, 2.5.2 double pendulum and 2.6.1 normal modes. Converted the source downward-positive y to this course upward-positive y.'
      },
      accessedOn: '2026-09-14'
    },
    {
      id: 'mit-multibody',
      title: {
        key: 'learn.course-1.1.3.reference.mit-multibody.title',
        ko: 'Underactuated Robotics — Multi-Body Dynamics',
        en: 'Underactuated Robotics — Multi-Body Dynamics'
      },
      authors: 'Russ Tedrake',
      url: 'https://underactuated.mit.edu/multibody.html',
      locator: {
        key: 'learn.course-1.1.3.reference.mit-multibody.locator',
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
      key: 'learn.course-1.1.3.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
