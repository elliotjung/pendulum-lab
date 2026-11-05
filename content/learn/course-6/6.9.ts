import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.9',
  summary: [
    '복소 승수쌍이 단위원을 지나면 닫힌 불변 곡선이 반드시 생길까요? NS 후보와 실제 collocation 원의 잔차를 비교합니다.',
    'Must a closed invariant curve appear when a complex pair crosses the unit circle? Compare an NS candidate with actual collocation-curve residuals.'
  ],
  objectives: [
    [
      '복소 승수쌍 통과와 강공명·비퇴화 전제를 설명합니다.',
      'Explain complex-pair crossing, strong resonance and nondegeneracy conditions.'
    ],
    [
      '불변 원의 비영 진폭과 off-grid 잔차를 함께 확인합니다.',
      'Check both nonzero invariant-circle amplitude and off-grid invariance residuals.'
    ]
  ],
  assumptions: [
    '독립 무차원 delayed-logistic 맵 (x,y)→(a*x*(1−y),x)입니다. 물리 구동 진자의 torus가 아닙니다. 고정점의 NS 기준은 a=2이며 공용 native collocation을 사용합니다.',
    'Use the independent dimensionless delayed-logistic map (x,y)→(a*x*(1−y),x). This is not a torus of the physical pendulum. The fixed-point NS benchmark occurs at a=2; invariant curves use shared native collocation.'
  ],
  concepts: [
    {
      id: 'crossing',
      title: ['복소쌍의 단위원 통과', 'Complex-pair unit-circle crossing'],
      body: [
        '비영 고정점은 x=y=(a−1)/a입니다. 여기서 trace는1이고 determinant는 a−1이므로 복소 승수의 절댓값이 sqrt(a−1)입니다. a=2에서1을 통과하지만 원의 생성과 안정성에는 비퇴화 계수와 강공명 배제가 추가로 필요합니다.',
        'The nonzero fixed point is x=y=(a−1)/a. Its trace is one and determinant a−1, giving complex-pair modulus sqrt(a−1). The pair crosses one at a=2, while curve birth and stability require nondegeneracy and exclusion of strong resonances.'
      ]
    },
    {
      id: 'circle',
      title: ['닫힌 그림과 불변 원의 차이', 'Closed pictures versus invariant curves'],
      body: [
        '공용 collocation은 곡선과 회전수를 함께 보정하고 별도 점에서 맵 불변 잔차를 확인합니다. 중심으로 붕괴한 작은 곡선은 Newton이 수렴해도 불변 원으로 승인하지 않습니다. 유한 Fourier 표현·허용치·off-grid 검사의 영향을 표시합니다.',
        'Shared collocation corrects a curve and rotation number together and checks invariance at independent points. A curve collapsed onto its center is rejected despite Newton convergence. Finite representation, tolerance and off-grid error remain explicit.'
      ]
    }
  ],
  equations: [
    {
      id: 'fixed',
      title: ['1. 비영 고정점', '1. Nonzero fixed point'],
      expression: 'center = (parameter-1)/parameter',
      explanation: [
        'x=y를 고정점 방정식에 넣고 비영 x로 나누어 얻습니다. 모든 좌표는 무차원입니다.',
        'Set x=y in the fixed-point equation and divide by nonzero x. All coordinates are dimensionless.'
      ],
      symbols: [
        ['center', '1', '고정점의 각 좌표', 'Each fixed-point coordinate'],
        ['parameter', '1', '맵 매개변수 a', 'Map parameter a']
      ]
    },
    {
      id: 'radius',
      title: ['2. 복소 승수 반경', '2. Complex multiplier radius'],
      expression: 'multiplierRadius = sqrt(parameter-1)',
      explanation: [
        '복소 켤레쌍의 곱은 determinant=a−1입니다. 복소쌍 구간에서만 이 반경 해석을 사용합니다.',
        'The conjugate-pair product is determinant=a−1. Interpret this radius only in the complex-pair regime.'
      ],
      symbols: [
        ['multiplierRadius', '1', '복소쌍 절댓값', 'Complex-pair modulus'],
        ['parameter', '1', '매개변수 a', 'Parameter a']
      ]
    }
  ],
  checks: [
    {
      prompt: ['복소 승수의 절댓값1만으로 충분한가요?', 'Is complex modulus one sufficient for an NS conclusion?'],
      correct: ['횡단·비퇴화·공명 조건을 더 검사합니다.', 'Also check transversality, nondegeneracy and resonance.'],
      incorrect: ['모든 경우 같은 안정 torus가 존재합니다.', 'The same stable torus exists in every case.'],
      explanation: [
        '선형 임계조건은 비선형 생성과 안정성을 모두 정하지 않습니다.',
        'A linear threshold does not determine all nonlinear existence and stability.'
      ]
    },
    {
      prompt: ['곡선 진폭이0에 붕괴하면?', 'What if the curve amplitude collapses to zero?'],
      correct: [
        '중심 고정점으로의 붕괴를 원 성공으로 승인하지 않습니다.',
        'Do not accept collapse to the fixed point as curve success.'
      ],
      incorrect: ['잔차만 작으면 완전한 불변 원입니다.', 'Any small residual gives a complete invariant circle.'],
      explanation: [
        '상수 곡선도 형식적인 불변식에 맞을 수 있습니다.',
        'A constant curve can satisfy a formal invariance relation.'
      ]
    }
  ],
  prediction: [
    'a를2 아래에서 위로 바꾸면 고정점 반경과 실제 원의 비영 진폭은 어떤 순서로 확인해야 할까요?',
    'As a passes from below two to above two, in what order should fixed-point radius and nonzero curve amplitude be verified?'
  ],
  action: [
    'NS branch와 두 실제 collocation 원을 실행합니다. endParameter와 circleParameter를 각각 바꾸며 승수 반경·원 진폭·off-grid 잔차를 확인합니다.',
    'Run the NS branch and two actual collocation circles. Change endParameter and circleParameter separately and inspect radius, amplitude and off-grid residuals.'
  ],
  expected: [
    '비영 고정점의 반경은 a=2에서1을 지납니다. 기본 a2.03 부근의 원은 비영 진폭과 작은 잔차를 동시에 만족하는지 공용 결과가 판정합니다.',
    'The nonzero fixed-point radius crosses one at a=2. Near the default a2.03, the shared result checks both nonzero curve amplitude and small residuals.'
  ],
  explanation: [
    '단위원 교차 후보와 불변 곡선의 별도 보정 증거가 함께 있어야 닫힌 그림의 해석을 뒷받침합니다.',
    'A unit-circle crossing candidate and separately corrected invariant-curve evidence together support interpretation of the closed geometry.'
  ],
  next: [
    '6.10에서는 원 위 회전수가 유리수에 잠기는 plateaus를 여러 결합 강도에서 비교합니다.',
    'In6.10, compare rational rotation-number plateaus at several circle-map couplings.'
  ],
  glossary: [
    ['불변 원 잔차', 'Invariant-circle residual'],
    [
      '매개변수 곡선의 맵 이미지와 회전시킨 같은 곡선의 차이입니다.',
      'The difference between a parameterized curve mapped forward and the same curve shifted by its rotation.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/stability/native-benchmarks.ts',
      locator: [
        'delayed-logistic 고정점과 NS·torus 결과의 비영 진폭·off-grid 검사를 확인합니다.',
        'Check delayed-logistic fixed points and nonzero-amplitude/off-grid checks in NS and torus results.'
      ]
    },
    {
      path: 'src/chaos/neimarkSacker.ts',
      locator: [
        'continueNeimarkSackerTorus와 실제 collocation 곡선의 보존을 확인합니다.',
        'Inspect continueNeimarkSackerTorus and preservation of actual collocation curves.'
      ]
    }
  ],
  external: {
    title: 'Neimark-Sacker bifurcation',
    authors: 'Yuri A. Kuznetsov and Robert J. Sacker',
    url: 'https://www.scholarpedia.org/article/Neimark-Sacker_bifurcation',
    locator: [
      '정규형·강공명 배제·비퇴화 조건과 불변 원의 생성 설명을 대조합니다.',
      'Compare normal-form, nondegeneracy and strong-resonance conditions for invariant-curve birth.'
    ]
  }
});
