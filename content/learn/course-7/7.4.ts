import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.4',
  summary: [
    '많은 위상의 정렬을 수 하나로 요약하면 무엇을 잃을까요? 동일 seed의 유한 네트워크에서 결합과 고유주파수 폭에 따른 R을 비교합니다.',
    'What is lost when many phases are summarized by one number? Compare coupling and frequency spread through R on the same seeded finite network.'
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
    '16개 위상, 대칭 완전 그래프, 이웃 가중치 합으로 정규화한 결합, 위상 지연0입니다. R은 무차원이고 주파수는rad/s입니다. 고유주파수 표본과 seed를 저장합니다.',
    'Sixteen phases use a symmetric complete graph, neighbor-weight normalized coupling and zero phase lag. R is dimensionless and frequencies are rad/s. Frequency samples and seed are retained.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '각 위상을 단위원의 복소수로 바꾸어 평균하면 방향과 길이를 얻습니다. 실수부는 cos의 평균, 허수부는 sin의 평균이며 길이 R은0~1입니다. 평균 위상이 같아도 클러스터 분포는 다를 수 있습니다.',
        'Map each phase to the unit circle and average the complex values. The real and imaginary parts are mean cosine and sine; the magnitude R lies in[0,1]. Different cluster distributions can share the same mean phase.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '선택한 K의 시간 변화와 K=0,K/2,K,2K의 후반 평균 R을 실제로 계산합니다. 같은 seed를 써 초기조건을 고정하므로 결합 변화와 초기조건 변화를 구분할 수 있습니다.',
        'Compute the time trace at the selected K and actual late-time mean R at0,K/2,K,2K. Reusing the seed holds initial conditions fixed and separates coupling changes from initial-condition changes.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        'N=16의 짧은 기록에서 비영 R은 자명한 표본 변동일 수도 있습니다. 이웃합 정규화는 self 항을 포함한 K/N 규약과 같지 않습니다. 이 scan을 무한집단 임계 결합의 인증값으로 해석하지 않습니다.',
        'A nonzero R in a short N=16 record may reflect finite-sample variation. Neighbor-sum normalization differs from K/N with a self term. This scan does not certify the infinite-population critical coupling.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'realMean = sumCos/count',
      explanation: [
        '단위원 벡터의 실수 성분을 평균합니다. count는 실제 노드 수이며 모든 항은 무차원입니다.',
        'Average real components of unit-circle vectors. Count is the actual node count and every quantity is dimensionless.'
      ],
      symbols: [
        ['realMean', '1', '평균 실수부', 'Mean real component'],
        ['sumCos', '1', 'cos 위상의 합', 'Sum of phase cosines'],
        ['count', '1', '위상 수', 'Phase count']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'order = sqrt(realMean^2+imagMean^2)',
      explanation: [
        '평균 복소수의 절댓값이 전역 질서매개변수입니다. R=1은 순간 완전 정렬을 뜻하며 주파수 잠금의 충분한 시간 증거와 구분합니다.',
        'The magnitude of the mean complex value gives global order. R=1 means instantaneous alignment and is distinct from sufficient temporal evidence for frequency locking.'
      ],
      symbols: [
        ['order', '1', '전역 R', 'Global R'],
        ['realMean', '1', '평균 실수부', 'Mean real part'],
        ['imagMean', '1', '평균 허수부', 'Mean imaginary part']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '큰 R 하나만으로 무한집단 임계 동기화를 증명할 수 있나요?',
        'Can one large R prove infinite-population critical synchronization?'
      ],
      correct: [
        '유한 크기·시간·정규화·분포를 함께 확인합니다.',
        'Finite size, time, normalization and distribution remain necessary.'
      ],
      incorrect: ['R이0보다 크면 이미 임계점 위입니다.', 'Any positive R means the critical point has been crossed.'],
      explanation: [
        '질서매개변수는 특정 위상 분포의 요약이므로 그 통계와 동역학을 함께 읽습니다.',
        'The order parameter summarizes a phase distribution, so its statistics and dynamics must be read together.'
      ]
    },
    {
      prompt: ['7.4의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.4 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        'N=16의 짧은 기록에서 비영 R은 자명한 표본 변동일 수도 있습니다. 이웃합 정규화는 self 항을 포함한 K/N 규약과 같지 않습니다. 이 scan을 무한집단 임계 결합의 인증값으로 해석하지 않습니다.',
        'A nonzero R in a short N=16 record may reflect finite-sample variation. Neighbor-sum normalization differs from K/N with a self term. This scan does not certify the infinite-population critical coupling.'
      ]
    }
  ],
  prediction: [
    '고유주파수 폭을0으로 줄이면 같은 K에서 정렬이 쉬워질지 예상하세요.',
    'Predict whether zero frequency spread makes alignment easier at fixed K.'
  ],
  action: [
    'spread를1과0에서 실행하고 같은 seed scan을 비교한 뒤 seed만 바꾸세요.',
    'Compare spread1 and0 using the same seeded scan, then change only the seed.'
  ],
  expected: [
    '각 R과 후반 평균은0~1 범위이며 같은 seed·설정·버전의 결과는 정확히 반복됩니다.',
    'Each R and late-time mean lies in[0,1], and identical seed, settings and version reproduce the result exactly.'
  ],
  explanation: [
    '질서매개변수는 특정 위상 분포의 요약이므로 그 통계와 동역학을 함께 읽습니다.',
    'The order parameter summarizes a phase distribution, so its statistics and dynamics must be read together.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['질서매개변수', 'Order parameter'],
    ['단위원에 놓은 위상 벡터 평균의 길이입니다.', 'Magnitude of the mean phase vector on the unit circle.']
  ],
  sources: [
    {
      path: 'src/physics/kuramoto.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/kuramoto.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/network-schema.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/network-schema.ts.'
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
    title: 'Chimera States for Coupled Oscillators',
    authors: 'D. M. Abrams, S. H. Strogatz',
    url: 'https://arxiv.org/abs/nlin/0407045',
    locator: [
      '위상 발진기와 국소·전역 정렬의 정의 및 유한 모형의 차이를 대조합니다.',
      'The author paper supplies phase-oscillator and coherence context; finite native normalization is checked against source.'
    ]
  }
});
