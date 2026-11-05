import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.1',
  summary: [
    '같은 자기 퍼텐셜에서 출발 위치만 바꾸면 어느 자석으로 향할까요? 정착 여부를 지우지 않은 seed grid로 감쇠와 해상도의 영향을 조사합니다.',
    'Which magnet is approached when only the starting position changes? Explore damping and resolution with a seed grid that retains convergence information.'
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
    '정규화한 평면 위치·속도와 세 고정 자석의 현상론적 모형입니다. 높이 h가 힘의 특이점을 정칙화합니다. SI 길이·초나 실제 자석 접촉을 나타내지 않습니다.',
    'This phenomenological model uses normalized planar positions, velocities and three fixed magnets. Height h regularizes the force singularity. Coordinates are not SI lengths or seconds and do not model magnet contact.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '각 자석까지의 평면 거리 제곱에 높이 제곱을 더하면 유한한 3차원 유효 거리가 됩니다. 위치에 따른 native 자기력과 선형 복원력의 합에서 속도 비례 감쇠를 뺍니다. 감쇠의 에너지 소산률은 속도 제곱에 비례합니다.',
        'Adding squared height to squared planar separation gives a finite effective three-dimensional distance. Native magnetic attraction and linear restoring force act alongside velocity damping. The dissipated power is proportional to squared speed.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '궤적은 RK4로, basin grid는 보존된 semi-implicit Euler 정착 루프로 계산합니다. 표는 최근접 자석 ID와 마지막 속도 기준 정착 여부를 모두 보존합니다. 감쇠를 바꿀 때 도착 후보와 미수렴 비율을 별도로 읽습니다.',
        'Trajectories use RK4 while the basin grid uses the preserved semi-implicit Euler settling loop. The table retains nearest-magnet identity and the final-speed settling criterion. Read arrival candidates separately from the unconverged fraction.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '유한 격자·유한 시간의 최근접 자석은 엄밀한 basin 증명이 아닙니다. 낮은 감쇠에서는 단지 천천히 이동하는 점을 정착으로 오해할 수 있습니다. 격자 해상도와 단계 한도를 함께 늘리고 미수렴 mask를 확인합니다.',
        'A nearest magnet on a finite grid at finite time is not a basin proof. At weak damping, slow motion can be mistaken for settling. Increase both resolution and step budget and inspect the unconverged mask.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'distanceSq = dx^2+dy^2+height^2',
      explanation: [
        '유효 거리의 제곱은 두 수평 성분과 정칙화 높이의 제곱 합입니다. 모든 변수는 정규화 값입니다.',
        'Squared effective distance sums squared planar components and the regularizing height; all quantities are normalized.'
      ],
      symbols: [
        ['distanceSq', '1', '유효 거리 제곱', 'Squared effective distance'],
        ['dx', '1', '자석과 x 차', 'Horizontal separation'],
        ['dy', '1', '자석과 y 차', 'Vertical planar separation'],
        ['height', '1', '정칙화 높이', 'Regularizing height']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'dissipation = damping*(vx^2+vy^2)',
      explanation: [
        '감쇠가 제거하는 정규화 에너지율입니다. 양의 감쇠에서 0 이상이며 자기 퍼텐셜의 부호와 구분합니다.',
        'Normalized dissipation is nonnegative for positive damping and is separate from the magnetic-potential sign.'
      ],
      symbols: [
        ['dissipation', '1', '정규화 소산률', 'Normalized dissipation rate'],
        ['damping', '1', '정규화 감쇠', 'Normalized damping'],
        ['vx', '1', '정규화 x 속도', 'Normalized horizontal velocity'],
        ['vy', '1', '정규화 y 속도', 'Normalized vertical velocity']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '격자점의 최근접 자석이 정해지면 basin이 확정되나요?',
        'Does a nearest magnet at a grid point certify the basin?'
      ],
      correct: [
        '정착·시간·해상도 조건을 추가로 확인합니다.',
        'Settling, observation time and resolution still need checking.'
      ],
      incorrect: ['자석 색만 있으면 확정됩니다.', 'The color alone is conclusive.'],
      explanation: [
        '감쇠는 궤적과 정착 속도를 함께 바꾸므로 색 분포와 수렴률을 구분해야 합니다.',
        'Damping changes both trajectories and settling speed, so color distribution and convergence fraction must be separated.'
      ]
    },
    {
      prompt: ['7.1의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.1 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '유한 격자·유한 시간의 최근접 자석은 엄밀한 basin 증명이 아닙니다. 낮은 감쇠에서는 단지 천천히 이동하는 점을 정착으로 오해할 수 있습니다. 격자 해상도와 단계 한도를 함께 늘리고 미수렴 mask를 확인합니다.',
        'A nearest magnet on a finite grid at finite time is not a basin proof. At weak damping, slow motion can be mistaken for settling. Increase both resolution and step budget and inspect the unconverged mask.'
      ]
    }
  ],
  prediction: [
    '감쇠를 0.4에서 0.5로 높이면 미수렴 비율이 어떻게 달라질지 예상하세요.',
    'Predict how the unconverged fraction may change when damping rises from 0.4 to 0.5.'
  ],
  action: [
    '기준 grid와 단계 한도를 유지해 두 감쇠 결과를 비교한 뒤 grid를 하나 늘리세요.',
    'Compare the two damping settings with identical grid and step budget, then increase grid size by one.'
  ],
  expected: [
    '모든 cell이 유한한 좌표와 자석 ID·정착 여부를 가지며 정착 비율은 0~1입니다. 특정 자석의 점유율이 단조 변할 필요는 없습니다.',
    'Every cell has finite coordinates, magnet identity and settling status, and the settled fraction lies in [0,1]. Magnet occupancy need not vary monotonically.'
  ],
  explanation: [
    '감쇠는 궤적과 정착 속도를 함께 바꾸므로 색 분포와 수렴률을 구분해야 합니다.',
    'Damping changes both trajectories and settling speed, so color distribution and convergence fraction must be separated.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['인력권 후보', 'Basin candidate'],
    [
      '유한 시간 정착 기준을 만족한 초기조건의 관측 집합입니다.',
      'An observed set of initial conditions meeting a finite-time settling criterion.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/magneticPendulum.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/magneticPendulum.ts.'
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
  ]
});
