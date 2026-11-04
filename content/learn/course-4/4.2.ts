import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.2',
  summary: [
    '같은 크기의 주기 외력이 왜 주파수에 따라 다른 응답을 만들까요? 실제 진자 일곱 개의 run에서 진폭과 위상 지연을 함께 읽습니다.',
    'Why does the same periodic force produce different responses at different frequencies? Read amplitude and phase lag from seven actual pendulum runs.'
  ],
  objectives: [
    [
      '강제 진동 방정식의 복소 응답에서 공명과 위상 지연을 유도합니다.',
      'Derive resonance and phase lag from the complex response of a forced oscillator.'
    ],
    [
      'transient가 남은 유한시간 fitting과 정상상태 전달함수를 구별합니다.',
      'Distinguish a finite-time fit containing transients from a steady-state transfer function.'
    ]
  ],
  assumptions: [
    '질량 1의 평면 단진자, 고정 길이 l, 감쇠율 c, 각가속도 진폭 A cos(Ωt)를 사용합니다. θ=0은 아래쪽이고 Ω는 Hz가 아닌 rad/s입니다. 기본 작은 진폭에서만 sinθ≈θ를 사용해 해석하며 실제 run은 기존 비선형 sinθ 엔진입니다.',
    'Use a unit-mass planar pendulum of fixed length l, damping rate c, and angular-acceleration drive A cos(Ωt). θ=0 points down and Ω is rad/s, not Hz. Linearization sinθ≈θ is interpretive only; actual runs use the existing nonlinear sine equation.'
  ],
  concepts: [
    {
      id: 'balance',
      title: ['1. 강제 진동의 항별 균형', '1. Balance the forced-oscillation terms'],
      body: [
        '각가속도·감쇠·복원 항을 같은 단위 rad/s²로 모으면 θ̈+cθ̇+(g/l)sinθ=A cosΩt입니다. A는 토크 자체가 아니라 관성으로 나눈 입력입니다. 구동이 한 일과 감쇠 손실이 경쟁하므로 기계적 에너지 변화는 적분 오차만 나타내지 않습니다.',
        'Acceleration, damping and restoring terms all have angular-acceleration units. A is torque divided by inertia. Driving work competes with dissipation, so mechanical-energy changes do not measure integration error alone.'
      ]
    },
    {
      id: 'phasor',
      title: ['2. 진폭과 지연을 함께 유도하기', '2. Derive amplitude and lag together'],
      body: [
        '작은 각도에서 cosΩt와 sinΩt 계수를 비교하거나 복소 진폭을 쓰면 분모는 ω₀²−Ω²+i cΩ입니다. 응답 진폭은 분모 크기의 역수이고 지연은 atan2(cΩ,ω₀²−Ω²)입니다. 공명은 자연주파수와 가까우나 감쇠가 있으면 진폭 최대 위치와 정확히 같지 않을 수 있습니다.',
        'For small angles, coefficient matching or complex amplitudes gives denominator ω₀²−Ω²+i cΩ. Its inverse magnitude sets amplitude and atan2(cΩ,ω₀²−Ω²) sets lag. With damping, the amplitude peak need not equal the natural frequency exactly.'
      ]
    },
    {
      id: 'window',
      title: ['3. 유한 관찰 구간의 fitting과 해석 한계', '3. Finite-window fitting and interpretation limits'],
      body: [
        '화면은 자연주파수의 0.65–1.35배 사이 일곱 주파수를 같은 초기조건에서 실행합니다. 후반부 θ를 a cosΩt+b sinΩt+c₀에 최소제곱으로 맞춥니다. 상수항은 중심 이동을 허용하지만 transient나 고조파를 없애지 않습니다. 진폭 0의 위상은 정의되지 않으므로 숫자만으로 해석하지 않습니다.',
        'Seven frequencies span 0.65–1.35 times the natural-frequency scale, each restarting from identical conditions. The second half is fitted to cosine, sine and an offset. The offset permits a shifted centre but removes neither transients nor harmonics. Phase has no physical meaning at zero response amplitude.'
      ]
    }
  ],
  equations: [
    {
      id: 'forced',
      title: ['비선형 운동과 작은 진동 척도', 'Nonlinear dynamics and the small-oscillation scale'],
      expression: 'thetaDDot+c*thetaDot+(g/l)*sin(theta)=A*cos(Omega*t); omega0=sqrt(g/l)',
      explanation: [
        '가속도·점성 감쇠·중력 복원 항의 합이 주기적인 각가속도 입력입니다. 작은 진동 자연 각주파수는 중력 나누기 길이의 제곱근입니다.',
        'Angular acceleration, viscous damping and gravity balance periodic angular acceleration; the small-oscillation natural frequency is the square root of gravity divided by length.'
      ],
      symbols: [
        ['theta', 'rad', '아래쪽 기준 각도', 'Angle from downward vertical'],
        ['thetaDot', 'rad/s', '각속도', 'Angular velocity'],
        ['thetaDDot', 'rad/s^2', '각가속도', 'Angular acceleration'],
        ['c', 's^-1', '감쇠율', 'Damping rate'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['l', 'm', '길이', 'Length'],
        ['A', 'rad/s^2', '각가속도 입력 진폭', 'Angular-acceleration drive amplitude'],
        ['Omega', 'rad/s', '구동 각주파수', 'Drive angular frequency'],
        ['t', 's', '시간', 'Time'],
        ['omega0', 'rad/s', '작은 진동 자연 각주파수', 'Small-oscillation natural frequency']
      ]
    },
    {
      id: 'response',
      title: ['선형 정상상태 진폭·위상', 'Linear steady-state amplitude and phase'],
      expression:
        'B=A/sqrt((omega0^2-Omega^2)^2+(c*Omega)^2); cos(phi)=(omega0^2-Omega^2)/sqrt((omega0^2-Omega^2)^2+(c*Omega)^2); sin(phi)=c*Omega/sqrt((omega0^2-Omega^2)^2+(c*Omega)^2)',
      explanation: [
        '진폭 B는 동적 강성과 감쇠항의 제곱합 제곱근으로 A를 나눈 값이고, 응답 B cos(Ωt−φ)의 지연 φ는 두 항의 atan2입니다.',
        'Amplitude is A divided by the magnitude of dynamic stiffness and damping; lag in B cos(Ωt−φ) is their atan2.'
      ],
      symbols: [
        ['B', 'rad', '선형 정상상태 진폭', 'Linear steady-state amplitude'],
        ['A', 'rad/s^2', '구동 진폭', 'Drive amplitude'],
        ['omega0', 'rad/s', '자연 각주파수', 'Natural angular frequency'],
        ['Omega', 'rad/s', '구동 각주파수', 'Drive angular frequency'],
        ['c', 's^-1', '감쇠율', 'Damping rate'],
        ['phi', 'rad', '구동에 대한 지연', 'Lag relative to forcing']
      ]
    }
  ],
  checks: [
    {
      prompt: ['구동 주파수 3 rad/s를 3 Hz로 읽어도 될까요?', 'Can 3 rad/s be read as 3 Hz?'],
      correct: ['아닙니다. Hz는 Ω/(2π)입니다.', 'No. Frequency in Hz is Ω/(2π).'],
      incorrect: ['둘 다 주파수이므로 같습니다.', 'They are equal because both describe frequency.'],
      explanation: ['한 주기는 2π rad이므로 단위 변환이 필요합니다.', 'A cycle contains 2π radians.']
    },
    {
      prompt: [
        '짧은 run에서 찾은 최대 응답 주파수는 정확한 정상상태 공명인가요?',
        'Is a peak from a short run an exact steady-state resonance?'
      ],
      correct: [
        '아닙니다. 과도응답·격자와 비선형성을 확인해야 합니다.',
        'No. Check transients, sampling and nonlinearity.'
      ],
      incorrect: ['가장 큰 숫자이므로 항상 확정할 수 있습니다.', 'Yes, the largest sampled number certifies it.'],
      explanation: [
        '유한 관찰 기간과 일곱 주파수만으로 연속적인 응답 곡선 전체를 알 수 없습니다.',
        'A finite window and seven samples do not resolve the entire continuous response curve.'
      ]
    }
  ],
  prediction: [
    '감쇠를 늘리면 진폭 peak와 지연 곡선은 어떻게 바뀔까요?',
    'How will added damping affect the amplitude peak and lag curve?'
  ],
  action: [
    '기본 sweep을 실행하고 진폭·위상을 나란히 읽으세요. damping과 amplitude를 하나씩 바꿔 비교하고 관찰 기간을 짧게 줄였을 때 결과가 달라지는지 확인하세요.',
    'Run the sweep and read amplitude and phase together. Change damping and amplitude separately, then shorten the observation window to expose transient dependence.'
  ],
  expected: [
    '기본 일곱 표본의 최대 진폭은 Ω≈3.13209 rad/s에서 나옵니다. 이 격자 위치의 허용 오차는 1e-6 rad/s입니다. A=0이면 기준 초기조건 0에서 모든 각도는 1e-12 rad 이내의 0입니다.',
    'The baseline seven-point peak is at Ω≈3.13209 rad/s, within 1e-6 rad/s. At A=0 and zero initial conditions every angle stays within 1e-12 rad of zero.'
  ],
  explanation: [
    '진폭·위상은 같은 동적 균형의 두 측면입니다. 구동을 끄면 위상 해석이 사라지는 것을 함께 확인하세요.',
    'Amplitude and phase describe the same dynamic balance; switching off forcing also removes meaningful driven phase.'
  ],
  next: [
    '4.3에서는 힘을 직접 더하는 대신 복원 계수를 주기적으로 바꿉니다.',
    'In 4.3 periodically vary the restoring coefficient rather than adding a direct force.'
  ],
  glossary: [
    ['위상 지연', 'Phase lag'],
    [
      '같은 주파수의 구동과 응답 사이의 각도 차이입니다.',
      'The angular displacement between same-frequency forcing and response.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/driven.ts',
      locator: [
        'rhsDriven의 감쇠·구동 부호와 phase 상태를 대조했습니다.',
        'Checked damping/drive signs and the phase state in rhsDriven.'
      ]
    },
    {
      path: 'src/product/adapters/physics/driven.ts',
      locator: [
        'sine offset π/2와 native 위상·SI 구동 단위를 대조했습니다.',
        'Checked the sine offset π/2, native phase and SI drive units.'
      ]
    }
  ]
});
