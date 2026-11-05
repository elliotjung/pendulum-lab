import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.12',
  summary: [
    '킥을 반복하면 위상 원통의 규칙성과 불규칙성이 어떻게 공존할까요? 실제 표준 사상의 θ와 감싸지 않은 p를 관찰합니다.',
    'How do regular and irregular motion coexist under repeated kicks? Observe actual standard-map theta and unwrapped momentum on the phase cylinder.'
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
    '정규화 표준 사상이며 θ는[0,2π)로 감싸고 p는감싸지 않습니다. 반복 번호는SI 초가 아니고 연속 적분기도 사용하지 않습니다. 시작 p=0이고 θ와 K를 조절합니다.',
    'The normalized standard map wraps theta into[0,2 pi) while leaving momentum unwrapped. Iteration number is not SI time and no continuous integrator is used. Initial momentum is zero; theta and K are adjustable.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '먼저 킥이 p를 바꾼 뒤 새 p로 θ를 전진시킵니다. 두 shear의 합성은 면적을 보존합니다. K=0이면 p가 일정하고 θ만 등속 회전하므로 적분 가능한 비교 극한입니다.',
        'The kick first updates momentum, then the new momentum advances theta. Composition of two shears preserves area. At K=0 momentum is constant and theta rotates uniformly, providing an integrable limit.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '반복점을 연결선 없이 원통 단면에 표시하고 p의 시간 대신 반복 기록을 나란히 읽습니다. K와 초기 θ를각각 바꾸어 island 주변의 제한 운동과 넓은 p 이동을 구분합니다.',
        'Display iterates as unconnected points on the cylinder and inspect momentum by iteration count. Vary K and initial theta separately to distinguish bounded motion around islands from broad momentum excursions.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '단일 유한 궤적의 p 이동은 ensemble diffusion coefficient가 아닙니다. Island sticking과 초기조건 의존성 때문에 장시간·여러 시작점을 확인해야 합니다. 이 실험만으로 모든 KAM 장벽의 소멸을 증명하지 않습니다.',
        'Momentum excursions of one finite trajectory are not an ensemble diffusion coefficient. Island sticking and initial-condition dependence require longer runs and multiple starts. This experiment does not prove destruction of every KAM barrier.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'pNext = p+kick*sin(theta)',
      explanation: [
        'Native map은 현재 θ에서 킥을 먼저 적용합니다. p와 K는 정규화 값입니다.',
        'The native map first applies the kick at the current theta; momentum and kick strength are normalized.'
      ],
      symbols: [
        ['pNext', '1', '새 운동량', 'New momentum'],
        ['p', '1', '현재 운동량', 'Current momentum'],
        ['kick', '1', '킥 세기', 'Kick strength'],
        ['theta', 'rad', '현재 각도', 'Current angle']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'thetaUnwrapped = theta+pNext',
      explanation: [
        '새 운동량으로 각도를 전진시킨 뒤2π로 감쌉니다. 감싸기 전 관계와 원통 좌표 표시를 구분합니다.',
        'The new momentum advances the angle before wrapping by2 pi; distinguish this unwrapped relation from the cylinder display.'
      ],
      symbols: [
        ['thetaUnwrapped', 'rad', '감싸기 전 새 각도', 'New angle before wrapping'],
        ['theta', 'rad', '현재 각도', 'Current angle'],
        ['pNext', '1', '정규화 새 운동량', 'Normalized new momentum']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        'p도2π로 감싸면 같은 확산 진단인가요?',
        'Does wrapping momentum by2 pi preserve the same diffusion diagnostic?'
      ],
      correct: [
        '원통에서의 누적 p 이동 정보를 잃습니다.',
        'It loses cumulative momentum displacement on the cylinder.'
      ],
      incorrect: ['그림이 비슷하면 모든 통계도 같습니다.', 'Similar pictures guarantee identical statistics.'],
      explanation: [
        '원통 좌표와 반복 규약을 보존해야 규칙성·수송에 대한 해석을 재현할 수 있습니다.',
        'Preserving cylinder coordinates and iteration conventions makes interpretations of regularity and transport reproducible.'
      ]
    },
    {
      prompt: [
        '7.12의 결과를 보편적인 증명으로 읽어도 될까요?',
        'Does the result of 7.12 establish a universal proof?'
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
        '단일 유한 궤적의 p 이동은 ensemble diffusion coefficient가 아닙니다. Island sticking과 초기조건 의존성 때문에 장시간·여러 시작점을 확인해야 합니다. 이 실험만으로 모든 KAM 장벽의 소멸을 증명하지 않습니다.',
        'Momentum excursions of one finite trajectory are not an ensemble diffusion coefficient. Island sticking and initial-condition dependence require longer runs and multiple starts. This experiment does not prove destruction of every KAM barrier.'
      ]
    }
  ],
  prediction: [
    'K=0·p₀=0에서 모든 반복점은어디에 놓일지 예상하세요.',
    'Predict every iterate when K=0 and initial momentum is zero.'
  ],
  action: [
    'K=0과1.2,5를비교하고 같은 시작점에서 p 기록을 읽으세요.',
    'Compare K=0,1.2 and5 and inspect momentum histories from the same start.'
  ],
  expected: [
    'K=0·θ₀=1·p₀=0에서 모든 표본은 정확히 θ=1,p=0을 유지합니다.',
    'At K=0,theta0=1,p0=0 every sample preserves exactly theta1 and momentum0.'
  ],
  explanation: [
    '원통 좌표와 반복 규약을 보존해야 규칙성·수송에 대한 해석을 재현할 수 있습니다.',
    'Preserving cylinder coordinates and iteration conventions makes interpretations of regularity and transport reproducible.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['위상 원통', 'Phase cylinder'],
    [
      '주기적 각도와 감싸지 않은 운동량으로 이루어진 이산 사상의 공간입니다.',
      'The map space formed by a periodic angle and an unwrapped momentum.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/standardMap.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/standardMap.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/discrete-engine.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/discrete-engine.ts.'
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
    title: 'Chirikov standard map',
    authors: 'B. Chirikov, D. Shepelyansky',
    url: 'https://www.scholarpedia.org/article/Chirikov_standard_map',
    locator: [
      '원 연구자 저술의 사상 식·원통/토러스 구분·유한 궤적과 확산의 차이를 대조합니다.',
      'The original researchers’ account supplies map equations, cylinder-versus-torus conventions and limits of finite-orbit diffusion interpretation.'
    ]
  }
});
