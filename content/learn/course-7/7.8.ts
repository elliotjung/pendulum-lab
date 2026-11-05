import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.8',
  summary: [
    '처음 하나의 모드에 준 에너지는 영원히 고르게 퍼질까요? 실제 비선형 FPUT 사슬에서 모드 교환과 짧은 시간 회귀 후보를 측정합니다.',
    'Must energy initially placed in one mode spread uniformly forever? Measure modal exchange and finite-time recurrence candidates in an actual nonlinear FPUT chain.'
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
    '양끝 변위0인 N=8 정규화 단위질량 사슬입니다. 결합 퍼텐셜은 r²/2+αr³/3+βr⁴/4이고 β=0.5를 고정합니다. Native velocity-Verlet와 첫 모드 초기화를 사용합니다.',
    'A normalized N=8 unit-mass chain has fixed zero-displacement walls and interaction potential r squared/2+alpha r cubed/3+beta r fourth/4 with beta=0.5 fixed. Native velocity-Verlet evolves a first-mode initial condition.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '조화 모드로 좌표를 투영하면 각 모드의 운동·이차 퍼텐셜 에너지를 계산할 수 있습니다. α와 β가0이 아니면 모드가 독립이 아니며 초기 모드의 비율이 내려갔다 다시 올라갈 수 있습니다. 전체 비선형 에너지와 조화 모드 에너지 합을 구별합니다.',
        'Projection onto harmonic modes gives kinetic and quadratic potential energy per mode. Nonzero alpha or beta couples modes, allowing the initial-mode fraction to fall and rebound. Total nonlinear energy differs from the harmonic modal sum.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '첫 모드 비율의 최솟값과 그 뒤의 최대 회귀 비율을 실제 기록에서 읽습니다. 초기/종료 모드 표와 총 에너지 변화로 전달과 수치 drift를 분리합니다. β>0는 큰 변위의 퍼텐셜을 구속합니다.',
        'Read the minimum first-mode fraction and its largest subsequent rebound from the actual record. Initial/final modal energies and total-energy change separate transfer from numerical drift. Positive beta confines the large-displacement potential.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '짧은 실행에는 회귀가 나타나지 않을 수 있습니다. 관찰창의 최댓값을 장시간 재귀 정리로 읽지 않습니다. 조화 성분만 합한 분모는 총 에너지가 아니며 강한 비선형성에서 그 차이가 커집니다.',
        'A short run need not contain recurrence. A finite-window rebound does not establish a long-time recurrence theorem. The harmonic-only denominator is not total energy and the difference grows with nonlinearity.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'modeFraction = firstMode/harmonicSum',
      explanation: [
        '초기 모드의 조화 에너지를 모든 조화 모드 에너지의 합으로 나눕니다. 모든 에너지는 정규화 값입니다.',
        'Divide the initial mode’s harmonic energy by the sum over all harmonic modes; energies are normalized.'
      ],
      symbols: [
        ['modeFraction', '1', '첫 모드 비율', 'First-mode fraction'],
        ['firstMode', '1', '첫 모드 정규화 에너지', 'Normalized first-mode energy'],
        ['harmonicSum', '1', '조화 모드 에너지 합', 'Harmonic energy sum']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'interaction = r^2/2+alpha*r^3/3+beta*r^4/4',
      explanation: [
        '결합 길이 차 r의 퍼텐셜을 차수별로 적습니다. 이 식의 미분이 native 결합력을 만들며 콘텐츠는 별도 계산을 실행하지 않습니다.',
        'The interaction potential is expanded in bond displacement r; native force routines own its derivative and content never executes another solver.'
      ],
      symbols: [
        ['interaction', '1', '정규화 결합 퍼텐셜', 'Normalized interaction potential'],
        ['r', '1', '정규화 인접 변위 차', 'Normalized bond displacement'],
        ['alpha', '1', '삼차 계수', 'Cubic coefficient'],
        ['beta', '1', '사차 계수', 'Quartic coefficient']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '조화 모드 에너지 합은 항상 총 비선형 에너지인가요?',
        'Is harmonic modal energy always total nonlinear energy?'
      ],
      correct: [
        '삼차·사차 퍼텐셜 기여를 별도로 포함해야 합니다.',
        'Cubic and quartic potential contributions must also be included.'
      ],
      incorrect: [
        '모드가 완전하므로 비선형 항이 자동 포함됩니다.',
        'Completeness of modes automatically includes nonlinear terms.'
      ],
      explanation: [
        '에너지 분산과 회귀는 관찰 기간·크기·비선형성에 의존하므로 수치 보존과 함께 평가합니다.',
        'Energy spread and rebound depend on observation time, size and nonlinearity and are evaluated alongside numerical conservation.'
      ]
    },
    {
      prompt: ['7.8의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.8 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '짧은 실행에는 회귀가 나타나지 않을 수 있습니다. 관찰창의 최댓값을 장시간 재귀 정리로 읽지 않습니다. 조화 성분만 합한 분모는 총 에너지가 아니며 강한 비선형성에서 그 차이가 커집니다.',
        'A short run need not contain recurrence. A finite-window rebound does not establish a long-time recurrence theorem. The harmonic-only denominator is not total energy and the difference grows with nonlinearity.'
      ]
    }
  ],
  prediction: [
    'α와 진폭을 늘릴 때 첫 모드에서의 에너지 유출이 어떻게 바뀔지 예상하세요.',
    'Predict how increasing alpha and amplitude affects energy transfer from the first mode.'
  ],
  action: [
    '한 번에 한 변수만 바꾸고 최소 비율·그 뒤 회귀·모드 표·총 drift를 비교하세요.',
    'Change one variable at a time and compare the minimum, post-dip rebound, modal table and total drift.'
  ],
  expected: [
    '비율은0~1이고 회귀 후보는기록 최솟값 이상입니다. α=0·β=0.5·기본 진폭에서 첫 모드 비율은0.99보다 큽니다.',
    'Fractions lie in[0,1] and the rebound is at least the recorded minimum. At alpha0,beta0.5 and default amplitude the first-mode fraction exceeds0.99.'
  ],
  explanation: [
    '에너지 분산과 회귀는 관찰 기간·크기·비선형성에 의존하므로 수치 보존과 함께 평가합니다.',
    'Energy spread and rebound depend on observation time, size and nonlinearity and are evaluated alongside numerical conservation.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['FPUT 회귀 후보', 'FPUT recurrence candidate'],
    [
      '관찰된 모드 에너지 감소 뒤 원래 모드로 되돌아오는 유한 시간의 증가입니다.',
      'A finite-time increase back toward the original mode after observed modal-energy loss.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/fput.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/fput.ts.'
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
    title: 'Studies of the Nonlinear Problems',
    authors: 'E. Fermi, J. Pasta, S. Ulam',
    url: 'https://digital.library.unt.edu/ark:/67531/metadc1018377/',
    locator: [
      '원 보고서의 비선형 사슬 실험과 모드 에너지 재분배 질문을 대조합니다. β=0.5인 현재 예제는 역사적 실험과 동일 설정이 아닙니다.',
      'The primary report supplies the nonlinear-chain and modal-energy redistribution question; the present beta0.5 example is not the identical historical experiment.'
    ]
  }
});
