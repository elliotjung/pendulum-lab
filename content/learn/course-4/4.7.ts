import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.7',
  summary: [
    '주파수를 올릴 때와 내릴 때 왜 다른 진폭을 볼 수 있을까요? Duffing 모형에서 두 우물의 초기조건과 실제 끝점으로 이어진 주파수 sweep을 비교합니다.',
    'Why can upward and downward frequency sweeps differ? Compare initial wells and endpoint-continuation sweeps in the Duffing model.'
  ],
  objectives: [
    [
      '삼차 복원력에서 이중 우물과 진폭 의존 응답을 유도합니다.',
      'Derive double wells and amplitude-dependent response from cubic restoration.'
    ],
    [
      '유한시간 이력 차이와 인증된 hysteresis branch를 구별합니다.',
      'Distinguish finite-time history differences from certified hysteresis branches.'
    ]
  ],
  assumptions: [
    '정규화 ẍ+δẋ+αx+βx³=γcosφ,φ̇=Ω를 씁니다. 모든 변위·속도·시간·계수는 정규화 값이며 SI m,J로 해석하지 않습니다. β>0과 양의 감쇠를 유지하고 기준 α=-1은 이중 우물입니다. 각 주파수의 체류 시간은 유한합니다.',
    'Use the normalized Duffing equation and phase state. Displacement, velocity, time and coefficients are normalized, not metres or joules. Keep β>0 and positive damping; baseline α=-1 gives double wells. Dwell time at each frequency is finite.'
  ],
  concepts: [
    {
      id: 'potential',
      title: ['1. 복원력에서 우물 찾기', '1. Find wells from the restoring force'],
      body: [
        '복원력을 적분하면 U=αx²/2+βx⁴/4입니다. α<0,β>0이면 원점은 퍼텐셜 최대이고 ±sqrt(-α/β)는 최소입니다. γ=0에서 이 두 점에 정지한 해가 존재합니다. 외력을 켜면 우물 사이 이동과 서로 다른 응답이 가능해집니다.',
        'Integrating restoration gives quadratic-plus-quartic potential. For α<0, β>0 the origin is a maximum and ±sqrt(-α/β) are minima. These are exact stationary solutions without forcing; forcing permits interwell motion and multiple responses.'
      ]
    },
    {
      id: 'response',
      title: ['2. 기본주파수 근사와 굽은 응답', '2. Fundamental approximation and bent response'],
      body: [
        'x≈Bcos(Ωt−φ)를 넣고 cos³의 기본주파수 성분 3/4만 남기면 유효 강성은 α+3βB²/4입니다. B가 식의 양쪽에 들어가 여러 대수적 해가 생길 수 있지만 그 모두가 실제 안정 해는 아닙니다. 고조파·우물 이동이 크면 이 근사를 쓰지 않습니다.',
        'Keeping only the fundamental of a cubic cosine yields effective stiffness α+3βB²/4. Multiple algebraic amplitudes may appear, but they need not all be stable trajectories. Strong harmonics and interwell motion invalidate this approximation.'
      ]
    },
    {
      id: 'history',
      title: ['3. sweep 이력을 실제로 보존하기', '3. Preserve actual sweep history'],
      body: [
        '상향 sweep의 각 끝점과 구동 위상을 다음 주파수로 전달하고 마지막 상태에서 하향을 시작합니다. 후반부 반폭을 비교하되 유한 체류 시간의 transient가 포함됩니다. 별도 ±x 초기조건 run은 같은 구동을 사용합니다. 눈에 띄는 gap이 있어도 fold 위치나 안정 branch를 인증한 것은 아닙니다.',
        'The upward sweep carries each endpoint and drive phase to the next frequency, then reverses from the final state. Tail half-ranges include finite-dwell transients. Paired opposite initial conditions share the same drive. A visible gap does not certify fold locations or stable branches.'
      ]
    }
  ],
  equations: [
    {
      id: 'duffing',
      title: ['Duffing 운동과 퍼텐셜', 'Duffing dynamics and potential'],
      expression: 'xDDot+delta*xDot+alpha*x+beta*x^3=gamma*cos(phi); phiDot=Omega; U=alpha*x^2/2+beta*x^4/4',
      explanation: [
        '선형·삼차 복원과 감쇠를 가진 정규화 발진기에 주기 외력을 가합니다. 퍼텐셜의 기울기가 복원 항을 만듭니다.',
        'A periodic force drives a normalized oscillator with linear/cubic restoration and damping; potential gradient gives restoration.'
      ],
      symbols: [
        ['x', '1', '정규화 변위', 'Normalized displacement'],
        ['xDot', '1', '정규화 속도', 'Normalized velocity'],
        ['xDDot', '1', '정규화 가속도', 'Normalized acceleration'],
        ['delta', '1', '감쇠', 'Damping'],
        ['alpha', '1', '선형 강성', 'Linear stiffness'],
        ['beta', '1', '삼차 강성', 'Cubic stiffness'],
        ['gamma', '1', '구동 진폭', 'Drive amplitude'],
        ['phi', 'rad', '구동 위상', 'Drive phase'],
        ['phiDot', '1', '정규화 위상 변화율', 'Normalized phase rate'],
        ['Omega', '1', '정규화 구동 주파수', 'Normalized drive frequency'],
        ['U', '1', '정규화 퍼텐셜', 'Normalized potential']
      ]
    },
    {
      id: 'harmonic-balance',
      title: ['단일 조화 근사', 'Single-harmonic approximation'],
      expression: 'gamma^2=B^2*((alpha+3*beta*B^2/4-Omega^2)^2+(delta*Omega)^2)',
      explanation: [
        '삼차 항의 기본주파수 성분만 남긴 진폭 식입니다. 모든 해의 안정성을 알려 주는 식은 아닙니다.',
        'This amplitude relation keeps only the cubic fundamental; it does not determine stability of every root.'
      ],
      symbols: [
        ['gamma', '1', '구동 진폭', 'Drive amplitude'],
        ['B', '1', '기본주파수 응답 진폭', 'Fundamental response amplitude'],
        ['alpha', '1', '선형 강성', 'Linear stiffness'],
        ['beta', '1', '삼차 강성', 'Cubic stiffness'],
        ['Omega', '1', '구동 주파수', 'Drive frequency'],
        ['delta', '1', '감쇠', 'Damping']
      ]
    }
  ],
  checks: [
    {
      prompt: ['α=-1,β=1,γ=0에서 정지한 우물 위치는?', 'Where are stationary wells for α=-1, β=1, γ=0?'],
      correct: ['x=±1입니다.', 'At x=±1.'],
      incorrect: ['원점만 안정한 우물입니다.', 'Only the origin is a stable well.'],
      explanation: ['U′=x(x²−1)이며 U″(±1)=2>0입니다.', 'U′=x(x²−1) and U″(±1)=2>0.']
    },
    {
      prompt: [
        '짧은 상향·하향 gap은 fold의 정확한 위치를 증명하나요?',
        'Does a short up/down gap prove an exact fold location?'
      ],
      correct: [
        '아닙니다. 체류 시간·수렴·branch 안정성을 검사해야 합니다.',
        'No. Check dwell time, convergence and branch stability.'
      ],
      incorrect: ['네. gap이면 충분합니다.', 'Yes. A gap is sufficient.'],
      explanation: [
        'transient만으로도 같은 주파수에서 다른 유한시간 진폭을 만들 수 있습니다.',
        'Transients alone can create different finite-time amplitudes.'
      ]
    }
  ],
  prediction: [
    '외력을 끄면 두 우물 초기조건과 sweep 이력은 어떻게 달라질까요?',
    'How will the two initial wells and sweep history change with forcing off?'
  ],
  action: [
    '기본 상향·하향 sweep과 반대 초기조건의 위상 궤적을 실행하세요. amplitude=0으로 바꾸어 우물 의존성을 분리하고 damping을 바꾸며 유한시간 gap의 변화를 설명하세요.',
    'Run both sweep directions and opposite initial conditions. Set amplitude to zero to isolate well dependence, then vary damping and explain finite-time gaps.'
  ],
  expected: [
    '기본 sweep의 최대 반폭 차이는 0.5보다 큽니다(관찰 기간·고정 순서를 유지). γ=0,α=-1,β=1에서 x=±1,v=0은 1e-12 이내에서 그대로 유지됩니다.',
    'The baseline maximum sweep half-range gap exceeds 0.5 with the fixed window and order. At γ=0, α=-1, β=1, x=±1,v=0 remain unchanged within 1e-12.'
  ],
  explanation: [
    'native 계산은 비선형 궤적을 적분하고 근사식은 해석만 돕습니다. 우물 간 이동과 transient를 실제 데이터에서 구별하세요.',
    'Native computation integrates nonlinear trajectories; the approximate amplitude relation is interpretive. Separate interwell motion from transients in actual data.'
  ],
  next: [
    '4.8에서는 외력 없이 음의 작은 진폭 감쇠가 만드는 한계주기를 살펴보세요.',
    'In 4.8 explore a self-excited cycle produced by negative small-amplitude damping without external forcing.'
  ],
  glossary: [
    ['hysteresis 후보', 'Hysteresis candidate'],
    [
      '매개변수 변화의 이력에 따라 다른 응답이 관찰되는 현상으로, 유한시간 차이만으로 안정 branch를 인증하지 않습니다.',
      'A history-dependent response; finite-time differences alone do not certify stable branches.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/duffing.ts',
      locator: [
        'rhsDuffing,duffingPotential와 에너지 정의에서 복원 부호·우물·정규화를 대조했습니다.',
        'Checked restoring signs, wells and normalization in rhsDuffing, duffingPotential and energy.'
      ]
    }
  ]
});
