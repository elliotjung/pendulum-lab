import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.6',
  summary: [
    '두 줄이 번갈아 느슨해지면 하나의 매끄러운 이중진자 방정식으로 충분할까요? 활성 구속과 모드 전환의 에너지·잔차를 추적합니다.',
    'Can one smooth double-pendulum equation describe two strings going slack? Track active constraints, energy and residuals across mode changes.'
  ],
  objectives: [
    ['팽팽함·바깥 줄 이완·전체 이완 모드를 구분합니다.', 'Distinguish taut, outer-slack and full-slack modes.'],
    [
      '사건 순서·길이 잔차·에너지 변화를 함께 해석합니다.',
      'Interpret event order, length residuals and energy changes together.'
    ]
  ],
  prerequisites: [
    '질점 두 개와 당길 수만 있는 질량 없는 줄, 양의 질량·최대 길이, 평면 운동입니다. 모든 시작 각도는 아래 수직 기준 절대각이며 감쇠는 0입니다. 위치는 첫 질점이 지지점 기준, 둘째 질점이 첫 질점 기준 거리 구속을 가집니다.',
    'Use two point masses and pull-only massless strings with positive masses and maximum lengths in a plane. Initial angles are absolute from downward vertical and damping is zero. The first distance is from the pivot; the second is between particles.'
  ],
  concepts: [
    {
      id: 'active-set',
      title: ['1. 각 줄의 활성 집합', '1. Active set for each string'],
      body: [
        '각 줄은 길이가 최대값보다 짧으면 장력이 0이고, 장력이 양수이면 최대 길이 경계에 있습니다. 두 줄이 모두 팽팽할 때만 강체 이중진자의 매끄러운 방정식을 사용할 수 있습니다. 줄 하나가 이완하면 기존 등식 하나가 사라져 다른 자유 비행 방정식과 연결됩니다.',
        'A string shorter than its maximum has zero tension; positive tension requires the maximum-length boundary. Smooth rigid double-pendulum equations apply only while both strings are taut. Releasing a string removes an equality and changes the continuous equations.'
      ]
    },
    {
      id: 'three-mode-model',
      title: ['2. 구현된 세 모드와 생략된 모드', '2. Implemented and omitted modes'],
      body: [
        '기존 엔진은 taut, outer-slack, full-slack 세 모드를 사용합니다. 안쪽 줄만 이완하고 바깥 줄만 팽팽한 운동을 별도의 완전한 모드로 풀지 않습니다. 따라서 모든 일방 구속계의 정확한 일반 해법이라고 해석하면 안 됩니다. 초기 음의 장력으로 생긴 사건은 초기 유효성 검사로 분류합니다.',
        'The preserved engine has taut, outer-slack and full-slack modes. It does not separately solve a complete inner-slack/outer-taut mode. It is therefore not a general exact solver for every unilateral constraint configuration. Events caused by initially negative tension are initial validity checks.'
      ]
    },
    {
      id: 'audit-transition',
      title: ['3. 사건 에너지 수지와 한계', '3. Audit transition energy and limits'],
      body: [
        '같은 물리 시각의 위치·속도·에너지를 비교하고 사건의 link와 source를 읽습니다. 재포획의 기록된 손실은 비음수지만 단순화된 모드 전환에서 전체 역학에너지가 증가할 수도 있습니다. 그러므로 E+누적손실이 언제나 일정하다고 주장하지 않습니다. 큰 길이 잔차와 에너지 증가를 숨기지 말고 간격 수렴과 모형 한계의 증거로 남기세요.',
        'Compare positions, velocities and energy at matched times and read each event link and source. Recorded capture loss is nonnegative, yet simplified mode changes can increase total mechanical energy. Do not claim E plus accumulated loss is always constant. Preserve large length residuals and energy increases as evidence of numerical or model limits.'
      ]
    }
  ],
  equations: [
    {
      id: 'unilateral-gaps',
      title: ['최대 길이와 비음수 간격', 'Maximum lengths and nonnegative gaps'],
      expression: 'gap1=l1-r1; gap2=l2-r2; gap1>=0; gap2>=0',
      explanation: [
        'r1은 지지점과 첫 질점 사이 거리, r2는 두 질점 사이 거리입니다. gap은 줄의 접힌 여유 길이로, 양수인 것이 위반은 아닙니다.',
        'r1 is pivot-to-first distance and r2 is inter-particle distance. A positive gap means available folded length, not a violation.'
      ],
      symbols: [
        ['gap1', 'm', '안쪽 줄 여유 길이', 'Inner-string gap'],
        ['l1', 'm', '안쪽 최대 길이', 'Inner maximum length'],
        ['r1', 'm', '지지점에서 첫 질점 거리', 'Pivot-to-first distance'],
        ['gap2', 'm', '바깥 줄 여유 길이', 'Outer-string gap'],
        ['l2', 'm', '바깥 최대 길이', 'Outer maximum length'],
        ['r2', 'm', '두 질점 사이 거리', 'Inter-particle distance']
      ]
    },
    {
      id: 'complementarity',
      title: ['상보 조건과 에너지 감사', 'Complementarity and energy audit'],
      expression: 'T1>=0; T2>=0; T1*gap1=0; T2*gap2=0; defect=Eend-Estart+loss',
      explanation: [
        '각 줄의 장력과 여유 길이는 동시에 양수일 수 없습니다. defect는 끝 에너지에서 처음 에너지를 빼고 기록된 손실을 더한 값으로, 이 단순화 모형에서 반드시 0은 아닙니다.',
        'Tension and gap of the same string cannot both be positive. The audit defect adds recorded loss to final minus initial energy; it need not vanish in this simplified model.'
      ],
      symbols: [
        ['T1', 'N', '안쪽 장력', 'Inner tension'],
        ['T2', 'N', '바깥 장력', 'Outer tension'],
        ['gap1', 'm', '안쪽 여유 길이', 'Inner gap'],
        ['gap2', 'm', '바깥 여유 길이', 'Outer gap'],
        ['defect', 'J', '기록 손실로 설명되지 않는 에너지 차이', 'Energy change unexplained by recorded loss'],
        ['Eend', 'J', '종료 역학에너지', 'Final mechanical energy'],
        ['Estart', 'J', '초기 역학에너지', 'Initial mechanical energy'],
        ['loss', 'J', '누적 기록 포획 손실', 'Accumulated recorded capture loss']
      ]
    }
  ],
  questions: [
    {
      id: 'mode-coverage',
      prompt: [
        '이 모형은 안쪽만 느슨하고 바깥만 팽팽한 경우도 독립 모드로 완전히 푸나요?',
        'Does this model fully solve inner-slack/outer-taut motion as a separate mode?'
      ],
      correct: ['아닙니다. 그 모드는 별도로 구현되지 않았습니다.', 'No. That mode is not implemented separately.'],
      distractor: ['그렇습니다. 가능한 모든 조합을 정확히 풉니다.', 'Yes. It exactly solves every combination.'],
      explanation: [
        '세 모드 근사와 일반 상보성 해법을 구분해야 합니다.',
        'Distinguish the three-mode approximation from a general complementarity solver.'
      ]
    },
    {
      id: 'loss-accounting',
      prompt: [
        '포획 손실이 비음수이면 E+누적손실은 반드시 보존되나요?',
        'If capture loss is nonnegative, must E plus accumulated loss be conserved?'
      ],
      correct: [
        '아닙니다. 다른 단순화 전환이 에너지 결함을 만들 수 있습니다.',
        'No. Other simplified transitions can produce an energy defect.'
      ],
      distractor: [
        '그렇습니다. 모든 전환의 정확한 수지 증명입니다.',
        'Yes. It proves exact accounting for every transition.'
      ],
      explanation: [
        '기록된 손실과 전체 에너지 수지 검증은 서로 다른 조건입니다.',
        'Recorded loss and a verified total-energy balance are separate conditions.'
      ]
    }
  ],
  prediction: [
    '바깥 시작 각도만 크게 바꾸면 어떤 줄이 먼저 이완할까요?',
    'If only the outer initial angle is large, which string will release first?'
  ],
  action: [
    '기본 상태를 실행해 바깥 줄 초기 이완을 읽으세요. theta1=theta2=2.5 rad의 전체 이완과 비교하고 step을 줄여 사건 순서·잔차·에너지 결함을 확인하세요.',
    'Run the default and inspect initial outer-string release. Compare with theta1=theta2=2.5 rad for full slack, then reduce step and inspect event order, residuals and energy defects.'
  ],
  expected: [
    '기본(0.4,2.6)rad의 바깥 이완과(2.5,2.5)rad의 전체 이완은 서로 다른 모드로 식별되어야 합니다. 사건 시각은 비감소하고 장력은 비음수입니다. 고정 간격 반복은 같은 사건열을 재현해야 하며 이중 줄의 에너지 결함을 0으로 강제하지 않습니다.',
    'Default(0.4,2.6)rad outer release and(2.5,2.5)rad full slack must be distinguished. Event times are nondecreasing and tensions nonnegative. Repeating a fixed-step run must reproduce its event sequence; do not force the double-string energy defect to zero.'
  ],
  explanation: [
    '모드 분류·결정론 검증은 전체 모형의 물리적 정확성 보증이 아닙니다. 단순화된 재포획과 누락 모드의 영향을 함께 보고합니다.',
    'Mode classification and determinism do not certify complete physical fidelity. Report the effects of simplified capture and the omitted mode.'
  ],
  next: [
    '사건이 있는 구속과 강체 구속을 구분했습니다. 3.7에서는 고정 길이를 유지하면서 운동 방향이 공간으로 확장될 때의 보존량을 살펴보세요.',
    'Having distinguished event-driven and rigid constraints, explore conserved quantities of spatial fixed-length motion in3.7.'
  ],
  source: {
    path: 'src/physics/doubleString.ts',
    locator: [
      'DoubleStringPhase, 모드 전환·장력·doubleStringEnergy를 확인했고 constraint-schema 경고의 모형 한계와 대조했습니다.',
      'Checked DoubleStringPhase, transitions, tensions and doubleStringEnergy against the model-limit warnings in constraint-schema.'
    ]
  }
});
