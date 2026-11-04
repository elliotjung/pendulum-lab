import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.7',
  summary: [
    '공간에서 도는 진자는 무엇을 보존할까요? 축대칭에서 나온 수직 각운동량과 방위 회전을 연결하고 전체 벡터 보존과 구분합니다.',
    'What does a spatial pendulum conserve? Connect axial symmetry, vertical angular momentum and azimuthal motion, distinguishing them from conservation of the full vector.'
  ],
  objectives: [
    [
      '구면 좌표의 위치·에너지·수직 각운동량을 유도합니다.',
      'Derive position, energy and vertical momentum in spherical coordinates.'
    ],
    [
      '방위 속도 변화와 세차·극점 좌표 한계를 관찰합니다.',
      'Observe azimuthal motion and precession while identifying polar-chart limits.'
    ]
  ],
  prerequisites: [
    '질점은 고정 지지점에서 길이 l인 강체 막대로 연결됩니다. 오른손 xyz에서 y가 위쪽이고 중력은 -y입니다. theta는 아래 수직 기준, phi는 +x에서 +z로 증가합니다. 이 phi 방향 때문에 +y 각운동량은 -m l² sin²(theta) phiDot입니다. 줄의 이완은 이 강체 모형에 없습니다.',
    'A point mass is attached by a rigid rod of length l. In right-handed xyz, y is up and gravity points -y. theta is from downward vertical and phi increases from +x toward +z, so +y angular momentum is -m l squared sin squared(theta) phiDot. This rigid model has no string release.'
  ],
  concepts: [
    {
      id: 'spherical-kinematics',
      title: ['1. 두 각도와 공간 속도', '1. Two angles and spatial velocity'],
      body: [
        '위치의 수평 반지름은 l sin(theta), 높이는 -l cos(theta)입니다. 시간 미분한 속력 제곱은 l²(thetaDot²+sin²(theta) phiDot²)입니다. 방위 속도를 일정하게 놓아도 극각이 바뀌면 수평 속력과 각운동량이 바뀌므로 실제 자유운동에서 phiDot은 일반적으로 일정하지 않습니다.',
        'Horizontal radius is l sin(theta), and height is -l cos(theta). Differentiation gives squared speed l squared(thetaDot squared+sin squared(theta) phiDot squared). Even at fixed azimuthal rate, changing theta changes horizontal speed and momentum; free motion generally has variable phiDot.'
      ]
    },
    {
      id: 'axial-symmetry',
      title: ['2. 축대칭에서 보존량 얻기', '2. Conservation from axial symmetry'],
      body: [
        '라그랑지안에 phi 자체가 없으므로 그 켤레 운동량 m l² sin²(theta) phiDot은 보존됩니다. 여기의 phi 방향은 +y 오른손 회전의 반대이므로 실제 +y 성분 Ly는 켤레 운동량의 음수입니다. 중력은 수평 토크를 만들 수 있어 전체 각운동량 벡터는 일반적으로 보존되지 않습니다.',
        'The Lagrangian is independent of phi, so its conjugate momentum m l squared sin squared(theta) phiDot is conserved. This azimuth convention runs opposite to positive right-handed rotation about +y; therefore Ly is its negative. Gravity can exert horizontal torque, so the full momentum vector is generally not conserved.'
      ]
    },
    {
      id: 'precession-limits',
      title: ['3. 세차와 좌표 특이점', '3. Precession and chart singularity'],
      body: [
        '수평 투영의 방향이 시간에 따라 회전하는 현상을 방위 운동으로 읽습니다. 일반 궤적에는 극각 진동도 함께 있으며 등속 원뿔 운동은 특별한 초기조건입니다. 무감쇠에서 E와 Ly의 드리프트를 간격 수렴으로 확인하세요. theta가0 또는pi에 가까우면 phi는 유일하지 않고 cot(theta) 항이 수치적으로 민감해지므로 매입 좌표와 비교해야 합니다.',
        'Read rotation of the horizontal projection as azimuthal motion. General orbits also nutate; steady conical motion requires special initial conditions. Check E and Ly drift by step refinement without damping. Near theta=0 or pi, azimuth is not unique and cot(theta) is numerically sensitive; compare embedded coordinates.'
      ]
    }
  ],
  equations: [
    {
      id: 'spherical-position',
      title: ['위쪽 y 기준 위치', 'Position with upward y'],
      expression: 'x=l*sin(theta)*cos(phi); y=-l*cos(theta); z=l*sin(theta)*sin(phi)',
      explanation: [
        'theta는 아래 수직선에서, phi는 x에서 z 방향으로 재며 세 위치 성분은 구면 위에 놓입니다.',
        'Measure theta from downward vertical and phi from x toward z; the three position components lie on the sphere.'
      ],
      symbols: [
        ['x', 'm', '가로 x 위치', 'Horizontal x position'],
        ['l', 'm', '고정 막대 길이', 'Fixed rod length'],
        ['theta', 'rad', '아래 수직 기준 극각', 'Polar angle from downward vertical'],
        ['phi', 'rad', 'x에서 z로 증가하는 방위각', 'Azimuth increasing from x toward z'],
        ['y', 'm', '위쪽 양의 높이', 'Upward height'],
        ['z', 'm', '수평 z 위치', 'Horizontal z position']
      ]
    },
    {
      id: 'spherical-invariants',
      title: ['에너지와 +y 각운동량', 'Energy and +y angular momentum'],
      expression: 'E=m*l^2*(thetaDot^2+sin(theta)^2*phiDot^2)/2-m*g*l*cos(theta); Ly=-m*l^2*sin(theta)^2*phiDot',
      explanation: [
        '에너지는 공간 운동에너지와 중력 퍼텐셜의 합입니다. +y 성분은 위치 외적 운동량에서 얻으며 이 방위각 정의에서 마이너스 부호를 가집니다.',
        'Energy sums spatial kinetic and gravitational potential energy. The +y component follows from position cross momentum and has a minus sign under this azimuth convention.'
      ],
      symbols: [
        ['E', 'J', '총역학에너지', 'Total mechanical energy'],
        ['m', 'kg', '질점 질량', 'Bob mass'],
        ['l', 'm', '막대 길이', 'Rod length'],
        ['thetaDot', 'rad/s', '극각 속도', 'Polar angular rate'],
        ['theta', 'rad', '극각', 'Polar angle'],
        ['phiDot', 'rad/s', '방위각 속도', 'Azimuthal rate'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['Ly', 'kg*m^2/s', '위쪽 +y 각운동량', 'Upward +y angular momentum']
      ]
    }
  ],
  questions: [
    {
      id: 'vector-conservation',
      prompt: [
        '무감쇠 구면진자에서 중력 아래 보존되는 각운동량은?',
        'Which angular momentum is conserved for an undamped spherical pendulum under gravity?'
      ],
      correct: [
        '수직 +y 성분이며 전체 벡터는 일반적으로 아닙니다.',
        'The vertical +y component, generally not the entire vector.'
      ],
      distractor: ['항상 세 성분 전체가 각각 보존됩니다.', 'All three components are always conserved separately.'],
      explanation: [
        '중력 토크의 y 성분은 0이지만 수평 성분은 0일 필요가 없습니다.',
        'Gravity torque has zero y component but need not have zero horizontal components.'
      ]
    },
    {
      id: 'sign-convention',
      prompt: [
        'theta가 극점이 아니고 phiDot>0이면 이 제품의 Ly 부호는?',
        'Away from the poles, what is the sign of product Ly when phiDot>0?'
      ],
      correct: ['음수입니다.', 'Negative.'],
      distractor: ['표기에 관계없이 항상 양수입니다.', 'Always positive regardless of coordinate convention.'],
      explanation: [
        'phi가 +x에서 +z로 증가하므로 r cross mv의 y 성분은 음수입니다.',
        'Because phi increases from +x toward +z, the y component of r cross mv is negative.'
      ]
    }
  ],
  prediction: [
    '방위 속도를 0에서 양수로 바꾸면 수평 궤적과 Ly는 어떻게 바뀔까요?',
    'How do the horizontal orbit and Ly change as azimuthal rate goes from zero to positive?'
  ],
  action: [
    'phiDot1=0과 기본1.2 rad/s를 비교하세요. theta1과 step을 바꾸며 3차원 위치·수직 각운동량·에너지 드리프트를 관찰하세요.',
    'Compare phiDot1=0 with the default1.2 rad/s. Change theta1 and step and inspect spatial position, vertical momentum and energy drift.'
  ],
  expected: [
    'm=l=1,theta1=0.6 rad,phiDot1=1.2 rad/s의 초기 Ly는 약-0.3825853473 kg·m²/s입니다(허용 오차1e-9). phiDot1=0이면 Ly는1e-12 이내0이며 무감쇠 궤적은 한 수직 평면에 머뭅니다.',
    'For m=l=1,theta1=0.6 rad,phiDot1=1.2 rad/s initial Ly is about-0.3825853473 kg m²/s within1e-9. At phiDot1=0, Ly is zero within1e-12 and undamped motion stays in one vertical plane.'
  ],
  explanation: [
    '부호는 +y 축의 오른손 외적 정의에서 정해집니다. 화면 카메라를 돌려도 물리적 Ly 값은 바뀌지 않습니다.',
    'The sign follows the right-handed cross product about +y. Rotating the camera does not change physical Ly.'
  ],
  next: [
    '공간 좌표와 보존량을 확인했습니다. 3.8에서는 여러 구면 링크의 관성과 세차가 어떻게 결합되는지 살펴보세요.',
    'After checking spatial coordinates and invariants, explore coupled inertia and precession of multiple spherical links in3.8.'
  ],
  source: {
    path: 'src/physics/spherical.ts',
    locator: [
      'sphericalRhs, sphericalEnergy, sphericalPosition을 대조했습니다. 원 Lz와 제품 +y Ly의 반대 부호는 spatial adapter와 확인했습니다.',
      'Checked sphericalRhs, sphericalEnergy and sphericalPosition; opposite signs of legacy Lz and product +y Ly verified in the spatial adapter.'
    ]
  }
});
