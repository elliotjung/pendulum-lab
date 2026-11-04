import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.6',
  title: ['전체 Lyapunov spectrum과 발산율', 'The full Lyapunov spectrum and divergence'],
  question: [
    '한 방향이 늘어나도 전체 부피는 줄 수 있을까요? 네 접선 지수의 합을 같은 각도·각속도 좌표에서 계산한 Jacobian trace의 시간 평균과 비교합니다.',
    'Can one direction expand while total volume contracts? Compare the sum of four tangent exponents with the mean Jacobian trace in the same angle–velocity coordinates.'
  ],
  prerequisites: [
    '4차원의 매끄러운 벡터장과 독립 접선 4개를 사용합니다. 각도·각속도는 정준좌표·운동량과 다르며 감쇠계수 gamma의 단위는 kg*m^2/s입니다.',
    'Use a smooth four-dimensional field and four independent tangent vectors. Angles and angular velocities differ from canonical coordinates and momenta; gamma has units kg*m^2/s.'
  ],
  objectives: [
    [
      'QR 대각 성장과 부피 성장률의 합 관계를 유도합니다.',
      'Derive the relation between QR diagonal growth and volume growth.'
    ],
    [
      '발산율의 좌표 의존성과 감쇠·유한시간 오차를 분리합니다.',
      'Separate coordinate-dependent divergence, damping and finite-time numerical errors.'
    ]
  ],
  concepts: [
    {
      title: ['선이 아닌 작은 부피', 'A small volume rather than a line'],
      body: [
        '전체 접선틀을 전파하고 QR로 다시 직교화하면 각 독립 방향의 성장을 기록할 수 있습니다. 그 부피 배율은 행렬식의 절댓값이고 로그는 각 QR 대각 로그의 합입니다. 첫 지수가 양수여도 나머지 방향의 수축으로 부피는 줄 수 있습니다.',
        'Propagating a full tangent frame with QR reorthogonalization records independent directional growth. Volume stretch is the absolute determinant, whose logarithm is the sum of QR diagonal log stretches. Contraction in other directions can outweigh a positive leading exponent.'
      ]
    },
    {
      title: ['발산과 같은 좌표', 'Divergence in matching coordinates'],
      body: [
        '매끄러운 흐름의 국소 부피 로그 변화율은 같은 좌표 Jacobian의 trace입니다. 공용 numericalJacobian으로 기록 시각의 trace를 평가하고 사다리꼴 평균을 냅니다. 이는 QR 적분 내부의 모든 시각을 쓴 값과 다르므로 sampling을 세분하여 오차를 확인합니다.',
        'Local log-volume change in a smooth flow equals the Jacobian trace in those coordinates. The shared numericalJacobian evaluates traces at recorded times, followed by a trapezoidal mean. This differs from using every QR integration stage and requires sampling refinement.'
      ]
    },
    {
      title: ['Hamiltonian 검사의 조건', 'Conditions for Hamiltonian checks'],
      body: [
        '정준 Hamiltonian 좌표에서는 Liouville 부피 보존이 성립합니다. 하지만 여기서는 질량행렬이 상태에 따라 바뀌는 각도·각속도 좌표입니다. 무감쇠라는 사실만으로 짧은 기간의 지수 합을 0으로 놓거나 대칭 쌍을 강제하지 않습니다.',
        'Liouville-volume preservation applies in canonical Hamiltonian coordinates. Here, angle–velocity coordinates involve a state-dependent mass matrix. Absence of damping alone does not justify forcing a finite-time zero sum or symmetric exponent pairs.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '혼합 단위를 임의로 다르게 스케일하면 유한시간 접선 성장도 바뀝니다. 양의 첫 지수와 음의 합은 상충하지 않으며 작은 SE는 trace 적분의 오차 상계가 아닙니다. 5.7에서 전체 스펙트럼보다 싼 두 접선 지표를 비교합니다.',
        'Rescaling mixed-unit coordinates changes finite-time tangent growth. A positive first exponent and negative sum are compatible; small SE does not bound trace-integration error. In 5.7, compare cheaper two-tangent indicators.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 부피 배율의 로그', '1. Logarithm of volume stretch'],
      expression: 'logVolume = duration*sumExponent',
      explanation: [
        'sumExponent는 같은 기간에 계산한 모든 접선 지수의 합입니다. 전체 상태 차원보다 적은 지수의 합을 부피 성장으로 부르면 안 됩니다.',
        'SumExponent includes all tangent exponents measured over the same interval. A partial spectrum does not yield full-state volume growth.'
      ],
      symbols: [
        ['logVolume', '1', '접선 부피 배율의 로그', 'Log tangent-volume stretch'],
        ['duration', 's', '측정 기간', 'Measurement duration'],
        ['sumExponent', 's^-1', '전체 지수 합', 'Full exponent sum']
      ]
    },
    {
      title: ['2. 4차원 흐름의 국소 발산', '2. Local divergence of a four-dimensional flow'],
      expression: 'divergence = j11+j22+j33+j44',
      explanation: [
        'Jacobian의 같은 성분에 대한 미분인 대각 성분을 더합니다. 각 대각항의 단위는 s^-1입니다.',
        'Add diagonal derivatives of corresponding field and state components. Each diagonal entry has units s^-1.'
      ],
      symbols: [
        ['divergence', 's^-1', '같은 좌표에서의 발산', 'Divergence in matching coordinates'],
        ['j11', 's^-1', 'Jacobian 첫 대각', 'First Jacobian diagonal'],
        ['j22', 's^-1', '둘째 대각', 'Second diagonal'],
        ['j33', 's^-1', '셋째 대각', 'Third diagonal'],
        ['j44', 's^-1', '넷째 대각', 'Fourth diagonal']
      ]
    }
  ],
  term: ['접선 부피 성장', 'Tangent-volume growth'],
  definition: [
    '전체 독립 접선으로 만든 평행체의 부피가 변하는 비율입니다.',
    'Rate of change of the volume spanned by a complete independent tangent frame.'
  ],
  checks: [
    {
      prompt: [
        '첫 지수 양수·전체 합 음수는 가능한가요?',
        'Can the first exponent be positive while the full sum is negative?'
      ],
      correct: ['다른 방향의 수축이 더 크면 가능합니다.', 'Yes, if contraction in other directions dominates.'],
      wrong: ['항상 모순입니다.', 'It is always contradictory.'],
      explanation: [
        '선 성장과 부피 성장은 다른 양입니다.',
        'Line growth and volume growth measure different quantities.'
      ]
    },
    {
      prompt: [
        '무감쇠 각도·각속도 지수 합은 유한시간에 정확히 0인가요?',
        'Must an undamped angle–velocity exponent sum be exactly zero at finite time?'
      ],
      correct: [
        '좌표·유한시간·수치 오차를 함께 봐야 합니다.',
        'Coordinates, finite duration and numerical errors must be considered.'
      ],
      wrong: ['에너지 보존만으로 정확히 0입니다.', 'Energy conservation alone makes it exactly zero.'],
      explanation: [
        '정준 부피 보존의 전제를 다른 좌표로 자동으로 옮기지 않습니다.',
        'Canonical-volume assumptions cannot be transferred automatically to other coordinates.'
      ]
    }
  ],
  task: {
    prediction: [
      'gamma를 0에서 0.2로 늘리면 첫 지수와 합은 같은 방향으로 바뀔까요?',
      'Will increasing gamma from 0 to 0.2 change the leading exponent and sum in the same direction?'
    ],
    action: [
      '전체 4개 지수와 mean-divergence를 읽고 gamma만 바꿉니다. 기간 비교와 기록 간격의 차이도 설명하세요.',
      'Inspect all four exponents and mean-divergence, then change only gamma. Explain duration and recording-resolution differences.'
    ],
    expected: [
      '4개 지수가 유한해야 하고 기본 fixture의 지수 합과 평균 발산 차이는 0.01 s^-1 이내여야 합니다. 임의 매개변수의 동일 오차 보증은 아닙니다.',
      'All four exponents must be finite; for the default fixture, the sum and mean divergence should differ by at most 0.01 s^-1. This does not guarantee that error for arbitrary parameters.'
    ],
    explanation: [
      '같은 좌표의 독립 부피 계산이 일치하는지를 검사하며 Hamiltonian 쌍을 강제로 생성하지 않습니다.',
      'Check agreement between independent volume measurements in matching coordinates without forcing Hamiltonian pairing.'
    ]
  },
  source: {
    title: [
      'The Lyapunov Characteristic Exponents and their computation',
      'The Lyapunov Characteristic Exponents and their computation'
    ],
    authors: 'Charalampos Skokos',
    url: 'https://arxiv.org/abs/0811.0882',
    locator: [
      '다수 지수·QR·접선 부피와 보존계의 전제를 대조했습니다. 제품은 동일 좌표 발산 평균을 별도 수치 근사로 표시합니다.',
      'Checked multiple exponents, QR, tangent volumes and conservative-system assumptions. The product labels its matched-coordinate divergence average as a separate numerical approximation.'
    ]
  }
});
