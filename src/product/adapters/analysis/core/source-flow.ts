import type { Derivative } from '../../../../physics/types';
import { createTripleRhsWorkspace, rhsTriple } from '../../../../physics/triple';
import { createChainWorkspace, rhsChain } from '../../../../physics/nPendulum';
import { rhsSpring, type SpringPendulumParameters } from '../../../../physics/spring';
import { sphericalRhs, type SphericalState } from '../../../../physics/spherical';
import { createSphericalChainWorkspace, rhsSphericalChain } from '../../../../physics/sphericalChain';
import { rhsDuffing, type DuffingParameters } from '../../../../physics/duffing';
import { rhsVanDerPol, type VanDerPolParameters } from '../../../../physics/vanDerPol';
import { rhsKapitza, type KapitzaParameters } from '../../../../physics/kapitza';
import { mathieuCoefficient } from '../../../../chaos/mathieuStability';
import { rhsMagneticPendulum } from '../../../../physics/magneticPendulum';
import { rhsPendulumNetwork } from '../../../../physics/pendulumNetwork';
import { rhsHuygensPhasePair, rhsKuramoto } from '../../../../physics/kuramoto';
import { fputAcceleration } from '../../../../physics/fput';
import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { createPlanarDerivative } from '../../physics/planar';
import { createDrivenFlow, type DrivenConfig } from '../../physics/driven';
import { networkMagneticParameters, networkPendulumParameters, networkPhaseParameters } from '../../physics/network';
import { readDiagnosticConfiguration } from './source-config';

export interface DiagnosticFlow {
  initial: number[];
  rhs: Derivative;
  dt: number;
  timeUnit: 's' | 'normalized-time';
  warnings: string[];
  conservative: boolean;
}
const unsupported: Record<string, string> = {
  'system:rope': '줄의 이완·재포획 사건에는 saltation/하이브리드 tangent 모델이 필요합니다.',
  'system:double-string': '이중 줄의 모드 전환·비탄성 재포획에는 하이브리드 tangent 모델이 필요합니다.',
  'system:spherical-embedded': '매입 좌표의 정규화·접선 투영에는 구속 다양체 tangent 모델이 필요합니다.',
  'system:spherical-embedded-chain': '매입 사슬의 정규화·접선 투영에는 구속 다양체 tangent 모델이 필요합니다.',
  'system:friction': '정지/운동 마찰 complementarity 전환에는 매끄러운 ODE tangent를 적용할 수 없습니다.',
  'system:pyragas': '지연 방정식에는 현재 좌표만이 아닌 이력 공간 tangent 모델이 필요합니다.',
  'system:langevin': '확률 경로에는 동일 잡음 및 확률 tangent 모델이 필요합니다.',
  'system:sine-gordon':
    'native leapfrog의 두 시간 수준과 backward 속도에는 그 이산 전파에 맞는 tangent 모델이 필요합니다.',
  'system:lattice-fk-limit': '정적 phonon 분산 평가에는 시간 전파 ODE가 없습니다.',
  'system:frenkel-kontorova': '정상 kink Newton 평가에는 시간 전파 ODE가 없습니다.',
  'system:standard-map': '이산 사상에는 사상 Jacobian 및 반복 단위 진단이 필요합니다.',
  'system:quantum-kicked-rotor': '양자 유니터리 진화에는 고전 ODE tangent 진단을 적용할 수 없습니다.',
  'system:unitary-floquet': '연산자 스펙트럼 평가에는 시간 전파 궤적이 없습니다.'
};
const scalar = (e: ExperimentStateV1, key: string) => {
  const q = e.parameters[key];
  return q?.kind === 'scalar' ? q.value : undefined;
};
/** Cheap structural capability query; createDiagnosticFlow still validates the complete model contract. */
export function diagnosticFlowRejection(experiment: ExperimentStateV1): string | null {
  const reason = unsupported[experiment.systemId];
  if (reason) return reason;
  if (experiment.modelOptions?.controllerEnabled === true)
    return '포화 제어기는 경계에서 미분 가능하지 않습니다. 제어기를 끄거나 controller tangent 모델을 사용하세요.';
  if ((scalar(experiment, 'forcingAmplitude') ?? 0) > 0 && experiment.modelOptions?.forcingWaveform !== 'sine')
    return 'square/triangle 구동의 불연속·꺾임에는 사건을 고려한 tangent 모델이 필요합니다. sine 파형을 선택하세요.';
  const supported = [
    'double',
    'compound-double',
    'triple',
    'chain',
    'spring',
    'spherical',
    'spherical-chain',
    'driven',
    'coupled',
    'inverted',
    'cartpole',
    'parametric',
    'duffing',
    'van-der-pol',
    'kapitza',
    'mathieu',
    'magnetic',
    'pendulum-network',
    'huygens-phase-pair',
    'kuramoto',
    'chimera-exploration',
    'fput'
  ];
  return supported.includes(experiment.systemId.slice(7)) ? null : '지원하는 native ODE tangent 연결이 없습니다.';
}

/** Matches the driven product adapter's phase transform, absolute clock and native actuator parameters. */
function drivenFlow(c: DrivenConfig): {
  initial: number[];
  rhs: Derivative;
  conservative: boolean;
  warnings: string[];
} {
  const id = c.systemId.slice(7) as 'driven' | 'coupled' | 'inverted' | 'cartpole' | 'parametric';
  const clock = id === 'cartpole',
    { initial, rhs } = createDrivenFlow(c);
  return {
    initial,
    rhs,
    conservative:
      (c.parameters.damping ?? c.parameters.friction ?? 0) === 0 &&
      (c.forcing?.amplitude ?? 0) === 0 &&
      (c.parameters.force ?? 0) === 0,
    warnings: [
      ...(clock
        ? [
            'cart-pole tangent는 다섯 번째 좌표 elapsedTime(s), 도함수 1을 추가합니다. 절대 구동 시각은 startTime+elapsedTime이며 spectrum은 시간 방향을 포함합니다.'
          ]
        : []),
      ...(['driven', 'parametric'].includes(id)
        ? [
            '원래 drivePhase(rad) 좌표와 forcing phase offset을 보존합니다. 위상 방향을 포함한 자율 확장계의 지표입니다.'
          ]
        : [])
    ]
  };
}

/** Uses preserved native equations. No systemSpec approximation or silent damping/forcing defaults. */
export function createDiagnosticFlow(experiment: ExperimentStateV1): DiagnosticFlow {
  const reason = diagnosticFlowRejection(experiment);
  if (reason) throw new Error(reason);
  const source = readDiagnosticConfiguration(experiment),
    c = source.config;
  let initial = [...c.initialState],
    rhs: Derivative | undefined,
    conservative = false;
  const warnings = [
    'tangent 지표는 native RHS를 별도로 적분한 유한 시간 결과입니다. 사용한 적분기를 확인하고 관측 실행의 적분기 오차와 구분해 dt·관찰 길이 수렴을 확인하세요.'
  ];
  switch (source.family) {
    case 'planar':
      rhs = createPlanarDerivative(source.config);
      conservative = source.config.gamma === 0;
      break;
    case 'chain': {
      const config = source.config,
        p = config.parameters,
        n = p.masses.length;
      if (config.systemId === 'system:triple') {
        const native = {
          m1: p.masses[0]!,
          m2: p.masses[1]!,
          m3: p.masses[2]!,
          l1: p.lengths[0]!,
          l2: p.lengths[1]!,
          l3: p.lengths[2]!,
          g: p.g
        };
        const workspace = createTripleRhsWorkspace();
        rhs = (s, out) => {
          rhsTriple(s, native, config.gamma, out, workspace);
        };
      } else {
        const workspace = createChainWorkspace(n);
        rhs = (s, out) => {
          rhsChain(s, p, config.gamma, out, workspace);
        };
      }
      conservative = config.gamma === 0;
      break;
    }
    case 'constraint': {
      const p = source.config.parameters as unknown as SpringPendulumParameters;
      rhs = (s, out) => {
        if (s[0]! <= 1e-6) throw new Error('용수철 극좌표의 r 특이점에 접근했습니다.');
        rhsSpring(s, p, out);
      };
      conservative = true;
      break;
    }
    case 'spatial': {
      const config = source.config,
        p = config.parameters,
        n = p.masses.length;
      const workspace = createSphericalChainWorkspace(n);
      rhs = (s, out) => {
        for (let i = 0; i < n; i++)
          if (Math.abs(Math.sin(s[2 * i]!)) < 1e-6)
            throw new Error('구면 극좌표 특이점 근처에서는 tangent 지표가 신뢰할 수 없습니다.');
        if (config.systemId === 'system:spherical')
          out.set(sphericalRhs(Array.from(s) as SphericalState, { l: p.lengths[0]!, g: p.g, damping: p.damping }));
        else rhsSphericalChain(s, p, out, workspace);
      };
      conservative = p.damping === 0;
      warnings.push(
        '구면 극좌표의 극점 근처에서 tangent 계산을 거부합니다. 좌표 특이점과 물리적 불안정성을 구분하세요.'
      );
      break;
    }
    case 'driven': {
      const flow = drivenFlow(source.config);
      initial = flow.initial;
      rhs = flow.rhs;
      conservative = flow.conservative;
      warnings.push(...flow.warnings);
      break;
    }
    case 'nonlinear': {
      const config = source.config,
        p = config.parameters;
      if (config.systemId === 'system:duffing') {
        rhs = (s, out) => {
          rhsDuffing(s, p as unknown as DuffingParameters, out);
        };
        conservative = p.damping === 0 && p.driveAmplitude === 0;
      } else if (config.systemId === 'system:van-der-pol') {
        rhs = (s, out) => {
          rhsVanDerPol(s, p as unknown as VanDerPolParameters, out);
        };
        conservative = p.mu === 0;
      } else if (config.systemId === 'system:kapitza') {
        rhs = (s, out) => {
          rhsKapitza(s, p as unknown as KapitzaParameters, out);
        };
        conservative = p.damping === 0 && p.driveAmplitude === 0;
      } else if (config.systemId === 'system:mathieu') {
        const matrix = mathieuCoefficient(p.delta!, p.epsilon!);
        initial.push(0);
        rhs = (s, out) => {
          out[0] = s[1]!;
          out[1] = matrix((config.startTime ?? 0) + s[2]!)[1]![0]! * s[0]!;
          out[2] = 1;
        };
        conservative = p.epsilon === 0;
        warnings.push(
          'Mathieu는 세 번째 elapsedTime 정규화 좌표와 도함수 1을 추가합니다. 절대 계수 시각은 startTime+elapsedTime이며 spectrum은 시간 방향을 포함합니다.'
        );
      }
      if (['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(config.systemId))
        warnings.push(
          '시간과 상태는 정규화 값입니다. canonical s 슬롯은 실제 SI 초가 아니며 Lyapunov·FLI 비율은 정규화 시간당입니다.'
        );
      break;
    }
    case 'network': {
      const config = source.config;
      if (config.systemId === 'system:magnetic') {
        const p = networkMagneticParameters(config);
        rhs = (s, out) => {
          rhsMagneticPendulum(s, p, out);
        };
        conservative = p.damping === 0;
        warnings.push('자기 모델의 시간·좌표는 정규화 값입니다. 지표의 시간 단위도 정규화 시간당입니다.');
      } else if (config.systemId === 'system:pendulum-network') {
        const p = networkPendulumParameters(config);
        rhs = (s, out) => {
          rhsPendulumNetwork(s, p, out);
        };
        conservative = config.graph.nodes.every((node) => node.damping === 0);
      } else {
        const p = networkPhaseParameters(config);
        rhs =
          config.systemId === 'system:huygens-phase-pair'
            ? (s, out) => {
                rhsHuygensPhasePair(
                  s,
                  {
                    frequencies: [p.naturalFrequencies[0]!, p.naturalFrequencies[1]!],
                    coupling: p.coupling,
                    phaseLag: p.phaseLag!
                  },
                  out
                );
              }
            : (s, out) => {
                rhsKuramoto(s, p, out);
              };
        if (config.systemId === 'system:chimera-exploration')
          warnings.push(
            'chimera tangent는 smooth 위상 RHS를 unwrapped 좌표로 적분합니다. 관측 midpoint RK2의 각도 감싸기와 다른 수치 경로입니다.'
          );
      }
      break;
    }
    case 'field': {
      const config = source.config,
        n = config.grid.points,
        p = { size: n, alpha: config.parameters.alpha!, beta: config.parameters.beta! };
      rhs = (s, out) => {
        out.set(s.subarray(n), 0);
        fputAcceleration(s.subarray(0, n), p, out.subarray(n));
      };
      conservative = true;
      warnings.push(
        'FPUT tangent는 native acceleration의 정규화 ODE입니다. 관측 velocity-Verlet와 독립 RK4의 유한 간격 차이를 포함하며 비율은 정규화 시간당입니다.'
      );
      break;
    }
  }
  if (!rhs || experiment.runtime.domain !== 'time') throw new Error('지원하는 native 시간 전파 RHS가 없습니다.');
  const native = rhs;
  const checked: Derivative = (s, out) => {
    if (s.length !== initial.length || out.length !== initial.length || Array.from(s).some((v) => !Number.isFinite(v)))
      throw new Error('tangent 상태 차원 또는 유한 값 조건이 맞지 않습니다.');
    out.fill(NaN);
    native(s, out);
    if (Array.from(out).some((v) => !Number.isFinite(v))) throw new Error('native tangent 도함수가 유한하지 않습니다.');
  };
  if (native.jacobian) checked.jacobian = native.jacobian;
  if (native.jacobianProvenance) checked.jacobianProvenance = native.jacobianProvenance;
  checked(Float64Array.from(initial), new Float64Array(initial.length));
  const timeUnit =
    source.family === 'field' ||
    experiment.systemId === 'system:magnetic' ||
    ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(experiment.systemId)
      ? 'normalized-time'
      : 's';
  return { initial, rhs: checked, dt: experiment.runtime.step.value, timeUnit, conservative, warnings };
}
