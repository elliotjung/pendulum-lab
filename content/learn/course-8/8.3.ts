import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.3',
  summary: [
    '알려진 native 관측에서 중력 g를 다시 추정하고 잔차·초기 추정·비수렴을 함께 읽습니다.',
    'Recover gravity from known native observations and read residuals, initialization and nonconvergence together.'
  ],
  objectives: [
    [
      '상태·단위·시간축을 정렬한 국소 최소제곱 문제를 만든다.',
      'Form a local least-squares problem with aligned state, units and time.'
    ],
    [
      '복원 오차와 식별 가능성·불확실성의 차이를 설명한다.',
      'Distinguish recovery error from identifiability and uncertainty.'
    ]
  ],
  assumptions: [
    '질점 이중진자에서 초기 각도·각속도·질량·길이와 감쇠를 알고 중력만 추정합니다. 별도 native run이 truth g=9.81로 관측을 만들고, 추정기는 초기 g=8에서 시작합니다. sin/cos 교란은 결정론적 교육 편향이며 확률 관측 잡음 분포나 posterior가 아닙니다.',
    'For the point-mass double pendulum, initial state, masses, lengths and damping are known and only gravity is estimated. A separate native run generates observations with truth g=9.81 while the optimizer starts at g=8. The optional sin/cos perturbation is deterministic instructional bias, not a probabilistic noise distribution or posterior.'
  ],
  concepts: [
    {
      id: 'residual',
      title: ['전방 모델에서 잔차로', 'From forward model to residual'],
      body: [
        '각 관측 시각까지 실제 RK4로 적분한 예측과 관측 각도를 빼고, 각도 wrap을 적용합니다. native Levenberg–Marquardt가 국소 Jacobian과 damping으로 g를 보정합니다. truth 값은 관측 생성에만 쓰며 추정기에 정답으로 전달하지 않습니다.',
        'The preserved RK4 forward model reaches each observation time, subtracts measured angles and wraps angle residuals. Native Levenberg–Marquardt updates g using a local Jacobian and damping. The truth parameter is used only to generate observations and is not supplied as the optimizer answer.'
      ]
    },
    {
      id: 'identifiability',
      title: ['낮은 잔차의 한계', 'Limits of a small residual'],
      body: [
        '관측 길이가 짧거나 거의 정지하면 다른 매개변수도 비슷한 궤적을 만들 수 있습니다. 이 실험의 단일 g 복원은 모든 질량·길이의 식별 가능성을 증명하지 않습니다. 반복 한도 1에서는 최선 후보를 반환하되 수렴 성공으로 표시하지 않습니다.',
        'Short or nearly stationary observations can allow different parameters to produce similar trajectories. Recovering one g does not establish identifiability of all masses and lengths. An iteration limit of one returns the best candidate without presenting it as converged.'
      ]
    }
  ],
  equations: [
    {
      id: 'cost',
      title: ['관측 잔차 비용', 'Observation residual cost'],
      expression: 'J = r1^2 + r2^2',
      explanation: [
        '한 시각의 두 wrapped 각도 잔차 r1,r2를 제곱해 더합니다. 전체 비용은 모든 관측 시각의 같은 항을 합합니다. rad는 SI에서 무차원이지만 각도 관례를 유지합니다.',
        'Square and sum the two wrapped angular residuals r1,r2 at one time. The full objective sums such terms over observation times. Radians are dimensionless in SI but the angle convention remains explicit.'
      ],
      symbols: [
        ['J', '1', '두 잔차 제곱합', 'sum of squared angular residuals'],
        ['r1', 'rad', '첫 각도 wrapped 잔차', 'first wrapped angular residual'],
        ['r2', 'rad', '둘째 각도 wrapped 잔차', 'second wrapped angular residual']
      ]
    },
    {
      id: 'parameter-error',
      title: ['복원 오차를 truth와 비교', 'Compare recovery with truth'],
      expression: 'dg = gfit - gtrue',
      explanation: [
        '추정 gfit에서 관측 생성 gtrue를 뺀 값은 이 알려진 예의 복원 오차입니다. 실측 자료에서는 gtrue가 알려져 있지 않아 같은 비교를 할 수 없습니다.',
        'Subtract the known observation-generating gtrue from fitted gfit to measure recovery error in this benchmark. Real measurements generally do not provide a known truth for this comparison.'
      ],
      symbols: [
        ['dg', 'm/s^2', '중력 복원 오차', 'gravity recovery error'],
        ['gfit', 'm/s^2', '국소 추정 중력', 'locally fitted gravity'],
        ['gtrue', 'm/s^2', '관측 생성 중력', 'observation-generating gravity']
      ]
    }
  ],
  prediction: [
    '잡음 교란이 0이고 충분한 보정을 허용하면 초기 g=8이 알려진 관측의 g=9.81에 얼마나 가까워질지 예측하세요.',
    'Predict how closely the initial g=8 will approach the known observation-generating g=9.81 with zero perturbation and sufficient iterations.'
  ],
  action: [
    '기본 설정으로 복원한 뒤 최대 반복을 1로 바꾸고, 수렴 지표와 잔차 및 native 경고를 비교하세요.',
    'Recover gravity with defaults, then set the maximum iterations to one and compare convergence flags, residuals and native warnings.'
  ],
  expected: [
    '기본 무교란 fixture는 g를 소수 여섯 자리까지 복원하고 잔차 RMSE는 2e-8 rad 미만입니다. 한 번 보정은 비수렴으로 남습니다.',
    'The default unperturbed fixture recovers g to six decimal places with residual RMSE below2e-8 rad. One correction remains nonconverged.'
  ],
  explanation: [
    '알려진 동일 모델의 관측은 국소 복원이 가능하지만 관측 생성과 각 시각별 적분의 부동소수점 차이로 잔차 바닥이 남습니다. 비수렴 후보도 삭제하거나 성공으로 바꾸지 않습니다.',
    'Known observations from the same model permit local recovery, with a small roundoff residual floor from observation generation versus interval-wise integration. A nonconverged candidate is preserved without relabeling it as success.'
  ],
  next: [
    '초기 추정과 관측 기간을 바꾸고 두 매개변수의 잔차 지형을 조사하세요. 공분산은 독립 잔차·국소 선형화 가정의 근사입니다.',
    'Vary initialization and record length, then inspect a two-parameter residual landscape. Covariance is conditional on local linearization and residual assumptions.'
  ],
  glossary: [
    ['식별 가능성', 'Identifiability'],
    [
      '지정한 관측과 모델에서 매개변수를 서로 구별할 수 있는 성질입니다.',
      'The ability to distinguish model parameters using the specified observations.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/inverse/estimate.ts',
      locator: [
        'runEstimate의 RK4/LM·wrapped 잔차와 비수렴 경고',
        'runEstimate RK4/LM, wrapped residuals, parameter bounds and nonconvergence warnings'
      ]
    },
    {
      path: 'src/research/parameterEstimation.ts',
      locator: [
        'fitDoublePendulum의 원래 최소제곱 추정',
        'fitDoublePendulum preserved local least-squares implementation'
      ]
    }
  ],
  external: {
    title: 'NIST/SEMATECH e-Handbook: Linear Least Squares Regression',
    authors: 'NIST/SEMATECH',
    url: 'https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm',
    locator: [
      '최소제곱 비용과 모형 전제 설명; 이 실험은 native 비선형 전방 모형을 사용',
      'Definition of least-squares residual minimization and assumptions; the experiment uses its preserved nonlinear forward model'
    ]
  },
  checks: [
    {
      prompt: ['잔차가 작으면 모든 물성이 식별되었나요?', 'Does a small residual identify every physical parameter?'],
      correct: [
        '아니며 관측과 매개변수별 식별 검사가 필요하다.',
        'No; observation- and parameter-specific identifiability checks remain necessary.'
      ],
      incorrect: [
        '모든 질량과 길이가 전역 유일하게 복원된다.',
        'Every mass and length is globally uniquely recovered.'
      ],
      explanation: [
        '한 매개변수의 알려진 fixture는 다변수 전역 유일성을 보장하지 않습니다.',
        'A known single-parameter fixture does not establish global uniqueness for multiple parameters.'
      ]
    },
    {
      prompt: ['반복 한도에서 멈춘 후보를 어떻게 읽나요?', 'How should an iteration-limited candidate be interpreted?'],
      correct: [
        '최선 후보와 비수렴 상태를 함께 보존한다.',
        'Retain the best candidate together with its nonconverged status.'
      ],
      incorrect: ['유한한 값이면 수렴했다고 표시한다.', 'A finite value should be labeled converged.'],
      explanation: [
        '유한한 계산 결과와 알고리즘 수렴은 서로 다른 조건입니다.',
        'A finite numerical result and algorithmic convergence are different conditions.'
      ]
    }
  ]
});
