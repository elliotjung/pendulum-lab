import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.3',
  title: ['NAFF와 준주기 기본주파수', 'NAFF and quasiperiodic fundamental frequencies'],
  question: [
    '진짜 주파수가 FFT 칸 사이에 놓이면 어떻게 추정할까요? 같은 진자 기록에서 FFT peak와 NAFF 각주파수를 같은 단위로 비교합니다.',
    'How can a frequency between FFT bins be estimated? Compare FFT peaks and NAFF angular frequencies from the same pendulum record in matching units.'
  ],
  prerequisites: [
    '균일한 실수 theta1 관측과 유한 구간 근사를 사용합니다. 실수 신호는 양·음 주파수 성분을 함께 가지며 허수부0으로 공용 NAFF에 전달됩니다.',
    'Use a finite, uniform real theta1 record. Real signals contain positive and negative frequency components and enter the shared NAFF routine with zero imaginary part.'
  ],
  objectives: [
    [
      'FFT의 이산 peak와 refined frequency 추정의 차이를 설명합니다.',
      'Explain discrete FFT peaks versus refined frequency estimates.'
    ],
    [
      '단위·±성분·가까운 모드와 유한 구간 편향을 확인합니다.',
      'Check units, signed components, close modes and finite-record bias.'
    ]
  ],
  concepts: [
    {
      title: ['준주기 근사의 가정', 'Assumptions of quasiperiodic approximation'],
      body: [
        '준주기 관측은 여러 기본주파수의 조합으로 근사할 수 있습니다. NAFF는 가중 내적의 크기가 큰 주파수를 찾고 그 성분을 빼며 반복합니다. 실제 기록이 짧거나 주파수가 확산하면 제한된 성분 목록은 편리한 근사일 뿐 정확한 준주기성의 증명이 아닙니다.',
        'Quasiperiodic observations admit approximations by frequency combinations. NAFF searches for strong weighted frequency components and iteratively subtracts them. For short or diffusing records, a finite list is a useful approximation rather than proof of exact quasiperiodicity.'
      ]
    },
    {
      title: ['FFT는 시작점, 탐색은 연속적', 'FFT as a starting grid'],
      body: [
        'FFT peak는 관측 격자의 주파수 칸에 놓입니다. NAFF의 탐색은 그 주변을 정밀화하므로 한 성분이 충분히 분리된 합성 신호에서는 칸 폭보다 작은 오차를 얻을 수 있습니다. 논문의 점근 정확도는 매끄러움·비공명·창에 대한 조건이 있어 임의 진자 기록의 오차 보증으로 옮기지 않습니다.',
        'FFT peaks occupy frequency bins. NAFF refines nearby frequencies and can achieve sub-bin error for a well-isolated synthetic tone. Published asymptotic accuracy requires smoothness, nonresonance and window assumptions; it is not an error guarantee for arbitrary pendulum data.'
      ]
    },
    {
      title: ['주파수와 복소 진폭', 'Frequency and complex amplitude'],
      body: [
        'cosine 신호는 복소 지수의 양·음 주파수 쌍으로 표현됩니다. 이때 각 성분 진폭은 실수 cosine 진폭의 절반일 수 있습니다. 공용 FFT는 Hz, NAFF는 rad/s이므로 NAFF의 절댓값을 2pi로 나눈 뒤 같은 물리 모드끼리 비교합니다.',
        'A cosine contains positive and negative complex exponentials. Each component can carry half the real cosine amplitude. The shared FFT reports Hz and NAFF rad/s; divide absolute NAFF frequency by 2pi and compare matching physical modes.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '가까운 두 성분, 잡음, 짧은 구간은 성분 순서와 주파수를 흔듭니다. 큰 peak가 항상 같은 모드인 것도 아닙니다. 기간을 두 배로 늘려 추정의 안정성을 보고 5.4의 단면 기하와 교차 검증합니다.',
        'Close components, noise and short windows can alter ordering and estimates. The strongest peak need not represent the same mode in both methods. Double duration to inspect stability, then compare the section geometry in 5.4.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 각주파수를 cycles로', '1. Angular to cyclic frequency'],
      expression: 'cyclicFrequency = abs(angularFrequency)/(2*pi)',
      explanation: [
        '각주파수의 부호는 회전 방향과 복소 표현에 남기고 peak 비교에서는 크기를 2pi로 나눕니다. pi는 무차원 상수입니다.',
        'Retain the sign for orientation and complex representation; compare peak magnitudes after dividing by 2pi. Pi is dimensionless.'
      ],
      symbols: [
        ['cyclicFrequency', 'Hz', 'cycles 주파수', 'Cyclic frequency'],
        ['angularFrequency', 'rad/s', 'NAFF 각주파수', 'NAFF angular frequency'],
        ['pi', '1', '원주율', 'Pi']
      ]
    },
    {
      title: ['2. 같은 성분의 단위 일치 오차', '2. Matched-component frequency difference'],
      expression: 'frequencyError = abs(estimate-reference)',
      explanation: [
        '같은 모드와 단위의 추정에서만 차이를 해석합니다. 합성 fixture의 reference는 알려진 주파수이고 실제 진자에서는 참값을 안다고 가정하지 않습니다.',
        'Interpret this difference only for matching modes and units. A synthetic fixture has a known reference; a physical pendulum record does not automatically provide a true frequency.'
      ],
      symbols: [
        ['frequencyError', 'Hz', '주파수 차이', 'Frequency difference'],
        ['estimate', 'Hz', '추정한 같은 성분', 'Estimated matched component'],
        ['reference', 'Hz', '대조 주파수', 'Reference frequency']
      ]
    }
  ],
  term: ['준주기 분해', 'Quasiperiodic decomposition'],
  definition: [
    '유한 관측을 복수의 복소 주파수 성분으로 근사하는 분석입니다.',
    'An approximation of a finite observation by multiple complex frequency components.'
  ],
  checks: [
    {
      prompt: ['NAFF의3 rad/s와 FFT의3 Hz는 같은가요?', 'Are3 rad/s in NAFF and3 Hz in FFT equal?'],
      correct: ['2pi 변환이 필요합니다.', 'A factor of2pi is required.'],
      wrong: ['숫자가 같으므로 같습니다.', 'Equal numbers imply equal frequencies.'],
      explanation: ['각주파수와 cycles 주파수는2pi배 차이입니다.', 'Angular frequency is2pi times cyclic frequency.']
    },
    {
      prompt: ['성분3개가 나오면 준주기가 증명되나요?', 'Do three fitted components prove quasiperiodicity?'],
      correct: [
        '유한 관측 근사이며 수렴 검사가 필요합니다.',
        'They approximate finite data and require convergence checks.'
      ],
      wrong: ['항 개수만으로 증명됩니다.', 'The component count proves it.'],
      explanation: [
        '짧거나 주파수가 확산하는 기록도 유한 성분으로 근사됩니다.',
        'Short or frequency-diffusing records also admit finite-component approximations.'
      ]
    }
  ],
  task: {
    prediction: [
      'duration을 두 배로 하면 FFT와 NAFF peak 차이는 반드시 줄까요?',
      'Must the FFT–NAFF peak difference shrink when duration doubles?'
    ],
    action: [
      '두 분석의 최대 성분과 ±주파수를 확인하고 duration만 바꿉니다. 표의 NAFF rad/s를 Hz로 환산한 값끼리 비교하세요.',
      'Inspect strongest and signed components, then change only duration. Compare the NAFF frequencies after conversion to Hz.'
    ],
    expected: [
      '물리 run에서는 단조 감소를 보장하지 않습니다. 독립 0.625 Hz 합성 fixture의 단일 성분은 FFT가 해당 bin을 찾고 NAFF가 1e-4 Hz 이내에서 재현해야 합니다.',
      'Monotonic decrease is not guaranteed for the physical run. In the independent 0.625 Hz synthetic fixture, FFT finds the corresponding bin and NAFF reproduces the tone within 1e-4 Hz.'
    ],
    explanation: [
      '알려진 benchmark 정확도와 임의 물리 기록의 수렴은 다른 주장입니다.',
      'Accuracy on a known benchmark differs from convergence for arbitrary physical records.'
    ]
  },
  source: {
    title: [
      'Frequency map analysis and quasiperiodic decompositions',
      'Frequency map analysis and quasiperiodic decompositions'
    ],
    authors: 'Jacques Laskar',
    url: 'https://arxiv.org/abs/math/0305364',
    locator: [
      '준주기 근사·가중 주파수 추출과 Hanning 창의 조건부 수렴 논의를 대조했습니다. 제품의 단순 탐색이 논문 전체 정확도를 보장한다고 표시하지 않습니다.',
      'Checked quasiperiodic approximation, weighted frequency extraction and conditional Hanning-window convergence; the product search does not claim the full paper accuracy.'
    ]
  }
});
