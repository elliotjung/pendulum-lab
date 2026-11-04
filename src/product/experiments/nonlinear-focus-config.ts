import { defaultPlanarConfig, toCanonicalPlanar, type PlanarConfig } from '../adapters/physics/planar';
import { defaultDrivenConfig, toCanonicalDriven, type DrivenConfig } from '../adapters/physics/driven';
import { defaultNonlinearConfig, toCanonicalNonlinear, type NonlinearConfig } from '../adapters/physics/nonlinear';
import type { ContractResult } from '../contracts/validation';
import type { ResearchFields } from './research-focus-contracts';
import { nonlinearFocusDeclaration } from './nonlinear-focus-definitions';

export type NonlinearFocusConfig =
  | { family: 'planar'; config: PlanarConfig }
  | { family: 'driven'; config: DrivenConfig }
  | { family: 'nonlinear'; config: NonlinearConfig };
const unwrap = <T>(r: ContractResult<T>): T => {
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join(' '));
  return r.value;
};
/** Native adapters remain the sole owners of physical equations, integrators and input constraints. */
export function nonlinearFocusConfig(id: string, v: ResearchFields): NonlinearFocusConfig {
  const d = nonlinearFocusDeclaration(id),
    common = { duration: v.duration!, step: v.step!, startTime: 0, sampleEvery: 1, analyses: [] };
  if (id === '4.1')
    return {
      family: 'planar',
      config: {
        ...defaultPlanarConfig('system:double'),
        ...common,
        parameters: { m1: v.m1!, m2: v.m2!, l1: v.l1!, l2: v.l2!, g: v.g! },
        gamma: v.gamma!,
        initialState: [v.theta1!, v.theta2!, v.omega1!, v.omega2!]
      }
    };
  if (['4.2', '4.5', '4.6'].includes(id)) {
    const c = defaultDrivenConfig(d.systemId as DrivenConfig['systemId']);
    if (id === '4.5')
      return {
        family: 'driven',
        config: {
          ...c,
          ...common,
          initialState: [0, v.theta!, 0, 0],
          controller: {
            ...c.controller!,
            enabled: true,
            kp: c.controller!.kp * v.gainScale!,
            kd: c.controller!.kd * v.gainScale!,
            kx: c.controller!.kx * v.gainScale!,
            kv: c.controller!.kv * v.gainScale!,
            maxOutput: v.maxOutput!
          }
        }
      };
    return {
      family: 'driven',
      config: {
        ...c,
        ...common,
        parameters: {
          g: v.g!,
          length: v.length!,
          damping: v.damping!,
          ...(id === '4.6' ? { coupling: v.coupling! } : {})
        },
        initialState: id === '4.6' ? [v.theta!, 0, 0, 0] : [v.theta!, 0, 0],
        ...(id === '4.2'
          ? { forcing: { waveform: 'sine', amplitude: v.amplitude!, frequency: v.frequency!, phase: Math.PI / 2 } }
          : {})
      }
    };
  }
  const c = defaultNonlinearConfig(d.systemId as NonlinearConfig['systemId']);
  switch (id) {
    case '4.3':
      return {
        family: 'nonlinear',
        config: { ...c, ...common, parameters: { delta: v.delta!, epsilon: v.epsilon! }, initialState: [v.x!, v.v!] }
      };
    case '4.4':
      return {
        family: 'nonlinear',
        config: {
          ...c,
          ...common,
          parameters: {
            g: v.g!,
            length: v.length!,
            damping: v.damping!,
            driveAmplitude: v.amplitude!,
            driveFrequency: v.frequency!
          },
          initialState: [v.theta!, 0, 0]
        }
      };
    case '4.7':
      return {
        family: 'nonlinear',
        config: {
          ...c,
          ...common,
          parameters: {
            damping: v.damping!,
            linearStiffness: v.alpha!,
            cubicStiffness: v.beta!,
            driveAmplitude: v.amplitude!,
            driveFrequency: v.frequency!
          },
          initialState: [v.x!, 0, 0]
        }
      };
    case '4.8':
      return { family: 'nonlinear', config: { ...c, ...common, parameters: { mu: v.mu! }, initialState: [v.x!, 0] } };
    case '4.9':
      return {
        family: 'nonlinear',
        config: {
          ...c,
          ...common,
          parameters: {
            ...c.parameters,
            mass: v.mass!,
            stiffness: v.stiffness!,
            staticFriction: v.staticFriction!,
            dynamicFriction: v.dynamicFriction!,
            driveAmplitude: v.amplitude!,
            driveFrequency: v.frequency!
          },
          initialState: [0, 0, Math.PI / 2]
        }
      };
    case '4.10':
      return {
        family: 'nonlinear',
        config: {
          ...c,
          ...common,
          parameters: {
            g: v.g!,
            length: v.length!,
            damping: v.damping!,
            feedbackGain: v.gain!,
            delay: v.delay!,
            driveAmplitude: v.amplitude!,
            driveFrequency: v.frequency!
          },
          initialState: [v.theta!, 0],
          history: { kind: 'constant', state: [v.theta!, 0] }
        }
      };
    default:
      throw new RangeError('알 수 없는 과정 4 실험입니다.');
  }
}
export function nonlinearFocusCanonical(id: string, fields: ResearchFields) {
  const source = nonlinearFocusConfig(id, fields);
  return source.family === 'planar'
    ? unwrap(toCanonicalPlanar(source.config))
    : source.family === 'driven'
      ? unwrap(toCanonicalDriven(source.config))
      : unwrap(toCanonicalNonlinear(source.config));
}
