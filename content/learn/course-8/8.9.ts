import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.9',
  summary: [
    '같은 보존 진동 자료에 reservoir와 Hamiltonian 다항 학습을 적용해 자유 rollout과 보존 구조를 비교합니다.',
    'Compare reservoir and polynomial Hamiltonian learning on the same conservative oscillation data using free rollout and structural diagnostics.'
  ],
  objectives: [
    [
      'canonical 운동량과 각속도의 차이를 명시한다.',
      'State the distinction between canonical momentum and angular velocity.'
    ],
    [
      '학습한 보존 구조와 유한 적분·예측 오차를 구별한다.',
      'Distinguish learned conservation structure from finite integration and prediction errors.'
    ]
  ],
  assumptions: [
    '보존된 Duffing adapter의 무감쇠·무구동 β=0,α=1 극한을 사용합니다. 정규화 질량 1에서 q=x,p=dq/dτ이며 두 좌표와 τ는 무차원입니다. UI canonical 시간 슬롯의 값도 이 모형에서는 정규화 시간으로 해석합니다. native Hamiltonian은 다항 계수 회귀로 neural-network epoch 학습이 아닙니다.',
    'The preserved Duffing adapter runs the undamped, unforced β=0,α=1 limit. With normalized unit mass, q=x and p=dq/dτ; both coordinates and τ are dimensionless. Values in the canonical time slots represent normalized time for this model. Native Hamiltonian learning regresses polynomial coefficients rather than training neural-network epochs.'
  ],
  concepts: [
    {
      id: 'structure',
      title: ['학습에 넣는 보존 구조', 'Conservation structure in learning'],
      body: [
        '정규화 canonical q,p에서 Hamiltonian의 기울기로 운동을 만들면 모델 벡터장의 보존 구조가 제한됩니다. 이 실험은 이중진자의 omega를 p로 이름만 바꾸지 않습니다. 하나의 에너지 궤도와 ridge만으로 Hamiltonian의 전역 유일성이 보장되지 않아 다른 에너지의 독립 관측이 필요합니다.',
        'In normalized canonical q,p coordinates, deriving the vector field from a Hamiltonian gradient constrains model structure. This experiment does not merely rename double-pendulum angular velocity as momentum. A single energy orbit and ridge fitting do not ensure a globally unique Hamiltonian; independent observations at other energies are needed.'
      ]
    },
    {
      id: 'reservoir-validation',
      title: ['Reservoir와 자유 rollout의 한계', 'Reservoir and free-rollout limitations'],
      body: [
        'native reservoir는 seed로 고정된 recurrent 행렬과 ridge readout을 사용합니다. 훈련·한 단계 teacher forcing·자유 rollout을 구분하고 같은 미래 구간을 비교합니다. 낮은 예측 오차가 보존 법칙을 보장하지 않으며 Hamiltonian 모델도 유한 RK4 rollout에서는 작은 에너지 drift가 생깁니다.',
        'The native reservoir uses a seeded recurrent matrix and ridge readout. Training, one-step teacher forcing and free rollout are distinguished on the same future interval. Low prediction error does not establish conservation, and finite RK4 rollout can introduce small energy drift even for a Hamiltonian model.'
      ]
    }
  ],
  equations: [
    {
      id: 'canonical-flow',
      title: ['정규화 Hamilton 방정식', 'Normalized Hamilton equations'],
      expression: 'qdot = Hp; pdot = -Hq',
      explanation: [
        'qdot는 H의 p미분 Hp이고 pdot는 H의 q미분 Hq의 음수입니다. 여기서는 좌표·시간·Hamiltonian 모두 정규화하여 SI 수치와 혼동하지 않습니다.',
        'qdot equals the p derivative Hp of H, and pdot is minus its q derivative Hq. Coordinates, time and Hamiltonian are normalized here and must not be confused with physical SI magnitudes.'
      ],
      symbols: [
        ['qdot', '1', '정규화 q 변화율', 'normalized q derivative'],
        ['pdot', '1', '정규화 p 변화율', 'normalized p derivative'],
        ['Hp', '1', '정규화 H의 p미분', 'normalized derivative of H with respect to p'],
        ['Hq', '1', '정규화 H의 q미분', 'normalized derivative of H with respect to q']
      ]
    },
    {
      id: 'harmonic-energy',
      title: ['단위 질량 보존 진동 극한', 'Unit-mass harmonic conservative limit'],
      expression: 'H = (p^2 + q^2) / 2',
      explanation: [
        'native Duffing의 α=1,β=감쇠=구동=0에서는 정규화 운동·퍼텐셜 에너지의 합이 이 이차형입니다. 학습은 이 정답 식을 하드코딩하지 않고 실제 관측 미분에 회귀합니다.',
        'For native Duffing with α=1 and β=damping=forcing=0, normalized kinetic and potential energies form this quadratic. Learning regresses actual observed derivatives without hardcoding this answer.'
      ],
      symbols: [
        ['H', '1', '정규화 조화 에너지', 'normalized harmonic energy'],
        ['p', '1', '정규화 canonical 운동량', 'normalized canonical momentum'],
        ['q', '1', '정규화 위치', 'normalized position']
      ]
    }
  ],
  prediction: [
    '같은 보존 진동 자료에서 보존 구조를 쓴 모델과 쓰지 않은 모델의 유한 자유 예측 오차가 반드시 같은지 예측하세요.',
    'Predict whether models with and without an imposed conservation structure must have identical finite free-rollout error on the same conservative data.'
  ],
  action: [
    '두 모델을 실제 학습하고 미래 rollout·learnedEnergyDrift·계보를 확인한 뒤 reservoir 노드 수나 seed를 바꾸세요.',
    'Train both models, inspect future rollout, learnedEnergyDrift and lineage, then vary reservoir size or seed.'
  ],
  expected: [
    '두 모델은 같은 정규화 native 진동 기록을 사용하고 실제 validation을 반환합니다. Hamiltonian에 learnedEnergyDrift가 표시되며 모델·seed·재평가 parent가 남습니다.',
    'Both models use the same normalized native oscillation record and return real validation diagnostics. Hamiltonian learnedEnergyDrift, model settings, seed and reevaluation parents are retained.'
  ],
  explanation: [
    '모델 구조는 학습 편향을 정하지만 유한 자료와 수치 적분의 오차를 없애지 않습니다. 보존하는 학습량이 곧 참 물리 Hamiltonian이라는 주장도 별도 검증이 필요합니다.',
    'Model structure imposes an inductive bias without eliminating finite-data or integration error. Equating a learned invariant with the true physical Hamiltonian requires additional verification.'
  ],
  next: [
    '다른 에너지와 새 초기조건의 독립 자료를 추가하고 같은 시간 범위에서 구조·일반화·계산비용을 함께 비교하세요.',
    'Add independent records at other energies and initial conditions, comparing structure, generalization and cost over matched horizons.'
  ],
  glossary: [
    ['Canonical 좌표', 'Canonical coordinates'],
    [
      'Hamilton 방정식의 q,p 쌍으로 정의한 좌표이며 일반 각속도가 자동으로 운동량은 아닙니다.',
      'Coordinates defined as Hamiltonian q,p pairs; a general angular velocity is not automatically a momentum.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/data-driven/learning-validation.ts',
      locator: [
        'Hamiltonian의 canonical q,p·단위·전처리 제한',
        'Hamiltonian canonical q,p, unit declarations and preprocessing restrictions'
      ]
    },
    {
      path: 'src/product/adapters/analysis/data-driven/learning.ts',
      locator: [
        'reservoir와 Hamiltonian 학습·rollout·에너지 drift',
        'Reservoir and polynomial Hamiltonian fitting, free rollout and learned-energy drift'
      ]
    },
    {
      path: 'src/product/adapters/physics/nonlinear-schema.ts',
      locator: [
        'Duffing harmonic preset과 정규화 변수 정의',
        'Duffing harmonic preset and normalized variable definitions'
      ]
    }
  ],
  external: {
    title: 'Hamiltonian Neural Networks',
    authors: 'S. Greydanus, M. Dzamba, J. Yosinski',
    url: 'https://arxiv.org/abs/1906.01563',
    locator: [
      '보존 구조를 넣는 학습 관점; 이 native 구현은 신경망이 아닌 다항 회귀',
      'Conservation-structure inductive bias; the preserved implementation here is polynomial regression, not that neural network'
    ]
  },
  checks: [
    {
      prompt: ['이중진자 각속도를 p로 이름만 바꾸면?', 'Can double-pendulum angular velocity simply be renamed p?'],
      correct: ['일반적으로 canonical 운동량이 아니므로 안 된다.', 'No; it is generally not canonical momentum.'],
      incorrect: [
        '항상 Hamiltonian 학습의 전제가 충족된다.',
        'This always satisfies Hamiltonian-learning assumptions.'
      ],
      explanation: [
        '일반 운동량에는 자세 의존 질량행렬과 좌표 결합이 포함됩니다.',
        'Generalized momenta include the configuration-dependent mass matrix and coordinate coupling.'
      ]
    },
    {
      prompt: [
        'Hamiltonian 벡터장이면 finite RK4 drift는?',
        'Can finite RK4 show drift for a Hamiltonian vector field?'
      ],
      correct: ['수치 적분 오차로 작게 생길 수 있다.', 'Yes; finite integration error can introduce small drift.'],
      incorrect: ['구조만으로 bitwise 보존이 보장된다.', 'Structure alone guarantees bitwise conservation.'],
      explanation: [
        '연속 벡터장의 불변량과 이산 수치 step의 보존 성질은 구별해야 합니다.',
        'Distinguish an invariant of the continuous vector field from conservation properties of a discrete numerical step.'
      ]
    }
  ]
});
