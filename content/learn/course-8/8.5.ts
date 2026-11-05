import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.5',
  summary: [
    '입력 중력의 불확실한 구간을 실제 전방 run으로 표본화해 끝 각도에 대한 1차·총효과 지수를 계산합니다.',
    'Sample uncertain gravity with real forward runs and compute first-order and total-effect indices for the final angle.'
  ],
  objectives: [
    ['분산 분해와 독립 입력 가정을 설명한다.', 'Explain variance decomposition and independent-input assumptions.'],
    [
      '지수의 유한 표본 오차와 출력·기간 의존성을 확인한다.',
      'Inspect finite-sample index error and dependence on output and horizon.'
    ]
  ],
  assumptions: [
    'g는 기준값±반폭 구간의 독립 균등 입력이고 관측량은 이중진자의 마지막 theta1(rad)입니다. 기간·초기조건·RK4는 고정합니다. 한 입력 예이므로 상호작용을 직접 측정하지 않습니다. native Sobol 설계열은 고정되어 seed 번호로 무작위화되지 않습니다.',
    'Gravity is a uniform input on baseline±half-range and the output is the final double-pendulum theta1 in rad. Horizon, initial conditions and RK4 remain fixed. This one-input example does not measure interactions directly. The native Sobol design sequence is fixed and is not randomized by the seed number.'
  ],
  concepts: [
    {
      id: 'variance-decomposition',
      title: ['출력 분산을 나누는 질문', 'Partitioning output variance'],
      body: [
        '매개변수 g를 바꿀 때 선택한 끝 각도가 얼마나 변하는지 실제 native run으로 평가합니다. 1차 지수는 한 입력만으로 설명되는 분산이고 총효과는 그 입력이 참여하는 상호작용까지 포함합니다. 단일 입력이고 분산이 양수인 이상적인 경우 두 지수는 1입니다.',
        'Real native runs evaluate how much the selected final angle changes with g. A first-order index measures variance attributable to that input alone; a total-effect index also includes interactions involving it. In the ideal positive-variance single-input case both indices equal one.'
      ]
    },
    {
      id: 'finite-sample-failure',
      title: ['작은 설계의 실패·오판', 'Finite-design failure and misinterpretation'],
      body: [
        '표본 수 N에 대해 이 단일 입력 native 설계는 3N번 전방 계산합니다. 유한 설계로 얻은 지수는 0..1을 벗어날 수 있어 잘라서 숨기지 않습니다. 출력 분산 0에서는 지수를 정의할 수 없습니다. 다른 출력·관찰 기간·입력 범위는 다른 민감도 문제입니다.',
        'This one-input native design uses3N forward evaluations for base size N. Finite-design indices can lie outside0..1 and are not clipped. Indices are undefined for zero output variance. Changing the output, horizon or input range defines a different sensitivity problem.'
      ]
    }
  ],
  equations: [
    {
      id: 'first-order',
      title: ['1차 분산 비율', 'First-order variance ratio'],
      expression: 'S = Vi / V',
      explanation: [
        '전체 출력 분산 V 중 입력 하나의 조건부 평균 변동 Vi가 차지하는 비율입니다. 분자와 분모가 같은 단위여서 지수는 무차원입니다.',
        'Divide the variance Vi of a single-input conditional mean by total output variance V. Matching numerator and denominator units make the index dimensionless.'
      ],
      symbols: [
        ['S', '1', '1차 Sobol 지수', 'first-order Sobol index'],
        ['Vi', '1', '조건부 평균의 분산', 'variance of the conditional mean'],
        ['V', '1', '전체 출력 분산', 'total output variance']
      ]
    },
    {
      id: 'total-effect',
      title: ['총효과의 보완 분산', 'Complementary variance for total effect'],
      expression: 'ST = 1 - Vrest / V',
      explanation: [
        '나머지 입력만으로 설명되는 분산 Vrest를 전체 분산에서 제외하면 해당 입력이 포함되는 총효과가 남습니다. 독립 입력과 양의 V가 전제입니다.',
        'Removing variance Vrest explained by the remaining inputs leaves the total contribution involving the selected input. Independent inputs and positive V are required.'
      ],
      symbols: [
        ['ST', '1', '총효과 Sobol 지수', 'total-effect Sobol index'],
        ['Vrest', '1', '나머지 입력 조건부 평균 분산', 'variance of the remaining-input conditional mean'],
        ['V', '1', '전체 출력 분산', 'total output variance']
      ]
    }
  ],
  prediction: [
    '기본 N=16 표본에서 단일 입력 g를 평가할 때 실제 native 전방 run이 몇 번 필요한지 예측하세요.',
    'Predict the number of native forward runs required for the single input g at the default base sample size N=16.'
  ],
  action: [
    '기본 표본 수로 Sobol 분석을 실행하고 평가 횟수와 두 지수를 확인한 뒤 표본 수를 늘려 비교하세요.',
    'Run Sobol analysis at the default sample count, inspect evaluations and both indices, then increase the sample count for comparison.'
  ],
  expected: [
    'N=16에서 실제 전방 평가는 48회입니다. 지수는 유한하며 0..1로 강제 절삭하지 않습니다. 결과에는 분포·기간·표본 한계가 남습니다.',
    'N=16 performs48 actual forward evaluations. Indices are finite and not forcibly clipped to0..1; distribution, horizon and sample limitations remain explicit.'
  ],
  explanation: [
    'native 단일 입력 표본 설계의 비용은 N(2+d)이고 d=1입니다. 지수의 이상적 값과 작은 결정론적 설계의 추정값을 구분해야 합니다.',
    'The native design costs N(2+d) with d=1. Distinguish an ideal index from its estimate using a small deterministic design.'
  ],
  next: [
    '두 입력으로 확장해 총효과−1차 효과의 차이를 조사하고 표본 수·출력·분포에 대한 수렴을 확인하세요.',
    'Extend to two inputs to inspect total-minus-first-order effects and test convergence with sample size, observable and distribution.'
  ],
  glossary: [
    ['총효과 지수', 'Total-effect index'],
    [
      '선택 입력 자체와 그 입력이 포함된 상호작용의 분산 기여를 합한 무차원 지수입니다.',
      'A dimensionless variance contribution including the selected input and interactions involving it.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/inverse/uq.ts',
      locator: [
        'runUq의 실제 전방 평가와 zero-variance 거부',
        'runUq native forward evaluations, variance assumptions and zero-variance refusal'
      ]
    },
    {
      path: 'src/research/sobolSensitivity.ts',
      locator: [
        'sobolIndices의 원래 표본 설계·지수 추정',
        'sobolIndices preserved sampling design and first/total-effect estimators'
      ]
    }
  ],
  external: {
    title: 'Variance based sensitivity analysis of model output. Design and estimator for the total sensitivity index',
    authors: 'A. Saltelli et al.',
    url: 'https://doi.org/10.1016/j.cpc.2009.09.018',
    locator: [
      'Computer Physics Communications181,259–270의 분산 기반 1차·총효과 정의',
      'Computer Physics Communications181,259–270: variance-based first-order and total-effect indices'
    ]
  },
  checks: [
    {
      prompt: ['지수가 1보다 약간 크면?', 'What if a finite-design index slightly exceeds one?'],
      correct: [
        '유한 표본 오차를 확인하고 표본을 늘린다.',
        'Inspect finite-sample error and increase the design size.'
      ],
      incorrect: ['자동으로 1로 잘라서 정확성을 보장한다.', 'Clip it to one to guarantee accuracy.'],
      explanation: [
        '강제 절삭은 추정 오차를 숨기며 수렴 검사를 대체하지 않습니다.',
        'Clipping hides estimation error and does not replace convergence checks.'
      ]
    },
    {
      prompt: ['출력 분산이 0이면 지수는?', 'What if output variance is zero?'],
      correct: ['정의할 수 없어 명시적으로 거부한다.', 'It is undefined and must be explicitly refused.'],
      incorrect: ['모든 입력이 정확히 중요도 0이다.', 'Every input has exactly zero importance.'],
      explanation: [
        '분산 비율의 분모가 0이므로 일반 Sobol 지수는 정의되지 않습니다.',
        'The denominator of the variance ratio is zero, so the usual Sobol index is undefined.'
      ]
    }
  ]
});
