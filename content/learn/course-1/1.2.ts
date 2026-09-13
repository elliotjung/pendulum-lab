import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.2',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.2.title',
    ko: '질점 위치·속도와 기하학적 구속',
    en: 'Positions, velocities and geometric constraints'
  },
  summary: {
    key: 'learn.course-1.1.2.summary',
    ko: '길이를 바꿔도 각좌표 곡선은 같을까요? 위치를 미분해 속도를 얻고 막대 구속이 모든 시각에 유지되는지 확인합니다.',
    en: 'Do angle trajectories stay unchanged when lengths change? Differentiate position to obtain velocity and inspect fixed-rod constraints at every time.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.2.objective.0',
      ko: '두 질점의 위치와 속도를 각도에서 유도합니다.',
      en: 'Derive both particles positions and velocities from angles.'
    },
    {
      key: 'learn.course-1.1.2.objective.1',
      ko: '길이 변화의 기하 효과와 동역학 효과를 구분합니다.',
      en: 'Distinguish geometric and dynamical effects of changing length.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.2.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.2.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.1'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'geometry',
      title: {
        key: 'learn.course-1.1.2.concept.geometry.title',
        ko: '벡터를 더해 둘째 위치 얻기',
        en: 'Add link vectors'
      },
      body: {
        key: 'learn.course-1.1.2.concept.geometry.body',
        ko: '둘째 질점은 첫 링크 끝에서 시작하므로 두 링크 벡터의 합에 놓입니다. 원점에서 둘째 질점까지의 거리를 l2로 두는 것은 잘못입니다. 고정 길이는 한 run 안에서 고정되며 길이 조절은 새로운 모형으로 다시 시작한다는 뜻입니다.',
        en: 'The second link starts at the first endpoint, so its endpoint is a sum of link vectors. Its distance from the origin is not l2. Length is fixed during a run; changing a length starts a new model.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'chain-rule',
      title: {
        key: 'learn.course-1.1.2.concept.chain-rule.title',
        ko: '시간 미분과 속도 구속',
        en: 'Differentiate in time'
      },
      body: {
        key: 'learn.course-1.1.2.concept.chain-rule.body',
        ko: '길이가 상수이므로 위치를 시간으로 미분할 때 각도에만 연쇄법칙을 적용합니다. 첫 속도는 첫 막대에 수직입니다. 둘째 속도는 움직이는 관절의 속도와 관절에 대한 상대속도의 합입니다. 두 각속도가 같아도 두 질점의 속력이 같은 것은 아닙니다.',
        en: 'With constant lengths the chain rule differentiates the angles. The first velocity is perpendicular to the first rod. The second velocity adds the moving joint velocity to the velocity relative to that joint. Equal angular velocities do not imply equal particle speeds.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'length-change',
      title: {
        key: 'learn.course-1.1.2.concept.length-change.title',
        ko: '길이 변화와 확인 한계',
        en: 'Changing length and checking limits'
      },
      body: {
        key: 'learn.course-1.1.2.concept.length-change.body',
        ko: '모든 길이를 두 배로 하면 같은 각도에서 위치는 두 배지만 중력이 만드는 시간 척도도 바뀝니다. 따라서 같은 실제 시각의 각도 궤적은 일반적으로 달라집니다. Cartesian 그래프와 각도 그래프는 서로 다른 단위의 투영입니다. 큰 시간 간격에서는 정확한 길이 구속을 만족해도 궤적 자체의 적분 오차가 클 수 있습니다.',
        en: 'Doubling all lengths doubles positions at fixed angles and also changes the gravitational time scale. Angle trajectories at the same physical time generally differ. Cartesian and angle plots are projections with different units. Exact geometric rod lengths do not guarantee an accurate time integration when steps are large.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.2.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.2.concept.synthesis.body',
        ko: '위치 벡터의 합을 미분하면 움직이는 관절의 속도가 자동으로 포함됩니다. 다음으로 이 속력을 제곱했을 때 생기는 교차 운동항을 1.3에서 찾아보세요.',
        en: 'Differentiating the position-vector sum includes the moving-joint velocity. In 1.3, identify the cross term produced by squaring that velocity.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'positions',
      title: {
        key: 'learn.course-1.1.2.equation.positions.title',
        ko: '1. 위치 벡터 합',
        en: '1. Sum position vectors'
      },
      expression: 'x1 = l1*sin(theta1); y1 = -l1*cos(theta1); x2 = x1+l2*sin(theta2); y2 = y1-l2*cos(theta2)',
      accessibleText: {
        key: 'learn.course-1.1.2.equation.positions.accessible',
        ko: '첫 위치는 첫 막대의 수평·수직 성분입니다. 둘째 위치는 첫 위치에 둘째 막대 성분을 더한 값입니다.',
        en: 'The first position is the horizontal and vertical projection of rod one. The second position adds rod two projections to that first position.'
      },
      symbols: [
        {
          symbol: 'x1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.x1',
            ko: '1번 질점의 오른쪽 양의 가로 위치',
            en: 'Horizontal position of particle 1, positive rightward'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'y1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.y1',
            ko: '1번 질점의 위쪽 양의 세로 위치',
            en: 'Vertical position of particle 1, positive upward'
          }
        },
        {
          symbol: 'x2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.x2',
            ko: '2번 질점의 오른쪽 양의 가로 위치',
            en: 'Horizontal position of particle 2, positive rightward'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'y2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.positions.symbol.y2',
            ko: '2번 질점의 위쪽 양의 세로 위치',
            en: 'Vertical position of particle 2, positive upward'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'velocities',
      title: {
        key: 'learn.course-1.1.2.equation.velocities.title',
        ko: '2. 위치의 시간 미분',
        en: '2. Differentiate positions'
      },
      expression:
        'vx1 = l1*cos(theta1)*omega1; vy1 = l1*sin(theta1)*omega1; vx2 = vx1+l2*cos(theta2)*omega2; vy2 = vy1+l2*sin(theta2)*omega2',
      accessibleText: {
        key: 'learn.course-1.1.2.equation.velocities.accessible',
        ko: '각 x 성분은 길이 곱하기 코사인 곱하기 각속도로 미분됩니다. 음의 코사인인 y 성분의 미분은 양의 사인 곱하기 각속도입니다. 둘째 속도에는 첫 속도가 포함됩니다.',
        en: 'Each x derivative is length times cosine times angular velocity. Differentiating negative cosine in y gives positive sine times angular velocity. The second velocity includes the first.'
      },
      symbols: [
        {
          symbol: 'vx1',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.vx1',
            ko: '1번 질점의 가로 속도',
            en: 'Horizontal velocity of particle 1'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'omega1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.omega1',
            ko: 'theta1의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta1'
          }
        },
        {
          symbol: 'vy1',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.vy1',
            ko: '1번 질점의 세로 속도',
            en: 'Vertical velocity of particle 1'
          }
        },
        {
          symbol: 'vx2',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.vx2',
            ko: '2번 질점의 가로 속도',
            en: 'Horizontal velocity of particle 2'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'omega2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.omega2',
            ko: 'theta2의 시간 미분인 각속도',
            en: 'Angular velocity, the time derivative of theta2'
          }
        },
        {
          symbol: 'vy2',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.velocities.symbol.vy2',
            ko: '2번 질점의 세로 속도',
            en: 'Vertical velocity of particle 2'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'constraints',
      title: {
        key: 'learn.course-1.1.2.equation.constraints.title',
        ko: '3. 거리와 속도 구속',
        en: '3. Distance and velocity constraints'
      },
      expression: 'sqrt(x1^2+y1^2) = l1; sqrt((x2-x1)^2+(y2-y1)^2) = l2; (x2-x1)*(vx2-vx1)+(y2-y1)*(vy2-vy1) = 0',
      accessibleText: {
        key: 'learn.course-1.1.2.equation.constraints.accessible',
        ko: '두 링크의 끝점 거리는 고정 길이와 같습니다. 둘째 링크 벡터와 상대속도의 내적은 0이므로 막대 방향으로 늘어나는 속도는 없습니다.',
        en: 'Each endpoint distance equals its fixed length. The second rod vector is perpendicular to relative velocity, so no velocity stretches the rod.'
      },
      symbols: [
        {
          symbol: 'x1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.x1',
            ko: '1번 질점의 오른쪽 양의 가로 위치',
            en: 'Horizontal position of particle 1, positive rightward'
          }
        },
        {
          symbol: 'y1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.y1',
            ko: '1번 질점의 위쪽 양의 세로 위치',
            en: 'Vertical position of particle 1, positive upward'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.l1',
            ko: '1번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 1'
          }
        },
        {
          symbol: 'x2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.x2',
            ko: '2번 질점의 오른쪽 양의 가로 위치',
            en: 'Horizontal position of particle 2, positive rightward'
          }
        },
        {
          symbol: 'y2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.y2',
            ko: '2번 질점의 위쪽 양의 세로 위치',
            en: 'Vertical position of particle 2, positive upward'
          }
        },
        {
          symbol: 'l2',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.l2',
            ko: '2번 막대의 양의 고정 길이',
            en: 'Positive fixed length of rod 2'
          }
        },
        {
          symbol: 'vx2',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.vx2',
            ko: '2번 질점의 가로 속도',
            en: 'Horizontal velocity of particle 2'
          }
        },
        {
          symbol: 'vx1',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.vx1',
            ko: '1번 질점의 가로 속도',
            en: 'Horizontal velocity of particle 1'
          }
        },
        {
          symbol: 'vy2',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.vy2',
            ko: '2번 질점의 세로 속도',
            en: 'Vertical velocity of particle 2'
          }
        },
        {
          symbol: 'vy1',
          unit: 'm/s',
          meaning: {
            key: 'learn.course-1.1.2.equation.constraints.symbol.vy1',
            ko: '1번 질점의 세로 속도',
            en: 'Vertical velocity of particle 1'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'holonomic',
      term: {
        key: 'learn.course-1.1.2.glossary.holonomic.term',
        ko: '홀로노믹 구속',
        en: 'Holonomic constraint'
      },
      definition: {
        key: 'learn.course-1.1.2.glossary.holonomic.definition',
        ko: '좌표와 시간만으로 나타내는 관계입니다. 고정 막대의 끝점 거리가 일정하다는 조건이 이에 해당합니다.',
        en: 'A relation involving coordinates and possibly time, such as the fixed distance between rod endpoints.'
      }
    },
    {
      id: 'cartesian-velocity',
      term: {
        key: 'learn.course-1.1.2.glossary.cartesian-velocity.term',
        ko: 'Cartesian 속도',
        en: 'Cartesian velocity'
      },
      definition: {
        key: 'learn.course-1.1.2.glossary.cartesian-velocity.definition',
        ko: '물리 공간의 위치 벡터를 시간으로 미분한 값입니다. 둘째 질점은 움직이는 관절 속도를 포함합니다.',
        en: 'The time derivative of physical position; the second particle includes the moving-joint velocity.'
      }
    }
  ],
  checks: [
    {
      id: 'moving-joint',
      prompt: {
        key: 'learn.course-1.1.2.check.moving-joint.prompt',
        ko: '둘째 질점의 속도에 반드시 포함되는 항은?',
        en: 'Which contribution must be included in the second particle velocity?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.2.check.moving-joint.explanation',
        ko: '둘째 위치가 첫 위치와 둘째 링크 벡터의 합이므로 미분에도 두 항이 남습니다.',
        en: 'Differentiating the sum of first position and second link vector retains both contributions.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.2.check.moving-joint.yes',
            ko: '첫 관절의 이동 속도',
            en: 'Velocity of the first moving joint'
          },
          feedback: {
            key: 'learn.course-1.1.2.check.moving-joint.yes-feedback',
            ko: '둘째 위치가 첫 위치와 둘째 링크 벡터의 합이므로 미분에도 두 항이 남습니다.',
            en: 'Differentiating the sum of first position and second link vector retains both contributions.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.2.check.moving-joint.no',
            ko: '둘째 상대운동만',
            en: 'Only motion relative to the joint'
          },
          feedback: {
            key: 'learn.course-1.1.2.check.moving-joint.no-feedback',
            ko: '다시 생각해 보세요. 둘째 위치가 첫 위치와 둘째 링크 벡터의 합이므로 미분에도 두 항이 남습니다.',
            en: 'Reconsider. Differentiating the sum of first position and second link vector retains both contributions.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'kinematics',
    plotIds: ['cartesian', 'angular'],
    systemId: 'system:double',
    exposedFields: ['l1', 'l2', 'theta1', 'theta2'],
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
          value: 0.6,
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
        key: 'learn.course-1.1.2.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.2.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'length-constraint',
        prediction: {
          key: 'learn.course-1.1.2.task.length-constraint.prediction',
          ko: 'l1을 2 m로 바꾸면 첫 링크 길이와 각도는 어떻게 표시될까요?',
          en: 'What happens to the first rod length and initial angle if l1 becomes 2 m?'
        },
        action: {
          key: 'learn.course-1.1.2.task.length-constraint.action',
          ko: 'l1=2 m, l2=1 m로 실행하고 Cartesian와 각도 그래프, 처음 위치와 길이 잔차를 비교하세요.',
          en: 'Run with l1=2 m and l2=1 m. Compare Cartesian and angle plots, initial positions and rod residuals.'
        },
        expected: {
          key: 'learn.course-1.1.2.task.length-constraint.expected',
          ko: '처음 각도 0.3, 0.6 rad는 유지되고 첫 링크만 2 m입니다. 모든 표본의 길이 잔차는 기본 및 이 설정에서 1e-12 m 이내입니다.',
          en: 'Initial angles remain 0.3 and 0.6 rad, while rod one becomes 2 m. Every sampled length residual stays within 1e-12 m for the default and this setting.'
        },
        explanation: {
          key: 'learn.course-1.1.2.task.length-constraint.explanation',
          ko: '기하학적 구속은 좌표 변환 자체가 보장합니다. 시간 궤적의 정확성은 별도로 시간 간격을 줄여 확인해야 합니다.',
          en: 'The coordinate transformation enforces geometry. Check time-trajectory accuracy separately by refining the time step.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.2',
    description: {
      key: 'learn.course-1.1.2.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.2.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.2.reference.tong-mechanics.locator',
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
      key: 'learn.course-1.1.2.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
