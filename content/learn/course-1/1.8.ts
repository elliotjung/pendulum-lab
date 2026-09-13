import type { LearnUnit } from '../../../src/product/learn/schema';

/** Course one: declarative content, with no executable physics. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.8',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-1.1.8.title',
    ko: '초기조건 민감성과 카오스의 출현',
    en: 'Sensitivity to initial conditions and the onset of chaos'
  },
  summary: {
    key: 'learn.course-1.1.8.summary',
    ko: '초기 각도를 백만분의 1 라디안만 바꾼 두 궤적은 얼마나 오래 가까울까요? 거리와 유한시간 성장률을 측정하고 카오스 판정의 한계를 익힙니다.',
    en: 'How long do trajectories remain close after a one-millionth-radian initial change? Measure distance and finite-time growth and learn the limits of chaos inference.'
  },
  objectives: [
    {
      key: 'learn.course-1.1.8.objective.0',
      ko: '가까운 초기조건 두 개를 같은 엔진 설정으로 비교합니다.',
      en: 'Compare nearby initial conditions with identical engine settings.'
    },
    {
      key: 'learn.course-1.1.8.objective.1',
      ko: '유한시간 분리율을 장기 Lyapunov 지수와 구분합니다.',
      en: 'Distinguish finite-time separation growth from a long-time Lyapunov exponent.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-1.1.8.prerequisite.title',
        ko: '필요한 개념과 좌표 약속',
        en: 'Prerequisites and coordinate convention'
      },
      body: {
        key: 'learn.course-1.1.8.prerequisite.body',
        ko: '고정 지지점, 질량 없는 강체 막대, 양의 질점 질량, 평면 운동, 일정한 중력, 외력·감쇠 없음이 공통 가정입니다. 두 각도는 아래쪽 수직에 대한 절대각이며 x는 오른쪽, y는 위쪽이 양수입니다. 라디안과 시간 미분을 사용합니다. 추천 단원은 접근을 제한하지 않습니다.',
        en: 'Assume a fixed pivot, massless rigid rods, positive point masses, planar motion, constant gravity, no forcing and no damping. Both angles are absolute from downward vertical; x points right and y points up. Angles are in radians; dots denote time derivatives. Recommendations never restrict access.'
      },
      recommendedUnits: [
        {
          courseId: 'course-1',
          unitId: '1.7'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'paired-run',
      title: {
        key: 'learn.course-1.1.8.concept.paired-run.title',
        ko: '작은 차이 하나만 도입하기',
        en: 'Introduce one small difference'
      },
      body: {
        key: 'learn.course-1.1.8.concept.paired-run.body',
        ko: '두 run은 질량, 길이, 중력, 적분기, 시간 간격, 기간이 모두 같습니다. 비교 run의 첫 초기 각도만 1e-6 rad만큼 더합니다. 동일 초기조건과 동일 설정에서는 결정론적으로 같은 결과가 나와야 합니다. 초기조건 민감성은 무작위 힘을 넣는 것과 다른 현상입니다.',
        en: 'Both runs share masses, lengths, gravity, integrator, step and duration. Only the comparison initial theta1 is increased by 1e-6 rad. Exactly identical conditions and settings should reproduce identical deterministic results. Sensitive dependence is different from adding random forcing.'
      },
      citationIds: ['shinbrot-chaos']
    },
    {
      id: 'distance-definition',
      title: {
        key: 'learn.course-1.1.8.concept.distance-definition.title',
        ko: '거리의 단위와 각도의 경계',
        en: 'Distance units and angle boundaries'
      },
      body: {
        key: 'learn.course-1.1.8.concept.distance-definition.body',
        ko: '각도 차는 한 바퀴 경계를 반영해 가까운 차로 접고, 각속도 차에는 고정 시간 척도를 곱한 뒤 하나의 거리로 합칩니다. 단위가 다른 각도와 각속도를 그대로 더하면 거리의 의미가 모호합니다. 화면의 유한시간 성장률은 선택한 거리와 초기 방향, 관찰 시간에 의존하며 t=0에서는 정의하지 않습니다.',
        en: 'Wrap angular differences across full-turn boundaries and multiply velocity differences by a fixed time scale before combining them. Adding quantities with different units without a scale gives an ambiguous distance. The displayed finite-time growth depends on the chosen norm, initial direction and duration; it is undefined at time zero.'
      },
      citationIds: ['shinbrot-chaos']
    },
    {
      id: 'chaos-limits',
      title: {
        key: 'learn.course-1.1.8.concept.chaos-limits.title',
        ko: '증거의 범위를 정직하게 읽기',
        en: 'Read the evidence within its limits'
      },
      body: {
        key: 'learn.course-1.1.8.concept.chaos-limits.body',
        ko: '일부 구간에서 양의 성장률이 보여도 무한시간 카오스의 증명은 아닙니다. 안정한 진동의 위상 차이, 과도 성장, 수치 오차도 유한 구간에서 거리를 키울 수 있습니다. 큰 거리에서는 선형적인 지수 성장 근사가 포화됩니다. 긴 기간, 여러 작은 섭동, 시간 간격 수렴과 다른 진단을 비교해야 합니다. 높은 에너지의 모든 초기조건이 카오스라고 단정하지 마세요. 이 실험은 첫 각도만 바꾸므로 두 run의 에너지도 조금 다릅니다. 같은 에너지면에서의 섭동과 비교하기 전에는 에너지 차이에 따른 위상 분리를 카오스로 단정하지 않습니다.',
        en: 'Positive growth on one interval does not prove infinite-time chaos. Phase differences in regular oscillations, transients and numerical error can increase finite-interval distance. Once separation is large, linearized exponential growth saturates. Compare longer intervals, perturbation sizes, step refinement and other diagnostics. Not every high-energy initial condition is chaotic. Perturbing only the first angle also slightly changes energy. Before comparison with a perturbation on the same energy surface, do not identify energy-induced phase separation alone as chaos.'
      },
      citationIds: ['shinbrot-chaos']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-1.1.8.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-1.1.8.concept.synthesis.body',
        ko: '가까운 두 run의 분리를 관찰했지만 유한시간 성장률에는 거리·기간·에너지 차이·수치 오차가 영향을 줍니다. 실험실에서 더 긴 기간과 작은 시간 간격을 비교하고 결과의 신뢰 범위를 설명하세요.',
        en: 'Nearby trajectories separate, but finite-time growth depends on norm, duration, energy differences and numerical error. In Lab, compare longer intervals and finer steps and explain the limits of your evidence.'
      },
      citationIds: ['shinbrot-chaos']
    }
  ],
  equations: [
    {
      id: 'perturbation',
      title: {
        key: 'learn.course-1.1.8.equation.perturbation.title',
        ko: '1. 초기조건의 작은 변화',
        en: '1. A small initial perturbation'
      },
      expression: 'epsilon = 0.000001; d0 = abs(epsilon)',
      accessibleText: {
        key: 'learn.course-1.1.8.equation.perturbation.accessible',
        ko: '두 번째 run의 첫 시작 각도에 백만분의 1 라디안을 더합니다. 나머지 차이가 0이고 각도 값은 라디안으로 무차원화되므로 시작 거리 수치는 epsilon의 절댓값입니다.',
        en: 'Add one millionth of a radian to the second run initial first angle. All other differences vanish; using radian angle values gives initial dimensionless distance equal to the absolute perturbation.'
      },
      symbols: [
        {
          symbol: 'epsilon',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.8.equation.perturbation.symbol.epsilon',
            ko: '두 궤적의 초기 theta1 차이',
            en: 'Initial theta1 difference between two trajectories'
          }
        },
        {
          symbol: 'd0',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.8.equation.perturbation.symbol.d0',
            ko: '시작 시점의 무차원 거리',
            en: 'Initial dimensionless distance'
          }
        }
      ],
      citationIds: ['shinbrot-chaos']
    },
    {
      id: 'state-distance',
      title: {
        key: 'learn.course-1.1.8.equation.state-distance.title',
        ko: '2. 시간 척도를 명시한 거리',
        en: '2. Distance with an explicit time scale'
      },
      expression: 'd = sqrt(dq1^2+dq2^2+(tau*dw1)^2+(tau*dw2)^2); tau = 1',
      accessibleText: {
        key: 'learn.course-1.1.8.equation.state-distance.accessible',
        ko: '주기 경계를 반영한 두 각도 차 제곱에, 1초 시간 척도를 곱한 각속도 차 제곱을 더해 제곱근을 취합니다. 각도는 라디안 수치로 사용합니다.',
        en: 'Take the square root of summed squared wrapped angle differences and squared velocity differences multiplied by a one-second time scale. Angles use their radian values.'
      },
      symbols: [
        {
          symbol: 'd',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.8.equation.state-distance.symbol.d',
            ko: '선택한 무차원 상태 거리',
            en: 'Chosen dimensionless state distance'
          }
        },
        {
          symbol: 'dq1',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.8.equation.state-distance.symbol.dq1',
            ko: '주기 경계를 반영한 두 theta1 차이',
            en: 'Wrapped difference of the two theta1 angles'
          }
        },
        {
          symbol: 'dq2',
          unit: 'rad',
          meaning: {
            key: 'learn.course-1.1.8.equation.state-distance.symbol.dq2',
            ko: '주기 경계를 반영한 두 theta2 차이',
            en: 'Wrapped difference of the two theta2 angles'
          }
        },
        {
          symbol: 'tau',
          unit: 's',
          meaning: {
            key: 'learn.course-1.1.8.equation.state-distance.symbol.tau',
            ko: '각속도를 무차원화하는 고정 시간 척도 1 s',
            en: 'Fixed 1 s time scale for nondimensionalizing angular velocity'
          }
        },
        {
          symbol: 'dw1',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.8.equation.state-distance.symbol.dw1',
            ko: '두 omega1 차이',
            en: 'Difference of omega1'
          }
        },
        {
          symbol: 'dw2',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-1.1.8.equation.state-distance.symbol.dw2',
            ko: '두 omega2 차이',
            en: 'Difference of omega2'
          }
        }
      ],
      citationIds: ['shinbrot-chaos']
    },
    {
      id: 'finite-growth',
      title: {
        key: 'learn.course-1.1.8.equation.finite-growth.title',
        ko: '3. 유한시간 로그 성장률',
        en: '3. Finite-time logarithmic growth'
      },
      expression: 'lambda = log(d/d0)/t; d = d0*exp(lambda*t)',
      accessibleText: {
        key: 'learn.course-1.1.8.equation.finite-growth.accessible',
        ko: '양의 경과 시간에서 현재 거리와 처음 거리의 비율에 자연로그를 취하고 시간으로 나눕니다. 이 구간 평균 성장률은 가까운 궤적을 재규격화해 얻는 점근 Lyapunov 지수와 다릅니다.',
        en: 'For positive elapsed time take the natural logarithm of the current-to-initial distance ratio and divide by time. This interval-averaged growth differs from an asymptotic Lyapunov exponent obtained with renormalized nearby trajectories.'
      },
      symbols: [
        {
          symbol: 'lambda',
          unit: 's^-1',
          meaning: {
            key: 'learn.course-1.1.8.equation.finite-growth.symbol.lambda',
            ko: '기간 t에 걸친 유한시간 로그 성장률',
            en: 'Finite-time logarithmic growth rate over interval t'
          }
        },
        {
          symbol: 'd',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.8.equation.finite-growth.symbol.d',
            ko: '선택한 무차원 상태 거리',
            en: 'Chosen dimensionless state distance'
          }
        },
        {
          symbol: 'd0',
          unit: '1',
          meaning: {
            key: 'learn.course-1.1.8.equation.finite-growth.symbol.d0',
            ko: '시작 시점의 무차원 거리',
            en: 'Initial dimensionless distance'
          }
        },
        {
          symbol: 't',
          unit: 's',
          meaning: {
            key: 'learn.course-1.1.8.equation.finite-growth.symbol.t',
            ko: '시작 뒤 흐른 양의 시간',
            en: 'Positive elapsed time'
          }
        }
      ],
      citationIds: ['shinbrot-chaos']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'finite-growth-term',
      term: {
        key: 'learn.course-1.1.8.glossary.finite-growth.term',
        ko: '유한시간 성장률',
        en: 'Finite-time growth rate'
      },
      definition: {
        key: 'learn.course-1.1.8.glossary.finite-growth.definition',
        ko: '지정한 양의 기간 동안 궤적 거리 비의 자연로그를 시간으로 나눈 값입니다. 점근 지수와 다릅니다.',
        en: 'The logarithm of a trajectory-distance ratio divided by a specified positive duration; it differs from an asymptotic exponent.'
      }
    },
    {
      id: 'sensitive-dependence',
      term: {
        key: 'learn.course-1.1.8.glossary.sensitive-dependence.term',
        ko: '초기조건 민감성',
        en: 'Sensitive dependence'
      },
      definition: {
        key: 'learn.course-1.1.8.glossary.sensitive-dependence.definition',
        ko: '매우 가까운 초기조건의 차이가 시간에 따라 커지는 성질입니다. 짧은 분리 관찰만으로 장기 카오스를 증명하지 않습니다.',
        en: 'Growth of differences from nearby initial conditions; short-time separation alone does not prove long-time chaos.'
      }
    }
  ],
  checks: [
    {
      id: 'finite-not-proof',
      prompt: {
        key: 'learn.course-1.1.8.check.finite-not-proof.prompt',
        ko: '20초 성장률이 양수이면 무엇을 결론낼 수 있나요?',
        en: 'What can a positive 20-second growth rate establish?'
      },
      correctOptionId: 'yes',
      explanation: {
        key: 'learn.course-1.1.8.check.finite-not-proof.explanation',
        ko: '유한시간 값은 기간·초기 방향·거리 척도와 수치 오차에 영향을 받습니다.',
        en: 'Finite-time estimates depend on interval, perturbation direction, norm and numerical error.'
      },
      options: [
        {
          id: 'yes',
          label: {
            key: 'learn.course-1.1.8.check.finite-not-proof.yes',
            ko: '선택한 두 run이 이 거리에서 순성장했으며 추가 검증이 필요합니다.',
            en: 'This pair had net growth in the chosen norm; further checks are needed.'
          },
          feedback: {
            key: 'learn.course-1.1.8.check.finite-not-proof.yes-feedback',
            ko: '유한시간 값은 기간·초기 방향·거리 척도와 수치 오차에 영향을 받습니다.',
            en: 'Finite-time estimates depend on interval, perturbation direction, norm and numerical error.'
          }
        },
        {
          id: 'no',
          label: {
            key: 'learn.course-1.1.8.check.finite-not-proof.no',
            ko: '모든 초기조건에서 무한시간 카오스가 증명됩니다.',
            en: 'Infinite-time chaos is proven for all initial conditions.'
          },
          feedback: {
            key: 'learn.course-1.1.8.check.finite-not-proof.no-feedback',
            ko: '다시 생각해 보세요. 유한시간 값은 기간·초기 방향·거리 척도와 수치 오차에 영향을 받습니다.',
            en: 'Reconsider. Finite-time estimates depend on interval, perturbation direction, norm and numerical error.'
          }
        }
      ]
    }
  ],
  focusExperiment: {
    status: 'ready',
    kind: 'sensitivity',
    plotIds: ['sensitivity', 'angular'],
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
        value: 20,
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
          value: 2,
          unit: 'rad'
        },
        {
          id: 'theta2',
          value: 1,
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
          value: 20,
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
        key: 'learn.course-1.1.8.focus.guidance',
        ko: '먼저 결과를 예측하고 설정을 바꾼 다음 실행하세요. 아래 관찰 과제에서 수치와 그래프를 읽고 설명을 비교하세요.',
        en: 'Predict before editing settings and running. Use the observation task below to read values and plots and compare your explanation.'
      }
    ],
    successCriteria: [
      {
        key: 'learn.course-1.1.8.focus.criteria',
        ko: '관찰 과제의 조건과 허용 오차를 확인하고, 보존량과 모델의 한계를 함께 설명합니다.',
        en: 'Check the observation conditions and tolerances, and explain both conserved quantities and model limits.'
      }
    ],
    tasks: [
      {
        id: 'nearby-growth',
        prediction: {
          key: 'learn.course-1.1.8.task.nearby-growth.prediction',
          ko: '기본 초기조건의 두 가까운 run은 20초 뒤에도 같은 화면 경로를 따를까요?',
          en: 'Will the default nearby runs still follow the same visible path after twenty seconds?'
        },
        action: {
          key: 'learn.course-1.1.8.task.nearby-growth.action',
          ko: '기본값 2,1 rad로 20초 실행해 두 궤적, 거리와 유한시간 성장률을 읽으세요. 시작 거리와 마지막 거리를 비교하세요.',
          en: 'Run the default 2,1 rad for twenty seconds. Read both trajectories, separation and finite-time growth, comparing initial and final distance.'
        },
        expected: {
          key: 'learn.course-1.1.8.task.nearby-growth.expected',
          ko: '초기 theta1 차는 1e-6 rad(허용 오차 1e-12 rad)입니다. 기본 fixture는 20초 뒤 거리가 초기 거리보다 큼을 확인합니다. 성장률은 유한하고 log(d/d0)/20과 1e-10 s⁻¹ 이내로 일치합니다.',
          en: 'Initial theta1 separation is 1e-6 rad within 1e-12 rad. The default fixture verifies final distance exceeds initial distance at 20 s. The finite rate agrees with log(d/d0)/20 within 1e-10 s⁻¹.'
        },
        explanation: {
          key: 'learn.course-1.1.8.task.nearby-growth.explanation',
          ko: '이는 이 초기조건과 구간의 민감성 관찰입니다. 별도의 계에서 보고된 논문의 지수 수치를 이 run의 정답으로 사용하지 않습니다.',
          en: 'This observes sensitivity for this pair and interval. A published exponent measured in a different physical system is not the correct numerical target for this run.'
        }
      }
    ]
  },
  labTransfer: {
    status: 'ready',
    systemId: 'system:double',
    sourceUnitId: '1.8',
    description: {
      key: 'learn.course-1.1.8.transfer.description',
      ko: '현재 초기조건·물성·적분기·분석 설정과 출처 단원을 실험실로 보냅니다. 실험실에서 자유롭게 확장한 뒤 뒤로가기로 이 단원의 설정과 관찰 화면에 돌아올 수 있습니다.',
      en: 'Send the current initial conditions, physical parameters, integrator, analyses and source unit to the laboratory. Expand the experiment there and use Back to return to this unit configuration and observation view.'
    }
  },
  references: [
    {
      id: 'shinbrot-chaos',
      title: {
        key: 'learn.course-1.1.8.reference.shinbrot-chaos.title',
        ko: 'Chaos in a double pendulum (1992)',
        en: 'Chaos in a double pendulum (1992)'
      },
      authors: 'Troy Shinbrot, Celso Grebogi, Jack Wisdom, James A. Yorke',
      url: 'https://materias.df.uba.ar/mcaa2017c2/files/2017/08/AJPDoublePendulum2.pdf',
      locator: {
        key: 'learn.course-1.1.8.reference.shinbrot-chaos.locator',
        ko: 'American Journal of Physics 60, 491–499, DOI 10.1119/1.16860. 대학 강의실에 보관된 원문 I–V절, 부록 B 및 주 8·12·26을 대조했습니다. 다른 장치의 측정 지수는 이 실험의 기대값으로 옮기지 않습니다.',
        en: 'American Journal of Physics 60, 491–499, DOI 10.1119/1.16860. Original paper hosted by a university course: sections I–V, Appendix B and notes 8, 12, 26. Its measured exponent for a different apparatus is not this experiment target.'
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
      key: 'learn.course-1.1.8.review.note',
      ko: '구조·기호·단위·예제와 공용 엔진 Focus fixture를 자동 검증하고 아래 1차 자료와 대조했습니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Structure, symbols, units, examples and shared-engine Focus fixtures are automatically verified and checked against the primary sources below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
