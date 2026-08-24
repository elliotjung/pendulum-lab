/** Browser/runtime readers kept independent of parity UI rendering. */
import type { IntegratorId, PendulumParameters, RunMode, RuntimeSnapshot, SystemType } from '../../types/domain';
import { integratorRegistry } from '../../physics/integrators';
import { stateStore } from '../../state/StateStore';
import { numberFrom, selectValue } from './shared-dom';
import { state } from './shared-state';
import type { ModernLabHandle } from './shared-types';

export function modernLab(): ModernLabHandle | undefined {
  return (window as Window & { __modernLab?: ModernLabHandle }).__modernLab;
}

export function currentParameters(): PendulumParameters {
  return {
    m1: numberFrom('m1', 1),
    m2: numberFrom('m2', 1),
    m3: numberFrom('m3', 1),
    l1: numberFrom('l1', 1.2),
    l2: numberFrom('l2', 1),
    l3: numberFrom('l3', 0.8),
    g: numberFrom('g', 9.81)
  };
}

export function currentSystem(): SystemType {
  return selectValue('sysType', 'double') === 'triple' ? 'triple' : 'double';
}

export function currentMethod(): IntegratorId {
  const raw = selectValue('method', 'rk4');
  if (raw === 'verlet') return 'leapfrog';
  return raw in integratorRegistry ? (raw as IntegratorId) : 'rk4';
}

export function currentMode(): RunMode {
  const raw = state.mode;
  return raw === 'research' || raw === 'benchmark' || raw === 'education' || raw === 'performance' || raw === 'recovery'
    ? raw
    : 'demo';
}

export function currentSnapshot(): RuntimeSnapshot {
  const live = modernLab()?.runtimeSnapshot?.();
  if (live) {
    // Research/workbench mode is parity UI state; every scientific field,
    // including state/time/hash, comes atomically from the live Lab runtime.
    return { ...live, mode: currentMode() };
  }
  const synced = stateStore.syncFromLegacy();
  const diagnostics = modernLab()?.diagnostics?.();
  const system = currentSystem();
  const baseState =
    system === 'triple'
      ? [
          numberFrom('th1', 2),
          numberFrom('th2', 2.5),
          numberFrom('th3', 1),
          numberFrom('iw1', 0),
          numberFrom('iw2', 0),
          numberFrom('iw3', 0)
        ]
      : [numberFrom('th1', 2), numberFrom('th2', 2.5), numberFrom('iw1', 0), numberFrom('iw2', 0)];
  return {
    ...synced,
    systemType: system,
    method: currentMethod(),
    mode: currentMode(),
    dt: numberFrom('dt', synced.dt || 0.003),
    tolerance: 10 ** numberFrom('tol', Math.log10(synced.tolerance || 1e-7)),
    stepsPerFrame: Math.max(1, Math.round(numberFrom('spf', synced.stepsPerFrame || 6))),
    damping: numberFrom('gamma', synced.damping || 0),
    parameters: currentParameters(),
    state: window.App?.state
      ? Array.from(window.App.state).slice(0, window.App.stateLen || window.App.state.length)
      : baseState,
    simTime: diagnostics?.time ?? synced.simTime,
    hash: window.App?._stateHash ?? synced.hash
  };
}
