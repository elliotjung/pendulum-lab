import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.6',
  summary: [
    '같은 초기조건에서 잡음이 있는 진자는 왜 다른 경로를 따를까요? 독립 Gaussian stream의 분포·장벽 도달과 seed 재현성을 조사합니다.',
    'Why do noisy pendulums follow different paths from identical initial conditions? Explore independent Gaussian streams, barrier encounters and seed reproducibility.'
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
    '단위 질량·길이·중력의 정규화 진자에 가산 속도 Itô 잡음을 넣습니다. Euler–Maruyama로 계산하고 감쇠와 잡음은 독립 입력입니다. 열평형 관계를 자동 강제하지 않습니다.',
    'A normalized unit-mass, unit-length, unit-gravity pendulum receives additive Itô velocity noise and uses Euler–Maruyama. Damping and noise are independent inputs; thermal equilibrium is not imposed.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '한 단계의 Brownian 증분은 평균0·분산dt입니다. 속도 잡음의 분산은 σ²dt가 되고 경로를 반복하면 각도·속도 분포가 생깁니다. 궤적 평균은 개별 실험을 대체하는 힘이 아닙니다.',
        'A Brownian increment has zero mean and variance dt. Velocity-noise increments have variance sigma squared times dt, and repeated paths produce angle/velocity distributions. The trajectory mean is not a force replacing individual experiments.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '각 stable member가 독립 seed를 소유합니다. 같은 전체 설정·seed·버전에서는 동일한 표본을 다시 얻고 잡음0에서는 모든 경로가 하나로 겹칩니다. 표는 기록 표본에서 처음 |θ|≥π가 된 시각을 남깁니다.',
        'Each stable member owns an independent seed. Identical complete settings, seed and version reproduce the same samples; zero noise collapses every path. The table records the first sampled time at which absolute theta reaches pi.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '기록 간격 사이의 탈출은 놓칠 수 있고 짧은 실행에서 탈출이 없다는 것이 확률0이라는 뜻은 아닙니다. Unwrapped 각도 평균·분산은 원형 평균과 다릅니다. dt를 바꾸면 동일 Brownian 경로의 coupling을 보장하지 않습니다.',
        'Escapes between recorded samples can be missed; observing no escape in a short run does not imply zero probability. Unwrapped angle moments differ from circular statistics. Changing dt does not guarantee coupled identical Brownian paths.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'noiseVariance = noise^2*dt',
      explanation: [
        '속도 잡음 증분의 분산입니다. 시간·잡음·속도는 이 모형의 정규화 값입니다.',
        'Variance of one velocity-noise increment; time, noise and velocity here are normalized.'
      ],
      symbols: [
        ['noiseVariance', '1', '속도 증분 분산', 'Velocity-increment variance'],
        ['noise', '1', '정규화 잡음 세기', 'Normalized noise amplitude'],
        ['dt', '1', '정규화 시간 간격', 'Normalized time step']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'sampleVariance = squaredDeviationSum/(members-1)',
      explanation: [
        '경로 평균에서의 제곱 편차 합을 n-1로 나눈 표본 분산을 보고합니다.',
        'The reported sample variance divides the sum of squared deviations from the member mean by n-1.'
      ],
      symbols: [
        ['sampleVariance', '1', '정규화 표본 분산', 'Normalized sample variance'],
        ['squaredDeviationSum', '1', '제곱 편차 합', 'Sum of squared deviations'],
        ['members', '1', '경로 수', 'Member count']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '같은 seed에서 dt를 바꾸면 완전히 같은 경로인가요?',
        'Does the same seed give exactly the same path after changing dt?'
      ],
      correct: ['같은 설정·step·생성기 버전까지 필요합니다.', 'Full settings, step and generator version also matter.'],
      incorrect: ['Seed 문자열만 같으면 항상 같습니다.', 'The seed string alone always suffices.'],
      explanation: [
        '확률 모형의 재현성은 분포의 일반성이나 개별 경로의 미래 예측 가능성과 구분합니다.',
        'Reproducibility of a stochastic model is distinct from distributional generality or predictability of an individual future path.'
      ]
    },
    {
      prompt: ['7.6의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.6 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '기록 간격 사이의 탈출은 놓칠 수 있고 짧은 실행에서 탈출이 없다는 것이 확률0이라는 뜻은 아닙니다. Unwrapped 각도 평균·분산은 원형 평균과 다릅니다. dt를 바꾸면 동일 Brownian 경로의 coupling을 보장하지 않습니다.',
        'Escapes between recorded samples can be missed; observing no escape in a short run does not imply zero probability. Unwrapped angle moments differ from circular statistics. Changing dt does not guarantee coupled identical Brownian paths.'
      ]
    }
  ],
  prediction: [
    '잡음을0으로 바꾸면 표본 분산이 어떻게 될지 예상하세요.',
    'Predict what happens to sample variance when noise is set to zero.'
  ],
  action: [
    '잡음0과0.4를 비교하고 같은 seed 재실행 후 seed 번호만 바꾸세요.',
    'Compare noise0 and0.4, repeat the same seed, then change only its number.'
  ],
  expected: [
    '잡음0에서 표본 각도 분산은0이고 동일한 설정·seed 결과는 정확히 반복됩니다.',
    'With zero noise the sample angle variance is zero, and identical settings and seed repeat exactly.'
  ],
  explanation: [
    '확률 모형의 재현성은 분포의 일반성이나 개별 경로의 미래 예측 가능성과 구분합니다.',
    'Reproducibility of a stochastic model is distinct from distributional generality or predictability of an individual future path.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['확률 앙상블', 'Stochastic ensemble'],
    [
      '같은 모형과 초기조건에서 독립 잡음 경로를 계산한 집합입니다.',
      'Independent noise-driven paths under the same model and initial conditions.'
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
      'Gaussian 잡음·감쇠와 분포 모멘트의 관계를 원 논문의 공개 초록과 대조합니다.',
      'Checked the primary abstract’s relation between Gaussian noise, damping and distribution moments; native nonlinear conventions remain explicit.'
    ]
  }
});
