import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.12',
  summary: [
    '격자색 경계의 복잡함은 어느 정도까지 예측 불확실성을 말해 줄까요? 실제 반전 영역·경계 차원 proxy·Wada 후보를 함께 검사합니다.',
    'How much does a complicated color boundary say about prediction uncertainty? Check actual flip regions, boundary-dimension proxies and Wada candidates together.'
  ],
  objectives: [
    [
      '유한 반전 label과 장기 인력권을 구별합니다.',
      'Distinguish finite-horizon flip labels from long-term attraction basins.'
    ],
    [
      '경계 차원 proxy와 Wada 데이터 충분성을 해상도별로 평가합니다.',
      'Assess boundary-dimension proxies and Wada data sufficiency across resolutions.'
    ]
  ],
  assumptions: [
    '무감쇠 질점 이중진자에서 두 초기 각도 격자를 스캔하며 두 각속도는0입니다. 현재 표시 초기각은 이 별도 격자의 seed가 아닙니다. label2는 기간 내 미반전이며 attractor가 아닙니다.',
    'Scan initial-angle grids of an undamped point-mass double pendulum with both velocities fixed to zero. The displayed baseline angles do not seed this independent grid. Label2 means no flip within the horizon, not an attractor.'
  ],
  concepts: [
    {
      id: 'labels',
      title: ['반전 영역과 인력권의 구별', 'Flip regions versus attraction basins'],
      body: [
        '공용 격자는 어느 봉이 먼저 뒤집히는지 또는 기간 안에 반전이 없는지 분류합니다. 긴 시간 정착 attractor를 분류하는 것이 아니므로 이 색을 그대로 basin of attraction이라고 부르지 않습니다. 관찰기간이 바뀌면 미반전 label과 경계도 바뀔 수 있습니다.',
        'The shared grid classifies which rod flips first or whether neither flips before the horizon. It does not classify asymptotic settling attractors, so these colors are not automatically basins of attraction. Changing the horizon can change no-flip labels and boundaries.'
      ]
    },
    {
      id: 'uncertainty',
      title: ['불확실성 proxy와 Wada 한계', 'Uncertainty proxy and Wada limits'],
      body: [
        '공용 uncertainty는 경계 box-counting 차원 D로2−D를 추정합니다. 이는 교란 쌍의 uncertainty exponent를 직접 측정한 것이 아닙니다. Wada 도구는 세 해상도와 실제 세 label·비어 있지 않은 경계를 요구하며 데이터 부족을 명시합니다. 고정 cell 반경은 격자마다 물리 반경이 달라집니다.',
        'Shared uncertainty derives2−D from boundary box-counting dimension, not direct uncertain-pair measurements. The Wada tool compares three resolutions and requires three actual labels with nonempty boundaries, reporting insufficient data otherwise. A fixed cell radius changes physical scale across grids.'
      ]
    }
  ],
  equations: [
    {
      id: 'uncertain',
      title: ['1. 조건부 경계 proxy', '1. Conditional boundary proxy'],
      expression: 'proxyExponent = 2-boundaryDimension',
      explanation: [
        '평면에서 scale 법칙이 유효하다는 조건 아래2−D를 계산합니다. 이 실험은 직접 교란 쌍 법칙을 적합하지 않습니다.',
        'Compute2−D under planar boundary scaling assumptions. This experiment does not fit a direct uncertain-pair scaling law.'
      ],
      symbols: [
        ['proxyExponent', '1', '조건부 불확실성 지수 proxy', 'Conditional uncertainty exponent proxy'],
        ['boundaryDimension', '1', '경계 box-counting 차원', 'Boundary box-counting dimension']
      ]
    },
    {
      id: 'spacing',
      title: ['2. 격자의 각도 간격', '2. Angular grid spacing'],
      expression: 'angleSpacing = (highAngle-lowAngle)/(resolution-1)',
      explanation: [
        '양 끝점을 포함한 한 축의 간격입니다. 해상도가 커지면 같은 cell 반경이 가리키는 물리 각도는 줄어듭니다.',
        'Spacing along one endpoint-inclusive grid axis. Higher resolution reduces the physical angle represented by a fixed cell radius.'
      ],
      symbols: [
        ['angleSpacing', 'rad', '격자 각도 간격', 'Angular grid spacing'],
        ['highAngle', 'rad', '격자 상한', 'Grid upper angle'],
        ['lowAngle', 'rad', '격자 하한', 'Grid lower angle'],
        ['resolution', '1', '한 변의 점 수', 'Points per axis']
      ]
    }
  ],
  checks: [
    {
      prompt: ['label2를 새 attractor로 부를 수 있나요?', 'Can label2 be called a new attractor?'],
      correct: ['아닙니다. 현재 기간 안에 반전이 없다는 뜻입니다.', 'No. It means no flip during the current horizon.'],
      incorrect: ['항상 세번째 attractor를 뜻합니다.', 'It always means a third attractor.'],
      explanation: [
        '유한 사건의 부재는 장기 정착의 증거가 아닙니다.',
        'Absence of a finite-time event does not establish asymptotic settling.'
      ]
    },
    {
      prompt: ['실제 label이 두 개뿐이면 Wada는?', 'What if only two actual labels occur?'],
      correct: [
        '세 영역 Wada 판정에 필요한 데이터가 부족합니다.',
        'The data are insufficient for a three-region Wada verdict.'
      ],
      incorrect: ['표에 최대label이2면 충분합니다.', 'A maximum label value of two is sufficient.'],
      explanation: [
        '최대label 번호와 실제 고유 label 수를 구별해야 합니다.',
        'Distinguish a maximum label index from the number of distinct labels.'
      ]
    }
  ],
  prediction: [
    '기간을 늘리지 않고 격자만 세분화하면 Wada 또는 불확실성 지수가 자동으로 더 확실해질까요?',
    'Will grid refinement alone automatically make Wada or uncertainty conclusions more certain without increasing the horizon?'
  ],
  action: [
    '기본16·24·32 해상도 Wada 표와 반전·uncertainty 결과를 읽습니다. resolution과 duration을 따로 바꾸어 데이터 충분성과 경계를 비교합니다.',
    'Inspect the default16/24/32 Wada table alongside flip and uncertainty results. Change resolution and duration separately and compare sufficiency and boundaries.'
  ],
  expected: [
    '기준 반전 표는16^2=256셀입니다. Wada의 실제 고유 label 수가3보다 적거나 경계가 없으면 insufficient-data로 남아야 합니다.',
    'The baseline flip table has16^2=256 cells. Wada remains insufficient-data when fewer than three labels or no boundary occur.'
  ],
  explanation: [
    '해상도·관찰기간·적분 간격은 서로 다른 오차입니다. 데이터 부족을0차원이나 Wada 부정 증명으로 바꾸지 않습니다.',
    'Grid, horizon and integration errors are distinct. Do not turn insufficient data into a zero-dimensional estimate or a proof against Wada.'
  ],
  next: [
    '과정7에서는 실제 감쇠 자기 모델의 정착 후보와 네트워크·장·양자 시스템으로 대상을 확장합니다.',
    'Course7 extends the targets to settling candidates of a damped magnetic model and to networks, fields and quantum systems.'
  ],
  glossary: [
    ['Wada 후보', 'Wada candidate'],
    [
      '세 영역 이상이 공유하는 경계 가능성을 유한 격자에서 시험한 결과이며 엄밀한 위상 성질의 증명은 아닙니다.',
      'A finite-grid test of possible shared boundaries among at least three regions, without a rigorous topological proof.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/advanced/native-grid.ts',
      locator: [
        'label 의미·uncertainty proxy·distinctColorCounts·insufficient-data 판정을 대조합니다.',
        'Check label meanings, uncertainty proxies, distinctColorCounts and insufficient-data verdicts.'
      ]
    },
    {
      path: 'src/chaos/wadaConvergence.ts',
      locator: [
        '해상도별 native Wada 비교와 반경·수렴 caveat를 확인합니다.',
        'Inspect native multi-resolution Wada comparisons, radius choices and convergence caveats.'
      ]
    }
  ],
  external: {
    title: 'Ascertaining when a basin is Wada: the merging method',
    authors: 'Alvar Daza, Alexandre Wagemakers and Miguel A. F. Sanjuán',
    url: 'https://www.nature.com/articles/s41598-018-28119-0',
    locator: [
      'Methods의 basin merging·경계 비교와 유한 해상도 반경 검사를 대조합니다.',
      'Compare basin merging, boundary comparisons and finite-resolution fattening in the Methods section.'
    ]
  }
});
