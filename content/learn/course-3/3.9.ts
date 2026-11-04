import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.9',
  summary: [
    '극점에서 방위각이 정의되지 않아도 질점의 운동은 계속됩니다. 단위 방향과 접선 속도 표현으로 좌표 특이점과 구속 잔차를 분리합니다.',
    'The bob can keep moving when azimuth becomes undefined at a pole. Use unit direction and tangent velocity to separate chart singularity from constraint error.'
  ],
  objectives: [
    [
      '극좌표를 단위 방향·접선 속도로 변환하고 구속을 설명합니다.',
      'Convert polar coordinates to unit direction and tangent velocity and explain their constraints.'
    ],
    [
      '같은 초기 물리 상태의 두 표현을 Cartesian 값으로 비교합니다.',
      'Compare two representations of the same initial physical state in Cartesian coordinates.'
    ]
  ],
  prerequisites: [
    '강체 구면진자와 무감쇠이며 y는 위쪽입니다. u는 길이1의 무차원 방향, w=du/dt는 단위 s^-1의 접선 속도입니다. 실제 위치는 l u이고 속도는 l w입니다. 극점의 phi는 유일하지 않으므로 원시 각도 차이를 물리적 거리로 쓰지 않습니다.',
    'Use an undamped rigid spherical pendulum with upward y. u is a dimensionless unit direction and w=du/dt has units s^-1 and is tangent to the sphere. Position is l u and velocity l w. Azimuth is nonunique at a pole, so raw angle differences are not physical distances.'
  ],
  concepts: [
    {
      id: 'chart-singularity',
      title: ['1. 물리적 점과 좌표표의 구분', '1. Distinguish a physical point from its chart'],
      body: [
        'theta=0이면 모든 phi가 같은 아래쪽 점을 나타냅니다. 각도 방정식의 cot(theta) 발산은 그 점의 운동이 발산한다는 뜻이 아닙니다. 최소좌표는 적은 변수를 쓰지만 한 좌표표로 구 전체를 매끄럽게 덮을 수 없습니다. 극점 부근 비교에서는 x,y,z와 실제 속도를 사용합니다.',
        'At theta=0 every phi denotes the same downward point. Diverging cot(theta) in the angle equation does not mean physical motion diverges. Minimal coordinates use fewer variables, but one smooth chart cannot cover the entire sphere. Compare Cartesian positions and velocities near a pole.'
      ]
    },
    {
      id: 'embedded-constraint',
      title: ['2. 여섯 성분과 두 구속', '2. Six components and two constraints'],
      body: [
        '방향 u의 세 성분과 w의 세 성분을 쓰면 여섯 수가 필요합니다. 그러나 u·u=1과 u·w=0 두 구속이 있어 물리 상태 차원은 여전히4입니다. 단위 길이 조건을 미분하면 접선 조건이 나오고, 다시 미분하면 방향 가속도의 반지름 성분이 -|w|²로 정해집니다.',
        'Using three components each for u and w requires six numbers. Constraints u dot u=1 and u dot w=0 leave four physical state dimensions. Differentiating the unit constraint gives tangency; differentiating again fixes the radial acceleration component to -|w| squared.'
      ]
    },
    {
      id: 'projection-and-error',
      title: ['3. 투영과 독립 검증', '3. Projection and independent verification'],
      body: [
        '보존 엔진은 매 단계 방향을 정규화하고 속도를 접선에 투영합니다. 이 조치는 구속 잔차를 줄이지만 정확한 에너지 보존이나 symplectic 성질을 보장하지 않습니다. 같은 물리 초기조건을 두 표현으로 실행해 위치 차이·에너지·Ly·단위 및 접선 잔차를 함께 비교합니다. 각도로 되돌릴 때 생기는 방위 점프를 실제 궤적의 불연속으로 오해하지 마세요.',
        'The preserved engine normalizes direction and projects velocity to the tangent plane each step. This reduces constraint residuals without guaranteeing exact energy conservation or symplecticity. Match physical initial states and compare position differences, energy, Ly, unit and tangency residuals. Azimuth jumps during conversion back to angles need not be physical discontinuities.'
      ]
    }
  ],
  equations: [
    {
      id: 'unit-tangent',
      title: ['단위 방향과 접선 구속', 'Unit direction and tangency constraints'],
      expression: 'ux^2+uy^2+uz^2=1; ux*wx+uy*wy+uz*wz=0',
      explanation: [
        '방향 성분의 제곱합은1이며 방향과 방향 속도의 내적은0입니다. 첫 식은 무차원, 둘째 식은 초의 역수 단위입니다.',
        'Direction components have squared norm1 and are orthogonal to their rate. The first relation is dimensionless and the second has reciprocal-second units.'
      ],
      symbols: [
        ['ux', '1', '단위 방향 x 성분', 'Unit direction x'],
        ['uy', '1', '단위 방향 y 성분', 'Unit direction y'],
        ['uz', '1', '단위 방향 z 성분', 'Unit direction z'],
        ['wx', 's^-1', '방향 속도 x 성분', 'Direction-rate x'],
        ['wy', 's^-1', '방향 속도 y 성분', 'Direction-rate y'],
        ['wz', 's^-1', '방향 속도 z 성분', 'Direction-rate z']
      ]
    },
    {
      id: 'embedded-dynamics',
      title: ['특이한 방위각 없는 가속도', 'Acceleration without singular azimuth'],
      expression: 'speed2=wx^2+wy^2+wz^2; c=(g/l)*uy-speed2; ax=c*ux; ay=-g/l+c*uy; az=c*uz',
      explanation: [
        '중력을 접선에 투영하고 구면의 법선 가속도를 더한 무감쇠 방향 가속도입니다. c와 각 가속도 성분은 s^-2 단위이며 theta의 역수는 없습니다.',
        'These undamped direction accelerations combine projected gravity and normal acceleration of spherical motion. c and acceleration components have units s^-2, without an inverse theta.'
      ],
      symbols: [
        ['speed2', 's^-2', '방향 속력 제곱', 'Squared direction speed'],
        ['wx', 's^-1', '방향 속도 x 성분', 'Direction-rate x'],
        ['wy', 's^-1', '방향 속도 y 성분', 'Direction-rate y'],
        ['wz', 's^-1', '방향 속도 z 성분', 'Direction-rate z'],
        ['c', 's^-2', '반지름 가속도 계수', 'Radial acceleration coefficient'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['l', 'm', '고정 길이', 'Fixed length'],
        ['uy', '1', '방향 y 성분', 'Direction y'],
        ['ax', 's^-2', '방향 가속도 x 성분', 'Direction acceleration x'],
        ['ux', '1', '방향 x 성분', 'Direction x'],
        ['ay', 's^-2', '방향 가속도 y 성분', 'Direction acceleration y'],
        ['az', 's^-2', '방향 가속도 z 성분', 'Direction acceleration z'],
        ['uz', '1', '방향 z 성분', 'Direction z']
      ]
    }
  ],
  questions: [
    {
      id: 'state-dimension',
      prompt: [
        '매입 상태는 수6개이므로 물리 상태 차원이6인가요?',
        'Does an embedded state with six numbers have six physical state dimensions?'
      ],
      correct: [
        '아닙니다. 두 독립 구속으로 물리 상태 차원은4입니다.',
        'No. Two independent constraints leave four physical state dimensions.'
      ],
      distractor: [
        '그렇습니다. 좌표 수는 언제나 자유도와 같습니다.',
        'Yes. Coordinate count always equals physical degrees of freedom.'
      ],
      explanation: [
        '중복 좌표와 독립 상태를 구분합니다. 구성 자유도는2, 상태 차원은4입니다.',
        'Distinguish redundant coordinates from independent states. Configuration has two degrees of freedom and state dimension four.'
      ]
    },
    {
      id: 'projection-proof',
      prompt: [
        '정규화 후 |u|=1이면 적분 에너지도 정확히 보존되나요?',
        'If normalization gives |u|=1, is energy integration exact?'
      ],
      correct: [
        '아닙니다. 구속과 에너지 정확도는 독립 검증입니다.',
        'No. Constraint and energy accuracy need independent checks.'
      ],
      distractor: ['그렇습니다. 모든 오차가 정규화로 없어집니다.', 'Yes. Normalization removes every numerical error.'],
      explanation: [
        '투영 자체가 에너지를 바꿀 수 있으므로 간격 수렴과 보존량 검사를 함께 수행합니다.',
        'Projection can itself change energy, so combine step convergence with invariant checks.'
      ]
    }
  ],
  prediction: [
    '극점을 지날 때 phi가 급변하면 질점도 순간 이동할까요?',
    'If phi changes sharply near a pole, does the bob teleport?'
  ],
  action: [
    '기본 theta1=0.01 rad의 극점 근처 실험을 실행하세요. 매입·각도 동반 실행의 Cartesian 위치·에너지·Ly와 단위·접선 잔차를 비교하고 step을 줄이세요.',
    'Run the default near-pole theta1=0.01 rad experiment. Compare embedded and angle companions in Cartesian position, energy, Ly and unit/tangency residuals; repeat with a smaller step.'
  ],
  expected: [
    '같은 물리 초기조건의 두 표현은 초기 위치가1e-12 m 이내로 일치해야 합니다. 매입 실행의 단위·접선 잔차는1e-10,1e-10 s^-1 이하 fixture를 만족합니다. 극점 근처 원시 phi의 일치나 두 해의 전시간 동일성을 강제하지 않습니다.',
    'Two representations of the same physical initial condition agree in initial position within1e-12 m. Embedded fixtures require unit and tangency residuals below1e-10 and1e-10 s^-1. Do not require raw phi agreement or identical trajectories for all time near the pole.'
  ],
  explanation: [
    '매입 표현은 좌표표 문제를 피하지만 유한 간격 적분 오차는 남습니다. 화면에서는 수치 잔차와 물리적 운동을 분리해 읽어야 합니다.',
    'Embedding avoids the chart problem while retaining finite-step integration error. Read numerical residuals separately from physical motion.'
  ],
  next: [
    '여섯 좌표와 두 구속으로 같은4차원 상태를 표현했습니다. 실험실에서 구면 사슬의 매입 표현도 비교하되 극점·조건수·보존량을 함께 확인하세요.',
    'Six components and two constraints represent the same four-dimensional state. In Lab, compare embedded spherical chains while checking poles, conditioning and invariants together.'
  ],
  source: {
    path: 'src/physics/sphericalEmbedded.ts',
    locator: [
      'sphericalEmbeddedRhs, angleToEmbedded, embeddedToAngle과 매 단계 정규화·접선 투영을 대조했습니다.',
      'Checked sphericalEmbeddedRhs, angleToEmbedded, embeddedToAngle and the per-step normalization/tangent projection.'
    ]
  }
});
