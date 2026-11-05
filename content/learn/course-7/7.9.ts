import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.9',
  summary: [
    '한 링크에 준 큰 에너지가 격자에 남아 있을까요? 실제 비선형 고리에서 국소 onsite 에너지 비율과 참여 수를 추적하고 선형 band와 비교합니다.',
    'Will energy placed on one link remain localized? Track onsite-energy fraction and participation in an actual nonlinear ring and compare its linear band.'
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
    '16개의1 kg·1 m 진자, g=1 m/s², 무감쇠 대칭 최근접 비틀림 고리입니다. 중앙 링크만 초기 각도로 여기합니다. 시간은s이며 onsite 에너지는J입니다.',
    'Sixteen1 kg,1 m pendulums have g=1 m/s² and undamped symmetric nearest-neighbor torsional coupling. Only the central link is initially displaced. Time is seconds and onsite energy is joules.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '결합0에서는 단일 진자만 움직이므로 초기 국소화가 유지됩니다. 결합을 켜면 중력 비선형성과 이웃 토크가 동시에 작용합니다. 작은 진폭 band는 native ring spectrum으로 계산하되 큰 진폭 packet의 주파수로 간주하지 않습니다.',
        'At zero coupling only the initially excited pendulum moves, preserving localization. Coupling activates neighbor torque alongside nonlinear gravity. The native ring spectrum supplies the small-amplitude band, not the frequency of a large-amplitude packet.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        'Native 단일 진자 에너지 함수를 각 링크에 적용해 onsite 에너지만 분리합니다. 중앙 비율과 참여 수는 에너지가 몇 링크에 퍼졌는지 요약합니다. 별도 총 에너지는결합 퍼텐셜까지 포함하므로 같은 분모가 아닙니다.',
        'Apply the native single-pendulum energy routine to each link to isolate onsite energy. Central fraction and participation summarize how many links carry energy. Separate total energy also includes coupling potential and uses a different denominator.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '유한 시간 국소화는 시간 주기 discrete breather의 존재·Floquet 안정성 증명이 아닙니다. 위상 정렬 지표 R을 에너지 수송과 혼동하지 않습니다. 고리의 주기적 경계와 반사·wrap-around가 장시간 분포를 바꿉니다.',
        'Finite-time localization does not prove a time-periodic discrete breather or Floquet stability. Phase alignment R is not energy transport. Periodic boundaries and wrap-around influence long-time distributions.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'centerFraction = centerEnergy/onsiteSum',
      explanation: [
        '중앙 링크의 운동+중력 에너지를 모든 링크의 onsite 에너지로 나눕니다. 결합 에너지는분모에서 제외됩니다.',
        'Divide central kinetic-plus-gravitational energy by total onsite energy, excluding coupling energy.'
      ],
      symbols: [
        ['centerFraction', '1', '중앙 에너지 비율', 'Central-energy fraction'],
        ['centerEnergy', 'J', '중앙 onsite 에너지', 'Central onsite energy'],
        ['onsiteSum', 'J', '전체 onsite 에너지', 'Total onsite energy']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'participation = 1/squaredFractionSum',
      explanation: [
        '정규화한 onsite 에너지 비율의 제곱 합의 역수입니다. 한 링크에만 에너지가 있으면1입니다.',
        'The inverse sum of squared normalized onsite fractions equals one when all onsite energy is on one link.'
      ],
      symbols: [
        ['participation', '1', '참여 링크 수', 'Participation count'],
        ['squaredFractionSum', '1', '에너지 비율 제곱 합', 'Sum of squared energy fractions']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '참여 수1이 오래 보이면 breather가 증명되나요?',
        'Does a persistent participation count near1 prove a breather?'
      ],
      correct: [
        '주기성·안정성과 장시간 수렴은 별도 검증입니다.',
        'Periodicity, stability and long-time convergence remain separate.'
      ],
      incorrect: ['국소화와 엄밀한 breather는 항상 같습니다.', 'Localization and a proven breather are identical.'],
      explanation: [
        '이 실험은 동일 native 비선형 계의 수송을 측정하고 선형 band를참조로만 사용합니다.',
        'The experiment measures transport in the same native nonlinear system and uses its linear band only as a reference.'
      ]
    },
    {
      prompt: ['7.9의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.9 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '유한 시간 국소화는 시간 주기 discrete breather의 존재·Floquet 안정성 증명이 아닙니다. 위상 정렬 지표 R을 에너지 수송과 혼동하지 않습니다. 고리의 주기적 경계와 반사·wrap-around가 장시간 분포를 바꿉니다.',
        'Finite-time localization does not prove a time-periodic discrete breather or Floquet stability. Phase alignment R is not energy transport. Periodic boundaries and wrap-around influence long-time distributions.'
      ]
    }
  ],
  prediction: [
    '결합을0으로 만들면 중앙 에너지 비율과 참여 수는어떻게 될지 예상하세요.',
    'Predict the central fraction and participation at zero coupling.'
  ],
  action: [
    '결합0과0.05의 packet을 비교하고 진폭을 바꾸어 선형 spectrum과 실제 수송의 차이를 설명하세요.',
    'Compare packets at coupling0 and0.05, then change amplitude and explain the difference between the linear spectrum and actual transport.'
  ],
  expected: [
    '결합0에서 중앙 비율과 참여 수는1이며 참여 수 오차는1e-12보다 작습니다.',
    'At zero coupling central fraction and participation equal1, with participation error below1e-12.'
  ],
  explanation: [
    '이 실험은 동일 native 비선형 계의 수송을 측정하고 선형 band를참조로만 사용합니다.',
    'The experiment measures transport in the same native nonlinear system and uses its linear band only as a reference.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['에너지 참여 수', 'Energy participation count'],
    [
      '에너지 분포의 유효 참여 링크 수이며 주기궤도 인증과 구분합니다.',
      'Effective number of links carrying energy, distinct from periodic-orbit certification.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/pendulumNetwork.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/pendulumNetwork.ts.'
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
    title: 'Proof of existence of breathers for time-reversible or Hamiltonian networks of weakly coupled oscillators',
    authors: 'R. S. MacKay, S. Aubry',
    url: 'https://doi.org/10.1088/0951-7715/7/6/006',
    locator: [
      '약결합·비공명 주기해의 존재 조건과 유한 시간 국소화의 차이를 구분합니다.',
      'The primary result’s weak-coupling, nonresonant periodic-orbit conditions are distinguished from finite-time localization observed here.'
    ]
  }
});
