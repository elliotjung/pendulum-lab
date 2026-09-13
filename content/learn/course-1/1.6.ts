import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.6',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.6.title',
    ko: '작은 진동 근사와 정상모드',
    en: 'Small oscillations and normal modes'
  },
  summary: {
    key: 'learn.course-1.1.6.summary',
    ko: '어떤 작은 초기 자세가 모양을 유지하며 진동할까요? 선형 정상모드와 같은 초기조건의 비선형 해를 나란히 비교합니다.',
    en: 'Which small initial shapes oscillate while preserving their pattern? Compare linear normal modes with nonlinear motion from the same initial state.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.6.objective.0',
      ko: '작은 진동의 연립식을 유도하고 두 모드를 구합니다.',
      en: 'Derive the small-oscillation equations and both modes.'
    },
    {
      key: 'learn.course-1.1.6.objective.1',
      ko: '진폭 증가가 근사 오차에 미치는 영향을 측정합니다.',
      en: 'Measure how increasing amplitude changes approximation error.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.6.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.6.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.5'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'linearization',
      title: {
        key: 'learn.course-1.1.6.concept.linearization.title',
        ko: '평형 근처의 차수 세기',
        en: 'Count orders near equilibrium'
      },
      body: {
        key: 'learn.course-1.1.6.concept.linearization.body',
        ko: '아래 평형 부근에서 각도와 각속도가 모두 작은 진동 크기라고 가정합니다. L을 이차까지 남겨야 한 번 미분한 방정식에 선형 복원항이 남습니다. 사인은 각도, 코사인 각도차는 1로 바꾸며 속도 제곱에 사인이 곱해진 항은 더 높은 차수입니다. 단지 시작 각도만 작고 각속도가 크면 이 근사는 유효하지 않습니다.',
        en: 'Assume both angles and angular velocities have small oscillation amplitude about the bottom. Keep quadratic terms in L to retain linear restoring terms after differentiation. Replace sine by angle and cosine difference by one; sine times velocity squared is higher order. A small initial angle with large velocity is not a small oscillation.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'eigenmodes',
      title: {
        key: 'learn.course-1.1.6.concept.eigenmodes.title',
        ko: '고유값 문제와 두 모양',
        en: 'Eigenvalues and two patterns'
      },
      body: {
        key: 'learn.course-1.1.6.concept.eigenmodes.body',
        ko: '이 단원은 두 질량과 길이를 각각 1로 고정합니다. 같은 주파수의 코사인으로 두 각도를 가정하면 계수 행렬의 행렬식이 0이어야 비영 해가 있습니다. 낮은 모드는 같은 방향으로, 높은 모드는 반대 방향으로 움직이며 둘째 각도 진폭의 크기는 첫째의 √2배입니다. 두 링크의 각도가 같아야 정상모드인 것은 아닙니다.',
        en: 'This unit fixes both masses and lengths to one. Assuming a common cosine frequency gives a nonzero solution only when the coefficient determinant vanishes. The low mode moves in phase and the high mode oppositely; the second angular amplitude has magnitude sqrt(2) times the first. Equal angles are not the normal-mode condition.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'approximation-error',
      title: {
        key: 'learn.course-1.1.6.concept.approximation-error.title',
        ko: '진폭과 관찰 기간을 함께 말하기',
        en: 'Specify amplitude and observation interval'
      },
      body: {
        key: 'learn.course-1.1.6.concept.approximation-error.body',
        ko: '기본값은 낮은 모드의 작은 진폭입니다. 두 각도를 같은 배수로 키우면 모드 모양을 유지한 채 비선형성을 시험할 수 있습니다. 선형식은 큰 진폭의 정확한 답이 아니며 위상 오차가 시간에 따라 누적될 수 있습니다. 어떤 각도가 한계를 넘으면 갑자기 모두 실패하는 임계값을 정하지 말고 같은 기간의 절대 각도 오차를 비교하세요.',
        en: 'The default is a small low-mode amplitude. Scale both angles equally to test nonlinearity while keeping the mode shape. Linear motion is not exact at large amplitudes, and phase error can accumulate. Compare absolute angular errors over the same duration rather than claiming a universal abrupt amplitude cutoff.'
      },
      citationIds: ['tong-mechanics']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.6.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.6.concept.synthesis.body',
        ko: '동일 질량·길이의 두 모드는 진폭비가 양·음의 루트2이며 진폭이 커지면 선형 오차가 커집니다. 다음으로 두 모드를 함께 여기했을 때 링크별 에너지 배분이 어떻게 바뀌는지 1.7에서 확인하세요.',
        en: 'For equal masses and lengths the modal ratios are plus or minus sqrt(2); larger amplitudes increase linear error. In 1.7, excite both modes and inspect changing energy assignments.'
      },
      citationIds: ['tong-mechanics']
    }
  ],
  equations: [
    {
      id: 'linear-balance',
      title: {
        key: 'learn.course-1.1.6.equation.linear-balance.title',
        ko: '1. 동일 질량·길이에서 선형식',
        en: '1. Linear equations for equal masses and lengths'
      },
      expression: '2*m*l^2*alpha1+m*l^2*alpha2+2*m*g*l*theta1 = 0; m*l^2*alpha1+m*l^2*alpha2+m*g*l*theta2 = 0',
      accessibleText: {
        key: 'learn.course-1.1.6.equation.linear-balance.accessible',
        ko: '첫 방정식은 관성 계수 2와 1, 복원 계수 2를 갖습니다. 둘째 방정식은 두 관성 계수와 복원 계수가 모두 1입니다. 질량은 공통 인자로 소거됩니다.',
        en: 'The first equation has inertia coefficients two and one and restoring coefficient two. The second has unit coefficients. Common mass cancels.'
      },
      symbols: [
        {
          symbol: 'm',
          unit: 'kg',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.m',
            ko: '두 질점에 공통인 질량',
            en: 'Common mass of the two particles'
          }
        },
        {
          symbol: 'l',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.l',
            ko: '두 막대에 공통인 길이',
            en: 'Common rod length'
          }
        },
        {
          symbol: 'alpha1',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.alpha1',
            ko: 'omega1의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega1'
          }
        },
        {
          symbol: 'alpha2',
          unit: 'rad/s^2',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.alpha2',
            ko: 'omega2의 시간 미분인 각가속도',
            en: 'Angular acceleration, the time derivative of omega2'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.linear-balance.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'eigenvalues',
      title: {
        key: 'learn.course-1.1.6.equation.eigenvalues.title',
        ko: '2. 특성식과 두 각진동수',
        en: '2. Characteristic polynomial and frequencies'
      },
      expression:
        '(2-2*mu)*(1-mu)-mu^2 = 0; mu^2-4*mu+2 = 0; OmegaLow = sqrt((g/l)*(2-sqrt(2))); OmegaHigh = sqrt((g/l)*(2+sqrt(2)))',
      accessibleText: {
        key: 'learn.course-1.1.6.equation.eigenvalues.accessible',
        ko: '무차원 고유값 mu는 2에서 루트2를 빼거나 더한 값입니다. g 나누기 l을 곱하고 제곱근을 취하면 두 각진동수를 얻습니다.',
        en: 'The dimensionless eigenvalues are two minus and two plus sqrt(2). Multiply by g over l and take square roots to obtain angular frequencies.'
      },
      symbols: [
        {
          symbol: 'mu',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.6.equation.eigenvalues.symbol.mu',
            ko: '무차원 고유값 Omega 제곱 곱하기 l/g',
            en: 'Dimensionless eigenvalue Omega squared times l/g'
          }
        },
        {
          symbol: 'OmegaLow',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.6.equation.eigenvalues.symbol.OmegaLow',
            ko: '낮은 모드의 각진동수',
            en: 'Low-mode angular frequency'
          }
        },
        {
          symbol: 'g',
          unit: 'm/s^2',
          meaning: {
            key: 'learn.course-1.1.6.equation.eigenvalues.symbol.g',
            ko: '양의 중력 가속도 크기',
            en: 'Positive gravitational acceleration magnitude'
          }
        },
        {
          symbol: 'l',
          unit: 'm',
          meaning: {
            key: 'learn.course-1.1.6.equation.eigenvalues.symbol.l',
            ko: '두 막대에 공통인 길이',
            en: 'Common rod length'
          }
        },
        {
          symbol: 'OmegaHigh',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.6.equation.eigenvalues.symbol.OmegaHigh',
            ko: '높은 모드의 각진동수',
            en: 'High-mode angular frequency'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    },
    {
      id: 'mode-ratios',
      title: {
        key: 'learn.course-1.1.6.equation.mode-ratios.title',
        ko: '3. 모드 모양과 비교 오차',
        en: '3. Mode patterns and comparison error'
      },
      expression: 'ratioLow = sqrt(2); ratioHigh = -sqrt(2); error = sqrt((theta1-qLinear1)^2+(theta2-qLinear2)^2)',
      accessibleText: {
        key: 'learn.course-1.1.6.equation.mode-ratios.accessible',
        ko: '낮은 모드의 둘째 대 첫째 진폭비는 양의 루트2, 높은 모드는 음의 루트2입니다. 오차는 선형과 비선형 두 각도 차이의 유클리드 길이입니다.',
        en: 'The second-to-first amplitude ratio is positive sqrt(2) for the low mode and negative sqrt(2) for the high mode. Error is the Euclidean norm of the two angular differences.'
      },
      symbols: [
        {
          symbol: 'ratioLow',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.ratioLow',
            ko: '낮은 모드에서 theta2/theta1 진폭비',
            en: 'Amplitude ratio theta2/theta1 in the low mode'
          }
        },
        {
          symbol: 'ratioHigh',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.ratioHigh',
            ko: '높은 모드에서 theta2/theta1 진폭비',
            en: 'Amplitude ratio theta2/theta1 in the high mode'
          }
        },
        {
          symbol: 'error',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.error',
            ko: '선형 및 비선형 두 각도 차이의 유클리드 크기',
            en: 'Euclidean angular difference between linear and nonlinear trajectories'
          }
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.theta1',
            ko: '1번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 1 from downward vertical'
          }
        },
        {
          symbol: 'qLinear1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.qLinear1',
            ko: '선형 모형의 첫 각도',
            en: 'First angle of the linear model'
          }
        },
        {
          symbol: 'theta2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.theta2',
            ko: '2번 막대의 아래쪽 수직 기준 절대각',
            en: 'Absolute angle of rod 2 from downward vertical'
          }
        },
        {
          symbol: 'qLinear2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.6.equation.mode-ratios.symbol.qLinear2',
            ko: '선형 모형의 둘째 각도',
            en: 'Second angle of the linear model'
          }
        }
      ],
      citationIds: ['tong-mechanics']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'normal-mode',
      term: {
        key: 'learn.course-1.1.6.glossary.normal-mode.term',
        ko: '정상모드',
        en: 'Normal mode'
      },
      definition: {
        key: 'learn.course-1.1.6.glossary.normal-mode.definition',
        ko: '선형 결합계가 하나의 주파수로 진동하며 좌표 진폭비를 유지하는 모양입니다.',
        en: 'A pattern of a linear coupled system that oscillates at one frequency with fixed coordinate amplitude ratios.'
      }
    },
    {
      id: 'linearization-term',
      term: {
        key: 'learn.course-1.1.6.glossary.linearization.term',
        ko: '선형화',
        en: 'Linearization'
      },
      definition: {
        key: 'learn.course-1.1.6.glossary.linearization.definition',
        ko: '평형 근처의 작은 교란에 대해 운동방정식의 일차 항을 남기는 근사입니다.',
        en: 'An approximation retaining first-order terms in small perturbations about equilibrium.'
      }
    }
  ],
  checks: [
    {
      id: 'mode-ratio',
      prompt: {
        key: 'learn.course-1.1.6.check.mode-ratio.prompt',
        ko: '낮은 모드에서 theta1=0.05 rad일 때 theta2는?',
        en: 'In the low mode, what is theta2 when theta1 is 0.05 rad?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.6.check.mode-ratio.explanation',
        ko: '같은 위상이어도 진폭비가 1은 아닙니다. 같은 질량·길이에서 비는 √2입니다.',
        en: 'In-phase motion need not have equal amplitudes. The ratio is sqrt(2) for equal masses and lengths.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.6.check.mode-ratio.yes',
            ko: '약 0.07071 rad',
            en: 'Approximately 0.07071 rad'
          },
          feedback: {
            key: 'learn.course-1.1.6.check.mode-ratio.yes-feedback',
            ko: '같은 위상이어도 진폭비가 1은 아닙니다. 같은 질량·길이에서 비는 √2입니다.',
            en: 'In-phase motion need not have equal amplitudes. The ratio is sqrt(2) for equal masses and lengths.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.6.check.mode-ratio.no',
            ko: '정확히 0.05 rad',
            en: 'Exactly 0.05 rad'
          },
          feedback: {
            key: 'learn.course-1.1.6.check.mode-ratio.no-feedback',
            ko: '다시 생각해 보세요. 같은 위상이어도 진폭비가 1은 아닙니다. 같은 질량·길이에서 비는 √2입니다.',
            en: 'Reconsider. In-phase motion need not have equal amplitudes. The ratio is sqrt(2) for equal masses and lengths.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'normal-modes',
    plotIds: ['linear-modes', 'angular'],
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
          value: 0.05,
          unit: 'rad'
        },
        {
          id: 'theta2',
          value: 0.07071067811865475,
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
        key: 'learn.course-1.1.6.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.6.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'amplitude-error',
        prediction: {
          key: 'learn.course-1.1.6.task.amplitude-error.prediction',
          ko: '두 초기 각도를 열 배로 키우면 같은 8초 동안 선형 오차가 어떻게 바뀔까요?',
          en: 'How does scaling both initial angles tenfold change linear error over the same eight seconds?'
        },
        action: {
          key: 'learn.course-1.1.6.task.amplitude-error.action',
          ko: '기본값 0.05,0.0707106781 rad로 실행하고, 이어 0.5,0.7071067812 rad로 실행해 선형 비교 오차를 읽으세요.',
          en: 'Run the default 0.05,0.0707106781 rad, then run 0.5,0.7071067812 rad and compare linear errors.'
        },
        expected: {
          key: 'learn.course-1.1.6.task.amplitude-error.expected',
          ko: '자동 fixture는 작은 진폭의 최대 각도 오차가 0.01 rad 미만이고 큰 진폭의 최대 오차가 더 큼을 검증합니다. 두 run은 동일한 8 s와 0.002 s 간격을 씁니다.',
          en: 'The automated fixture verifies maximum small-amplitude error below 0.01 rad and a larger maximum error at large amplitude. Both runs use 8 s and a 0.002 s step.'
        },
        explanation: {
          key: 'learn.course-1.1.6.task.amplitude-error.explanation',
          ko: '더 큰 각도에서는 사인과 각도의 차이 및 자세 의존 관성이 커집니다. 이 비교값은 모든 기간에 대한 보편적인 오차 상한은 아닙니다.',
          en: 'At larger angles the sine approximation and posture-dependent inertia matter more. The comparison is not a universal error bound for every observation period.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.6',
    description: {
      key: 'learn.course-1.1.6.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'tong-mechanics',
      title: {
        key: 'learn.course-1.1.6.reference.tong-mechanics.title',
        ko: 'Classical Dynamics — The Lagrangian Formalism',
        en: 'Classical Dynamics — The Lagrangian Formalism'
      },
      authors: 'David Tong',
      url: 'https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf',
      locator: {
        key: 'learn.course-1.1.6.reference.tong-mechanics.locator',
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
      key: 'learn.course-1.1.6.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
