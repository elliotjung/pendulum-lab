import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.7',
  summary: [
    '무작위 궤적의 histogram을 결정론적 밀도 방정식과 어떻게 비교할까요? 실제 비선형 앙상블과 작은 진폭 Kramers 방정식의 Gaussian 진화를 구분합니다.',
    'How can random-path histograms be compared with a deterministic density equation? Separate the actual nonlinear ensemble from Gaussian evolution of the small-angle Kramers equation.'
  ],
  objectives: [
    [
      '모형의 가정에서 핵심 관계를 유도하고 실제 결과와 비교합니다.',
      'Derive the central relation from the model assumptions and compare it with actual results.'
    ],
    [
      '관찰값과 그 수치적·과학적 한계를 함께 설명합니다.',
      'Explain the measured quantities together with their numerical and scientific limits.'
    ]
  ],
  assumptions: [
    'θ₀=0.1,ω₀=0의 정규화 진자입니다. 실제 경로는 sin θ를 보존하고 밀도 예측만 sin θ≈θ로 선형화합니다. 0≤γ≤1의 underdamped 범위, 독립 경로8~64개, unwrapped 좌표입니다.',
    'The normalized pendulum starts at theta0=0.1, omega0=0. Actual trajectories retain sin theta; only the density prediction uses sin theta approximately theta. The underdamped range is0<=gamma<=1 with8–64 independent paths and unwrapped coordinates.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        'Itô drift와 확산으로부터 밀도식은 ∂tP=-∂θ(ωP)+∂ω((θ+γω)P)+(σ²/2)∂ωωP가 됩니다. 선형 drift에서는 delta 초기분포가 이변량 Gaussian으로 진화합니다. 각도 평균은 감쇠 진동해, 각도 분산은 impulse response 제곱의 시간 적분으로 얻습니다.',
        'The Itô drift and diffusion give a Kramers density equation with angle transport, linear restoring/damping drift and velocity diffusion sigma squared over two. Linear drift evolves a delta initial distribution into a bivariate Gaussian. Angle mean follows damped oscillation and its variance integrates the squared impulse response.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '동일 시각의 실제 각도 histogram을 선형화 Gaussian 주변밀도와 겹치고 시간별 분산을 비교합니다. Gaussian은 해석적 밀도 해이지 또 다른 궤적 적분기가 아닙니다. Histogram 범위 밖 경로 수도 보고해 표시 누락을 숨기지 않습니다.',
        'Overlay the actual angle histogram with the linearized Gaussian marginal and compare variance over time. The Gaussian is an analytic density solution, not another trajectory integrator. The count outside the histogram range makes omitted display mass explicit.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '큰 각도·장벽 탈출·wrapping에서는 Gaussian 선형화가 실패합니다. 유한 표본 분산은 정확한 밀도 분산과 같을 필요가 없습니다. 12개 bins의 선형 연결은 연속 밀도의 인증이 아니며 σ=0의 Dirac 분포를 유한 곡선으로 꾸미지 않습니다.',
        'Large angles, barrier escape and wrapping invalidate the Gaussian approximation. Finite-sample variance need not equal density variance. Joining twelve histogram bins does not certify a continuous density, and a zero-noise Dirac distribution is not drawn as a finite Gaussian.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'mean = theta0*exp(-gamma*time/2)*(cos(nu*time)+gamma*sin(nu*time)/(2*nu))',
      explanation: [
        '선형화한 θ¨+γθ˙+θ=0의 초기 속도0인 평균해입니다. nu²=1-γ²/4이며 모든 시간·계수는 정규화 값입니다.',
        'This is the mean of the linearized damped oscillator with zero initial velocity, nu squared=1-gamma squared/4; all time and coefficients are normalized.'
      ],
      symbols: [
        ['mean', '1', '각도 평균', 'Angle mean'],
        ['theta0', '1', '시작 각도', 'Initial angle'],
        ['gamma', '1', '정규화 감쇠', 'Normalized damping'],
        ['time', '1', '정규화 시간', 'Normalized time'],
        ['nu', '1', '감쇠 진동 주파수', 'Damped frequency']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'variance = noise^2*responseSquareIntegral',
      explanation: [
        '선형 impulse response G=e^(−γt/2)sin(nu*t)/nu의 제곱을0부터t까지 적분하면 각도 분산입니다. 상수 계수 Gaussian 밀도식의 해석해를 평가합니다.',
        'Angle variance is noise squared times the integral of the squared linear impulse response. This evaluates the analytic solution of a constant-coefficient Gaussian density equation.'
      ],
      symbols: [
        ['variance', '1', '정규화 각도 분산', 'Normalized angle variance'],
        ['noise', '1', '정규화 잡음', 'Normalized noise'],
        [
          'responseSquareIntegral',
          '1',
          '정규화 impulse response 제곱 적분',
          'Normalized integrated squared impulse response'
        ]
      ]
    }
  ],
  checks: [
    {
      prompt: [
        'Histogram과 Gaussian의 차이가 항상 구현 오류인가요?',
        'Does disagreement with the Gaussian always mean an implementation error?'
      ],
      correct: [
        '표본 변동·비선형성·시간 이산화를 구분합니다.',
        'Separate sampling variation, nonlinearity and time discretization.'
      ],
      incorrect: ['둘은 모든 잡음에서 점별로 같아야 합니다.', 'They must agree pointwise at every noise level.'],
      explanation: [
        '분포 수준의 비교는 개별 경로 일치가 아니라 모멘트와 밀도 형상의 표본 오차를 확인합니다.',
        'Distribution-level comparison tests moments and density shape with sampling error rather than matching individual paths.'
      ]
    },
    {
      prompt: ['7.7의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.7 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '큰 각도·장벽 탈출·wrapping에서는 Gaussian 선형화가 실패합니다. 유한 표본 분산은 정확한 밀도 분산과 같을 필요가 없습니다. 12개 bins의 선형 연결은 연속 밀도의 인증이 아니며 σ=0의 Dirac 분포를 유한 곡선으로 꾸미지 않습니다.',
        'Large angles, barrier escape and wrapping invalidate the Gaussian approximation. Finite-sample variance need not equal density variance. Joining twelve histogram bins does not certify a continuous density, and a zero-noise Dirac distribution is not drawn as a finite Gaussian.'
      ]
    }
  ],
  prediction: [
    '경로 수를 줄이면 histogram과 분산 곡선의 변동이 어떻게 바뀔지 예상하세요.',
    'Predict how fewer ensemble members change histogram and variance fluctuations.'
  ],
  action: [
    '64개와16개 경로를 비교하고 관찰 기간·잡음을 각각 바꾸어 선형화 예측과의 차이를 설명하세요.',
    'Compare64 and16 members, then vary duration and noise separately and explain departures from the linearized prediction.'
  ],
  expected: [
    '기본64경로의 분산/밀도예측 비는0.5~1.6입니다. t=0의 예측 분산은0이며 γ=0 극한은 σ²(t/2−sin(2t)/4)와 일치합니다.',
    'At defaults the64-path variance/prediction ratio lies in0.5–1.6. Predicted variance is zero at t=0 and its zero-damping limit equals sigma squared times(t/2-sin(2t)/4).'
  ],
  explanation: [
    '분포 수준의 비교는 개별 경로 일치가 아니라 모멘트와 밀도 형상의 표본 오차를 확인합니다.',
    'Distribution-level comparison tests moments and density shape with sampling error rather than matching individual paths.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['Kramers 밀도식', 'Kramers density equation'],
    [
      '위치와 속도를 함께 다루는 underdamped Fokker–Planck 방정식입니다.',
      'An underdamped Fokker–Planck equation for joint position and velocity.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/stochasticSteppers.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/stochasticSteppers.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/field.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/field.ts.'
      ]
    }
  ],
  recommendedUnits: [
    {
      courseId: 'course-2',
      unitId: '2.8'
    },
    {
      courseId: 'course-3',
      unitId: '3.2'
    }
  ],
  external: {
    title: 'On the Theory of the Brownian Motion',
    authors: 'G. E. Uhlenbeck, L. S. Ornstein',
    url: 'https://doi.org/10.1103/PhysRev.36.823',
    locator: [
      '조화 구속 Brownian 분산의 시간 의존성과 Fokker–Planck 연결을 공개 초록에서 대조합니다.',
      'The primary abstract treats time-dependent variance of harmonically bound Brownian motion and its Fokker–Planck connection.'
    ]
  }
});
