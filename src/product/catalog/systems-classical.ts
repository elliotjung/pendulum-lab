import type { SystemRow } from './systems-helpers';
import { l, p, coupledLimit, polarLimit, projectionLimit, spatialDof, state4, pendulumParams } from './systems-helpers';

export const classicalRows: readonly SystemRow[] = [
  {
    id: 'double',
    family: 'classical',
    evolution: 'ode',
    stage: 7,
    name: l('점질량 이중 진자', 'Point-mass double pendulum'),
    description: l(
      '두 질점과 질량 없는 두 막대의 평면 운동.',
      'Planar motion of two point masses and two massless rods.'
    ),
    binding: p('double', 'rhsDouble'),
    parameters: pendulumParams,
    coordinates: state4,
    dof: 2,
    limitation: coupledLimit
  },
  {
    id: 'compound-double',
    family: 'classical',
    evolution: 'ode',
    stage: 7,
    name: l('균일 막대 복합 이중 진자', 'Uniform-rod compound double pendulum'),
    description: l(
      '막대의 분포 질량과 회전 관성을 포함한 이중 진자.',
      'Double pendulum with distributed rod masses and rotational inertia.'
    ),
    binding: p('compoundDouble', 'rhsCompoundDouble'),
    parameters: pendulumParams,
    coordinates: state4,
    dof: 2,
    limitation: coupledLimit
  },
  {
    id: 'triple',
    family: 'classical',
    evolution: 'ode',
    stage: 10,
    name: l('삼중 진자', 'Triple pendulum'),
    description: l('세 링크 평면 진자의 결합 운동.', 'Coupled motion of a three-link planar pendulum.'),
    binding: p('triple', 'rhsTriple'),
    parameters: pendulumParams,
    coordinates: l('[theta1..3, omega1..3] 길이 6 벡터.', '[theta1..3, omega1..3] length-six vector.'),
    dof: 3,
    limitation: coupledLimit
  },
  {
    id: 'chain',
    family: 'classical',
    evolution: 'ode',
    stage: 10,
    name: l('N중 평면 진자', 'Planar N-pendulum chain'),
    description: l(
      '질량·길이 배열로 정의하는 가변 링크 진자.',
      'A variable-link pendulum defined by mass and length arrays.'
    ),
    binding: p('nPendulum', 'rhsChain'),
    parameters: p('nPendulum', 'ChainParameters'),
    coordinates: l('[theta_0..N-1, omega_0..N-1] 길이 2N 벡터.', '[theta_0..N-1, omega_0..N-1] length-2N vector.'),
    dof: l('1–128개 링크, 각 링크당 1 자유도.', 'One to 128 links, one degree of freedom per link.'),
    limitation: l(
      'g>0, 양의 질량·길이가 필요하다. 밀집 질량행렬 메모리는 O(N²), 직접 해법은 O(N³)이며 큰 사슬은 worker에서 계산한다.',
      'Requires g>0 and positive masses/lengths. Dense mass-matrix memory is O(N²), direct solving is O(N³); large chains run in a worker.'
    )
  },
  {
    id: 'spring',
    family: 'flexible',
    evolution: 'ode',
    stage: 11,
    name: l('용수철 진자', 'Spring pendulum'),
    description: l(
      '반지름 변형과 각운동이 결합된 Hooke 용수철 진자.',
      'A Hookean spring pendulum coupling radial deformation and angular motion.'
    ),
    binding: p('spring', 'rhsSpring'),
    parameters: p('spring', 'SpringPendulumParameters'),
    coordinates: l(
      '[r, theta, rDot, thetaDot] 반지름·각도와 그 속도.',
      '[r, theta, rDot, thetaDot] radius, angle, and their rates.'
    ),
    dof: 2,
    limitation: l(
      '기존 엔진은 r=0 부근을 정칙화하며 새 Lab은 원점 특이점 접근 시 중지한다. 용수철 힘은 압축에서 음수이다. 속도 의존 가속도의 분할법은 근사이다.',
      'The legacy engine regularizes near r=0; the new Lab stops near the origin singularity. Spring force is negative under compression. Splitting velocity-dependent acceleration is approximate.'
    )
  },
  {
    id: 'rope',
    family: 'flexible',
    evolution: 'hybrid',
    stage: 11,
    name: l('편측 줄 진자', 'Unilateral rope pendulum'),
    description: l(
      '줄의 팽팽함·느슨함과 재포획 충격을 추적한다.',
      'Tracks taut/slack rope phases and recapture impacts.'
    ),
    binding: p('rope', 'RopePendulum'),
    parameters: p('rope', 'RopeParams'),
    state: p('rope', 'RopeStateSnapshot'),
    coordinates: l(
      '팽팽한 각 상태와 느슨한 Cartesian 상태를 포함한 snapshot.',
      'Snapshot containing taut angular and slack Cartesian states.'
    ),
    dof: l('팽팽한 구간 1, 느슨한 구간 2.', 'One in taut phases, two in slack phases.'),
    internal: {
      binding: p('rope', 'RopePendulum'),
      description: l('최대 2 ms RK4 부분 단계와 사건 시각 보정.', 'RK4 substeps up to 2 ms with event-time refinement.')
    },
    limitation: l(
      '인장만 지지하며 포획에서 에너지가 손실된다. 매끄러운 보존 ODE로 취급하지 않는다.',
      'Supports tension only and loses energy at capture. This is not a smooth conservative ODE.'
    )
  },
  {
    id: 'double-string',
    family: 'flexible',
    evolution: 'hybrid',
    stage: 11,
    name: l('편측 이중 줄 진자', 'Unilateral double-string pendulum'),
    description: l(
      '두 줄의 장력·이완·재포획을 포함한 평면 운동.',
      'Planar motion with tension, slack, and recapture of two strings.'
    ),
    binding: p('doubleString', 'DoubleStringPendulum'),
    parameters: p('doubleString', 'DoubleStringParams'),
    state: p('doubleString', 'DoubleStringSnapshot'),
    coordinates: l(
      '각 상태·Cartesian 상태와 taut/outer-slack/full-slack 위상.',
      'Angular/Cartesian state and taut/outer-slack/full-slack phase.'
    ),
    dof: l('구속 위상에 따라 2~4.', 'Two to four depending on constraint phase.'),
    internal: {
      binding: p('doubleString', 'DoubleStringPendulum'),
      description: l(
        'RK4 팽팽한 구간과 탄도 구간 및 사건 보정.',
        'RK4 taut segments, ballistic segments, and event refinement.'
      )
    },
    limitation: l(
      'taut/outer-slack/full-slack 세 모드의 기존 근사 모델이다. 안쪽만 느슨한 모드는 따로 풀지 않는다. 포획 손실·구속 잔차·간격 수렴을 확인해야 하며 강체 이중 진자 RHS로 대체할 수 없다.',
      'The legacy approximation has taut/outer-slack/full-slack modes and no separate inner-only slack mode. Check capture loss, constraint residuals and step convergence; a rigid double-pendulum RHS cannot replace it.'
    )
  },
  {
    id: 'spherical',
    family: 'spatial',
    evolution: 'ode',
    stage: 12,
    name: l('구면 진자', 'Spherical pendulum'),
    description: l(
      '극각과 방위각으로 표현한 공간 진자.',
      'A spatial pendulum represented by polar and azimuthal angles.'
    ),
    binding: p('spherical', 'SphericalPendulum'),
    parameters: p('spherical', 'SphericalParams'),
    state: p('spherical', 'SphericalState'),
    coordinates: l('[theta, phi, thetaDot, phiDot] 각 좌표.', '[theta, phi, thetaDot, phiDot] angular coordinates.'),
    dof: 2,
    limitation: polarLimit,
    internal: {
      binding: p('spherical', 'SphericalPendulum'),
      description: l('클래스에 고정된 RK4와 내부 dt.', 'Class-owned RK4 with an internal dt.')
    }
  },
  {
    id: 'spherical-chain',
    family: 'spatial',
    evolution: 'ode',
    stage: 12,
    name: l('구면 진자 사슬', 'Spherical pendulum chain'),
    description: l(
      '공간 N중 진자의 각 좌표 질량 행렬을 푼다.',
      'Solves the angular-coordinate mass matrix of a spatial N-pendulum chain.'
    ),
    binding: p('sphericalChain', 'SphericalChain'),
    parameters: p('sphericalChain', 'SphericalChainParams'),
    coordinates: l(
      '[theta_0, phi_0, …, thetaDot_0, phiDot_0, …] 길이 4N.',
      '[theta_0, phi_0, …, thetaDot_0, phiDot_0, …] length 4N.'
    ),
    dof: spatialDof,
    limitation: polarLimit
  },
  {
    id: 'spherical-embedded',
    family: 'spatial',
    evolution: 'constrained',
    stage: 12,
    name: l('매입 좌표 구면 진자', 'Embedded spherical pendulum'),
    description: l(
      '단위 방향 벡터와 접선 속도로 극점 특이점을 피한다.',
      'Uses a unit direction vector and tangent velocity to avoid polar singularities.'
    ),
    binding: p('sphericalEmbedded', 'EmbeddedSphericalPendulum'),
    parameters: p('spherical', 'SphericalParams'),
    state: p('sphericalEmbedded', 'EmbeddedSphericalState'),
    coordinates: l('[ux,uy,uz,wx,wy,wz], |u|=1, u·w=0.', '[ux,uy,uz,wx,wy,wz], |u|=1, u·w=0.'),
    dof: 2,
    limitation: projectionLimit,
    internal: {
      binding: p('sphericalEmbedded', 'EmbeddedSphericalPendulum'),
      description: l('RK4와 각 단계 후 구속 투영.', 'RK4 with projection after each step.')
    }
  },
  {
    id: 'spherical-embedded-chain',
    family: 'spatial',
    evolution: 'constrained',
    stage: 12,
    name: l('매입 좌표 구면 사슬', 'Embedded spherical chain'),
    description: l(
      '단위 벡터 구속과 승수 방정식으로 공간 사슬을 적분한다.',
      'Integrates a spatial chain with unit-vector constraints and multiplier equations.'
    ),
    binding: p('sphericalEmbeddedChain', 'EmbeddedSphericalChain'),
    parameters: p('sphericalEmbeddedChain', 'EmbeddedChainParams'),
    state: p('sphericalEmbeddedChain', 'EmbeddedChainState'),
    coordinates: l(
      '[u_0(3), …, w_0(3), …] 길이 6N와 링크별 구속.',
      '[u_0(3), …, w_0(3), …] length 6N with per-link constraints.'
    ),
    dof: spatialDof,
    limitation: projectionLimit,
    internal: {
      binding: p('sphericalEmbeddedChain', 'EmbeddedSphericalChain'),
      description: l('RK4와 각 단계 후 링크 구속 투영.', 'RK4 with per-link projection after each step.')
    }
  }
];
