import type { ImportValidationResult } from '../types/domain';
import { energyDouble, relativeEnergyDrift } from '../physics/energy';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import { canonicalStepThetaOmega } from '../physics/canonical';
import { parseStrictJsonImport } from './importSchema';

export interface ValidationCaseResult {
  id: string;
  status: 'PASS' | 'FAIL';
  measured: string;
  threshold: string;
}

export function runEnergyDriftCheck(): ValidationCaseResult {
  const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const state = new Float64Array([0.15, 0.1, 0, 0]);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, parameters, 0, o);
  const initial = energyDouble(state, parameters);
  for (let i = 0; i < 1_000; i += 1) {
    rk4Step(state, 0.001, rhs, out);
    state.set(out);
  }
  const drift = relativeEnergyDrift(initial, energyDouble(state, parameters));
  return {
    id: 'energy-drift-rk4-double',
    status: drift < 1e-5 ? 'PASS' : 'FAIL',
    measured: drift.toExponential(3),
    threshold: '< 1e-5'
  };
}

export function runReplayDeterminismCheck(): ValidationCaseResult {
  const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const makeRun = () => {
    const state = new Float64Array([0.3, -0.2, 0.05, -0.02]);
    const out = new Float64Array(4);
    const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, parameters, 0, o);
    for (let i = 0; i < 400; i += 1) {
      rk4Step(state, 0.002, rhs, out);
      state.set(out);
    }
    return Array.from(state)
      .map((x) => x.toPrecision(15))
      .join(',');
  };
  const first = makeRun();
  const second = makeRun();
  return {
    id: 'replay-determinism-rk4',
    status: first === second ? 'PASS' : 'FAIL',
    measured: first === second ? 'identical' : 'mismatch',
    threshold: 'bitwise-equivalent string serialization'
  };
}

export function runJsonImportValidationCheck(): ValidationCaseResult {
  const bad = parseStrictJsonImport(
    '{"systemType":"double","method":"rk4","mode":"demo","dt":0.003,"tolerance":1e-7,"stepsPerFrame":6,"damping":0,"parameters":{"m1":1,"m2":1,"l1":1,"l2":1,"g":9.81},"state":[0,null,0,0],"simTime":0}'
  );
  return {
    id: 'json-import-rejects-non-finite',
    status: bad.ok ? 'FAIL' : 'PASS',
    measured: bad.problems.join('; ') || 'accepted',
    threshold: 'reject'
  };
}

export function runDtHalvingCheck(): ValidationCaseResult {
  const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, parameters, 0, o);
  const coarse = new Float64Array([0.4, 0.25, 0.02, -0.01]);
  const fine = new Float64Array(coarse);
  const out = new Float64Array(4);
  for (let i = 0; i < 500; i += 1) {
    rk4Step(coarse, 0.002, rhs, out);
    coarse.set(out);
  }
  for (let i = 0; i < 1_000; i += 1) {
    rk4Step(fine, 0.001, rhs, out);
    fine.set(out);
  }
  const error = Math.hypot(coarse[0]! - fine[0]!, coarse[1]! - fine[1]!, coarse[2]! - fine[2]!, coarse[3]! - fine[3]!);
  return {
    id: 'dt-halving-rk4-double',
    status: error < 1e-6 ? 'PASS' : 'FAIL',
    measured: error.toExponential(3),
    threshold: '< 1e-6'
  };
}

export function runCanonicalResidualCheck(): ValidationCaseResult {
  const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const result = canonicalStepThetaOmega([0.4, 0.25, 0.02, -0.01], 0.001, parameters, 0);
  return {
    id: 'canonical-midpoint-residual',
    status: result.stats.residual < 1e-8 ? 'PASS' : 'FAIL',
    measured: `${result.stats.residual.toExponential(3)} in ${result.stats.iterations} iterations`,
    threshold: '< 1e-8'
  };
}

export function runAllValidationChecks(): ImportValidationResult<ValidationCaseResult[]> {
  const results = [
    runEnergyDriftCheck(),
    runReplayDeterminismCheck(),
    runJsonImportValidationCheck(),
    runDtHalvingCheck(),
    runCanonicalResidualCheck()
  ];
  return {
    ok: results.every((result) => result.status === 'PASS'),
    value: results,
    problems: results.filter((result) => result.status === 'FAIL').map((result) => result.id)
  };
}
