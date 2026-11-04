import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.1',
  summary: [
    '링크 하나를 더하면 왜 앞 관절의 관성까지 바뀔까요? 질점 위치의 재귀 합에서 삼중진자의 질량행렬을 유도합니다.',
    'Why does adding a link change the inertia seen by earlier joints? Derive the triple-pendulum mass matrix from recursively accumulated positions.'
  ],
  objectives: [
    [
      '하류 질량의 누적합으로 대칭 질량행렬을 구성합니다.',
      'Construct the symmetric mass matrix from downstream mass sums.'
    ],
    [
      'N=2와 N=3의 행렬 크기·결합항을 실제 엔진에서 비교합니다.',
      'Compare matrix dimensions and coupling terms for N=2 and N=3 using the real engine.'
    ]
  ],
  prerequisites: [
    '질량 없는 강체 링크, 양의 질점 질량, 평면 운동과 고정 지지점을 가정합니다. theta는 아래 수직선 기준 절대각(rad), y는 위쪽 양수입니다. 상태는 모든 각도 다음 모든 각속도 순서입니다. 선수 단원 추천은 접근 제한이 아닙니다.',
    'Assume massless rigid links, positive point masses, planar motion and a fixed pivot. Each theta is an absolute angle from downward vertical in radians; y points up. State stores all angles followed by all rates. Recommendations never restrict access.'
  ],
  concepts: [
    {
      id: 'recursive-position',
      title: ['1. 위치와 속도의 재귀 합', '1. Recursively accumulate position and velocity'],
      body: [
        'j번째 질점 위치는 앞선 j개 링크 벡터의 합입니다. 미분하면 같은 경로의 속도 기여를 더합니다. 따라서 앞 링크의 각속도는 자기 질점뿐 아니라 그 아래 모든 질점을 움직입니다. 운동에너지를 질점별로 더하고 각속도의 이차항을 모으면 질량행렬을 얻습니다.',
        'Mass j lies at the sum of the first j link vectors. Differentiation adds their velocity contributions. An earlier link rate therefore moves every downstream particle. Collecting quadratic rate terms in the summed particle kinetic energies gives the inertia matrix.'
      ]
    },
    {
      id: 'suffix-mass',
      title: ['2. 하류 질량과 대칭성', '2. Downstream masses and symmetry'],
      body: [
        '두 링크 j,k의 속도 기여가 함께 나타나는 질점은 둘 중 더 아래쪽 링크 뒤에 있습니다. 그 질량합이 Smax(j,k)입니다. 두 방향의 내적이 cos(theta_j-theta_k)를 만들므로 Mjk=Mkj입니다. 모든 길이와 질량이 1이고 세 링크가 나란하면 행렬의 행은 (3,2,1), (2,2,1), (1,1,1) kg·m²입니다.',
        'The particles affected by both links j and k lie downstream of the later link. Their sum is Smax(j,k). The direction inner product supplies cos(theta_j-theta_k), giving Mjk=Mkj. With unit lengths and masses and aligned links, rows are (3,2,1), (2,2,1) and (1,1,1) kg m².'
      ]
    },
    {
      id: 'solve-not-invert',
      title: ['3. 운동방정식과 계산 한계', '3. Dynamics and numerical limits'],
      body: [
        '라그랑주 방정식은 M alpha=f 형태입니다. 엔진은 역행렬을 명시적으로 만들지 않고 Cholesky 분해로 선형계를 풉니다. 상태가 바뀌면 결합항도 바뀝니다. 행렬의 대칭성이나 정확한 막대 길이만으로 시간 적분이 정확하다고 결론내릴 수 없으며, 극단적인 질량·길이 비는 조건수를 악화시킵니다.',
        'The Lagrange equations have the form M alpha=f. The engine solves the linear system with Cholesky rather than forming an inverse. Couplings vary with configuration. Symmetry and exact rod lengths alone do not establish integration accuracy; extreme mass and length ratios worsen conditioning.'
      ]
    }
  ],
  equations: [
    {
      id: 'suffix-recurrence',
      title: ['하류 질량의 재귀 계산', 'Recursive downstream sums'],
      expression: 'S3=m3; S2=m2+S3; S1=m1+S2',
      explanation: [
        '마지막 질량부터 위로 더합니다. 각 S는 해당 링크 아래에 실린 전체 질량입니다.',
        'Add masses upward from the last bob. Each S is the total downstream mass carried by that link.'
      ],
      symbols: [
        ['S3', 'kg', '3번 링크의 하류 질량', 'Downstream mass for link 3'],
        ['m3', 'kg', '3번 질점 질량', 'Mass of bob 3'],
        ['S2', 'kg', '2번 링크의 하류 질량', 'Downstream mass for link 2'],
        ['m2', 'kg', '2번 질점 질량', 'Mass of bob 2'],
        ['S1', 'kg', '1번 링크의 하류 질량', 'Downstream mass for link 1'],
        ['m1', 'kg', '1번 질점 질량', 'Mass of bob 1']
      ]
    },
    {
      id: 'matrix-entries',
      title: ['관성 대각항과 결합항', 'Diagonal inertia and coupling'],
      expression: 'M11=S1*l1^2; M12=S2*l1*l2*cos(theta1-theta2); M21=M12',
      explanation: [
        '첫 대각항에는 모든 하류 질량이 들어갑니다. 첫째와 둘째 링크의 결합에는 둘째 아래 질량과 두 절대각의 차가 들어갑니다.',
        'The first diagonal carries all downstream masses. Coupling links one and two uses downstream mass from link two and the difference of absolute angles.'
      ],
      symbols: [
        ['M11', 'kg*m^2', '첫 관성 대각항', 'First diagonal inertia'],
        ['S1', 'kg', '전체 질량', 'Total downstream mass'],
        ['l1', 'm', '첫 링크 길이', 'First link length'],
        ['M12', 'kg*m^2', '첫째와 둘째 결합 관성', 'Coupling inertia between links 1 and 2'],
        ['S2', 'kg', '둘째 아래 질량합', 'Mass sum downstream of link 2'],
        ['l2', 'm', '둘째 링크 길이', 'Second link length'],
        ['theta1', 'rad', '첫 절대각', 'First absolute angle'],
        ['theta2', 'rad', '둘째 절대각', 'Second absolute angle'],
        ['M21', 'kg*m^2', '전치 결합항', 'Transposed coupling entry']
      ]
    }
  ],
  questions: [
    {
      id: 'downstream',
      prompt: [
        '나란한 단위 링크에 질량 1 kg인 셋째 질점을 추가하면 M11은 어떻게 바뀌나요?',
        'What happens to M11 when a third 1 kg bob is added to aligned unit links?'
      ],
      correct: ['2에서 3 kg·m²로 증가합니다.', 'It increases from 2 to 3 kg m².'],
      distractor: [
        '첫 관절과 무관하므로 바뀌지 않습니다.',
        'It stays unchanged because the third bob is unrelated to the first joint.'
      ],
      explanation: [
        '첫 링크의 회전은 세 질점을 모두 이동시키므로 하류 질량합이 증가합니다.',
        'Rotating the first link moves all three particles, so its downstream mass sum increases.'
      ]
    },
    {
      id: 'orthogonal',
      prompt: [
        'theta1-theta2=pi/2이면 M12=0입니다. 두 링크의 운동이 언제나 독립인가요?',
        'If theta1-theta2=pi/2 gives M12=0, are the two links always dynamically independent?'
      ],
      correct: [
        '아닙니다. 그 자세의 관성항만 0이며 다른 힘과 이후 자세가 결합합니다.',
        'No. Only that inertia entry vanishes at this configuration; other forces and later configurations still couple.'
      ],
      distractor: ['그렇습니다. 모든 시간의 두 운동이 분리됩니다.', 'Yes. Their motions decouple for all time.'],
      explanation: [
        '한 시각의 행렬 원소와 전체 비선형 운동방정식을 구분해야 합니다.',
        'A single instantaneous matrix entry does not determine the entire nonlinear dynamics.'
      ]
    }
  ],
  prediction: [
    '링크가 나란할 때 첫 관절이 느끼는 관성은 N=2와 N=3에서 같을까요?',
    'For aligned links, is the inertia at the first joint the same for N=2 and N=3?'
  ],
  action: [
    'theta를 0 rad로 설정해 나란한 삼중진자의 초기 질량행렬과 N=2 비교를 읽으세요. 다음으로 theta를 늘려 링크별 초기각과 결합항이 어떻게 바뀌는지 확인하세요.',
    'Set theta to 0 rad and read the aligned triple-pendulum initial mass matrix and N=2 comparison. Then increase theta and inspect how the per-link initial angles and couplings change.'
  ],
  expected: [
    '단위 질량·길이의 나란한 상태에서 M11=3, M12=2, M33=1 kg·m²이며 전치 원소는 1e-12 kg·m² 이내로 같습니다. 행렬 크기는 2×2에서 3×3으로 증가합니다.',
    'For aligned unit masses and lengths, M11=3, M12=2 and M33=1 kg m²; transposed entries agree within 1e-12 kg m². Matrix size grows from 2 by 2 to 3 by 3.'
  ],
  explanation: [
    '하류 질량의 변화와 각도 내적이 관성 결합을 함께 결정합니다. 실제 실행 시간은 기기 부하에 따라 달라집니다.',
    'Both downstream mass and angle inner products determine inertial coupling. Measured execution time varies with device load.'
  ],
  next: [
    '삼중진자는 새 공식을 따로 쓰는 예외가 아니라 N중 사슬의 한 경우입니다. 3.2에서 N 증가의 메모리·연산 비용을 분리해 측정하세요.',
    'The triple pendulum is a special case of an N-link chain. In 3.2, separate memory growth from computation cost as N increases.'
  ],
  source: {
    path: 'src/physics/nPendulum.ts',
    locator: [
      'fillSuffixMass, rhsChain, chainMassMatrix: 절대각과 하류 질량합, 대칭 행렬, Cholesky 해법을 대조했습니다.',
      'Checked fillSuffixMass, rhsChain and chainMassMatrix for absolute angles, suffix sums, symmetric inertia and the Cholesky solve.'
    ]
  },
  external: {
    title: 'Underactuated Robotics — Multi-Body Dynamics',
    authors: 'Russ Tedrake',
    url: 'https://underactuated.mit.edu/multibody.html',
    locator: [
      'Manipulator Equations와 Recursive Dynamics Algorithms. 상대 관절각 설명을 이 과정의 절대각으로 변환했습니다.',
      'Manipulator Equations and Recursive Dynamics Algorithms; converted relative-joint descriptions to this course absolute angles.'
    ]
  }
});
