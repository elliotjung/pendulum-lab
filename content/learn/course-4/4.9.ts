import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.9',
  summary: [
    '힘이 있는데도 왜 블록이 움직이지 않을까요? 기존 scalar 마찰 접촉 모형에서 정지·미끄럼 전환과 에너지 손실을 시간축에서 조사합니다.',
    'Why can a loaded block remain at rest? Inspect static/sliding transitions and energy loss in the existing scalar friction-contact model.'
  ],
  objectives: [
    [
      '정지 마찰의 부등식 조건과 운동 마찰의 방향을 설명합니다.',
      'Explain the static-friction inequality and direction of sliding friction.'
    ],
    [
      '격자상 전환 시각·수치 채터링·물리적 stick-slip을 구별합니다.',
      'Distinguish grid-observed transition times, numerical chatter and physical stick-slip.'
    ]
  ],
  assumptions: [
    '질량 m과 용수철 k의 1차원 블록에 주기 힘을 가합니다. 완전한 마찰 진자가 아닌 기존 scalar complementarity 도구의 예제입니다. x는 m,v는 m/s,Fs와 Fc는 N이고 Fs≥Fc입니다. Stribeck·정칙화 곡선은 실제 complementarity 궤적과 구별합니다.',
    'Apply periodic force to a one-dimensional mass–spring block. This demonstrates the existing scalar complementarity tool, not a complete friction-pendulum model. x is metres, v is m/s, Fs and Fc are newtons, with Fs≥Fc. Distinguish display Stribeck/regularization curves from the actual complementarity trajectory.'
  ],
  concepts: [
    {
      id: 'static',
      title: ['1. 정지 마찰은 한 개의 상수가 아니다', '1. Static friction is not a single fixed force'],
      body: [
        'v=0에서는 마찰이 ±Fs 사이에서 필요한 만큼 외력과 용수철 힘을 상쇄할 수 있습니다. |외력−kx|가 한계를 넘으면 정지를 유지할 수 없습니다. Fc를 모든 순간에 대입하면 작은 힘에서도 가짜 운동이 생길 수 있습니다.',
        'At v=0, friction can take any required value within ±Fs to balance applied and spring forces. Exceeding the limit prevents sticking. Applying the dynamic value at every instant can create spurious motion under small loads.'
      ]
    },
    {
      id: 'discrete-contact',
      title: ['2. 격자에서 운동량과 접촉을 풀기', '2. Solve momentum and contact on the grid'],
      body: [
        'native 함수는 현재 힘과 이전 속도로 한 단계 운동량 변화를 풀어 stick 또는 slip을 반환합니다. 시간축의 전환은 이 격자 판정이며 연속 사건의 정확한 root가 아닙니다. dt를 줄이면 전환 시각과 마찰 일이 어떻게 바뀌는지 비교해야 합니다.',
        'The native function solves a one-step momentum/contact update from current force and prior velocity, returning stick or slip. Timeline transitions are grid observations, not exact continuous roots; refine dt to compare event times and work.'
      ]
    },
    {
      id: 'work',
      title: ['3. 마찰 일과 외력 일을 분리하기', '3. Separate friction work from drive work'],
      body: [
        '미끄럼에서 Coulomb 마찰은 속도와 반대이므로 fcv≤0입니다. 추가 점성 손실 bv²와 주기 외력의 일을 함께 계산해야 전체 에너지 수지를 이해할 수 있습니다. 표시 마찰 일은 native 접촉력의 격자 적분이며 점성 항 전체를 포함한 엄밀 수지가 아닙니다. 외력이 충분하면 에너지가 잠시 증가할 수 있습니다.',
        'During slip, Coulomb friction opposes velocity and has nonpositive power. Include viscous loss and drive work when interpreting total energy. Displayed contact work is a grid integral of native contact force, not a certified full viscous energy balance; drive can temporarily increase energy.'
      ]
    }
  ],
  equations: [
    {
      id: 'stick-slip',
      title: ['정지와 미끄럼의 조건', 'Static and sliding conditions'],
      expression: 'abs(Fdrive-k*x)<=Fs; fStatic=-Fdrive+k*x; frictionPower=-Fc*abs(v)',
      explanation: [
        '정지할 수 있는 힘 영역에서는 마찰이 필요한 반력을 제공하고, 미끄럼에서는 운동 마찰이 속도의 부호와 반대로 작용합니다.',
        'Within the admissible static-force interval friction supplies the needed reaction; during sliding it opposes velocity.'
      ],
      symbols: [
        ['v', 'm/s', '블록 속도', 'Block velocity'],
        ['Fdrive', 'N', '외력', 'Applied drive force'],
        ['k', 'N/m', '용수철 강성', 'Spring stiffness'],
        ['x', 'm', '블록 변위', 'Block displacement'],
        ['Fs', 'N', '정지 마찰 한계', 'Static friction limit'],
        ['Fc', 'N', '운동 마찰 크기', 'Dynamic friction magnitude'],
        ['fStatic', 'N', '정지 조건에서 필요한 마찰력', 'Friction needed under the static condition'],
        ['frictionPower', 'W', '미끄럼 구간 Coulomb 마찰 일률', 'Coulomb friction power during sliding']
      ]
    },
    {
      id: 'energy-work',
      title: ['미끄럼 구간의 에너지 수지', 'Energy balance during sliding'],
      expression: 'E=m*v^2/2+k*x^2/2; energyRate=Fdrive*v-b*v^2-Fc*abs(v)',
      explanation: [
        '운동·탄성 에너지 변화는 구동 일률에서 점성·Coulomb 소산을 뺀 값입니다. 전환을 포함한 native 격자 해의 정확한 이산 항등식이라고 주장하지 않습니다.',
        'Kinetic-plus-elastic energy changes by drive power minus viscous and Coulomb losses; this continuous sliding identity is not claimed as an exact discrete identity across native transitions.'
      ],
      symbols: [
        ['E', 'J', '블록의 역학에너지', 'Block mechanical energy'],
        ['m', 'kg', '질량', 'Mass'],
        ['v', 'm/s', '속도', 'Velocity'],
        ['k', 'N/m', '강성', 'Stiffness'],
        ['x', 'm', '변위', 'Displacement'],
        ['Fdrive', 'N', '외력', 'Drive force'],
        ['b', 'N*s/m', '점성 계수', 'Viscous coefficient'],
        ['Fc', 'N', '운동 마찰 크기', 'Dynamic friction magnitude'],
        ['energyRate', 'W', '미끄럼 구간 에너지 변화율', 'Energy rate during sliding']
      ]
    }
  ],
  checks: [
    {
      prompt: ['정지할 때 마찰력은 항상 −Fc인가요?', 'Is friction always −Fc while sticking?'],
      correct: [
        '아닙니다. 허용 구간 안에서 필요한 반력을 가집니다.',
        'No. It supplies the needed reaction within its admissible interval.'
      ],
      incorrect: ['네. 정지·운동 마찰은 같습니다.', 'Yes. Static and dynamic friction are identical.'],
      explanation: [
        '정지 마찰은 힘 균형과 부등식 한계로 정의됩니다.',
        'Static friction is defined by force balance and an inequality limit.'
      ]
    },
    {
      prompt: [
        '격자에서 전환 수가 늘면 물리적인 stick-slip이 더 정확해졌나요?',
        'Does more grid switching necessarily mean more accurate physical stick-slip?'
      ],
      correct: ['아닙니다. 간격 수렴과 채터링을 확인해야 합니다.', 'No. Check step convergence and chatter.'],
      incorrect: ['네. 전환이 많을수록 정확합니다.', 'Yes. More switches always mean higher accuracy.'],
      explanation: [
        '큰 간격이나 부적절한 전환 처리도 가짜 고주파 전환을 만듭니다.',
        'Large steps or unsuitable switching can create spurious rapid transitions.'
      ]
    }
  ],
  prediction: [
    '외력 진폭을 0.8 N으로 줄이면 기본 Fs=1.2 N 아래에서 어떤 모드가 예상되나요?',
    'What mode is expected when drive amplitude is reduced to 0.8 N below baseline Fs=1.2 N?'
  ],
  action: [
    '기본 run에서 전환 표·속도·힘을 비교하세요. amplitude=0.8로 줄이고 다시 실행한 뒤 기본 진폭에서 step을 절반으로 줄여 전환 관찰을 비교하세요.',
    'Inspect transition table, velocity and forces. Repeat with amplitude 0.8, then restore baseline forcing and halve step to compare switching observations.'
  ],
  expected: [
    '기본 15 s run은 stick과 slip을 모두 포함하고 접촉 마찰 일은 음수입니다. amplitude=0.8의 정지 초기조건에서는 모든 변위·속도가 1e-12 이내의 0이며 전환 수가 0입니다.',
    'The baseline 15 s run includes both stick and slip and negative contact-friction work. With amplitude 0.8 and a resting start, displacement and velocity remain within 1e-12 of zero with no transitions.'
  ],
  explanation: [
    '작은 외력은 정지 반력으로 상쇄되지만 큰 외력은 한계를 넘겨 미끄럼을 시작합니다. 전환 표의 시각은 계산 격자의 해상도만큼만 의미가 있습니다.',
    'Small loads are balanced by static reaction; larger loads trigger slip. Timeline times carry only grid-level resolution.'
  ],
  next: [
    '4.10에서는 현재 상태뿐 아니라 과거 상태가 힘을 정하는 지연 계를 탐구하세요.',
    'In 4.10 explore a delay system whose force depends on history as well as the present state.'
  ],
  glossary: [
    ['stick-slip', 'Stick-slip'],
    [
      '속도 0인 정지 구간과 미끄럼 구간이 번갈아 나타나는 접촉 운동입니다.',
      'Contact motion alternating between zero-velocity sticking and sliding.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/friction.ts',
      locator: [
        'staticFrictionComplementarityStep의 정지·미끄럼 및 운동량/마찰원뿔 잔차를 대조했습니다.',
        'Checked static/sliding modes and momentum/cone residuals in staticFrictionComplementarityStep.'
      ]
    },
    {
      path: 'src/product/adapters/physics/nonlinear.ts',
      locator: [
        'friction branch가 힘·이전 속도를 평가하는 이산 규칙과 표시 곡선 분리를 대조했습니다.',
        'Checked the discrete friction branch and its separation from display friction curves.'
      ]
    }
  ]
});
