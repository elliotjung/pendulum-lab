import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.3',
  summary: [
    '주기마다 교란이 줄어드는지는 어느 수치가 말해 줄까요? 공용 shooting 궤도의 승수와 Liouville 행렬식을 비교합니다.',
    'Which numbers describe perturbation contraction over a period? Compare multipliers and the Liouville determinant for a shared shooting orbit.'
  ],
  objectives: [
    [
      '한 주기 변분 전파자에서 승수와 지수를 연결합니다.',
      'Connect multipliers and exponents through the one-period variational propagator.'
    ],
    [
      '행렬식 검사를 개별 승수의 안정성과 구별합니다.',
      'Distinguish a determinant check from stability of individual multipliers.'
    ]
  ],
  assumptions: [
    '구동 위상이 고정된 단일 진자의 물리2차원 반환 맵입니다. 전체 자율화3차원 중립 위상 승수는 표시 블록에 포함하지 않습니다. SI 시간과 각도를 사용합니다.',
    'Use the physical two-dimensional return map of a single pendulum at fixed forcing phase. The neutral phase multiplier of the augmented three-dimensional flow is outside this block. Time and angle use SI conventions.'
  ],
  concepts: [
    {
      id: 'propagator',
      title: ['한 주기 뒤 교란의 비율', 'Perturbation ratios after a period'],
      body: [
        '주기궤도를 따라 변분 방정식을 적분하면 초기 교란을 한 주기 뒤 교란으로 보내는 모노드로미가 됩니다. 그 고유값인 승수는 무차원입니다. 모든 물리 승수의 절댓값이1보다 작으면 국소적으로 수축하지만 궤도 자체의 shooting 수렴도 먼저 확인해야 합니다.',
        'Integrate variational dynamics along the periodic orbit to map an initial perturbation over one period. Eigenvalues of this monodromy are dimensionless multipliers. Contraction of all physical multipliers gives local stability only after shooting convergence is checked.'
      ]
    },
    {
      id: 'determinant',
      title: ['수치 검증과 안정성의 한계', 'Numerical checks and stability limits'],
      body: [
        '일정 감쇠의 물리2차원 블록에서는 발산율이−감쇠율이므로 행렬식은 exp(−감쇠율×주기)입니다. 이 곱이1보다 작아도 한 승수는1보다 클 수 있습니다. 단위원 가까이에서는 적분 해상도와 유한차분 오차를 줄여야 하며 경계의 비선형 분류는 별도입니다.',
        'Constant damping gives physical-block divergence minus the damping rate, hence determinant exp(−damping×period). A product below one can coexist with one multiplier above one. Near the unit circle, refine integration and finite differences; nonlinear boundary classification is separate.'
      ]
    }
  ],
  equations: [
    {
      id: 'det',
      title: ['1. Liouville 행렬식', '1. Liouville determinant'],
      expression: 'determinant = exp(-damping*period)',
      explanation: [
        '일정한 발산율을 한 주기 적분한 지수입니다. 지수의 인수는 무차원입니다.',
        'Exponentiate constant divergence integrated over one period. The exponent is dimensionless.'
      ],
      symbols: [
        ['determinant', '1', '모노드로미 행렬식', 'Monodromy determinant'],
        ['damping', 's^-1', '감쇠율', 'Damping rate'],
        ['period', 's', '구동 주기', 'Forcing period']
      ]
    },
    {
      id: 'exponent',
      title: ['2. 승수에서 실수 지수로', '2. Real exponent from a multiplier'],
      expression: 'realExponent = log(multiplierModulus)/period',
      explanation: [
        '주기마다 곱해지는 비율을 시간당 로그 성장률로 바꿉니다. 복소 로그의 위상 branch와는 분리한 실수부입니다.',
        'Convert a per-period multiplicative factor to a logarithmic growth rate per second. This real part is separate from complex-log phase branches.'
      ],
      symbols: [
        ['realExponent', 's^-1', 'Floquet 지수 실수부', 'Real Floquet exponent'],
        ['multiplierModulus', '1', '승수 절댓값', 'Multiplier modulus'],
        ['period', 's', '주기', 'Period']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '행렬식이1보다 작으면 모든 승수가 안정한가요?',
        'Does determinant below one imply every multiplier is stable?'
      ],
      correct: ['아닙니다. 개별 절댓값도 확인합니다.', 'No. Inspect each modulus as well.'],
      incorrect: ['항상 안정합니다.', 'It is always stable.'],
      explanation: [
        '큰 팽창과 더 큰 수축의 곱도1보다 작을 수 있습니다.',
        'Expansion times stronger contraction can still have a product below one.'
      ]
    },
    {
      prompt: ['구동 위상 중립 승수가 안 보이는 이유는?', 'Why is the neutral forcing-phase multiplier absent?'],
      correct: [
        '고정 위상 물리2차원 블록이기 때문입니다.',
        'The display uses the fixed-phase physical two-dimensional block.'
      ],
      incorrect: ['모든 중립 방향은 물리적으로 존재하지 않습니다.', 'Neutral directions never physically exist.'],
      explanation: [
        '자율화 위상 방향과 단면의 물리 방향을 구별합니다.',
        'Distinguish the augmented phase direction from physical section directions.'
      ]
    }
  ],
  prediction: [
    '감쇠율을 줄이면 행렬식은1에 가까워질까요? 승수 각각도 반드시 단조롭게 움직일까요?',
    'Will lowering damping move the determinant toward one? Must each multiplier also vary monotonically?'
  ],
  action: [
    '기본 Floquet 결과의 복소평면과 행렬식을 기록하고 damping을 바꿉니다. stepsPerPeriod를256으로 늘려 수치 변화를 대조합니다.',
    'Record the multiplier plane and determinant, change damping, then raise stepsPerPeriod to256 to compare numerical sensitivity.'
  ],
  expected: [
    '기본 gamma0.5,T=3pi에서 행렬식은 exp(−1.5pi)≈0.008983입니다. 실제 승수 곱이 해상도 오차 안에서 이 값과 일치해야 합니다.',
    'At default gamma0.5 and T=3pi, the determinant is exp(−1.5pi)≈0.008983. The computed multiplier product should agree within integration error.'
  ],
  explanation: [
    '행렬식은 면적 수축의 합성 진단입니다. 분기 판정은 개별 승수와 궤도의 검증된 잔차를 함께 요구합니다.',
    'The determinant diagnoses combined area contraction. Bifurcation interpretation also requires individual multipliers and a verified orbit residual.'
  ],
  next: [
    '국소 궤도 안정성에 이어6.4에서 안정·불안정 다양체의 전역 기하와 약섭동 예측을 비교합니다.',
    'After local orbit stability, compare global stable/unstable manifold geometry with weak-perturbation predictions in6.4.'
  ],
  glossary: [
    ['모노드로미', 'Monodromy'],
    [
      '주기궤도 위 한 주기의 선형 교란 전파자입니다.',
      'The linear perturbation propagator over one period along a periodic orbit.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/floquet.ts',
      locator: [
        'monodromyMatrix와 floquetAnalysis의 물리2×2 블록을 확인합니다.',
        'Check the physical2×2 block in monodromyMatrix and floquetAnalysis.'
      ]
    },
    {
      path: 'src/product/adapters/analysis/stability/native-current.ts',
      locator: [
        '검증된 shooting 뒤 실제 위상에서 Floquet을 계산하는 경로를 확인합니다.',
        'Check the actual-phase Floquet path after verified periodic shooting.'
      ]
    }
  ],
  external: {
    title: 'Period doubling',
    authors: 'Charles Tresser, Pierre Coullet and Edson de Faria',
    url: 'https://www.scholarpedia.org/article/Period_doubling',
    locator: [
      '승수−1 통과와 비퇴화 전제를 설명한 Dependence upon the dimension을 대조합니다.',
      'Compare the multiplier crossing and nondegeneracy conditions under Dependence upon the dimension.'
    ]
  }
});
