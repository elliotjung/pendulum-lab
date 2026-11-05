import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.6',
  summary: [
    '제한된 native run으로 Legendre PCE를 학습하고 다른 LHS 설계의 예측 오차로 surrogate를 평가합니다.',
    'Fit a Legendre PCE from bounded native runs and assess it on a separate LHS validation design.'
  ],
  objectives: [
    [
      '분포와 다항 기저·차수의 관계를 설명한다.',
      'Explain the relationship between input distribution, polynomial basis and degree.'
    ],
    [
      '훈련 적합도와 보지 않은 입력의 예측 오차를 구별한다.',
      'Distinguish training fit from prediction error at held-out inputs.'
    ]
  ],
  assumptions: [
    '독립 균등분포의 단일 g 입력에서 이중진자 마지막 theta1을 학습합니다. native normalized Legendre 기저와 회귀를 재사용합니다. 훈련과 validation은 서로 다른 seed의 LHS 설계이며 겹침을 강제한 자료가 아닙니다. 범위 밖 예측은 지원하지 않습니다.',
    'A single independent uniform gravity input predicts the final double-pendulum theta1. The preserved normalized Legendre basis and regression are reused. Training and validation use different-seed LHS designs. Out-of-domain predictions are not supported.'
  ],
  concepts: [
    {
      id: 'basis-fit',
      title: ['전방 모델을 다항 기저로 압축', 'Compress a forward model into a polynomial basis'],
      body: [
        '입력 g를 기준 구간의 무차원 좌표로 옮기고 해당 균등분포에 맞는 Legendre 기저를 만듭니다. 실제 전방 run의 출력으로 계수를 회귀합니다. 높은 차수는 표본 수·조건수 요구를 키우며 훈련 오차를 줄여도 새 입력 오차가 작아진다는 보장은 없습니다.',
        'Map g into a dimensionless interval and use Legendre basis functions matching its uniform distribution. Regress coefficients using real forward-run outputs. Higher degree increases sample and conditioning demands; a smaller training error need not improve predictions at new inputs.'
      ]
    },
    {
      id: 'held-out-limit',
      title: ['별도 validation과 외삽 한계', 'Held-out validation and extrapolation limits'],
      body: [
        'native 구현은 N개 훈련에 더해 max(8,ceil(N/4))개 별도 검증 run을 수행합니다. RMSE와 최대 오차는 그 표본에서의 오차이며 전체 구간의 상한이 아닙니다. 이 작은 예에서는 비용 절감을 실제 시간 측정으로 주장하지 않고 학습·검증 비용을 함께 표시합니다.',
        'The native implementation adds max(8,ceil(N/4)) validation runs to N training runs. RMSE and maximum error describe those samples and are not bounds over the whole interval. This small example reports both costs without claiming a measured runtime saving.'
      ]
    }
  ],
  equations: [
    {
      id: 'expansion',
      title: ['2차 PCE의 구조', 'Structure of a degree-two PCE'],
      expression: 'yhat = c0 + c1 * psi1 + c2 * psi2',
      explanation: [
        '기저 psi1,psi2는 입력 분포에 대해 정규화된 무차원 Legendre 다항식입니다. 계수는 출력과 같은 각도 단위를 갖고 c0는 상수 기여입니다.',
        'The dimensionless Legendre basis functions psi1 and psi2 are normalized for the input distribution. Coefficients carry the output angle convention, and c0 is the constant contribution.'
      ],
      symbols: [
        ['yhat', 'rad', 'surrogate 출력', 'surrogate output'],
        ['c0', 'rad', '상수 계수', 'constant coefficient'],
        ['c1', 'rad', '1차 계수', 'first-order coefficient'],
        ['c2', 'rad', '2차 계수', 'second-order coefficient'],
        ['psi1', '1', '정규화 1차 기저', 'normalized first-order basis'],
        ['psi2', '1', '정규화 2차 기저', 'normalized second-order basis']
      ]
    },
    {
      id: 'held-out-error',
      title: ['새 입력의 제곱평균오차', 'Root mean square error at new inputs'],
      expression: 'err = sqrt(E2 / N)',
      explanation: [
        'N개 validation 잔차 제곱합 E2를 평균한 뒤 제곱근을 취합니다. rad의 SI 차원은 1이며 err는 원 관측량의 각도 관례를 유지합니다.',
        'Average the validation squared-residual sum E2 over N samples and take its square root. A radian is dimensionless in SI; err retains the observable angle convention.'
      ],
      symbols: [
        ['err', 'rad', 'validation RMSE', 'validation root mean square error'],
        ['E2', '1', 'validation 잔차 제곱합', 'validation squared-residual sum'],
        ['N', '1', 'validation 표본 수', 'validation sample count']
      ]
    }
  ],
  prediction: [
    '기본 훈련 16개로 2차 surrogate를 만들면 validation까지 포함한 실제 전방 run 수를 예측하세요.',
    'Predict the total native forward-run count, including validation, for a degree-two surrogate trained on16 samples.'
  ],
  action: [
    '기본 PCE를 계산하고 held-out 표에서 native·예측·잔차를 확인한 뒤 차수나 범위를 바꾸어 오차를 비교하세요.',
    'Fit the default PCE, inspect native values, predictions and residuals in the held-out table, then change degree or input range.'
  ],
  expected: [
    '기본 설정은 훈련 16개와 별도 validation 8개로 총 24회 전방 계산합니다. 검증 RMSE는 0.01 rad 미만이며 새 입력 표가 8행입니다.',
    'Defaults use16 training and8 separate validation runs for24 forward evaluations. Validation RMSE is below0.01 rad and the held-out table contains8 rows.'
  ],
  explanation: [
    '훈련에 쓰지 않은 입력을 실제 엔진으로 다시 계산해야 surrogate 오차를 독립적으로 관찰할 수 있습니다. 이 유한 validation이 전 영역을 인증하지는 않습니다.',
    'Held-out inputs must be calculated with the real engine to observe surrogate error separately from training fit. This finite validation does not certify the entire domain.'
  ],
  next: [
    '훈련 budget을 늘리면서 오차와 native 평가 횟수를 함께 기록하고 급변 응답 구간에서는 범위를 나누는 설계를 비교하세요.',
    'Increase the training budget while recording errors and native evaluations, and compare partitioned designs near rapidly changing responses.'
  ],
  glossary: [
    ['대리모델', 'Surrogate model'],
    [
      '명시한 입력 분포·구간에서 비싼 모델의 출력을 근사하는 학습 모델입니다.',
      'A trained approximation to expensive model outputs over a specified distribution and domain.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/inverse/uq.ts',
      locator: [
        'runUq의 PCE 훈련·별도 LHS validation·오차 경고',
        'runUq PCE training, separate LHS validation, error metrics and conditioning warnings'
      ]
    },
    {
      path: 'src/research/surrogate.ts',
      locator: [
        '정규화 Legendre 기저와 polynomial chaos 회귀',
        'Preserved normalized Legendre basis and polynomial-chaos regression'
      ]
    }
  ],
  external: {
    title: 'Metamodel-based sensitivity analysis: polynomial chaos expansions and Gaussian processes',
    authors: 'L. Le Gratiet, S. Marelli, B. Sudret',
    url: 'https://sudret.ibk.ethz.ch/publications/preprints-archive/2016-007.html',
    locator: [
      '저자 공개 원고의 PCE 대리모델과 sensitivity 분석 개요',
      'Author-hosted chapter: polynomial-chaos surrogate construction and sensitivity-analysis limitations'
    ]
  },
  checks: [
    {
      prompt: [
        '훈련 R²가 높으면 validation은 생략해도 되나요?',
        'Can held-out validation be omitted when training R² is high?'
      ],
      correct: ['새 입력 오차를 별도로 확인해야 한다.', 'Error at new inputs must be checked separately.'],
      incorrect: ['훈련 R²가 전체 영역 정확도를 보증한다.', 'Training R² guarantees whole-domain accuracy.'],
      explanation: [
        '과적합·ill-conditioning은 높은 훈련 적합도와 공존할 수 있습니다.',
        'Overfitting and ill-conditioning can coexist with a high training fit.'
      ]
    },
    {
      prompt: ['PCE 입력 범위를 벗어나면?', 'What happens outside the PCE input domain?'],
      correct: ['이 도구는 외삽을 거부한다.', 'This tool rejects extrapolation.'],
      incorrect: ['같은 오차 상한으로 예측한다.', 'It predicts with the same error bound.'],
      explanation: [
        '이 모델은 지정한 구간에서만 학습·검증되며 전역 오차 상한을 제공하지 않습니다.',
        'The model is trained and validated only on its specified interval and provides no global error bound.'
      ]
    }
  ]
});
