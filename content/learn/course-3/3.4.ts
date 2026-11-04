import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.4',
  summary: [
    '진자가 흔들리는 동안 길이도 변하면 어떤 항이 두 운동을 연결할까요? 극좌표 운동에너지에서 방사·각 방정식을 유도합니다.',
    'Which terms couple swinging and stretching? Derive radial and angular equations from polar-coordinate kinetic energy.'
  ],
  objectives: [
    [
      '원심 항과 길이 변화에 따른 각속도 항을 구분합니다.',
      'Distinguish the centrifugal term from the angular-rate term due to changing length.'
    ],
    [
      'Hooke 힘의 부호와 전체 에너지 보존을 실제 궤적으로 검증합니다.',
      'Check the sign of the Hooke force and total-energy conservation using real trajectories.'
    ]
  ],
  prerequisites: [
    '질점 하나와 질량 없는 Hooke 용수철, 평면 운동, 감쇠 없음입니다. r은 지지점에서 질점까지 양의 거리(m), theta는 아래 수직 기준 각도(rad)입니다. 자연 길이 L0와 정적 평형 길이를 구분합니다. r=0 근처는 극좌표 특이점입니다.',
    'Use one point mass on a massless Hooke spring in a plane without damping. r is positive pivot-to-bob distance in metres; theta is measured from downward vertical. Distinguish natural length L0 from static equilibrium length. Polar coordinates are singular near r=0.'
  ],
  concepts: [
    {
      id: 'polar-energy',
      title: ['1. 운동에너지에서 결합 찾기', '1. Locate coupling in kinetic energy'],
      body: [
        '속력 제곱은 방사 속도 제곱과 r² 곱하기 각속도 제곱의 합입니다. 그래서 r이 바뀌면 같은 각속도의 회전 에너지도 달라집니다. 퍼텐셜은 용수철 변형 에너지와 -mgr cos(theta)의 합입니다. 두 좌표의 에너지를 독립적인 두 보존량으로 나눌 수는 없습니다.',
        'Squared speed is radial speed squared plus r squared times angular rate squared. Changing r therefore changes rotational kinetic energy at the same rate. Potential combines spring strain energy and -mgr cos(theta). Radial and angular energies are not two separately conserved quantities.'
      ]
    },
    {
      id: 'lagrange-terms',
      title: ['2. 두 Euler–Lagrange 방정식', '2. Two Euler–Lagrange equations'],
      body: [
        'r에 대한 미분은 r omega² 원심 항, -(k/m)(r-L0) 복원 항, g cos(theta) 중력 항을 줍니다. theta에 대해 r² omega를 시간 미분하면 2r rDot omega가 생겨 각가속도에 -2rDot omega/r가 들어갑니다. 늘어나는 동안 각속도가 감소하는 항이지 마찰 손실 항은 아닙니다.',
        'The radial equation contains centrifugal r omega squared, restoring -(k/m)(r-L0), and gravity g cos(theta). Differentiating r squared omega generates 2r rDot omega, giving angular term -2rDot omega/r. It can reduce angular rate during extension without dissipating energy.'
      ]
    },
    {
      id: 'limits-resonance',
      title: ['3. 평형·공명과 유효 범위', '3. Equilibrium, resonance and validity'],
      body: [
        '아래로 정지한 평형 길이는 L0+mg/k입니다. 작은 방사 진동의 주파수 척도는 sqrt(k/m), 작은 각 진동은 sqrt(g/req)입니다. 두 척도가 가까운 정수비일 때 에너지 교환이 두드러질 수 있으나 모든 초기조건에서 공명을 보장하지 않습니다. 큰 k는 짧은 시간 척도를 만들며 큰 간격은 불안정할 수 있습니다. 압축 힘이 음수여도 오류가 아니지만 r이 0에 접근하면 계산을 멈춰야 합니다.',
        'The downward static length is L0+mg/k. Small radial oscillations have frequency scale sqrt(k/m), and angular oscillations sqrt(g/req). Near integer ratios, energy exchange can become prominent, but resonance is not guaranteed for every initial condition. Large k creates fast scales; a large step may be unstable. A signed compressive force is valid, but runs approaching r=0 must stop.'
      ]
    }
  ],
  equations: [
    {
      id: 'radial-equation',
      title: ['방사 방향 운동', 'Radial motion'],
      expression: 'ar=r*omega^2-(k/m)*(r-L0)+g*cos(theta); req=L0+m*g/k',
      explanation: [
        '방사 가속도는 원심 효과, Hooke 복원력, 중력의 방사 투영을 합한 값입니다. 아래쪽 정지 평형에서는 탄성력이 무게를 지탱합니다.',
        'Radial acceleration combines centrifugal motion, Hooke restoration and radial gravity. At downward static equilibrium the spring supports the weight.'
      ],
      symbols: [
        ['ar', 'm/s^2', '바깥쪽 양의 방사 가속도', 'Outward radial acceleration'],
        ['r', 'm', '현재 반지름', 'Current radius'],
        ['omega', 'rad/s', '각속도', 'Angular velocity'],
        ['k', 'N/m', '용수철 상수', 'Spring stiffness'],
        ['m', 'kg', '질점 질량', 'Bob mass'],
        ['L0', 'm', '자연 길이', 'Natural length'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['theta', 'rad', '아래 수직 기준 각도', 'Angle from downward vertical'],
        ['req', 'm', '아래쪽 정적 평형 길이', 'Downward static equilibrium length']
      ]
    },
    {
      id: 'angular-energy',
      title: ['각 운동과 전체 에너지', 'Angular motion and total energy'],
      expression: 'alpha=(-2*vr*omega-g*sin(theta))/r; E=m*(vr^2+r^2*omega^2)/2+k*(r-L0)^2/2-m*g*r*cos(theta)',
      explanation: [
        '각가속도는 길이 변화와 접선 중력에서 옵니다. 총에너지는 방사·각 운동에너지, 탄성에너지와 중력 퍼텐셜의 합입니다.',
        'Angular acceleration comes from changing radius and tangential gravity. Total energy sums radial/angular kinetic, elastic and gravitational contributions.'
      ],
      symbols: [
        ['alpha', 'rad/s^2', '각가속도', 'Angular acceleration'],
        ['vr', 'm/s', '방사 속도', 'Radial velocity'],
        ['omega', 'rad/s', '각속도', 'Angular velocity'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['theta', 'rad', '아래 수직 기준 각도', 'Angle from downward vertical'],
        ['r', 'm', '현재 반지름', 'Current radius'],
        ['E', 'J', '전체 역학에너지', 'Total mechanical energy'],
        ['m', 'kg', '질점 질량', 'Bob mass'],
        ['k', 'N/m', '용수철 상수', 'Spring stiffness'],
        ['L0', 'm', '자연 길이', 'Natural length']
      ]
    }
  ],
  questions: [
    {
      id: 'equilibrium',
      prompt: [
        'm=1 kg,k=40 N/m,L0=1 m,g=9.81 m/s²의 아래쪽 정적 평형 길이는?',
        'What is the downward equilibrium length for m=1 kg,k=40 N/m,L0=1 m,g=9.81 m/s²?'
      ],
      correct: ['1.24525 m입니다.', '1.24525 m.'],
      distractor: ['자연 길이와 같은 1 m입니다.', 'The natural length, 1 m.'],
      explanation: ['중력에 의한 추가 신장은 mg/k=0.24525 m입니다.', 'The gravitational extension is mg/k=0.24525 m.']
    },
    {
      id: 'coupling-damping',
      prompt: [
        '-2rDot omega/r 항은 역학에너지를 열로 소산시키나요?',
        'Does -2rDot omega/r dissipate mechanical energy as heat?'
      ],
      correct: [
        '아닙니다. 좌표 운동 사이의 보존적 결합입니다.',
        'No. It is conservative coupling between coordinate motions.'
      ],
      distractor: ['그렇습니다. 각속도가 줄면 항상 감쇠입니다.', 'Yes. A falling angular rate always means damping.'],
      explanation: [
        '감쇠 없는 라그랑지안에서 유도된 항이며 방사·각 에너지를 함께 계산해야 합니다.',
        'It follows from an undamped Lagrangian; radial and angular energy must be accounted for together.'
      ]
    }
  ],
  prediction: [
    'theta=0과 작은 비영 각도에서 r(t)는 같을까요?',
    'Will r(t) be identical for theta=0 and a small nonzero angle?'
  ],
  action: [
    '기본 용수철 실험을 실행한 뒤 theta=0으로 바꾸어 다시 실행하세요. stiffness와 r을 하나씩 바꾸며 반지름·각도·탄성력·에너지 변화를 비교하세요.',
    'Run the default spring experiment, then repeat with theta=0. Change stiffness and r one at a time and compare radius, angle, elastic force and energy.'
  ],
  expected: [
    'theta=0, 초기 각속도0이면 각 운동은 1e-12 rad 이내에서 0으로 유지되어야 합니다. 기본 k=40 N/m에서 r=1.24525 m는 정적 평형이며 탄성력은 9.81 N입니다. 힘 fixture 허용 오차는 1e-10 N입니다.',
    'For theta=0 and zero angular rate, angular motion stays zero within 1e-12 rad. At k=40 N/m, r=1.24525 m is static equilibrium with elastic force 9.81 N; force fixture tolerance is 1e-10 N.'
  ],
  explanation: [
    '평형 길이는 자연 길이가 아닙니다. 비영 각도에서는 중력 투영과 원심 항이 r을 바꾸고 그 변화가 각 운동으로 되돌아옵니다.',
    'Equilibrium length differs from natural length. At nonzero angle gravity projection and centrifugal motion alter r, feeding back into angular motion.'
  ],
  next: [
    '보존적인 길이 변화와 마찰을 구분했습니다. 3.5에서는 당길 수만 있는 줄의 길이 구속이 비활성화되는 사건을 살펴보세요.',
    'Having separated conservative length coupling from friction, explore in 3.5 how a pull-only string constraint becomes inactive.'
  ],
  source: {
    path: 'src/physics/spring.ts',
    locator: [
      'rhsSpring와 energySpring의 두 극좌표 방정식·Hooke 부호·퍼텐셜 기준을 대조했습니다.',
      'Checked the two polar equations, Hooke-force sign and potential reference in rhsSpring and energySpring.'
    ]
  }
});
