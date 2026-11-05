import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.10',
  summary: [
    '같은 장 방정식에서 kink·breather·충돌은 어떻게 다를까요? Native 초기 장과 격자 전파로 형상·전하·에너지를 비교합니다.',
    'How do kinks, breathers and collisions differ under the same field equation? Compare profile, charge and energy with native initial fields and grid evolution.'
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
    'c=1·기판 주파수1의 정규화 sine-Gordon 장,81점·길이30·fixed 경계,dt=0.02입니다.0=kink,1=최대 변위에서 놓은 breather,2=접근하는 kink–antikink 중첩입니다.',
    'A normalized sine-Gordon field has c=1, substrate frequency1,81 points over length30, fixed boundaries and dt0.02. Scenario0 is a kink,1 a breather released at maximum displacement,2 approaching kink–antikink initial superposition.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '장 방정식 u_tt-u_xx+sin u=0에서 공간 기울기와 기판 복원이 경쟁합니다. Kink는 서로 다른 진공을 잇고 breather는 같은 진공으로 돌아가는 국소 진동입니다. 전하는 끝점 장 차를2π로 나누어 계산합니다.',
        'Spatial gradients and substrate restoring force compete in u_tt-u_xx+sin u=0. A kink connects different vacua; a breather is localized oscillation returning to the same vacuum. Charge is endpoint field difference divided by2 pi.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        'Kink와 breather는 보존된 정확해 생성기로 초기화하고 동일 native leapfrog 장 adapter를 실행합니다. 첫 두 scenario의 종료 형상을 동일 시각 연속체 정확해와 비교합니다. 충돌 scenario는native 두 솔리톤 중첩과 그 두 시간층을 보존합니다.',
        'Preserved exact-profile constructors initialize kinks and breathers before the same native leapfrog field adapter evolves them. Compare final profiles to continuum exact solutions at the same time. The collision scenario preserves the native two-soliton superposition and both time levels.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '유한 분리 중첩은 무한영역의 정확한 다중솔리톤 해와 다릅니다. fixed 경계·공간 격자·backward 속도 추정과 초기 Taylor 층이 에너지 오차에 영향을 줍니다. 작은 전하 오차를 topology 변화로 단정하지 않습니다.',
        'Finite-separation superposition differs from an exact infinite-domain multisoliton solution. Fixed boundaries, spatial discretization, backward velocity estimates and the initial Taylor time level affect energy error. Small charge errors do not establish topology changes.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'charge = (rightField-leftField)/(2*pi)',
      explanation: [
        '유한 구간 끝점 장의 차로 계산하는 전하입니다. 무한영역에서 깨끗한 kink는±1이고 breather는0입니다.',
        'Charge comes from the finite interval’s endpoint fields; clean infinite-domain kinks have plus or minus one and breathers have zero.'
      ],
      symbols: [
        ['charge', '1', '위상전하', 'Topological charge'],
        ['rightField', 'rad', '오른쪽 끝 장', 'Right endpoint field'],
        ['leftField', 'rad', '왼쪽 끝 장', 'Left endpoint field'],
        ['pi', '1', '원주율', 'Pi']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'kinkEnergy = 8/sqrt(1-velocity^2); breatherEnergy = 16*sqrt(1-frequency^2)',
      explanation: [
        '정규화 연속체 정확해의 에너지입니다. 격자 backward 차분 에너지와 수치적으로 동일할 것을 요구하지 않습니다.',
        'These are normalized continuum exact-solution energies, which need not equal discrete backward-difference energies numerically.'
      ],
      symbols: [
        ['kinkEnergy', '1', '정규화 kink 에너지', 'Normalized kink energy'],
        ['velocity', '1', '파동 속도 대비 이동 속도', 'Velocity relative to wave speed'],
        ['breatherEnergy', '1', '정규화 breather 에너지', 'Normalized breather energy'],
        ['frequency', '1', '정규화 내부 주파수', 'Normalized internal frequency']
      ]
    }
  ],
  checks: [
    {
      prompt: ['Breather는 kink와 같은 전하+1을 가지나요?', 'Does a breather carry the same +1 charge as a kink?'],
      correct: [
        '양끝이 같은 진공이므로 순전하는0입니다.',
        'Its endpoints lie in the same vacuum, giving zero net charge.'
      ],
      incorrect: ['국소적인 장은 모두+1입니다.', 'Every localized field carries+1.'],
      explanation: [
        '서로 다른 현상도 동일한 장 엔진과 경계 계약을 공유하므로 초기 장과 topology를 분리해 설명할 수 있습니다.',
        'The different phenomena share one field engine and boundary contract, allowing initial field shape and topology to be explained separately.'
      ]
    },
    {
      prompt: [
        '7.10의 결과를 보편적인 증명으로 읽어도 될까요?',
        'Does the result of 7.10 establish a universal proof?'
      ],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '유한 분리 중첩은 무한영역의 정확한 다중솔리톤 해와 다릅니다. fixed 경계·공간 격자·backward 속도 추정과 초기 Taylor 층이 에너지 오차에 영향을 줍니다. 작은 전하 오차를 topology 변화로 단정하지 않습니다.',
        'Finite-separation superposition differs from an exact infinite-domain multisoliton solution. Fixed boundaries, spatial discretization, backward velocity estimates and the initial Taylor time level affect energy error. Small charge errors do not establish topology changes.'
      ]
    }
  ],
  prediction: [
    'Scenario를0에서1과2로 바꿀 때 전하가 어떻게 바뀔지 예상하세요.',
    'Predict the charge changes when switching from scenario0 to1 and2.'
  ],
  action: [
    '세 scenario를 각각 실행하고 형상·전하·에너지 기록과 가능한 정확해 차이를 비교하세요.',
    'Run all three scenarios and compare profiles, charge, energy records and available exact-solution discrepancies.'
  ],
  expected: [
    '기본 kink 전하는0.999보다 크고 breather·충돌의 순전하 절댓값은1e-10보다 작습니다. 기본 kink 정확해 차이는0.15 rad보다 작습니다.',
    'Default kink charge exceeds0.999, while breather and collision net charges have magnitude below1e-10. Default kink profile error is below0.15 rad.'
  ],
  explanation: [
    '서로 다른 현상도 동일한 장 엔진과 경계 계약을 공유하므로 초기 장과 topology를 분리해 설명할 수 있습니다.',
    'The different phenomena share one field engine and boundary contract, allowing initial field shape and topology to be explained separately.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['위상 솔리톤', 'Topological soliton'],
    [
      '서로 다른 진공을 잇는 국소 장 구조이며 유한 경계의 전하 진단과 함께 평가합니다.',
      'A localized field structure connecting distinct vacua, evaluated with finite-boundary charge diagnostics.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/sineGordon.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/sineGordon.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/field.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/field.ts.'
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
    title: 'Wobbles and other kink-breather solutions of the Sine Gordon model',
    authors: 'L. A. Ferreira, B. Piette, W. J. Zakrzewski',
    url: 'https://arxiv.org/abs/0708.1088',
    locator: [
      '저자 공개본의 kink/breather·경계·산란 맥락을 대조하며 native 초기 중첩의 한계를 구분합니다.',
      'The author paper supplies kink/breather, boundary and scattering context, separately from the limitations of the native initial superposition.'
    ]
  }
});
