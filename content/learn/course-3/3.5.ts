import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.5',
  summary: [
    '줄은 질점을 밀 수 없습니다. 음의 장력이 필요한 순간의 이완과 재포획을 서로 다른 연속 운동 사이의 사건으로 추적합니다.',
    'A string cannot push a bob. Track release and recapture as events between distinct continuous dynamical regimes.'
  ],
  objectives: [
    ['장력의 부호로 팽팽한 운동의 유효성을 판정합니다.', 'Use tension sign to test validity of taut motion.'],
    [
      '초기 이완·실행 중 0교차·비탄성 재포획을 구분합니다.',
      'Distinguish initial release, an in-run zero crossing and inelastic recapture.'
    ]
  ],
  prerequisites: [
    '질량 없는 늘어나지 않는 줄, 질점 하나, 평면 운동이며 감쇠는 0입니다. theta는 아래 수직 기준, y는 위쪽입니다. 팽팽할 때만 원운동 구속이 활성입니다. 제품 장력은 N, 사건 손실은 J이며 원 엔진의 질량당 값을 adapter가 환산합니다.',
    'Use a massless inextensible string and one planar point mass with zero damping. theta is from downward vertical and y is up. The circular constraint is active only when taut. Product tension is N and event loss J; the adapter scales legacy per-mass values.'
  ],
  concepts: [
    {
      id: 'taut-force',
      title: ['1. 방사 방정식에서 장력 구하기', '1. Recover tension from radial dynamics'],
      body: [
        '팽팽할 때 중심 쪽 가속도는 l omega²입니다. 중력의 반지름 성분을 포함해 힘을 정리하면 T=m(g cos(theta)+l omega²)입니다. 이 값이 음수이면 줄이 질점을 바깥으로 밀어야 하므로 팽팽한 해는 유효하지 않습니다. 이완 동안 T=0이고 질점은 중력 아래 자유 비행합니다.',
        'When taut, inward acceleration is l omega squared. Including radial gravity gives T=m(g cos(theta)+l omega squared). A negative value would require an outward push, so the taut solution is invalid. In slack flight tension is zero and gravity drives projectile motion.'
      ]
    },
    {
      id: 'release-root',
      title: ['2. 초기 유효성 검사와 사건 검출', '2. Initial validity versus event location'],
      body: [
        '기본 높은 각도·정지 상태에서는 처음부터 가상 장력이 음수라 t=0에 이완합니다. 이것은 양의 장력이 0을 통과한 시각을 찾은 결과가 아닙니다. 실행 중의 이완은 장력 0 조건, 재포획은 거리=l이며 바깥으로 움직이는 조건을 내부 간격 안에서 찾습니다. 출력 표본 시각과 사건 시각을 혼동하지 마세요.',
        'At a high-angle rest state, hypothetical taut tension is negative initially and release occurs at t=0. This is a validity check, not a located crossing from positive tension. In-run release locates tension zero; capture locates distance=l while moving outward. Event time need not coincide with output sample time.'
      ]
    },
    {
      id: 'capture-loss',
      title: ['3. 비탄성 재포획과 한계', '3. Inelastic capture and limits'],
      body: [
        '재포획은 줄 방향 속도를 없애고 접선 성분을 유지합니다. 이상적인 순간 투영의 손실은 m vr²/2이며, 포획 전후 위치와 에너지를 함께 비교해야 합니다. 이완 동안 길이가 l보다 짧은 것은 구속 위반이 아닙니다. 이 모형은 실제 줄의 탄성파·파단·충격음을 풀지 않으며 중간 비행 상태 대신 초기 각도·속도로 재시작합니다.',
        'Capture removes radial velocity and keeps tangential velocity. The ideal instantaneous projection loses m vr squared/2, so compare positions and energies around capture. A slack distance shorter than l is not a constraint violation. The model omits string waves, breakage and sound, and restarts from initial angles/rates rather than midflight state.'
      ]
    }
  ],
  equations: [
    {
      id: 'tension-validity',
      title: ['팽팽한 모드의 유효성', 'Validity of the taut mode'],
      expression: 'T=m*(g*cos(theta)+l*omega^2); T>=0',
      explanation: [
        '장력은 안쪽으로 양수이며 음의 계산값은 팽팽한 모드를 버려야 한다는 신호입니다.',
        'Tension is positive inward. A negative hypothetical value signals that the taut mode must be abandoned.'
      ],
      symbols: [
        ['T', 'N', '팽팽한 가정에서 필요한 장력', 'Required tension under the taut assumption'],
        ['m', 'kg', '질점 질량', 'Bob mass'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['theta', 'rad', '아래 수직 기준 각도', 'Angle from downward vertical'],
        ['l', 'm', '줄의 최대 길이', 'Maximum string length'],
        ['omega', 'rad/s', '팽팽한 모드 각속도', 'Taut angular velocity']
      ]
    },
    {
      id: 'capture-projection',
      title: ['재포획의 에너지 투영', 'Capture energy projection'],
      expression: 'Kbefore=m*(vr^2+vt^2)/2; Kafter=m*vt^2/2; loss=Kbefore-Kafter',
      explanation: [
        '같은 포획 위치에서 반지름 속도를 제거하면 운동에너지 차이가 손실입니다. 중력 퍼텐셜은 순간 투영 전후 같은 위치에서 비교합니다.',
        'Removing radial velocity at the same capture position changes kinetic energy by the loss. Compare potential at the same position before and after projection.'
      ],
      symbols: [
        ['Kbefore', 'J', '포획 직전 운동에너지', 'Kinetic energy just before capture'],
        ['m', 'kg', '질점 질량', 'Bob mass'],
        ['vr', 'm/s', '바깥쪽 방사 속도', 'Outward radial speed'],
        ['vt', 'm/s', '접선 속도', 'Tangential speed'],
        ['Kafter', 'J', '포획 직후 운동에너지', 'Kinetic energy just after capture'],
        ['loss', 'J', '비탄성 포획 손실', 'Inelastic capture loss']
      ]
    }
  ],
  questions: [
    {
      id: 'slack-gap',
      prompt: [
        '줄이 이완되어 질점 거리가 줄 최대 길이보다 짧습니다. 이것만으로 구속 위반인가요?',
        'During slack flight the bob is closer than the maximum string length. Is this alone a violation?'
      ],
      correct: [
        '아닙니다. 비활성인 길이 등식 대신 최대 길이 부등식을 따릅니다.',
        'No. The inactive length equality is replaced by a maximum-length inequality.'
      ],
      distractor: [
        '그렇습니다. 모든 시각에 길이가 최대 길이와 같아야 합니다.',
        'Yes. Distance must equal maximum length at every instant.'
      ],
      explanation: [
        '줄은 접힐 수 있으므로 짧아진 거리는 허용됩니다.',
        'The string can fold, so a shorter distance is allowed.'
      ]
    },
    {
      id: 'initial-event',
      prompt: [
        'theta=2.2 rad,omega=0의 t=0 이완을 장력 0 교차라고 기록해도 되나요?',
        'May release at t=0 for theta=2.2 rad,omega=0 be called a tension zero crossing?'
      ],
      correct: [
        '아닙니다. 처음부터 음의 가상 장력을 배제한 유효성 검사입니다.',
        'No. It is an initial validity check rejecting negative hypothetical tension.'
      ],
      distractor: ['그렇습니다. 이완은 언제나 0 교차입니다.', 'Yes. Every release is a zero crossing.'],
      explanation: [
        '교차는 사건 전 양의 장력 구간이 필요하지만 이 초기조건에는 없습니다.',
        'A crossing requires a preceding positive-tension segment, absent in this initial condition.'
      ]
    }
  ],
  prediction: [
    '높은 각도에서 정지한 질점을 원 위에 계속 묶어 둘 수 있을까요?',
    'Can a bob released from rest at a high angle remain constrained to the circle?'
  ],
  action: [
    '기본 theta=2.2 rad,omega=0의 초기 이완과 포획을 theta=0,omega=0의 팽팽한 평형과 비교하세요. 이어 theta=2.2 rad,omega=3 rad/s로 실행해 처음 양수였던 장력이 적분 중0을 통과하는 이완과 이후 재포획을 읽으세요. step을 줄여 사건 시각·잔차를 점검하세요.',
    'Compare initial release and capture at the default theta=2.2 rad,omega=0 with taut equilibrium theta=0,omega=0. Then run theta=2.2 rad,omega=3 rad/s to observe initially positive tension crossing zero during integration, followed by capture. Reduce step and inspect event times and residuals.'
  ],
  expected: [
    '기본은 t=0 초기 이완이며 이완 장력은0 N입니다. theta=0,omega=0에서는 장력9.81 N, 위치(0,-1)m입니다(허용 오차1e-10 N,1e-12 m). theta=2.2 rad,omega=3 rad/s에서는 처음 팽팽하고, t>0의 적분 이완 뒤 재포획이 옵니다. 기본step=0.002 s fixture의 이완 장력 잔차는1e-7 N 이하, 포획 거리 잔차는1e-7 m 이하이며 사건은 시간순·포획 손실은 비음수입니다.',
    'The default releases initially at t=0 with zero slack tension. At theta=0,omega=0 tension is9.81 N and position(0,-1)m within1e-10 N and1e-12 m. For theta=2.2 rad,omega=3 rad/s the initially taut state releases during integration at t>0 and later recaptures. At default step0.002 s, fixtures require release tension residual at most1e-7 N, capture distance residual at most1e-7 m, ordered events and nonnegative capture loss.'
  ],
  explanation: [
    '정지한 높은 각도의 t=0 유효성 판정과, 양의 초기 장력에서 시작한 실제0교차를 구분합니다. 모드가 바뀌면 운동식과 보존량 해석도 바뀝니다. 작은 사건 잔차만으로 전역 궤적 정확도를 보장하지 않으며, 출력 간격과 기존 최대2 ms 내부 분할을 구분해 간격 수렴을 확인하세요.',
    'Distinguish the t=0 validity check at high-angle rest from a true zero crossing reached from positive initial tension. Changing mode changes dynamics and conservation interpretation. A small event residual alone does not certify global trajectory accuracy; distinguish output spacing from the existing maximum2 ms internal substep and check convergence.'
  ],
  next: [
    '줄 한 개의 활성 구속을 구분했습니다. 3.6에서는 두 줄의 여러 모드와 단순화된 재포획의 한계를 확인하세요.',
    'Having identified one string active constraint, inspect multiple modes and simplified capture limits for two strings in3.6.'
  ],
  source: {
    path: 'src/physics/rope.ts',
    locator: [
      'tautTension, releaseToSlack, captureToTaut, 사건 locator와 2 ms 내부 분할을 대조했습니다. 제품의 N/J 환산은 constraint adapter와 확인했습니다.',
      'Checked tautTension, releaseToSlack, captureToTaut, event location and2 ms internal splitting; N/J conversion checked against the constraint adapter.'
    ]
  }
});
