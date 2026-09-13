import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.1',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.1.title',
    ko: '이중진자의 일반화좌표와 구성공간',
    en: 'Generalized coordinates and configuration space'
  },
  summary: {
    key: 'learn.course-1.1.1.summary',
    ko: '왜 네 개의 Cartesian 위치 대신 두 각도만으로 자세를 지정할 수 있을까요? 구성공간의 한 점을 실제 두 링크 형상과 연결합니다.',
    en: 'Why can two angles replace four Cartesian position coordinates? Connect one configuration-space point to the physical two-link shape.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.1.objective.0',
      ko: '두 각도로 자세를 지정하고 상태공간과 구분합니다.',
      en: 'Specify configuration with two angles and distinguish it from state space.'
    },
    {
      key: 'learn.course-1.1.1.objective.1',
      ko: '절대각·상대각·각도의 주기성을 변환합니다.',
      en: 'Translate absolute and relative angles and account for periodicity.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.1.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.1.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: []
    }
  ],
  concepts: [
    {
      id: 'configuration',
      title: {
        key: 'learn.course-1.1.1.concept.configuration.title',
        ko: '구속을 먼저 세기',
        en: 'Count constraints first'
      },
      body: {
        key: 'learn.course-1.1.1.concept.configuration.body',
        ko: '두 질점의 평면 위치에는 처음에 네 좌표가 필요합니다. 첫 질점은 지지점에서 l1, 둘째 질점은 첫 질점에서 l2만큼 떨어져야 하므로 독립적인 길이 구속 두 개가 있습니다. 남는 자유도는 둘입니다. 일반화좌표는 구속을 만족하는 자세를 중복 없이 국소적으로 기술하는 선택입니다.',
        en: 'Two planar particles initially require four position coordinates. Two independent fixed-distance constraints leave two degrees of freedom. Generalized coordinates describe configurations satisfying these constraints without local redundancy.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'absolute-angle',
      title: {
        key: 'learn.course-1.1.1.concept.absolute-angle.title',
        ko: '상대각과 절대각 바꾸기',
        en: 'Convert relative and absolute angles'
      },
      body: {
        key: 'learn.course-1.1.1.concept.absolute-angle.body',
        ko: '첫 막대의 방향을 유지하면서 둘째 절대각만 바꾸면 둘째 막대만 회전합니다. 둘째 상대각은 두 절대각의 차입니다. MIT 자료는 관절 상대각을 쓰므로 식을 그대로 복사하면 다른 형상을 얻습니다. 이 과정은 두 각도를 모두 수직선 기준으로 일관되게 씁니다.',
        en: 'Holding the first angle fixed and changing only the second absolute angle rotates just the second rod. The second relative joint angle is the difference of the absolute angles. MIT uses relative joint coordinates; copying those formulas without conversion produces a different shape. This course consistently uses the vertical reference for both rods.'
      },
      citationIds: ['mit-multibody', 'planar-source']
    },
    {
      id: 'torus',
      title: {
        key: 'learn.course-1.1.1.concept.torus.title',
        ko: '경계는 벽이 아닌 같은 자세',
        en: 'A boundary identifies the same configuration'
      },
      body: {
        key: 'learn.course-1.1.1.concept.torus.body',
        ko: '각도에 2π를 더하면 같은 자세입니다. 두 각도의 구성공간은 두 원의 곱인 토러스입니다. 평면 그래프의 양 끝은 이어져 있으며 경계를 지나도 막대가 순간 이동하지 않습니다. 하지만 같은 자세라도 각속도가 다르면 이후 운동은 달라집니다. 회전 횟수가 필요한 원자료와 주기적으로 접은 화면 좌표도 구분하세요.',
        en: 'Adding a full turn leaves a configuration unchanged. The product of the two angle circles is a torus. Opposite edges of a flat plot are identified; crossing one does not teleport a rod. Identical configurations with different velocities can evolve differently. Distinguish unwrapped rotation counts in raw data from wrapped display coordinates.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.1.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.1.concept.synthesis.body',
        ko: '두 각도가 자세를 정하고, 각속도까지 있어야 다음 운동을 정합니다. 다음으로 길이를 바꾸면서 같은 각도가 실제 위치와 속도에 어떻게 대응하는지 1.2에서 탐구하세요.',
        en: 'Two angles specify configuration; velocities are also needed to determine motion. In 1.2, change lengths and explore how the same angles map to positions and velocities.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'first-position',
      title: {
        key: 'learn.course-1.1.1.equation.title',
        ko: '첫 질점의 위치',
        en: 'Position of the first mass'
      },
      expression: 'x1 = l1 * sin(theta1); y1 = -l1 * cos(theta1)',
      accessibleText: {
        key: 'learn.course-1.1.1.equation.accessible',
        ko: '첫 질점의 가로 위치 x1은 첫 막대 길이 l1 곱하기 theta1의 사인입니다. 세로 위치 y1은 마이너스 l1 곱하기 theta1의 코사인입니다. 각도 0에서 질점은 지지점 바로 아래에 있습니다.',
        en: 'The first mass has horizontal position x1 equal to rod length l1 times sine of theta1, and vertical position y1 equal to negative l1 times cosine of theta1. At zero angle the mass is directly below the pivot.'
      },
      symbols: [
        {
          symbol: 'x1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.1.symbol.x1',
            ko: '지지점에서 오른쪽으로 잰 첫 질점의 가로 위치',
            en: 'First mass horizontal position measured rightward from the pivot'
          }
        },
        {
          symbol: 'y1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.1.symbol.y1',
            ko: '지지점에서 위쪽으로 잰 첫 질점의 세로 위치',
            en: 'First mass vertical position measured upward from the pivot'
          }
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.1.symbol.l1',
            ko: '첫 번째 강체 막대의 양의 길이',
            en: 'Positive length of the first rigid rod'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.1.symbol.theta1',
            ko: '아래쪽 수직선에서 오른쪽으로 기울어지는 첫 막대의 절대각',
            en: 'First rod absolute angle, positive toward the right from downward vertical'
          }
        }
      ],
      citationIds: ['mit-multibody', 'planar-source']
    },
    {
      id: 'angle-conversion',
      title: {
        key: 'learn.course-1.1.1.equation.angle-conversion.title',
        ko: '각도 정의의 변환',
        en: 'Coordinate conversion'
      },
      expression: 'q1 = theta1; phi2 = theta2-theta1; q2 = theta2 + 2*pi*k',
      accessibleText: {
        key: 'learn.course-1.1.1.equation.angle-conversion.accessible',
        ko: '첫 일반화좌표는 첫 절대각입니다. 둘째 상대각은 둘째 절대각에서 첫 절대각을 뺍니다. 둘째 각도에 정수 바퀴를 더한 q2는 같은 자세를 나타냅니다.',
        en: 'The first coordinate equals the first absolute angle. The second relative angle is the second absolute angle minus the first. Adding any integer number of full turns gives the same configuration.'
      },
      symbols: [
        {
          symbol: 'q1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.q1',
            ko: '첫 일반화좌표',
            en: 'First generalized coordinate'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'phi2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.phi2',
            ko: '첫 막대에 대한 둘째 막대의 상대각',
            en: 'Second angle relative to the first rod'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'q2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.q2',
            ko: '둘째 일반화좌표',
            en: 'Second generalized coordinate'
          }
        },
        {
          symbol: 'pi',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.pi',
            ko: '원주율 약 3.14159; 각도식에서 라디안 값 사용',
            en: 'Circle constant approximately 3.14159; radian values used in angle expressions'
          }
        },
        {
          symbol: 'k',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.1.equation.angle-conversion.symbol.k',
            ko: '회전 횟수인 정수',
            en: 'Integer number of turns'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [
    {
      id: 'configuration-sketch',
      title: {
        key: 'learn.course-1.1.1.figure.title',
        ko: '두 링크의 정적인 구성 예시',
        en: 'A static two-link configuration'
      },
      caption: {
        key: 'learn.course-1.1.1.figure.caption',
        ko: '기호와 링크 연결을 보여 주는 개략도입니다. 축척에 맞춘 계산 결과나 실행 중인 시뮬레이션이 아닙니다.',
        en: 'A schematic of the labels and link connections. It is not a scale drawing, calculated result or running simulation.'
      },
      alt: {
        key: 'learn.course-1.1.1.figure.alt',
        ko: '위쪽 지지점에서 첫 질점으로 오른쪽 아래 막대가 이어지고, 첫 질점에서 두 번째 질점으로 왼쪽 아래 막대가 이어집니다.',
        en: 'One rod connects the upper pivot to the first mass down and right; a second rod connects that mass to the second mass down and left.'
      },
      nodes: [
        {
          id: 'pivot',
          x: 0.35,
          y: 0.14,
          label: {
            key: 'learn.course-1.1.1.figure.pivot',
            ko: '지지점',
            en: 'Pivot'
          }
        },
        {
          id: 'first',
          x: 0.65,
          y: 0.46,
          label: {
            key: 'learn.course-1.1.1.figure.first',
            ko: '첫 질점',
            en: 'First mass'
          }
        },
        {
          id: 'second',
          x: 0.45,
          y: 0.8,
          label: {
            key: 'learn.course-1.1.1.figure.second',
            ko: '두 번째 질점',
            en: 'Second mass'
          }
        }
      ],
      lines: [
        {
          from: 'pivot',
          to: 'first'
        },
        {
          from: 'first',
          to: 'second'
        }
      ],
      citationIds: ['planar-source']
    }
  ],
  glossary: [
    {
      id: 'generalized-coordinate',
      term: {
        key: 'learn.course-1.1.1.glossary.coordinate.term',
        ko: '일반화좌표',
        en: 'Generalized coordinate'
      },
      definition: {
        key: 'learn.course-1.1.1.glossary.coordinate.definition',
        ko: '구속을 만족하는 계의 자세를 지정하기 위해 고른 독립 좌표입니다.',
        en: 'An independent coordinate chosen to specify a configuration satisfying the constraints.'
      }
    },
    {
      id: 'configuration-space',
      term: {
        key: 'learn.course-1.1.1.glossary.configuration.term',
        ko: '구성공간',
        en: 'Configuration space'
      },
      definition: {
        key: 'learn.course-1.1.1.glossary.configuration.definition',
        ko: '계가 가질 수 있는 모든 자세의 집합입니다. 여기서는 각각 한 바퀴를 돌아 같은 자세가 되는 두 각도로 표현합니다.',
        en: 'The set of possible configurations, represented here by two angles, each returning to the same configuration after a full turn.'
      }
    }
  ],
  checks: [
    {
      id: 'coordinates',
      prompt: {
        key: 'learn.course-1.1.1.check.coordinates.prompt',
        ko: '고정 길이 평면 이중진자의 자세를 지정하는 독립 각도는 몇 개인가요?',
        en: 'How many independent angles specify a fixed-length planar double-pendulum configuration?'
      },
      options: [
        {
          id: 'one',
          label: {
            key: 'learn.course-1.1.1.check.coordinates.one',
            ko: '한 개',
            en: 'One'
          },
          feedback: {
            key: 'learn.course-1.1.1.check.coordinates.one-feedback',
            ko: '한 각도만 정하면 두 번째 막대가 어느 방향인지 남아 있습니다.',
            en: 'One angle leaves the second rod direction unspecified.'
          }
        },
        {
          id: 'two',
          label: {
            key: 'learn.course-1.1.1.check.coordinates.two',
            ko: '두 개',
            en: 'Two'
          },
          feedback: {
            key: 'learn.course-1.1.1.check.coordinates.two-feedback',
            ko: '맞습니다. 두 각도가 두 링크의 자세를 정합니다.',
            en: 'Correct. Two angles specify both link directions.'
          }
        },
        {
          id: 'four',
          label: {
            key: 'learn.course-1.1.1.check.coordinates.four',
            ko: '네 개',
            en: 'Four'
          },
          feedback: {
            key: 'learn.course-1.1.1.check.coordinates.four-feedback',
            ko: '각도 두 개와 각속도 두 개는 운동 상태입니다. 자세에는 각도 두 개를 씁니다.',
            en: 'Two angles plus two angular velocities describe a motion state. Configuration uses the two angles.'
          }
        }
      ],
      correctOptionId: 'two',
      explanation: {
        key: 'learn.course-1.1.1.check.coordinates.explanation',
        ko: '고정 길이와 지지점의 구속을 반영하면 자세의 자유도는 2입니다.',
        en: 'With fixed lengths and a fixed pivot, configuration has two degrees of freedom.'
      }
    },
    {
      id: 'downward-position',
      prompt: {
        key: 'learn.course-1.1.1.check.position.prompt',
        ko: 'theta1 = 0, l1 = 1 m일 때 첫 질점의 위치는 무엇인가요?',
        en: 'For theta1 = 0 and l1 = 1 m, where is the first mass?'
      },
      options: [
        {
          id: 'below',
          label: {
            key: 'learn.course-1.1.1.check.position.below',
            ko: 'x1 = 0 m, y1 = -1 m',
            en: 'x1 = 0 m, y1 = -1 m'
          },
          feedback: {
            key: 'learn.course-1.1.1.check.position.below-feedback',
            ko: '맞습니다. 각도 0은 아래쪽 수직선이며 y는 위쪽이 양수입니다.',
            en: 'Correct. Zero angle is downward, and y is positive upward.'
          }
        },
        {
          id: 'above',
          label: {
            key: 'learn.course-1.1.1.check.position.above',
            ko: 'x1 = 0 m, y1 = 1 m',
            en: 'x1 = 0 m, y1 = 1 m'
          },
          feedback: {
            key: 'learn.course-1.1.1.check.position.above-feedback',
            ko: 'y가 양수면 지지점 위쪽입니다. 수식의 마이너스 부호를 확인하세요.',
            en: 'Positive y is above the pivot. Check the minus sign in the equation.'
          }
        }
      ],
      correctOptionId: 'below',
      explanation: {
        key: 'learn.course-1.1.1.check.position.explanation',
        ko: 'sin(0) = 0, cos(0) = 1이므로 첫 질점은 지지점에서 1 m 아래에 있습니다.',
        en: 'Since sin(0) = 0 and cos(0) = 1, the first mass is 1 m below the pivot.'
      }
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'configuration',
    plotIds: ['configuration'],
    systemId: 'system:double',
    exposedFields: ['theta1', 'theta2'],
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
          value: 1.2,
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
        key: 'learn.course-1.1.1.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.1.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'coordinate-point',
        prediction: {
          key: 'learn.course-1.1.1.task.coordinate-point.prediction',
          ko: '두 각도가 0이면 두 질점은 어디에 있을까요?',
          en: 'Where are both particles when both angles are zero?'
        },
        action: {
          key: 'learn.course-1.1.1.task.coordinate-point.action',
          ko: 'theta1과 theta2를 0 rad로 설정해 처음 형상과 구성공간 점을 확인하세요.',
          en: 'Set both angles to 0 rad and inspect the initial shape and configuration point.'
        },
        expected: {
          key: 'learn.course-1.1.1.task.coordinate-point.expected',
          ko: '처음 위치는 (0, -1) m와 (0, -2) m입니다. 길이/위치 fixture 허용 오차는 1e-12 m입니다.',
          en: 'Initial positions are (0, -1) m and (0, -2) m. The length/position fixture tolerance is 1e-12 m.'
        },
        explanation: {
          key: 'learn.course-1.1.1.task.coordinate-point.explanation',
          ko: 'x는 사인, y는 음의 코사인으로 정해집니다. 화면의 픽셀 y 방향과 물리 좌표의 y 방향을 혼동하지 마세요.',
          en: 'Sine sets x and negative cosine sets y. Do not confuse downward screen pixels with upward physical y.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.1',
    description: {
      key: 'learn.course-1.1.1.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.1.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.1.reference.tong-mechanics.locator',
        ko: '2.2–2.3 좌표·구속, 2.5.2 이중진자, 2.6.1 정상모드. 원문의 아래쪽 양의 y를 이 과정의 위쪽 양의 y로 변환했습니다.',
        en: 'Sections 2.2–2.3 coordinates/constraints, 2.5.2 double pendulum and 2.6.1 normal modes. Converted the source downward-positive y to this course upward-positive y.'
      },
      accessedOn: '2026-09-14'
    },
    {
      id: 'mit-multibody',
      title: {
        key: 'learn.course-1.1.1.reference.mit-multibody.title',
        ko: 'Underactuated Robotics — Multi-Body Dynamics',
        en: 'Underactuated Robotics — Multi-Body Dynamics'
      },
      authors: 'Russ Tedrake',
      url: 'https://underactuated.mit.edu/multibody.html',
      locator: {
        key: 'learn.course-1.1.1.reference.mit-multibody.locator',
        ko: 'Simple Double Pendulum과 Manipulator Equations. MIT의 둘째 상대각을 theta2-theta1로 변환해 대조했습니다.',
        en: 'Simple Double Pendulum and Manipulator Equations. Converted the MIT second relative joint angle to theta2 minus theta1.'
      },
      accessedOn: '2026-09-14'
    },
    {
      id: 'planar-source',
      title: {
        key: 'learn.course-1.1.1.reference.planar-source.title',
        ko: 'Pendulum Lab — planarPositions',
        en: 'Pendulum Lab — planarPositions'
      },
      authors: 'Pendulum Lab contributors',
      url: 'https://github.com/elliotjung/pendulum-lab/blob/acd7f869db182376b726e337606335eeabe0d541/src/product/adapters/physics/planar.ts#L202-L214',
      locator: {
        key: 'learn.course-1.1.1.reference.planar-source.locator',
        ko: 'S07 adapter의 두 절대각, 위쪽 양의 y, SI 길이. 로컬 보존 원본과 대조했습니다.',
        en: 'S07 adapter: two absolute angles, upward-positive y and SI lengths, checked against the preserved local source.'
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
      key: 'learn.course-1.1.1.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
