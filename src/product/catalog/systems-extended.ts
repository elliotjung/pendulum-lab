import type { SystemRow } from './systems-helpers';
import { l, b, p, nDof } from './systems-helpers';

export const extendedRows: readonly SystemRow[] = [
  {
    id: 'langevin',
    family: 'stochastic-field',
    evolution: 'sde',
    stage: 16,
    name: l('시드 기반 랑주뱅 앙상블', 'Seeded Langevin ensemble'),
    description: l(
      '가산·곱셈·행렬 잡음의 경로와 통계량을 계산한다.',
      'Computes paths and statistics for additive, multiplicative, and matrix noise.'
    ),
    binding: p('stochastic', 'runLangevinEnsemble'),
    parameters: p('stochastic', 'LangevinEnsembleSpec'),
    state: p('stochastic', 'LangevinEnsembleSpec'),
    coordinates: l(
      'initialState 벡터와 drift/diffusion 함수, 시드와 앙상블 설정.',
      'An initialState vector, drift/diffusion functions, seed, and ensemble settings.'
    ),
    dof: l('호출자가 정의한 상태 차원.', 'Caller-defined state dimension.'),
    internal: {
      binding: p('stochastic', 'runLangevinEnsemble'),
      description: l(
        'scheme에 따라 Euler–Maruyama, Milstein, 행렬 Heun 또는 가환 Milstein.',
        'Selects Euler–Maruyama, Milstein, matrix Heun, or commutative Milstein through scheme.'
      )
    },
    limitation: l(
      '확률 해석과 강수렴 차수 조건을 보존한다. 행렬 scheme은 matrixNoise, 밀스테인은 대응 확산 도함수를 요구한다.',
      'Preserve stochastic interpretation and strong-order conditions. Matrix schemes require matrixNoise; Milstein requires the matching diffusion derivative.'
    )
  },
  {
    id: 'fput',
    family: 'stochastic-field',
    evolution: 'ode',
    stage: 16,
    name: l('FPUT 비선형 사슬', 'FPUT nonlinear chain'),
    description: l(
      '비조화 인접 결합의 에너지 재귀를 계산한다.',
      'Computes energy recurrence in an anharmonic nearest-neighbor chain.'
    ),
    binding: p('fput', 'fputAcceleration'),
    engines: [p('fput', 'fputVelocityVerletStep')],
    parameters: p('fput', 'FputParameters'),
    coordinates: l(
      '[q_0..N-1, p_0..N-1] 단위 질량의 정준 상태.',
      '[q_0..N-1, p_0..N-1] canonical state with unit masses.'
    ),
    dof: nDof,
    internal: {
      binding: p('fput', 'fputVelocityVerletStep'),
      description: l(
        '전용 제자리 속도 베를레와 재사용 scratch.',
        'Dedicated in-place velocity Verlet with reusable scratch.'
      )
    },
    limitation: l(
      '범용 ODE dispatcher와 별도 API이다. 작은 진폭·모드 수·격자 크기에 따른 수렴을 확인한다.',
      'A separate API from the generic ODE dispatcher. Check convergence against amplitude, mode count, and lattice size.'
    )
  },
  {
    id: 'lattice-fk-limit',
    family: 'stochastic-field',
    evolution: 'diagnostic',
    stage: 16,
    name: l('진자 격자·FK 조화 극한', 'Pendulum lattice and harmonic FK limit'),
    description: l(
      '인접 결합 진자 격자의 조화 분산 관계를 계산한다.',
      'Computes harmonic dispersion of a nearest-neighbor pendulum lattice.'
    ),
    binding: p('pendulumNetwork', 'ringPhononDispersion'),
    parameters: p('pendulumNetwork', 'ringPhononDispersion'),
    coordinates: l(
      'onsiteOmegaSq, couplingRate, n으로 계산한 모드 진동수.',
      'Mode frequencies computed from onsiteOmegaSq, couplingRate, and n.'
    ),
    dof: nDof,
    internal: {
      binding: p('pendulumNetwork', 'ringPhononDispersion'),
      description: l(
        '조화 분산의 직접 평가이며 시간 적분은 수행하지 않는다.',
        'Direct evaluation of harmonic dispersion with no time integration.'
      )
    },
    limitation: l(
      '기존 진자 네트워크와 조화 극한이다. 일반적인 FK depinning 시간 진화 solver를 주장하지 않는다.',
      'The existing pendulum network and harmonic limit; not a general FK depinning evolution solver.'
    )
  },
  {
    id: 'sine-gordon',
    family: 'stochastic-field',
    evolution: 'field',
    stage: 16,
    name: l('사인–고든 장', 'Sine–Gordon field'),
    description: l(
      '공간 격자에서 kink와 breather 및 장의 전파를 적분한다.',
      'Integrates kinks, breathers, and field propagation on a spatial grid.'
    ),
    binding: p('sineGordon', 'createSineGordonField'),
    engines: [p('sineGordon', 'createSineGordonField'), p('sineGordon', 'stepSineGordon')],
    parameters: p('sineGordon', 'SineGordonFieldSpec'),
    state: p('sineGordon', 'SineGordonGrid'),
    coordinates: l(
      'u와 uPrev 두 시간층, dx, dt, 고정/주기 경계.',
      'Two time levels u and uPrev, dx, dt, and fixed/periodic boundaries.'
    ),
    dof: l('공간 격자 크기와 경계 조건에 따른다.', 'Determined by spatial grid size and boundary conditions.'),
    internal: {
      binding: p('sineGordon', 'stepSineGordon'),
      description: l(
        '공간 중앙 차분과 세 시간층 leapfrog.',
        'Centered spatial differences with a three-time-level leapfrog.'
      )
    },
    limitation: l(
      '안정성을 위해 dt<=dx를 유지하고 공간·시간 세분화를 확인한다. 범용 leapfrogStep과 상태 형식이 다르다.',
      'Keep dt<=dx for stability and check space/time refinement. Its state differs from generic leapfrogStep.'
    )
  },
  {
    id: 'frenkel-kontorova',
    baselineIds: [],
    family: 'stochastic-field',
    evolution: 'diagnostic',
    stage: 16,
    name: l('Frenkel–Kontorova 정적 kink', 'Frenkel–Kontorova stationary kink'),
    description: l(
      '고정 경계의 이산 FK kink를 Newton 완화하고 수렴 잔차를 확인한다.',
      'Relaxes a fixed-boundary discrete FK kink with Newton iteration and reports convergence residuals.'
    ),
    binding: p('sineGordon', 'relaxFrenkelKontorovaKink'),
    parameters: p('sineGordon', 'RelaxKinkOptions'),
    coordinates: l(
      '0→2π 고정 경계의 정규화 각도 격자. 시간 진화 상태가 아니다.',
      'A normalized angle grid with fixed 0→2π boundaries; not a time-evolution state.'
    ),
    dof: l(
      'N개 격자점 중 양 끝은 고정한 정적 각도 프로필.',
      'A static angle profile with two fixed endpoints among N lattice sites.'
    ),
    internal: {
      binding: p('sineGordon', 'relaxFrenkelKontorovaKink'),
      description: l(
        '기존 native Newton 정적 완화와 잔차 평가.',
        'Existing native static Newton relaxation and residual evaluation.'
      )
    },
    limitation: l(
      '정지점은 saddle일 수 있다. 허용치·반복 수를 확인하며 구동 depinning·이동도·비정합 동역학을 주장하지 않는다. S16 제품 확장이며 고정 S01 baseline 기능을 새로 만들지 않는다.',
      'A stationary point may be a saddle. Check tolerance and iterations; no driven depinning, mobility, or incommensurate dynamics. An S16 product extension without inventing a frozen S01 baseline capability.'
    )
  },
  {
    id: 'standard-map',
    family: 'discrete-quantum',
    evolution: 'map',
    stage: 17,
    name: l('표준 사상', 'Standard map'),
    description: l(
      '킥 강도 K의 면적 보존 이산 사상을 반복한다.',
      'Iterates an area-preserving discrete map with kick strength K.'
    ),
    binding: p('standardMap', 'standardMapStep'),
    parameters: p('standardMap', 'standardMapStep'),
    coordinates: l('theta와 p의 스칼라 입력 및 {theta,p} 출력.', 'Scalar theta and p inputs with a {theta,p} output.'),
    dof: 1,
    internal: {
      binding: p('standardMap', 'standardMapStep'),
      description: l('호출당 정확히 한 번의 이산 사상 반복.', 'Exactly one discrete map iteration per call.')
    },
    limitation: l(
      '연속 시간 dt나 ODE 적분기 설정을 사용하지 않는다. 회전각 wrapping 규칙을 보존한다.',
      'Does not use continuous-time dt or ODE integrator settings. Preserve angle wrapping conventions.'
    )
  },
  {
    id: 'quantum-kicked-rotor',
    family: 'discrete-quantum',
    evolution: 'quantum',
    stage: 17,
    name: l('양자 킥 회전자', 'Quantum kicked rotor'),
    description: l(
      'FFT로 위치 킥과 운동량 자유 전파를 번갈아 적용한다.',
      'Alternates position-space kicks and momentum-space free propagation through FFTs.'
    ),
    binding: p('quantumKickedRotor', 'createQkrState'),
    engines: [p('quantumKickedRotor', 'createQkrState'), p('quantumKickedRotor', 'qkrStep')],
    parameters: p('quantumKickedRotor', 'QuantumKickedRotorParams'),
    state: p('quantumKickedRotor', 'QkrState'),
    coordinates: l('FFT 순서의 복소 운동량 파동함수 {re,im}.', 'Complex momentum wavefunction {re,im} in FFT order.'),
    dof: l('gridSize 복소 격자 자유도.', 'gridSize complex grid degrees of freedom.'),
    internal: {
      binding: p('quantumKickedRotor', 'qkrStep'),
      description: l(
        'createQkrPlan의 위상 인자로 한 Floquet 주기를 제자리 전진한다.',
        'Advances one Floquet period in place using phase factors from createQkrPlan.'
      )
    },
    limitation: l(
      'gridSize는 2 이상인 2의 거듭제곱, hbar>0이어야 한다. 격자 크기와 확률 norm을 확인한다.',
      'Requires power-of-two gridSize>=2 and hbar>0. Check grid size and probability norm.'
    )
  },
  {
    id: 'unitary-floquet',
    family: 'discrete-quantum',
    evolution: 'spectral',
    stage: 17,
    name: l('유니터리 Floquet 스펙트럼', 'Unitary Floquet spectrum'),
    description: l(
      '복소 주기 연산자의 고유위상과 준에너지를 계산한다.',
      'Computes eigenphases and quasi-energies of a complex periodic operator.'
    ),
    binding: b('research/unitaryFloquet', 'complexUnitaryFloquetSpectrum'),
    parameters: b('research/unitaryFloquet', 'UnitaryFloquetOptions'),
    state: b('research/unitaryFloquet', 'ComplexMatrix'),
    coordinates: l('동일 크기의 실수·허수 정방 행렬 블록.', 'Matching square real and imaginary matrix blocks.'),
    dof: l('입력 복소 행렬 차원.', 'Input complex-matrix dimension.'),
    internal: {
      binding: b('research/unitaryFloquet', 'complexUnitaryFloquetSpectrum'),
      description: l(
        '행렬 스펙트럼 평가이며 궤적 시간 적분기가 아니다.',
        'Evaluates a matrix spectrum; it is not a trajectory time integrator.'
      )
    },
    limitation: l(
      'unitarity defect와 단위원 이탈을 보고한다. 투영된 고유값을 원래 연산자의 정확한 유니터리성 증거로 쓰지 않는다.',
      'Report unitarity defect and unit-circle drift. Projected eigenvalues do not prove exact unitarity of the original operator.'
    )
  }
];
