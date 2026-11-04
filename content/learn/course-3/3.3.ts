import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.3',
  summary: [
    '질량과 길이가 같아도 균일 막대와 끝점 질량은 같은 운동을 하지 않습니다. 질량중심 병진과 자체 회전을 함께 세어 관성 차이를 설명합니다.',
    'A uniform rod and an endpoint mass can move differently at identical mass and length. Account for center-of-mass translation and rotation about the center.'
  ],
  objectives: [
    ['평행축 정리와 작은 진동 주기를 유도합니다.', 'Derive the parallel-axis relation and small-oscillation period.'],
    [
      '균일 막대 두 개와 질점 이중진자의 관성·궤적 차이를 구분합니다.',
      'Distinguish the inertia and trajectories of two uniform rods from point-mass double pendulums.'
    ]
  ],
  prerequisites: [
    '두 균일 강체 막대가 마찰 없는 관절로 이어지고 각도는 아래 수직 기준 절대각입니다. 회전 관성의 단위는 kg·m²입니다. 이 제품은 균일 막대 모형이며 질량중심 위치나 임의 관성분포를 별도 입력하지 않습니다.',
    'Two uniform rigid rods are connected by frictionless joints. Angles are absolute from downward vertical; inertia has units kg m². This product uses uniform rods and does not independently accept arbitrary center-of-mass positions or inertia distributions.'
  ],
  concepts: [
    {
      id: 'center-and-spin',
      title: ['1. 병진과 자체 회전', '1. Translation and spin'],
      body: [
        '강체의 운동에너지는 질량중심의 병진 에너지와 질량중심 둘레 회전 에너지의 합입니다. 균일 막대의 중심은 길이의 절반이며 중심 관성은 mL²/12입니다. 중심 속도를 사용한 뒤 다시 관절 관성 mL²/3을 더하면 평행축 기여를 두 번 세므로 잘못입니다.',
        'Rigid-body kinetic energy combines center translation and rotation about that center. A uniform rod has its center halfway along the rod and center inertia mL squared/12. Adding hinge inertia mL squared/3 after already using center velocity would double-count the parallel-axis contribution.'
      ]
    },
    {
      id: 'physical-pendulum',
      title: ['2. 작은 진동 주기의 유도', '2. Derive the small-oscillation period'],
      body: [
        '하나의 강체에 대한 중력 토크는 -mgd sin(theta)입니다. I alpha와 같게 두고 작은 각도에서 sin(theta)를 theta로 바꾸면 각진동수 제곱은 mgd/I입니다. 끝점 질량은 d=L과 I=mL², 균일 막대는 d=L/2와 I=mL²/3이므로 같은 전체 길이의 막대 주기는 질점 주기의 sqrt(2/3)배입니다. 이 단일 진자 식을 관절 두 개인 계의 주기에 그대로 대입하지 않습니다.',
        'For one rigid body gravity supplies torque -mgd sin(theta). Equating it to I alpha and linearizing gives squared frequency mgd/I. An endpoint mass has d=L and I=mL squared; a uniform rod has d=L/2 and I=mL squared/3. Its period is sqrt(2/3) of the endpoint-mass period at equal length. Do not apply this one-joint formula directly to a two-joint system.'
      ]
    },
    {
      id: 'two-rods',
      title: ['3. 두 막대의 관성행렬', '3. Inertia of two rods'],
      body: [
        '둘째 막대 중심은 첫 링크 끝에서 둘째 길이의 절반만큼 떨어져 있습니다. 두 중심의 병진과 각 막대의 자체 회전을 더하면 단위 질량·길이, 나란한 상태에서 M11=4/3, M12=1/2, M22=1/3 kg·m²입니다. 질점 이중진자의 2,1,1과 다릅니다. 길이·질량을 바꾸면 분포가 함께 바뀌며 일반적인 주기 증가·감소 방향은 보장되지 않습니다.',
        'The second rod center lies half its length beyond the first endpoint. Combining center translations with both spins gives M11=4/3, M12=1/2 and M22=1/3 kg m² for aligned unit rods. These differ from point-mass values 2,1,1. Changing lengths and masses changes the distribution; no universal direction of period change is guaranteed.'
      ]
    }
  ],
  equations: [
    {
      id: 'parallel-axis-period',
      title: ['관절 관성과 작은 진동', 'Hinge inertia and small oscillations'],
      expression: 'I=Ic+m*d^2; P=2*pi*sqrt(I/(m*g*d))',
      explanation: [
        'I는 관절 축의 관성, Ic는 평행한 중심 축의 관성입니다. P는 단일 강체가 작은 각도로 진동할 때의 근사 주기입니다.',
        'I is hinge-axis inertia and Ic is center-axis inertia. P is the approximate small-angle period of a single rigid body.'
      ],
      symbols: [
        ['I', 'kg*m^2', '관절 축 관성', 'Hinge-axis moment of inertia'],
        ['Ic', 'kg*m^2', '질량중심 축 관성', 'Center-axis moment of inertia'],
        ['m', 'kg', '강체 전체 질량', 'Total rigid-body mass'],
        ['d', 'm', '지지점에서 질량중심까지 거리', 'Pivot-to-center distance'],
        ['P', 's', '작은 진폭 단일 강체 주기', 'Single-body small-amplitude period'],
        ['pi', '1', '원주율', 'Circle constant'],
        ['g', 'm/s^2', '중력 가속도', 'Gravitational acceleration']
      ]
    },
    {
      id: 'uniform-rod-inertia',
      title: ['두 균일 막대의 행렬', 'Two uniform-rod matrix'],
      expression: 'M11=(m1/3+m2)*l1^2; M12=m2*l1*l2*cos(theta1-theta2)/2; M22=m2*l2^2/3',
      explanation: [
        '각 막대 중심의 병진과 중심 둘레 회전을 모아 얻은 관성행렬입니다. 각도는 서로 상대각이 아닌 두 절대각입니다.',
        'This inertia matrix combines center translations and center-axis rotations. The angles are both absolute rather than relative joint coordinates.'
      ],
      symbols: [
        ['M11', 'kg*m^2', '첫 대각 관성', 'First diagonal inertia'],
        ['m1', 'kg', '첫 막대 질량', 'First rod mass'],
        ['m2', 'kg', '둘째 막대 질량', 'Second rod mass'],
        ['l1', 'm', '첫 막대 전체 길이', 'Full first-rod length'],
        ['M12', 'kg*m^2', '막대 사이 결합 관성', 'Inter-rod coupling inertia'],
        ['l2', 'm', '둘째 막대 전체 길이', 'Full second-rod length'],
        ['theta1', 'rad', '첫 절대각', 'First absolute angle'],
        ['theta2', 'rad', '둘째 절대각', 'Second absolute angle'],
        ['M22', 'kg*m^2', '둘째 대각 관성', 'Second diagonal inertia']
      ]
    }
  ],
  questions: [
    {
      id: 'double-count',
      prompt: [
        '중심 속도로 병진 에너지를 구한 다음 어떤 회전 관성을 더하나요?',
        'After computing translation with center velocity, which rotational inertia should be used?'
      ],
      correct: ['질량중심 둘레 관성 Ic입니다.', 'The center-axis inertia Ic.'],
      distractor: ['관절 관성 I를 다시 더합니다.', 'Add hinge inertia I again.'],
      explanation: [
        '관절까지의 이동 기여는 중심 병진에 이미 포함되었습니다.',
        'Motion of the center relative to the hinge is already included in center translation.'
      ]
    },
    {
      id: 'single-limit',
      prompt: [
        '같은 L의 균일 막대와 끝점 질량의 단일 작은 진동 주기는?',
        'How do single-body small-angle periods compare for a uniform rod and an endpoint mass at equal L?'
      ],
      correct: ['막대 주기가 sqrt(2/3)배입니다.', 'The rod period is sqrt(2/3) times the point-mass period.'],
      distractor: ['질량과 길이가 같으므로 반드시 같습니다.', 'They must be identical because mass and length match.'],
      explanation: [
        '질량중심 거리와 관성의 비 I/(md)가 서로 다릅니다.',
        'Their inertia-to-gravity-lever ratios I/(md) differ.'
      ]
    }
  ],
  prediction: [
    '두 모형의 질량과 길이를 맞추면 초기 에너지와 이후 각도도 같을까요?',
    'If masses and lengths match, must initial energy and later angles also match?'
  ],
  action: [
    '기본6초 균일 막대 실험과 같은 질량·길이·초기조건·간격·기간의 질점 동반 실행을 비교하세요. m1,m2,l1,l2를 하나씩 바꾸며 관성행렬과 첫 각도의 시간 변화를 읽고, theta1=0을 상승 방향으로 통과하는 시각과 연속 교차 간격을 비교하세요.',
    'Compare the default6-second uniform-rod run with its point-mass companion at matched masses, lengths, initial conditions, step and duration. Change m1,m2,l1,l2 one at a time; inspect inertia matrices, first-angle evolution and successive rising theta1=0 crossing intervals.'
  ],
  expected: [
    '균일 단위 막대의 초기 M11=4/3, M22=1/3 kg·m²이며 결합항은 cos(theta1-theta2)/2 kg·m²입니다(행렬 fixture1e-12 kg·m²). 기본6초에서는 두 모형의 상승 교차를 각각 두 개 이상 관찰하며 유한한 양의 평균 간격을 비교합니다. 교차 두 개 미만이면 평균을 만들지 않습니다. 궤적 차이와 교차 간격 차이는 물리 모형 차이도 포함합니다.',
    'Unit rods have initial M11=4/3 and M22=1/3 kg m², with coupling cos(theta1-theta2)/2 kg m²(matrix fixture1e-12 kg m²). In the default6 seconds, each model has at least two rising crossings, allowing comparison of finite positive mean intervals. No mean is invented for fewer than two crossings. Trajectory and crossing-interval differences include physical model differences.'
  ],
  explanation: [
    '관성과 중력 작용점이 함께 바뀝니다. 상승 단면의 연속 교차 간격은 이 관측량의 유한 시간 재귀 간격입니다. 두 정상모드가 섞인 이중진자의 고유한 주기나 단일 강체의 작은 진동식 P를 인증하지 않습니다. 질량·길이 변화에 따른 차이의 방향은 보장하지 않으며, 이 실험은 균일 막대와 끝점 질량 분포를 비교합니다.',
    'Both inertia and the gravity application point change. Successive rising crossings define a finite-time recurrence interval of this observable. They do not certify a unique period for a two-mode double pendulum or the single-rigid-body small-angle formula P. No universal direction of change is claimed as masses or lengths vary; the experiment compares uniform rods with endpoint masses.'
  ],
  next: [
    '질량 분포가 바뀌면 관성 계약도 바뀝니다. 3.4에서는 링크 길이 자체가 자유도가 될 때 생기는 에너지 교환을 살펴보세요.',
    'Changing mass distribution changes inertia. In 3.4, explore energy exchange when link length becomes a degree of freedom.'
  ],
  source: {
    path: 'src/physics/compoundDouble.ts',
    locator: [
      'compoundDoubleMassMatrix와 energyCompoundDouble: 중심 병진, Ic=mL²/12, 균일 두 막대 관성을 대조했습니다.',
      'Checked compoundDoubleMassMatrix and energyCompoundDouble for center translation, Ic=mL squared/12 and the two-uniform-rod matrix.'
    ]
  },
  external: {
    title: 'University Physics Volume 1 — 15.4 Pendulums',
    authors: 'OpenStax',
    url: 'https://openstax.org/books/university-physics-volume-1/pages/15-4-pendulums',
    locator: [
      'Physical Pendulum, 식 15.20–15.21과 Example 15.4의 균일 막대 평행축 정리를 대조했습니다.',
      'Checked Physical Pendulum equations 15.20–15.21 and the uniform-rod parallel-axis calculation in Example 15.4.'
    ]
  }
});
