import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.11',
  summary: [
    '기판과 격자의 비정합은 초기 impulse에 따른 이동을 어떻게 바꿀까요? 정적 PN 기준과 평균 twist가 다른 유한 FK chain의 depinning protocol·이동률을 비교합니다.',
    'How does substrate–lattice misfit change motion after an initial impulse? Compare a stationary PN reference with finite-chain depinning protocols and transport rates at different mean twists.'
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
    '기준 PN 계산은0→2π fixed 경계의41-site 정규화 단일 kink입니다. 동반 수송은25-site chain에서 끝점 차로 평균 비정합비ρ를 고정하고 ρ=1과 선택ρ를 비교합니다. K는 결합/기판 비입니다. dx=1/√K인 native sine-Gordon 격자를 써 동일한 최근접 FK 힘을 전파하며 지속 외력과 감쇠는 없습니다.',
    'The PN reference is a normalized41-site single kink with fixed0 to2 pi boundaries. Companion transport uses a25-site chain with endpoint-imposed mean misfit rho, comparing rho1 with the selected rho. K is coupling relative to substrate. A native sine-Gordon grid with dx1/sqrt(K) propagates the same nearest-neighbor FK forces without sustained force or damping.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '연속체의 평행이동 대칭은 격자에서 깨집니다. Site 중심과 bond 중심의 stationary kink 에너지를 비교하면 Peierls–Nabarro 차이를 얻습니다. Newton은 에너지 최솟값뿐 아니라 saddle에도 수렴할 수 있어 잔차와 중심 종류를 보존합니다.',
        'The lattice breaks continuum translation symmetry. Comparing stationary site-centered and bond-centered kink energies gives a Peierls–Nabarro difference. Newton can converge to saddles as well as minima, so residual and center type are retained.'
      ]
    },
    {
      id: 'misfit',
      title: ['비정합비를 고정하는 경계', 'Boundary-imposed misfit'],
      body: [
        '균일한 자연 간격 a를 가진 탄성 에너지를 펼치면 기존 제곱 차 에너지와의 차이는 끝점 차에 비례하는 항과 상수입니다. 끝점을 고정하면 두 힘의 내부 미분이 같으므로 보존된 native FK 힘을 재사용합니다. 평균 ρ=(u끝−u처음)/(2π(N−1))는 유한 chain의 기판 대비 위상 간격을 뜻하며 무리수 thermodynamic limit의 증명이 아닙니다.',
        'Expanding elastic energy with constant natural spacing a changes the zero-rest-spacing energy only by an endpoint term and a constant. Fixed endpoints therefore leave interior forces identical, allowing reuse of native FK forces. Mean rho=(uLast-uFirst)/(2 pi(N-1)) describes finite-chain phase spacing relative to substrate, without certifying an irrational thermodynamic limit.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '동반 chain의 정지 힘은 native pendulum-network RHS로 평가하고 공용 Newton으로 찾습니다. 잔차1e-7 미만과 양의 수치 Hessian 조건을 만족한 국소 최소에서 내부 링크에 같은 초기 각속도 impulse를 줍니다. 평균 내부 위상 이동이 한 기판 주기를 넘었는지와 이동/시간을 실제 native 궤적으로 측정합니다. K·ρ·impulse를 각각 바꿔 비교합니다.',
        'Native pendulum-network forces and a shared Newton solver prepare the companion chain. Only stationary states with residual below1e-7 and a positive numerical Hessian receive a uniform initial interior-velocity impulse. Actual native trajectories measure whether mean interior phase advances one substrate period and report displacement over time. Vary K, rho and impulse separately.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '정지 힘이나 최소 조건을 확인하지 못한 chain에서는 depinning을 판정하지 않습니다. 표본 impulse 중 한 주기 이동의 최초값은 유한 시간·격자·경계·선택한 국소 최소에 따른 protocol 역치입니다. 단일-kink PN 차이는25-site 비정합 chain의 장벽과 동일하지 않습니다. 이 무외력 이동률은 정상 force/velocity mobility나 무한 chain의 Aubry 전이 인증이 아닙니다.',
        'No depinning verdict is made without verifying stationary force and local-minimum conditions. The smallest sampled impulse producing one-period motion is a protocol threshold dependent on time, mesh, boundaries and the selected local minimum. Single-kink PN difference is not the barrier of the25-site misfit chain. Unforced transport rate is distinct from steady force/velocity mobility and infinite-chain Aubry certification.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'barrierCandidate = abs(siteEnergy-bondEnergy)',
      explanation: [
        'Site·bond stationary 에너지의 절댓값 차입니다. 양쪽 해가 충분히 수렴하고 해당 branch인지를 확인해야 PN 장벽으로 해석합니다.',
        'The absolute stationary site/bond energy difference is interpreted as a PN barrier only after checking convergence and branch identity.'
      ],
      symbols: [
        ['barrierCandidate', '1', '장벽 후보', 'Barrier candidate'],
        ['siteEnergy', '1', 'Site 중심 에너지', 'Site-centered energy'],
        ['bondEnergy', '1', 'Bond 중심 에너지', 'Bond-centered energy']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'meanSpeed = displacement/duration; coupling = 1/dx^2',
      explanation: [
        '평균 이동률은 평균 내부 위상의 기판 주기 단위 이동/기간입니다. dx 선택은 native 이산 Laplacian 계수를 FK 결합 K와 일치시킵니다.',
        'Mean transport rate divides average interior-phase displacement in substrate periods by the observation interval. Choosing dx matches the native discrete-Laplacian coefficient to FK coupling K.'
      ],
      symbols: [
        ['meanSpeed', '1', '정규화 평균 주기 이동률', 'Normalized mean period transport rate'],
        ['displacement', '1', '평균 위상의 기판 주기 이동량', 'Mean-phase displacement in substrate periods'],
        ['duration', '1', '정규화 관찰 기간', 'Normalized observation interval'],
        ['coupling', '1', '정규화 FK 결합', 'Normalized FK coupling'],
        ['dx', '1', '정규화 격자 간격', 'Normalized mesh spacing']
      ]
    },
    {
      id: 'relation-3',
      title: ['3. 경계로 고정한 평균 비정합비', '3. Boundary-imposed mean misfit'],
      expression: 'twist = endpointDifference/(2*pi*intervals)',
      explanation: [
        '고정 끝점 차를2π와 이웃 간격 수로 나눈 유한 chain의 위상 간격입니다. ρ=1은한 기판 주기 간격이며 선택값은 다른 비정합을 비교합니다.',
        'Divide fixed endpoint phase difference by2 pi and the number of neighbor intervals. Rho1 corresponds to one substrate period per interval; the selected value compares a different misfit.'
      ],
      symbols: [
        ['twist', '1', '평균 비정합비', 'Mean misfit'],
        ['endpointDifference', 'rad', '끝점 위상 차', 'Endpoint phase difference'],
        ['pi', '1', '원주율', 'Pi'],
        ['intervals', '1', '이웃 간격 수 N−1', 'Neighbor interval count N-1']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '초기 운동 kick 뒤 이동률이 지속 외력의 mobility인가요?',
        'Is post-kick speed the mobility under sustained force?'
      ],
      correct: [
        '무외력 유한 시간 이동이며 정상 force/velocity 곡선과 다릅니다.',
        'It is unforced finite-time motion, distinct from a steady force/velocity curve.'
      ],
      incorrect: [
        '외력이 없더라도 모든 depinning 실험과 같습니다.',
        'It equals every depinning experiment even without force.'
      ],
      explanation: [
        '유한 chain의 비정합과 impulse 반응을 측정하지만 초기 운동 에너지와 지속 외력을 같은 조건으로 해석하지 않습니다.',
        'Finite-chain misfit and impulse responses are measured without treating initial kinetic energy as a sustained external force.'
      ]
    },
    {
      prompt: [
        '7.11의 결과를 보편적인 증명으로 읽어도 될까요?',
        'Does the result of 7.11 establish a universal proof?'
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
        '역치는 선택한 정지 국소 최소·고정 경계·관찰 시간·표본 impulse에 따라 바뀝니다. 무리수 무한 chain·지속 외력의 정상 mobility를 인증하지 않습니다.',
        'The threshold depends on the selected stationary local minimum, fixed boundaries, observation time and sampled impulses. It does not certify an infinite irrational chain or steady driven mobility.'
      ]
    }
  ],
  prediction: [
    '같은 K에서 ρ=1과 약0.618의 chain이 초기 impulse1과3에 어떻게 다르게 반응할지 예상하세요.',
    'Predict how chains at rho1 and approximately0.618 respond differently to initial impulses1 and3 at the same K.'
  ],
  action: [
    'K·평균 비정합비·초기 impulse를 각각 바꾸고 정지 잔차·최소 고유값·역치 표와 실제 위상 수송 곡선을 비교하세요.',
    'Vary K, mean misfit and initial impulse separately; compare stationary residual, minimum curvature, threshold table and actual phase-transport traces.'
  ],
  expected: [
    '기본 두 chain의 정지 잔차는1e-7보다 작고 무impulse 평균 이동은1e-7 주기보다 작습니다. impulse3에서는두 chain 모두 한 기판 주기 역치를 통과합니다. impulse1의선택ρ 이동은ρ=1의3배보다 큽니다.',
    'Both default stationary residuals are below1e-7 and zero-impulse mean motion is below1e-7 period. At impulse3 both chains cross one substrate period; at impulse1 selected-rho displacement exceeds three times the rho1 displacement.'
  ],
  explanation: [
    '정적 pinning·유한 비정합·impulse 수송을 같은 native 힘으로 연결하면서 steady driven mobility와의 차이를 명시합니다.',
    'The same native forces connect static pinning, finite misfit and impulse transport while preserving the distinction from steady driven mobility.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['Peierls–Nabarro 차이', 'Peierls–Nabarro difference'],
    [
      '격자에 대한 kink 중심 위치가 다른 stationary 상태의 에너지 차입니다.',
      'An energy difference between stationary kinks centered differently relative to the lattice.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/sineGordon.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/sineGordon.ts.'
      ]
    },
    {
      path: 'src/physics/pendulumNetwork.ts',
      locator: [
        '정지 내부 힘과 비틀림 결합을 RHS에서 직접 평가합니다.',
        'The stationary interior force and torsional coupling are evaluated directly through the native right-hand side.'
      ]
    },
    {
      path: 'src/chaos/chaosControl.ts',
      locator: [
        '공용 findPeriodicOrbit Newton과 mapJacobianFD를 정지 힘 영점 및 수치 Hessian 평가에 사용합니다.',
        'Shared findPeriodicOrbit Newton and mapJacobianFD evaluate stationary force zeros and the numerical Hessian.'
      ]
    },
    {
      path: 'src/product/adapters/physics/field.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/field.ts.'
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
    title: 'Devil’s staircase and order without periodicity in classical condensed matter',
    authors: 'S. Aubry',
    url: 'https://digital.library.unt.edu/ark:/67531/metadc1056922/',
    locator: [
      '원 연구의 비정합 구조·Peierls 힘 맥락과 현재 고정 경계 유한 chain의 impulse protocol 범위 차이를 대조합니다.',
      'The primary work’s incommensurate structures and Peierls-force context are distinguished from the present fixed-boundary finite-chain impulse protocol.'
    ]
  },
  labTransferDescription: [
    '기준41-site 정적 FK의 K·경계·격자·Newton 설정을 Lab으로 전달합니다.25-site 비정합/impulse 대조군의ρ·경계·정지 잔차·수송 결과는단원의 설정과 결과 JSON에 남습니다. 동반 chain을단일 정적 baseline으로 바꾸어 전달하지 않습니다.',
    'Transfer the baseline41-site stationary FK coupling, boundaries, grid and Newton settings to Lab. Companion25-site misfit/impulse settings, imposed boundaries, stationary residuals and transport results remain in lesson fields and result JSON, rather than being relabeled as the single stationary baseline.'
  ]
});
