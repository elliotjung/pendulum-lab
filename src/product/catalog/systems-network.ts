import type { SystemRow } from './systems-helpers';
import { l, b, p, nDof } from './systems-helpers';

export const networkRows: readonly SystemRow[] = [
  {
    id: 'magnetic',
    family: 'network',
    evolution: 'ode',
    stage: 15,
    name: l('다중 자석 진자', 'Multi-magnet pendulum'),
    description: l(
      '여러 자석의 인력과 감쇠를 받는 평면 질점 운동.',
      'Planar point-mass motion under multiple magnetic attractions and damping.'
    ),
    binding: p('magneticPendulum', 'rhsMagneticPendulum'),
    parameters: p('magneticPendulum', 'MagneticPendulumParameters'),
    coordinates: l(
      '[x, y, vx, vy] 평면 Cartesian 좌표. 새 Lab은 위치·속도·시간·에너지를 정규화한다.',
      '[x, y, vx, vy] planar Cartesian coordinates. The new Lab uses normalized position, velocity, time and energy.'
    ),
    dof: 2,
    limitation: l(
      '정칙화된 현상론적 자력 모델이며 실제 자석 형상·접촉은 포함하지 않는다. 궤적 RK4와 basin의 semi-implicit Euler를 구분한다. 유한 시간 최근접 자석과 속도 수렴 mask는 인력권 인증이 아니다.',
      'A softened phenomenological force model without magnet geometry or contact. Distinguish trajectory RK4 from basin semi-implicit Euler. Finite-time nearest magnets and a speed-convergence mask do not certify basins.'
    )
  },
  {
    id: 'pendulum-network',
    family: 'network',
    evolution: 'ode',
    stage: 15,
    name: l('진자 결합 그래프', 'Coupled pendulum graph'),
    description: l(
      '결합 행렬로 연결된 평면 진자 네트워크.',
      'A network of planar pendulums connected by a coupling matrix.'
    ),
    binding: p('pendulumNetwork', 'rhsPendulumNetwork'),
    parameters: p('pendulumNetwork', 'PendulumNetworkParameters'),
    coordinates: l('[theta_0..N-1, omega_0..N-1] 네트워크 상태.', '[theta_0..N-1, omega_0..N-1] network state.'),
    dof: nDof,
    limitation: l(
      '무방향 비틀림 결합이며 감쇠가 있으면 에너지가 소산된다. 원형 각도 정렬 R과 국소 coherence는 진동 위상 추정이 아니다. 임의의 기계 접촉 그래프를 구현하지 않는다.',
      'Undirected torsional coupling; damping dissipates energy. Circular angle order R and local coherence do not estimate oscillation phase. No arbitrary mechanical contact graph.'
    )
  },
  {
    id: 'kuramoto',
    family: 'network',
    evolution: 'ode',
    stage: 15,
    name: l('쿠라모토 위상 네트워크', 'Kuramoto phase network'),
    description: l(
      '고유 진동수와 사인 위상 결합으로 동기화를 모델링한다.',
      'Models synchronization using natural frequencies and sinusoidal phase coupling.'
    ),
    binding: p('kuramoto', 'rhsKuramoto'),
    parameters: p('kuramoto', 'KuramotoNetworkParameters'),
    coordinates: l('[phase_0..N-1] 위상만 포함한다.', '[phase_0..N-1] contains phases only.'),
    dof: l('N개 1차 위상 변수.', 'N first-order phase variables.'),
    limitation: l(
      '진폭이나 관성 좌표가 없다. 새 Lab의 무방향 그래프는 이웃 가중치 합으로 행 정규화하며 self 항을 포함한 기존 K/N과 유효 결합이 다르다. 짝수 차원이어도 q/v 분할 적분기는 호환되지 않는다.',
      'No amplitude or inertia. The Lab undirected graph normalizes rows by neighbour weights, differing from legacy self-inclusive K/N coupling. Even state dimension does not make q/v split steppers compatible.'
    )
  },
  {
    id: 'huygens-phase-pair',
    family: 'network',
    evolution: 'ode',
    stage: 15,
    name: l('하위헌스 두 시계 위상 축약', 'Huygens two-clock phase reduction'),
    description: l(
      '두 발진자의 위상 잠금과 진동수 불일치를 조사한다.',
      'Examines phase locking and frequency mismatch between two oscillators.'
    ),
    binding: p('kuramoto', 'rhsHuygensPhasePair'),
    parameters: p('kuramoto', 'HuygensPhasePairParameters'),
    coordinates: l('[phase1, phase2] 두 위상.', '[phase1, phase2] two phases.'),
    dof: 2,
    limitation: l(
      '진폭, 탈진기 접촉, 지지대 반동, 충격이나 기어 마찰이 없는 위상 축약이다.',
      'A phase reduction without amplitudes, escapement contact, support recoil, impacts, or gear friction.'
    )
  },
  {
    id: 'chimera-exploration',
    family: 'network',
    evolution: 'ode',
    stage: 15,
    name: l('키메라 초기조건 동기화 탐색', 'Chimera-seeded synchronization exploration'),
    description: l(
      '비국소 쿠라모토 사슬의 유한 네트워크 위상 일관성을 탐색한다.',
      'Explores finite-network phase coherence in a nonlocal Kuramoto ring.'
    ),
    binding: b('app/researchPlusModels', 'buildSynchronizationExploration'),
    parameters: b('app/researchPlusModels', 'buildSynchronizationExploration'),
    state: b('app/researchPlusModels', 'SynchronizationExploration'),
    coordinates: l(
      'N개 위상, 시간별 order parameter와 최종 진단.',
      'N phases, order parameters over time, and final diagnostics.'
    ),
    dof: l('count>=8인 유한 위상 네트워크.', 'A finite phase network with count>=8.'),
    internal: {
      binding: b('app/researchPlusModels', 'buildSynchronizationExploration'),
      description: l('내부 midpoint RK2와 위상 wrapping.', 'Internal midpoint RK2 with phase wrapping.')
    },
    limitation: l(
      '쿠라모토 동역학과 키메라 진단을 재사용한다. 새 Lab은 stable ID의 ringOrder와 단위 가중치 비국소 고리를 보존한다. chimera-candidate는 순간 유한 크기 진단이며 지속성·크기·반경 수렴을 확인해야 한다.',
      'Reuses Kuramoto dynamics and chimera diagnostics. The Lab preserves stable-ID ringOrder and a unit-weight nonlocal ring. A chimera candidate is an instantaneous finite-size diagnostic requiring persistence, size and radius refinement.'
    )
  }
];
