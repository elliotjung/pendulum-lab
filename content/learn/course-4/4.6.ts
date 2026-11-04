import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.6',
  summary: [
    '한 진자에서 시작한 운동이 왜 다른 진자로 옮겨갈까요? 실제 두 진자의 대칭·반대칭 모드와 beat를 비교하고 동기화와 구별합니다.',
    'Why does motion started in one pendulum move to the other? Compare symmetric/antisymmetric modes and beats, and distinguish them from attracting synchronization.'
  ],
  objectives: [
    [
      '합·차 좌표로 작은 진동 방정식을 분리합니다.',
      'Separate small-oscillation equations using sum and difference coordinates.'
    ],
    [
      '결합에 따른 모드 분할과 beat의 시간 척도를 연결합니다.',
      'Relate coupling-induced mode splitting to beat timescales.'
    ]
  ],
  assumptions: [
    '같은 단위 질량·길이 1 m인 두 진자의 각도 차이에 선형 복원 결합을 가합니다. 두 θ=0은 아래쪽이고 결합 κ는 s⁻²입니다. 외력·제어·감쇠는 고정 0입니다. 이는 기존 교육용 각도 결합 모형이며 실제 탄성 연결체의 완전 유도가 아닙니다.',
    'Use equal unit-mass, one-metre pendulums with restoring coupling proportional to angular difference. Both zeros point down; κ is s⁻². Forcing, control and damping are zero. This is the preserved educational angular-coupling model, not a full elastic-connector derivation.'
  ],
  concepts: [
    {
      id: 'coupling',
      title: ['1. 같은 크기·반대 방향의 결합 항', '1. Equal and opposite coupling terms'],
      body: [
        '첫 진자에는 -κ(θ₁−θ₂), 둘째에는 +κ(θ₁−θ₂)가 작용합니다. 각도가 같으면 결합 항이 사라지고 다른 초기조건이면 두 진자 사이의 운동을 연결합니다. 한 진자의 진폭 감소는 전체 에너지 소산과 다릅니다.',
        'Coupling adds -κ(θ₁−θ₂) to the first acceleration and the opposite to the second. Equal angles cancel coupling; unequal starts exchange motion. A falling amplitude in one pendulum does not imply total-energy dissipation.'
      ]
    },
    {
      id: 'modes',
      title: ['2. 합·차 좌표로 분리하기', '2. Separate sum and difference coordinates'],
      body: [
        'sinθ≈θ에서 q₊=(θ₁+θ₂)/2와 q₋=(θ₁−θ₂)/2를 대입합니다. 합 방정식은 결합이 없어 ω₊²=g/l이고 차 방정식은 복원이 2κ 더해져 ω₋²=g/l+2κ입니다. 한 진자만 놓은 초기조건은 두 모드를 모두 섞습니다.',
        'With sinθ≈θ, use q₊=(θ₁+θ₂)/2 and q₋=(θ₁−θ₂)/2. Coupling cancels from the sum and adds 2κ to the difference stiffness. Releasing only one pendulum excites both modes.'
      ]
    },
    {
      id: 'beats',
      title: ['3. 선형 모드 근사의 한계와 동기화 오해', '3. Linear-mode limits and synchronization misconceptions'],
      body: [
        '가까운 두 모드의 합은 빠른 진동과 느린 포락선을 만듭니다. 보존계의 가역적인 에너지 교환을 감쇠계의 attracting locking으로 부르지 않습니다. 큰 각도에서는 선형 모드 근사가 깨지고 beat 주기가 바뀔 수 있으므로 정상모드 예측과 실제 곡선을 함께 봅니다.',
        'Adding nearby mode frequencies produces rapid motion with a slow envelope. Reversible exchange in a conservative system is not attracting locking in a dissipative system. At large angles linear modal predictions can fail, so inspect actual trajectories alongside frequency scales.'
      ]
    }
  ],
  equations: [
    {
      id: 'native',
      title: ['두 진자의 실제 결합', 'Actual two-pendulum coupling'],
      expression:
        'theta1DDot=-(g/l)*sin(theta1)-kappa*(theta1-theta2); theta2DDot=-(g/l)*sin(theta2)+kappa*(theta1-theta2)',
      explanation: [
        '중력 복원 항은 각 진자에 따로 작용하며 결합은 두 각도의 차이를 줄이는 반대 부호의 항입니다.',
        'Each pendulum has its own gravity term; opposite coupling terms reduce angular separation.'
      ],
      symbols: [
        ['theta1', 'rad', '첫 절대각', 'First absolute angle'],
        ['theta2', 'rad', '둘째 절대각', 'Second absolute angle'],
        ['theta1DDot', 'rad/s^2', '첫 각가속도', 'First angular acceleration'],
        ['theta2DDot', 'rad/s^2', '둘째 각가속도', 'Second angular acceleration'],
        ['g', 'm/s^2', '중력', 'Gravity'],
        ['l', 'm', '공통 길이', 'Common length'],
        ['kappa', 's^-2', '각도 차이 결합', 'Angular-difference coupling']
      ]
    },
    {
      id: 'normal-modes',
      title: ['선형 정상모드 주파수', 'Linear normal-mode frequencies'],
      expression:
        'omegaPlus=sqrt(g/l); omegaMinus=sqrt(g/l+2*kappa); Tbeat=6.283185307179586/abs(omegaMinus-omegaPlus)',
      explanation: [
        '동위상 모드는 중력만, 역위상 모드는 중력과 두 배의 결합 복원을 느낍니다. 차 주파수의 역수가 에너지 교환 포락선의 시간 척도를 줍니다. κ=0에서는 beat 주기가 정의되지 않습니다.',
        'The symmetric mode sees gravity alone; the antisymmetric mode sees twice the coupling stiffness as well. The inverse frequency difference sets an energy-exchange envelope scale; at κ=0 there is no finite beat period.'
      ],
      symbols: [
        ['omegaPlus', 'rad/s', '동위상 주파수', 'Symmetric angular frequency'],
        ['omegaMinus', 'rad/s', '역위상 주파수', 'Antisymmetric angular frequency'],
        ['g', 'm/s^2', '중력', 'Gravity'],
        ['l', 'm', '공통 길이', 'Common length'],
        ['kappa', 's^-2', '결합', 'Coupling'],
        ['Tbeat', 's', '에너지 교환 포락선 시간 척도', 'Energy-exchange envelope timescale']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        'θ₁=θ₂,ω₁=ω₂이면 결합 항은 어떻게 되나요?',
        'What happens to coupling when both angles and rates match?'
      ],
      correct: ['0이며 대칭 모드가 유지됩니다.', 'It vanishes and the symmetric mode persists.'],
      incorrect: ['두 진자가 즉시 반대 위상으로 바뀝니다.', 'They immediately switch to opposite phase.'],
      explanation: [
        '결합은 절대각이 아닌 두 각도의 차이에 비례합니다.',
        'Coupling depends on angular difference, not absolute angle.'
      ]
    },
    {
      prompt: [
        '한 진자에서 다른 진자로 에너지가 넘어가면 attracting 동기화인가요?',
        'Does energy transfer alone establish attracting synchronization?'
      ],
      correct: [
        '아닙니다. 보존 beat는 가역적인 모드 간섭입니다.',
        'No. Conservative beats are reversible modal interference.'
      ],
      incorrect: ['네. 에너지가 이동하면 모든 궤적이 lock됩니다.', 'Yes. Any energy transfer locks all trajectories.'],
      explanation: [
        '감쇠 없는 같은 진자의 모드 혼합과 attractor로의 수렴은 다른 현상입니다.',
        'Mode mixing without damping differs from convergence to an attractor.'
      ]
    }
  ],
  prediction: ['κ=0과 κ=0.5에서 두 선형 모드의 차이는?', 'How do the two linear modes differ at κ=0 and κ=0.5?'],
  action: [
    '한 진자 시작·동위상·역위상 세 run을 실행하세요. coupling을 0으로 바꾸고 증가시키며 beat와 모드 주파수 척도를 비교하세요.',
    'Run one-pendulum, symmetric and antisymmetric initial states. Set coupling to zero and then increase it to compare beats and frequency scales.'
  ],
  expected: [
    '기본 ω₊≈3.13209,ω₋≈3.28786 rad/s입니다(1e-5 rad/s 허용). 대칭 run의 max |θ₁−θ₂|는 1e-12 rad 미만이고 κ=0이면 첫 진자만 시작한 run의 둘째 각도는 0입니다.',
    'Baseline ω₊≈3.13209 and ω₋≈3.28786 rad/s within 1e-5. Symmetric mismatch is below 1e-12 rad; with κ=0 the second pendulum stays at zero when only the first is released.'
  ],
  explanation: [
    '결합이 차 좌표의 복원력만 바꾸므로 분할이 생깁니다. 유한 관찰 구간보다 beat 주기가 길면 완전한 교환이 보이지 않을 수 있습니다.',
    'Coupling changes difference-coordinate stiffness. A beat period longer than the observation window may hide full exchange.'
  ],
  next: [
    '4.7에서는 진폭 의존 복원이 만드는 다중 응답과 주파수 이력을 탐구하세요.',
    'In 4.7 explore multiple responses and frequency history under amplitude-dependent restoration.'
  ],
  glossary: [
    ['정상모드', 'Normal mode'],
    [
      '작은 진동 선형화에서 모든 좌표가 한 주파수와 고정 비율로 움직이는 패턴입니다.',
      'A pattern with one frequency and fixed coordinate ratios in the small-oscillation linearization.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/expandedModels-factory.ts',
      locator: [
        'coupledRhs와 coupledEnergy의 결합 부호·길이 의존 한계를 대조했습니다.',
        'Checked coupling signs and length-dependence limitations in coupledRhs/coupledEnergy.'
      ]
    }
  ]
});
