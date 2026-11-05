import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.10',
  summary: [
    '회전수가 유리수에 가까운 한 점과 폭 있는 locking plateau는 어떻게 다를까요? 세 결합 절단면의 실제 원형 맵을 비교합니다.',
    'How does one near-rational rotation estimate differ from a finite-width locking plateau? Compare actual circle maps at three coupling slices.'
  ],
  objectives: [
    ['lift의 누적 이동에서 회전수를 정의합니다.', 'Define rotation number through accumulated motion of a lift.'],
    [
      '유한 반복·주파수 격자·결합 세기에 따른 잠금 후보를 비교합니다.',
      'Compare locking candidates across iteration budgets, frequency grids and coupling strengths.'
    ]
  ],
  assumptions: [
    '독립 sine-circle lift이며 x는 turn 단위의 무차원 좌표입니다. K≤1에서 비교합니다. 구동 진자의 물리 theta·시간과 같은 상태가 아닙니다.',
    'Use an independent sine-circle lift with x in dimensionless turns and K≤1. This is a separate state from the physical pendulum angle and time.'
  ],
  concepts: [
    {
      id: 'lift-concept',
      title: ['원 좌표를 풀어 누적 이동 측정', 'Unwrap the circle to measure accumulated motion'],
      body: [
        '원 위 위치만 보면 한 바퀴 이동을 잃습니다. lift는 회전수를 보존하며 긴 반복의 평균 이동량을 계산하게 합니다. 공용 scanModeLocking은 과도 반복을 제거하고 유리수 근처의 연속 매개변수 표본 구간을 반환합니다.',
        'Circle positions alone lose full turns. A lift preserves accumulated rotation and allows a long-iteration mean displacement. Shared scanModeLocking discards transients and returns contiguous parameter samples near specified rationals.'
      ]
    },
    {
      id: 'tongues',
      title: ['절단면과 tongue 폭의 한계', 'Slices and tongue-width limitations'],
      body: [
        'K=0에서는 회전수가 입력 주파수와 같습니다. 양의 K에서 plateau 후보가 생길 수 있으며 여러 K의 절단면은 tongue이 자라는 모양을 보여 줍니다. 단일 유리수 근접점은 폭 있는 영역의 증거가 아니고 유한 반복 편향은 대략1/N 척도이므로 격자와 반복을 함께 바꿉니다.',
        'At K=0, rotation equals input frequency. Positive coupling can produce plateau candidates; multiple K slices reveal tongue growth. One near-rational point does not establish finite width. Finite-iteration bias has an approximate1/N scale, requiring both iteration and grid refinement.'
      ]
    }
  ],
  equations: [
    {
      id: 'lift',
      title: ['1. lift의 이동', '1. Lift displacement'],
      expression: 'nextPosition = position+frequency-coupling*sin(2*pi*position)/(2*pi)',
      explanation: [
        '각도 대신 turn 좌표이므로 사인 인수에2pi를 곱합니다. 모든 변수는 무차원이며 lift를 매번 wrapping하지 않습니다.',
        'Turn coordinates require2pi in the sine argument. All variables are dimensionless and the lift is not wrapped at each iteration.'
      ],
      symbols: [
        ['nextPosition', '1', '다음 lift 위치', 'Next lift position'],
        ['position', '1', '현재 lift 위치', 'Current lift position'],
        ['frequency', '1', '반복당 입력 회전수', 'Input turns per iteration'],
        ['coupling', '1', '결합 K', 'Coupling K'],
        ['pi', '1', '원주율', 'Pi']
      ]
    },
    {
      id: 'rotation',
      title: ['2. 유한 회전수', '2. Finite rotation estimate'],
      expression: 'rotation = (finalPosition-startPosition)/iterations',
      explanation: [
        '과도구간 뒤 누적 이동을 측정 반복 수로 나눕니다. 그 극한이 존재할 때 회전수로 해석합니다.',
        'Divide post-transient accumulated displacement by measured iterations. Interpret its limit as rotation number when that limit exists.'
      ],
      symbols: [
        ['rotation', '1', '유한 회전수 추정', 'Finite rotation estimate'],
        ['finalPosition', '1', '측정 끝 lift', 'Final measured lift'],
        ['startPosition', '1', '측정 시작 lift', 'Initial measured lift'],
        ['iterations', '1', '측정 반복 수', 'Measurement iterations']
      ]
    }
  ],
  checks: [
    {
      prompt: ['한 주파수에서 rho≈1/2면 tongue 폭이 있나요?', 'Does rho≈1/2 at one frequency establish tongue width?'],
      correct: ['인접 주파수와 수렴 검사가 필요합니다.', 'Neighboring frequencies and convergence checks are needed.'],
      incorrect: ['한 점으로 열린 잠금 영역이 증명됩니다.', 'One point proves an open locking region.'],
      explanation: [
        '단일 유리수 근접과 매개변수 구간의 plateau는 다릅니다.',
        'A single near-rational estimate differs from a plateau across an interval.'
      ]
    },
    {
      prompt: ['K=0에서 회전수는?', 'What is the rotation number when K=0?'],
      correct: ['입력 frequency와 같습니다.', 'It equals the input frequency.'],
      incorrect: ['항상0입니다.', 'It is always zero.'],
      explanation: ['lift가 반복마다 frequency만큼 증가합니다.', 'The lift increases by frequency on each iteration.']
    }
  ],
  prediction: [
    'K를0에서 키우면 같은 주파수 범위의 곡선과1/2 근처 plateau 후보는 어떻게 달라질까요?',
    'How do the curve and near-one-half plateau candidates change as K increases from zero?'
  ],
  action: [
    'K0,K/2,K의 세 실제 회전수 곡선을 실행합니다. coupling과 iterations를 바꾸어 같은 구간의 수렴·평탄부를 대조합니다.',
    'Run the three actual rotation curves at K0,K/2,K. Change coupling and iterations and compare convergence and flat regions over the same range.'
  ],
  expected: [
    'K0 곡선은 rho=frequency 직선입니다. 결합 곡선에서 평탄 후보를 읽되 단일 표본과 유한 반복 오차를 폭으로 해석하지 않습니다.',
    'The K0 curve follows rho=frequency. Read flat candidates in coupled curves without interpreting a single sample or finite-iteration error as plateau width.'
  ],
  explanation: [
    '여러 결합 절단면은 실제 native 반복을 비교하지만 완전한2차원 연속 경계 추적은 아닙니다.',
    'Multiple coupling slices compare actual native iterations but do not trace complete continuous boundaries in two parameters.'
  ],
  next: [
    '6.11에서는 두 매개변수 지도와 국소 정규형의 분기곡선이 주는 서로 다른 정보를 비교합니다.',
    'In6.11, compare the different information provided by a two-parameter map and local normal-form bifurcation curves.'
  ],
  glossary: [
    ['회전수 plateau', 'Rotation-number plateau'],
    [
      '입력 주파수가 변해도 평균 회전수가 같은 유리수 부근에 유지되는 매개변수 구간입니다.',
      'A parameter interval where mean rotation remains near the same rational despite changing input frequency.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/arnoldTongue.ts',
      locator: [
        'sineCircleMap과 scanModeLocking의 lift·구간·유한 반복 전제를 확인합니다.',
        'Check lift conventions, intervals and finite-iteration assumptions in sineCircleMap and scanModeLocking.'
      ]
    },
    {
      path: 'src/product/adapters/analysis/stability/native-benchmarks.ts',
      locator: [
        '원형 맵 절단면의 실제 반복·과도구간·해상도 기록을 확인합니다.',
        'Inspect actual circle-map iterations, transients and slice resolution metadata.'
      ]
    }
  ],
  external: {
    title: 'Pinched Arnol’d tongues for Families of circle maps',
    authors: 'Philip L. Boyland',
    url: 'https://arxiv.org/html/2506.02988v1',
    locator: [
      'Introduction과2.1–2.2의 표준 lift·회전수·잠금 구간을 대조합니다. 본 실험의 음의 sine 부호는 반 주기 좌표 이동과 동등합니다.',
      'Compare Introduction and Sections2.1–2.2 for standard lifts, rotation numbers and locking intervals. The negative sine convention is conjugate by a half-turn shift.'
    ]
  }
});
