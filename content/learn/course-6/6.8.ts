import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.8',
  summary: [
    '주기1 궤도의 승수가−1을 지나면 실제 반환값은 어떻게 갈라질까요? 공용 shooting·가지 전환·유한 cascade 스캔을 연결합니다.',
    'How do return values split when a period-one multiplier crosses−1? Connect shared shooting, branch switching and a finite cascade scan.'
  ],
  objectives: [
    [
      '−1 승수 통과와 원시 주기2의 검증 조건을 연결합니다.',
      'Connect a−1 multiplier crossing with verification of primitive period two.'
    ],
    [
      '후속 배가 후보 구간과 유한 관찰 편향을 평가합니다.',
      'Assess successive doubling brackets and finite-observation bias.'
    ]
  ],
  assumptions: [
    '고전 gamma0.5,Omega2/3 구동 진자입니다. 같은128구동주기 과도구간 뒤16개 strobe를 기록합니다. 별도 P^1/P^2/P^4 Newton의 요청 주기와 원시 주기를 구별합니다.',
    'Use the classic damped driven pendulum with gamma0.5 and Omega2/3. Retain16 strobes after128 forcing periods. Distinguish requested P^1/P^2/P^4 Newton multiplicity from primitive period.'
  ],
  concepts: [
    {
      id: 'flip',
      title: ['−1 방향과 두 주기', 'The−1 direction and two periods'],
      body: [
        '음의 승수는 반환할 때 교란 방향이 뒤집힘을 뜻합니다. 절댓값이1을 넘어가는 국소 flip 근처에서 고유벡터 seed를 사용하면 P^2의 다른 해를 찾을 수 있습니다. P의 해도 P^2를 만족하므로 공용 native switch는 잔차와 cycle 분리를 함께 검사합니다.',
        'A negative multiplier reverses perturbation direction on each return. Near a local flip beyond modulus one, an eigenvector seed can find another P^2 solution. Since a P fixed point also satisfies P^2, native switching checks residual and cycle separation together.'
      ]
    },
    {
      id: 'cascade',
      title: ['후속 배가와 관찰 한계', 'Successive doubling and observation limits'],
      body: [
        '같은 과도구간·관찰수로 구동 진폭을 스캔하고 서로 다른 반환값 수의 배가 후보를 찾습니다. 동시에 P^1/P^2/P^4의 잔차와 승수를 기록합니다. 느린 수렴, 짧은 기록, 잘못된 seed는 가짜 다중값을 만들며 무한 cascade나 Feigenbaum 비율을 이 짧은 실험으로 확정하지 않습니다.',
        'Scan forcing with equal transient and observation budgets and detect candidate doublings in distinct return counts. Record P^1/P^2/P^4 residuals and multipliers as companion evidence. Slow relaxation, short records and poor seeds can create spurious multiplicity; this does not establish an infinite cascade or Feigenbaum ratio.'
      ]
    }
  ],
  equations: [
    {
      id: 'growth',
      title: ['1. 반환마다 반전하는 교란', '1. Alternating return perturbation'],
      expression: 'nextPerturbation = multiplier*perturbation',
      explanation: [
        '단일 임계 고유방향의 선형식입니다. 음의 승수는 부호 반전, 절댓값1 초과는 국소 성장을 뜻합니다.',
        'This is the linear equation along one critical direction. Negative multiplier reverses sign; modulus above one gives local growth.'
      ],
      symbols: [
        ['nextPerturbation', 'rad', '다음 반환 교란 좌표', 'Next return perturbation'],
        ['multiplier', '1', '임계 승수', 'Critical multiplier'],
        ['perturbation', 'rad', '현재 교란 좌표', 'Current perturbation']
      ]
    },
    {
      id: 'period',
      title: ['2. 반복 주기', '2. Repeated period'],
      expression: 'orbitPeriod = multiplicity*drivePeriod',
      explanation: [
        '원시 multiplicity를 확인한 경우에만 궤도 주기를 해석합니다. 요청 multiplicity만으로 판정하지 않습니다.',
        'Interpret orbit period only after primitive multiplicity is verified, not merely from the requested multiplicity.'
      ],
      symbols: [
        ['orbitPeriod', 's', '검증된 궤도 주기', 'Verified orbit period'],
        ['multiplicity', '1', '원시 반환 횟수', 'Primitive return multiplicity'],
        ['drivePeriod', 's', '구동 주기', 'Drive period']
      ]
    }
  ],
  checks: [
    {
      prompt: ['음의 승수−0.5는 불안정인가요?', 'Is a multiplier−0.5 unstable?'],
      correct: ['부호는 뒤집히지만 크기는 줄어듭니다.', 'The sign alternates while the magnitude contracts.'],
      incorrect: ['음수이면 언제나 불안정입니다.', 'Every negative multiplier is unstable.'],
      explanation: [
        '맵의 안정성은 실수부 부호가 아니라 절댓값과 단위원을 사용합니다.',
        'Map stability uses modulus relative to the unit circle, rather than real-part sign.'
      ]
    },
    {
      prompt: [
        'P^4 Newton 수렴으로 주기4를 확정할 수 있나요?',
        'Can P^4 Newton convergence alone establish period four?'
      ],
      correct: ['더 짧은 cycle로의 중복을 배제해야 합니다.', 'Lower-period duplicates must be excluded.'],
      incorrect: ['요청 주기4이면 모두 원시 주기4입니다.', 'Every requested period-four solution is primitive.'],
      explanation: ['P^1과 P^2의 해도 P^4를 만족합니다.', 'P^1 and P^2 solutions also satisfy P^4.']
    }
  ],
  prediction: [
    '스캔 간격을 줄이면 배가 후보의 위치 구간과 실제 주기 승수 정보는 각각 어떻게 변할까요?',
    'How will a finer scan change doubling brackets and information about the actual orbit multipliers?'
  ],
  action: [
    '기본 branch·실제 strobe·P^n 표를 실행하고 scanPoints를 늘립니다. count 변화 구간과 원시 cycle 분리·승수를 함께 대조합니다.',
    'Run the branch, actual strobes and P^n table, then increase scanPoints. Compare count-change brackets with primitive-cycle separation and multipliers.'
  ],
  expected: [
    '기본 임계 근처에서 주기1→2 분리를 확인할 수 있습니다. 후속 구간의2→4 등은 관찰값과 shooting 증거가 함께 맞을 때만 후보로 읽습니다.',
    'The default near-critical setup can verify separation from period one to period two. Read later2→4 changes as candidates only when observations and shooting evidence agree.'
  ],
  explanation: [
    '서로 다른 strobe 개수는 해상도 의존 탐지이고 승수는 특정 수렴 궤도의 국소 정보입니다. 두 정보를 혼동하지 않습니다.',
    'Distinct strobe counts are resolution-dependent detection; multipliers describe one converged orbit locally. Keep these two forms of evidence distinct.'
  ],
  next: [
    '6.9에서는 실수−1 통과와 다른 복소 승수쌍의 단위원 통과를 독립 기준 맵으로 조사합니다.',
    'In6.9, contrast real−1 crossing with a complex-pair unit-circle crossing in an independent benchmark map.'
  ],
  glossary: [
    ['주기배가 후보 구간', 'Period-doubling bracket'],
    [
      '서로 다른 반환값 수의 배가가 관찰된 인접 매개변수 사이의 유한 해상도 구간입니다.',
      'A finite-resolution interval between adjacent parameter samples showing a doubling in distinct return counts.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/branchSwitching.ts',
      locator: [
        'switchPeriodDoubling·drivenPeriodicOrbitN의 승수·분리·중복 가능성을 확인합니다.',
        'Inspect multipliers, separation and lower-period duplication in switchPeriodDoubling and drivenPeriodicOrbitN.'
      ]
    },
    {
      path: 'src/chaos/poincare.ts',
      locator: [
        'bifurcationDiagram의 동일 과도구간과 반환 표본 계산을 사용합니다.',
        'Use bifurcationDiagram with matched transient and retained return budgets.'
      ]
    },
    {
      path: 'src/chaos/bifurcationDetect.ts',
      locator: [
        'count 배가 사건은 구간 후보로만 해석합니다.',
        'Interpret distinct-count doubling events as bracketed candidates only.'
      ]
    }
  ],
  external: {
    title: 'Period doubling',
    authors: 'Charles Tresser, Pierre Coullet and Edson de Faria',
    url: 'https://www.scholarpedia.org/article/Period_doubling',
    locator: [
      'Definition과 Dependence upon the dimension의−1 통과·비퇴화 조건을 대조합니다.',
      'Compare Definition and Dependence upon the dimension for−1 crossing and nondegeneracy conditions.'
    ]
  }
});
