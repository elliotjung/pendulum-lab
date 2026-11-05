import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.5',
  summary: [
    '전역 R이 작아도 한 구간만 정렬될 수 있을까요? 비국소 고리의 공간 순서를 유지하며 순간 local coherence와 분류를 관찰합니다.',
    'Can one region remain coherent when global R is small? Preserve spatial ring order while observing local coherence and instantaneous classification.'
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
    '32개 동일 주파수의 위상만 포함한 비국소 고리입니다. 반경은양쪽 이웃 수이고 phaseLag는rad입니다. Native midpoint RK2와 매 단계 wrapping을 그대로 사용합니다.',
    'A nonlocal ring has32 phase oscillators with identical frequency. Radius counts neighbors on each side and phaseLag is in radians. Native midpoint RK2 and per-step wrapping are preserved.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '전역 복소 평균 대신 각 노드의 이웃만 평균하면 국소 coherence를 얻습니다. 공간적 ringOrder를 보존해야 같은 인접 영역을 비교할 수 있습니다. 위상 지연은 결합의 홀대칭을 바꾸어 단순한 완전 정렬 이외의 패턴을 허용합니다.',
        'Averaging only neighboring unit vectors gives local coherence. Ring order must be retained to compare the same spatial neighborhood. Phase lag changes the coupling symmetry and permits patterns beyond complete alignment.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '처음과 끝의 국소 R 프로필, 전역 R·평균 국소 R·native 순간 분류표를 비교합니다. 위상 지연과 반경을 한 번에 하나씩 바꾸어 구조의 공간적 이동과 정렬 범위를 관찰합니다.',
        'Compare initial and final local-R profiles with the table of global R, mean local R and native instantaneous classifications. Vary phase lag and radius separately to observe spatial changes in coherence.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        'chimera-candidate는 이 표본·크기·시각의 분류입니다. 안정한 chimera의 존재를 증명하지 않습니다. 장시간 지속성·다른 초기조건·노드 수·반경과 시간 간격 수렴을 확인해야 합니다.',
        'Chimera-candidate is a classification at the sampled size and instant, not a proof of a stable chimera. Persistence, other initial conditions, system size, radius and step convergence must be checked.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'localOrder = sqrt(sumCos^2+sumSin^2)/neighbors',
      explanation: [
        '이웃 위상 벡터의 합을 이웃 수로 나눈 길이입니다. 단위 가중치 비국소 고리의 정의이며 고립 노드는별도 규약을 따릅니다.',
        'This is the magnitude of neighboring unit-vector sum divided by neighbor count for the unit-weight nonlocal ring; isolated nodes use a separate convention.'
      ],
      symbols: [
        ['localOrder', '1', '국소 R', 'Local order'],
        ['sumCos', '1', '이웃 cos 합', 'Neighbor cosine sum'],
        ['sumSin', '1', '이웃 sin 합', 'Neighbor sine sum'],
        ['neighbors', '1', '이웃 수', 'Neighbor count']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'contrast = maxLocal-minLocal',
      explanation: [
        '국소 정렬의 공간적 차이를 요약합니다. 최대·최소 차이만으로 chimera를 판정하지 않습니다.',
        'The range summarizes spatial variation of local alignment, without providing a chimera classification on its own.'
      ],
      symbols: [
        ['contrast', '1', '국소 정렬 범위', 'Local-order range'],
        ['maxLocal', '1', '최대 국소 R', 'Maximum local R'],
        ['minLocal', '1', '최소 국소 R', 'Minimum local R']
      ]
    }
  ],
  checks: [
    {
      prompt: ['순간 candidate 표시는 안정성 증명인가요?', 'Does an instantaneous candidate label prove stability?'],
      correct: [
        '시간·크기·교란에 대한 지속성을 추가 검사합니다.',
        'Persistence under time, size and perturbation changes needs testing.'
      ],
      incorrect: ['한 프레임이면 충분합니다.', 'One frame is sufficient.'],
      explanation: [
        '국소 정렬은 전역 평균에 숨은 공간 정보를 제공하지만 시간 안정성을 대신하지 않습니다.',
        'Local coherence reveals spatial information hidden by the global average, while leaving temporal stability unresolved.'
      ]
    },
    {
      prompt: ['7.5의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.5 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        'chimera-candidate는 이 표본·크기·시각의 분류입니다. 안정한 chimera의 존재를 증명하지 않습니다. 장시간 지속성·다른 초기조건·노드 수·반경과 시간 간격 수렴을 확인해야 합니다.',
        'Chimera-candidate is a classification at the sampled size and instant, not a proof of a stable chimera. Persistence, other initial conditions, system size, radius and step convergence must be checked.'
      ]
    }
  ],
  prediction: [
    '반경을4에서5로 바꾸면 어느 노드가 이웃 평균에 새로 들어갈지 예상하세요.',
    'Predict which nodes enter the neighborhood average when radius rises from4 to5.'
  ],
  action: [
    '반경과 phaseLag를 각각 바꾸고 공간 프로필·전역/국소 R·분류표를 비교하세요.',
    'Vary radius and phaseLag separately and compare spatial profiles, global/local R and classification tables.'
  ],
  expected: [
    '모든 local coherence는0~1 범위이며 공간 index가 동일한 stable 노드를 가리킵니다. 순간 분류가 계속 candidate일 필요는 없습니다.',
    'All local coherence lies in[0,1], and each spatial index keeps the same stable node identity. The classification need not remain candidate.'
  ],
  explanation: [
    '국소 정렬은 전역 평균에 숨은 공간 정보를 제공하지만 시간 안정성을 대신하지 않습니다.',
    'Local coherence reveals spatial information hidden by the global average, while leaving temporal stability unresolved.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['chimera 후보', 'Chimera candidate'],
    [
      '정렬과 비정렬 영역이 함께 보이는 유한 표본의 순간 진단입니다.',
      'An instantaneous finite-sample diagnosis showing coherent and incoherent regions together.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/chimera.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/chaos/chimera.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/network.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/network.ts.'
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
      '원 논문의 비국소 위상 고리와 정렬·drift 공존을 대조하되 native 유한 top-hat 고리와 구별합니다.',
      'Checked the author paper’s nonlocal phase ring and coexistence of locking and drift, separately from the finite native top-hat ring.'
    ]
  }
});
