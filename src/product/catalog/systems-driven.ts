import type { SystemRow } from './systems-helpers';
import {
  l,
  b,
  p,
  driveLimit,
  state3,
  state4,
  expansionParams,
  expansionFactory,
  expansionDefinitions
} from './systems-helpers';

export const drivenRows: readonly SystemRow[] = [
  {
    id: 'driven',
    family: 'driven-control',
    evolution: 'ode',
    stage: 13,
    name: l('감쇠 구동 진자', 'Damped driven pendulum'),
    description: l('주기적 외력과 선형 감쇠가 작용하는 진자.', 'A pendulum with periodic forcing and linear damping.'),
    binding: p('driven', 'rhsDriven'),
    parameters: p('driven', 'DrivenParameters'),
    coordinates: state3,
    dof: 1,
    limitation: driveLimit
  },
  {
    id: 'coupled',
    family: 'driven-control',
    evolution: 'ode',
    stage: 13,
    name: l('결합 진자', 'Coupled pendulums'),
    description: l(
      '각도 차이에 비례하는 결합을 가진 두 진자.',
      'Two pendulums coupled proportionally to their angle difference.'
    ),
    binding: expansionDefinitions,
    engines: [expansionFactory],
    parameters: expansionParams,
    state: p('expandedModels-types', 'ExpansionSystem'),
    coordinates: state4,
    dof: 2,
    limitation: l(
      'factory id=coupled와 기존 기본값을 사용한다. 에너지 비교 시 감쇠와 결합의 단위 정의를 확인한다.',
      'Uses factory id=coupled and legacy defaults. Check damping and coupling units when interpreting energy.'
    )
  },
  {
    id: 'inverted',
    family: 'driven-control',
    evolution: 'ode',
    stage: 13,
    name: l('역진자', 'Inverted pendulum'),
    description: l(
      '위쪽 평형을 기준으로 개방 루프 또는 포화된 PD 피드백을 비교한다.',
      'Compares open-loop motion and saturated PD feedback around the upright equilibrium.'
    ),
    binding: expansionDefinitions,
    engines: [expansionFactory],
    parameters: expansionParams,
    state: p('expandedModels-types', 'ExpansionSystem'),
    coordinates: l(
      '[theta, omega], rad와 rad/s. theta=0은 위쪽 불안정 평형이며 화면 y는 위쪽이다.',
      '[theta, omega] in rad and rad/s. Theta=0 is the unstable upright equilibrium; display y points up.'
    ),
    dof: 1,
    limitation: l(
      'factory id=inverted의 plant를 보존한다. 새 Lab의 별도 PD adapter는 각도 오차를 사용하며 |theta−reference|>π/2에서 안전 중지한다. 국소 안정화이며 전역 swing-up 제어가 아니다.',
      'Preserves the factory id=inverted plant. A separate Lab PD adapter uses angular error and stops at |theta−reference|>π/2. Local stabilization only; no global swing-up controller.'
    )
  },
  {
    id: 'cartpole',
    family: 'driven-control',
    evolution: 'ode',
    stage: 13,
    name: l('카트폴', 'Cart-pole'),
    description: l(
      '카트와 위쪽 진자의 결합 운동에 외력·파형·상태 피드백을 적용한다.',
      'Applies external force, waveforms and state feedback to a cart and upright pole.'
    ),
    binding: expansionDefinitions,
    engines: [expansionFactory],
    parameters: expansionParams,
    state: p('expandedModels-types', 'ExpansionSystem'),
    coordinates: l(
      '[x, theta, xDot, thetaDot], m·rad·m/s·rad/s. theta=0은 위쪽, 화면 y는 위쪽이다.',
      '[x, theta, xDot, thetaDot] in m, rad, m/s, rad/s. Theta=0 is upright; display y points up.'
    ),
    dof: 2,
    limitation: l(
      'factory id=cartpole의 plant와 에너지 진단을 보존한다. 기존 rod RHS와 point-bob 에너지식은 서로 달라 보존 검증에 쓰지 않는다. 별도 Lab 제어기는 포화·각도 안전 한계를 가진 국소 상태 피드백이다.',
      'Preserves the factory id=cartpole plant and energy diagnostic. The inherited rod RHS and point-bob energy formula differ, so energy is not a conservation check. The separate Lab controller is local state feedback with saturation and angle safety limits.'
    )
  },
  {
    id: 'parametric',
    family: 'driven-control',
    evolution: 'ode',
    stage: 13,
    name: l('매개변수 가진 진자', 'Parametrically excited pendulum'),
    description: l(
      '복원 계수를 주기적으로 변조하는 진자.',
      'A pendulum with a periodically modulated restoring coefficient.'
    ),
    binding: expansionDefinitions,
    engines: [expansionFactory],
    parameters: expansionParams,
    state: p('expandedModels-types', 'ExpansionSystem'),
    coordinates: state3,
    dof: 1,
    limitation: driveLimit
  },
  {
    id: 'duffing',
    family: 'nonlinear',
    evolution: 'ode',
    stage: 14,
    name: l('더핑 발진기', 'Duffing oscillator'),
    description: l(
      '3차 복원력과 외력을 가진 비선형 발진기.',
      'A nonlinear oscillator with cubic restoring force and external drive.'
    ),
    binding: p('duffing', 'rhsDuffing'),
    parameters: p('duffing', 'DuffingParameters'),
    coordinates: l('[x, v, phase] 변위·속도·구동 위상.', '[x, v, phase] displacement, velocity, and drive phase.'),
    dof: 1,
    limitation: driveLimit
  },
  {
    id: 'van-der-pol',
    family: 'nonlinear',
    evolution: 'ode',
    stage: 14,
    name: l('반데르폴 발진기', 'Van der Pol oscillator'),
    description: l(
      '상태 의존 감쇠로 한계 주기를 만드는 발진기.',
      'An oscillator producing a limit cycle through state-dependent damping.'
    ),
    binding: p('vanDerPol', 'rhsVanDerPol'),
    parameters: p('vanDerPol', 'VanDerPolParameters'),
    coordinates: l('[x, v] 변위와 속도.', '[x, v] displacement and velocity.'),
    dof: 1,
    limitation: l(
      'mu>0에서 에너지는 진단량이다. 큰 mu의 강성과 속도 의존 감쇠를 고려한다.',
      'Energy is diagnostic for mu>0. Account for stiffness at large mu and velocity-dependent damping.'
    )
  },
  {
    id: 'kapitza',
    family: 'nonlinear',
    evolution: 'ode',
    stage: 14,
    name: l('카피차 진자', 'Kapitza pendulum'),
    description: l(
      '지지점의 빠른 수직 가진을 그대로 적분한다.',
      'Directly integrates fast vertical excitation of the pivot.'
    ),
    binding: p('kapitza', 'rhsKapitza'),
    parameters: p('kapitza', 'KapitzaParameters'),
    coordinates: state3,
    dof: 1,
    limitation: driveLimit
  },
  {
    id: 'mathieu',
    family: 'nonlinear',
    evolution: 'diagnostic',
    stage: 14,
    name: l('마티외 안정성 지도', 'Mathieu stability diagram'),
    description: l(
      '선형 주기계의 monodromy와 Floquet 승수로 안정성을 조사한다.',
      'Examines stability through monodromy and Floquet multipliers of a linear periodic system.'
    ),
    binding: b('chaos/mathieuStability', 'mathieuStabilityDiagram'),
    parameters: b('chaos/mathieuStability', 'MathieuStabilityDiagramSpec'),
    state: b('chaos/mathieuStability', 'MathieuStabilityDiagram'),
    coordinates: l(
      'delta/epsilon 격자와 Floquet 스펙트럼 출력; 독립 궤적 상태가 아니다.',
      'Delta/epsilon grid with Floquet spectral outputs, not an independent trajectory state.'
    ),
    dof: 1,
    internal: {
      binding: b('chaos/mathieuStability', 'mathieuFloquet'),
      description: l(
        '선형 monodromy의 한 주기를 내부 RK4로 계산한다.',
        'Computes one period of the linear monodromy using internal RK4.'
      )
    },
    limitation: l(
      '선형 마티외 방정식의 안정성 분석이다. 비선형 매개변수 진자 궤적을 대신하지 않는다.',
      'Analyzes stability of the linear Mathieu equation; it does not replace nonlinear parametric-pendulum trajectories.'
    )
  },
  {
    id: 'friction',
    family: 'nonlinear',
    evolution: 'diagnostic',
    stage: 14,
    name: l('쿨롱·스트리벡 마찰 도구', 'Coulomb and Stribeck friction tools'),
    description: l(
      '정칙화 마찰력과 정지 마찰 complementarity 단계를 제공한다.',
      'Provides regularized friction forces and a static-friction complementarity step.'
    ),
    binding: p('friction', 'applyStribeckFriction'),
    parameters: p('friction', 'StribeckFrictionParameters'),
    engines: [p('friction', 'applyStribeckFriction'), p('friction', 'staticFrictionComplementarityStep')],
    coordinates: l(
      '속도 벡터→마찰력; 정지 마찰 도구는 단일 속도 입력.',
      'Velocity vector to friction force; the static-friction helper takes one velocity.'
    ),
    dof: l('호출자가 지정한 속도 성분 수.', 'The number of velocity components supplied by the caller.'),
    internal: {
      binding: p('friction', 'staticFrictionComplementarityStep'),
      description: l(
        '힘 평가와 별도로 단일 자유도의 암시적 Euler stick/slip 단계를 제공한다.',
        'Separately from force evaluation, provides a scalar implicit-Euler stick/slip step.'
      )
    },
    limitation: l(
      '완성된 진자 엔진이 아닌 구성 도구다. 정칙화 마찰력과 정확한 stiction 경로를 구별한다.',
      'A building block rather than a complete pendulum engine. Distinguish regularized forces from the exact stiction path.'
    )
  },
  {
    id: 'pyragas',
    family: 'nonlinear',
    evolution: 'delay',
    stage: 14,
    name: l('피라가스 지연 피드백', 'Pyragas delayed feedback'),
    description: l(
      '과거 각도와 현재 각도의 차이로 지연 피드백을 적용한다.',
      'Applies delayed feedback from the difference between past and current angles.'
    ),
    binding: p('pyragasDde', 'integratePyragasPendulumDde'),
    parameters: p('pyragasDde', 'PyragasPendulumParameters'),
    state: p('pyragasDde', 'PyragasHistory'),
    coordinates: l(
      '[theta, omega]와 과거 이력 함수 및 승인된 지연 이력.',
      '[theta, omega], a history function, and accepted delay history.'
    ),
    dof: l('한 기계 좌표와 무한 차원 지연 이력.', 'One mechanical coordinate plus infinite-dimensional delay history.'),
    internal: {
      binding: p('pyragasDde', 'integratePyragasPendulumDde'),
      description: l(
        '고정 격자 method-of-steps RK4와 선형 이력 보간.',
        'Fixed-grid method-of-steps RK4 with linear history interpolation.'
      )
    },
    limitation: l(
      'delay>=dt가 필요하다. 경계나 사건 시각을 해석하기 전에 dt와 이력 함수를 세분화한다.',
      'Requires delay>=dt. Refine dt and history before interpreting boundaries or event times.'
    )
  }
];
