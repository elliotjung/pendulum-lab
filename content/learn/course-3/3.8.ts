import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.8',
  summary: [
    '여러 구면진자를 잇는 것은 독립 궤적을 겹치는 일이 아닙니다. 움직이는 관절의 속도와 2N 자유도 관성 결합을 따라 집단 세차를 관찰합니다.',
    'A spherical chain is more than superposed independent pendulums. Follow moving-joint velocities and a 2N-dimensional inertia coupling to investigate collective precession.'
  ],
  objectives: [
    [
      '링크 벡터 합과 속도 합으로 다체 에너지를 구성합니다.',
      'Construct many-body energy from sums of link vectors and velocities.'
    ],
    [
      '초기 방위 비대칭과 전체 수직 각운동량의 관계를 확인합니다.',
      'Examine initial azimuthal asymmetry and total vertical angular momentum.'
    ]
  ],
  prerequisites: [
    '기본은 두 질점이며 전용 실험에서는 링크 수를1–4개로 바꿉니다. 고정 길이·질량 없는 구면 링크, 고정 지지점, 무감쇠입니다. 오른손 xyz에서 y는 위쪽입니다. 각 링크는 theta,phi 두 각도와 두 각속도를 가지며 상태는 모든 각도쌍 뒤 모든 속도쌍입니다. 링크끼리의 충돌·자기 접촉은 없습니다.',
    'The default has two point masses; the focused experiment allows1–4 links. Links are fixed-length and massless, with a fixed pivot and no damping. y is upward in right-handed xyz. Each link has theta,phi and two rates; state stores all angle pairs before all rate pairs. Link collisions and self-contact are not modeled.'
  ],
  concepts: [
    {
      id: 'moving-joint',
      title: ['1. 움직이는 관절을 포함한 위치·속도', '1. Include the moving joint'],
      body: [
        '둘째 질점은 첫 질점 위치에 둘째 링크 벡터를 더한 곳에 있습니다. 따라서 둘째 속도에는 첫 관절 속도가 포함됩니다. 둘째 에너지를 원점에서 독립 구면진자처럼 계산하면 교차 운동항이 사라져 잘못된 모형이 됩니다. 3차원 벡터 내적이 평면 사슬의 코사인 결합을 일반화합니다.',
        'The second bob position adds its link vector to the first bob position. Its velocity therefore includes the moving first joint. Treating its energy as an independent spherical pendulum at the origin drops cross terms and gives the wrong model. Three-dimensional vector inner products generalize planar cosine coupling.'
      ]
    },
    {
      id: 'two-n-dof',
      title: ['2. 2N 자유도의 질량행렬', '2. Inertia with 2N degrees of freedom'],
      body: [
        '극점에서 떨어진 링크마다 독립 각도 두 개가 있으므로 N개 링크의 관성행렬은 2N×2N입니다. 각 원소는 하류 질량합, 두 길이, 위치 Jacobian 열벡터 내적의 곱입니다. 구현은 이 밀집 행렬을 풀며 극점 근처에는 좌표 정규화와 선형계 실패 검사가 있습니다. N이 늘수록 계산·표본 비용도 늘어납니다.',
        'Away from poles, each link has two independent angles, giving a 2N by2N inertia matrix. Entries combine downstream masses, two lengths and inner products of position-Jacobian columns. The implementation solves this dense system with near-pole regularization and explicit linear-solve failure checks. More links increase computation and sample-storage costs.'
      ]
    },
    {
      id: 'total-not-linkwise',
      title: ['3. 전체 보존량과 비대칭', '3. Total invariants and asymmetry'],
      body: [
        '전체 에너지와 +y 각운동량은 무감쇠·축대칭에서 보존되지만 개별 링크의 에너지나 각운동량은 서로 교환됩니다. 한 링크의 초기 방위각·방위 속도를 바꾸면 상대 방향과 결합이 바뀝니다. 집단 세차를 관찰하더라도 짧은 궤적만으로 동기화나 카오스를 확정하지 않습니다. 극점에 가까운 비교는 3.9의 매입 표현을 사용하세요.',
        'Total energy and +y momentum are conserved under undamped axial symmetry, while individual link energies and momenta can exchange. Changing one link azimuth or rate changes relative directions and coupling. Apparent collective precession in a short run does not establish synchronization or chaos. Use the embedded representation in3.9 for near-pole comparisons.'
      ]
    }
  ],
  equations: [
    {
      id: 'two-link-position',
      title: ['둘째 질점의 공간 위치', 'Spatial position of the second bob'],
      expression: 'x2=x1+l2*sin(theta2)*cos(phi2); y2=y1-l2*cos(theta2); z2=z1+l2*sin(theta2)*sin(phi2)',
      explanation: [
        '첫 질점의 움직이는 위치에 둘째 링크의 세 성분을 더합니다. 둘째 링크의 길이는 지지점까지 거리가 아닙니다.',
        'Add the second link components to the moving first-bob position. The second link length is not its distance from the fixed pivot.'
      ],
      symbols: [
        ['x2', 'm', '둘째 x 위치', 'Second x position'],
        ['x1', 'm', '첫 x 위치', 'First x position'],
        ['l2', 'm', '둘째 링크 길이', 'Second link length'],
        ['theta2', 'rad', '둘째 아래 수직 기준 극각', 'Second polar angle'],
        ['phi2', 'rad', '둘째 방위각', 'Second azimuth'],
        ['y2', 'm', '둘째 높이', 'Second height'],
        ['y1', 'm', '첫 높이', 'First height'],
        ['z2', 'm', '둘째 z 위치', 'Second z position'],
        ['z1', 'm', '첫 z 위치', 'First z position']
      ]
    },
    {
      id: 'total-vertical-momentum',
      title: ['질점별 수직 각운동량의 합', 'Sum particle vertical momenta'],
      expression: 'Ly1=m1*(z1*vx1-x1*vz1); Ly2=m2*(z2*vx2-x2*vz2); Ly=Ly1+Ly2; D=4*N',
      explanation: [
        '각 질점의 실제 Cartesian 속도로 위치 외적 운동량을 구해 합합니다. 링크 N개는 각도2N개와 속도2N개로 상태 차원4N입니다.',
        'Use each particle actual Cartesian velocity in position cross momentum, then sum. N links have2N angles and2N rates, giving state dimension4N.'
      ],
      symbols: [
        ['Ly1', 'kg*m^2/s', '첫 질점의 +y 각운동량', 'First particle +y momentum'],
        ['m1', 'kg', '첫 질점 질량', 'First mass'],
        ['z1', 'm', '첫 z 위치', 'First z position'],
        ['vx1', 'm/s', '첫 x 속도', 'First x velocity'],
        ['x1', 'm', '첫 x 위치', 'First x position'],
        ['vz1', 'm/s', '첫 z 속도', 'First z velocity'],
        ['Ly2', 'kg*m^2/s', '둘째 질점의 +y 각운동량', 'Second particle +y momentum'],
        ['m2', 'kg', '둘째 질점 질량', 'Second mass'],
        ['z2', 'm', '둘째 z 위치', 'Second z position'],
        ['vx2', 'm/s', '둘째 x 속도', 'Second x velocity'],
        ['x2', 'm', '둘째 x 위치', 'Second x position'],
        ['vz2', 'm/s', '둘째 z 속도', 'Second z velocity'],
        ['Ly', 'kg*m^2/s', '전체 +y 각운동량', 'Total +y momentum'],
        ['D', '1', '상태 실수 원소 수', 'Real state entry count'],
        ['N', '1', '링크 수', 'Link count']
      ]
    }
  ],
  questions: [
    {
      id: 'dimension',
      prompt: [
        '구면 링크 두 개의 구성 자유도와 상태 차원은?',
        'What are configuration degrees of freedom and state dimension for two spherical links?'
      ],
      correct: ['4자유도와8차원 상태입니다.', '4 configuration degrees of freedom and8 state entries.'],
      distractor: ['평면 사슬과 같은2자유도와4차원입니다.', '2 and4, identical to a planar chain.'],
      explanation: [
        '각 링크에 극각·방위각 두 좌표가 있고 각각의 속도가 필요합니다.',
        'Each link needs polar and azimuth coordinates plus their rates.'
      ]
    },
    {
      id: 'individual-momentum',
      prompt: [
        '전체 Ly가 일정하면 각 링크의 Ly도 각각 일정한가요?',
        'If total Ly is constant, must each link Ly separately be constant?'
      ],
      correct: ['아닙니다. 링크 간 토크로 교환될 수 있습니다.', 'No. Inter-link torques can exchange momentum.'],
      distractor: [
        '그렇습니다. 전체 보존은 각 부분의 독립 보존입니다.',
        'Yes. Total conservation means independent conservation of every part.'
      ],
      explanation: [
        '내부 교환은 전체 합에서 상쇄되지만 각 부분에는 남습니다.',
        'Internal exchanges cancel in the total sum but remain in its parts.'
      ]
    }
  ],
  prediction: [
    '첫 방위각만 바꾸면 전체 궤적을 단순히 회전한 것과 같을까요?',
    'Is changing only the first azimuth equivalent to rotating the whole trajectory?'
  ],
  action: [
    '기본 두 링크에서 phi1과 phiDot1을 하나씩 바꾸세요. 이어 links를1,2,3으로 바꾸며 상태 차원·수평 투영·전체 Ly·에너지를 비교하고 theta1 변화가 집단 세차에 미치는 영향을 확인하세요.',
    'At the default two links, change phi1 and phiDot1 one at a time. Then run links=1,2,3 and compare state dimension, horizontal projections, total Ly and energy; inspect the effect of theta1 on collective precession.'
  ],
  expected: [
    '기본 두 링크의 상태는8개 값이고 관성행렬은4×4입니다. 세 링크에서는 상태12개·행렬6×6으로 바뀝니다. 초기·실행 중 링크 길이 잔차는1e-10 m 이하의 기하 fixture를 만족해야 합니다. 같은 설정의 반복은 동일한 궤적·Ly를 재현합니다. 한 링크 방위만 바꾸는 것은 전체의 강체 회전과 다릅니다.',
    'The default two links give8 state values and a4 by4 inertia matrix; three links give12 state values and a6 by6 matrix. Initial and sampled link-length residuals meet the1e-10 m geometry fixture. Repeated identical settings reproduce trajectories and Ly. Changing one link azimuth differs from rotating the entire configuration.'
  ],
  explanation: [
    '상대 방위가 바뀌면 Jacobian 내적과 속도 결합이 바뀝니다. 기하 잔차가 작아도 에너지·Ly 드리프트와 시간 간격 수렴을 별도로 확인해야 합니다.',
    'Changing relative azimuth changes Jacobian inner products and velocity coupling. Small geometry residuals still require separate energy/momentum drift and step-convergence checks.'
  ],
  next: [
    '공간 사슬은 실제 다체 결합계입니다. 3.9에서 같은 운동을 매입 좌표로 바꾸어 좌표 특이점과 물리적 특이점을 분리하세요.',
    'A spatial chain is a genuinely coupled many-body system. In3.9, use embedded coordinates to separate chart singularity from physical singularity.'
  ],
  source: {
    path: 'src/physics/sphericalChain.ts',
    locator: [
      'rhsSphericalChain, sphericalChainMassMatrix, Positions/Velocities/Energy/Lz의 상태4N·관성2N·+y 외적 합을 대조했습니다.',
      'Checked the4N state,2N inertia and+y cross-product sum in rhsSphericalChain, sphericalChainMassMatrix and position/velocity/energy/momentum functions.'
    ]
  }
});
