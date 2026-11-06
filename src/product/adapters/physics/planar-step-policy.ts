import type { LabStepReport } from '../../../app/LabSimulation';
import { PhysicsEvaluationError } from '../../../physics/errors';
import { step } from '../../../physics/integrators';
import type { Derivative, StepDiagnostics, StateVector } from '../../../physics/types';
import { nativeOdeMethod, ODE_MONITORED_METHODS, type LegacyOdeIntegratorId } from './planar-integrators';

const initialReport = (): LabStepReport =>
  Object.freeze({
    accepted: true,
    requestedDt: 0,
    advancedDt: 0,
    attempts: 0,
    retryAttempted: false,
    retrySubsteps: 0,
    diagnostics: Object.freeze({})
  });

/**
 * Adapter for the unchanged step dispatcher and LabSimulation's bounded interval
 * acceptance policy: one primary call, at most two equal half-step retries.
 * Never commits the caller's input. Native policy equivalence is tested against
 * LabSimulation for every public method and both implicit Jacobian policies.
 */
export function createLegacyOdeIntervalStepper(
  id: LegacyOdeIntegratorId,
  rhs: Derivative,
  dimension: number,
  tolerance?: number
) {
  if (!Number.isSafeInteger(dimension) || dimension < 1)
    throw new RangeError('ODE interval dimension must be a positive safe integer.');
  const method = nativeOdeMethod(id),
    retryScratch = new Float64Array(dimension);
  let report = initialReport();
  function attempt(from: StateVector, dt: number, out: StateVector): Readonly<Partial<StepDiagnostics>> {
    const diagnostics: Partial<StepDiagnostics> = {},
      residual = { value: 0 };
    step(method, from, dt, rhs, out, {
      diagnostics,
      previousError: residual,
      ...(tolerance === undefined ? {} : { tolerance })
    });
    if (!out.every(Number.isFinite))
      throw new PhysicsEvaluationError('NON_FINITE_INPUT', '적분기가 유한하지 않은 상태를 만들었습니다.', {
        operation: 'product.native-ode-interval',
        method,
        dt,
        retryable: false
      });
    return Object.freeze({
      solver: diagnostics.solver ?? (ODE_MONITORED_METHODS.has(method) ? 'adaptive' : 'explicit'),
      iterations: diagnostics.iterations ?? 1,
      residualNorm: diagnostics.residualNorm ?? residual.value,
      converged: diagnostics.converged ?? diagnostics.accepted !== false,
      accepted: diagnostics.accepted ?? true,
      retryable: diagnostics.retryable ?? false,
      ...(diagnostics.conditionEstimate === undefined ? {} : { conditionEstimate: diagnostics.conditionEstimate }),
      ...(diagnostics.failureReason === undefined ? {} : { failureReason: diagnostics.failureReason }),
      ...(diagnostics.errorCode === undefined ? {} : { errorCode: diagnostics.errorCode }),
      ...(diagnostics.suggestedDt === undefined ? {} : { suggestedDt: diagnostics.suggestedDt })
    });
  }
  return {
    lastStepReport: () => report,
    /** A post-step renderer/energy check can veto the still-uncommitted candidate. */
    rejectCandidate() {
      report = Object.freeze({
        ...report,
        accepted: false,
        advancedDt: 0,
        diagnostics: Object.freeze({
          ...report.diagnostics,
          accepted: false,
          converged: false,
          retryable: false,
          failureReason: 'non-finite-candidate',
          errorCode: 'NON_FINITE_INPUT'
        })
      });
    },
    advance(from: StateVector, dt: number, out: StateVector): void {
      if (
        !(from instanceof Float64Array) ||
        !(out instanceof Float64Array) ||
        from.length !== dimension ||
        out.length !== dimension ||
        (from.buffer === out.buffer &&
          from.byteOffset < out.byteOffset + out.byteLength &&
          out.byteOffset < from.byteOffset + from.byteLength)
      ) {
        report = Object.freeze({
          accepted: false,
          requestedDt: dt,
          advancedDt: 0,
          attempts: 0,
          retryAttempted: false,
          retrySubsteps: 0,
          diagnostics: Object.freeze({
            accepted: false,
            converged: false,
            retryable: false,
            failureReason: 'invalid-buffer-boundary'
          })
        });
        throw new RangeError(
          'ODE interval input/output must be disjoint Float64Array buffers with the configured dimension.'
        );
      }
      let attempts = 0,
        retries = 0,
        primary: Readonly<Partial<StepDiagnostics>> | undefined,
        reportedFailure = false;
      const reject = (diagnostics: Readonly<Partial<StepDiagnostics>>): never => {
        reportedFailure = true;
        report = Object.freeze({
          accepted: false,
          requestedDt: dt,
          advancedDt: 0,
          attempts,
          retryAttempted: retries > 0,
          retrySubsteps: retries,
          diagnostics,
          ...(primary === undefined ? {} : { primaryFailure: primary })
        });
        throw new PhysicsEvaluationError(
          diagnostics.errorCode === 'NON_FINITE_INPUT' ? 'NON_FINITE_INPUT' : 'IMPLICIT_SOLVER_DID_NOT_CONVERGE',
          `${method}: 적분 구간을 수락하지 못했습니다. 상태·시간은 보존했습니다. 시간 간격이나 허용오차를 확인하세요.`,
          {
            operation: 'product.native-ode-interval',
            method,
            requestedDt: dt,
            retryable: false,
            attempts,
            retrySubsteps: retries
          }
        );
      };
      try {
        attempts++;
        primary = attempt(from, dt, out);
        let accepted = primary;
        if (primary.accepted === false) {
          const suggested = primary.suggestedDt,
            half = Math.abs(dt) / 2;
          if (
            primary.retryable !== true ||
            suggested === undefined ||
            !Number.isFinite(suggested) ||
            suggested <= 0 ||
            suggested >= Math.abs(dt) ||
            half > suggested * (1 + 64 * Number.EPSILON)
          )
            reject(primary);
          attempts++;
          retries++;
          const first = attempt(from, dt / 2, retryScratch);
          if (first.accepted === false) reject(first);
          attempts++;
          retries++;
          const second = attempt(retryScratch, dt / 2, out);
          if (second.accepted === false) reject(second);
          const conditionEstimate = Math.max(first.conditionEstimate ?? 0, second.conditionEstimate ?? 0);
          accepted = Object.freeze({
            solver: second.solver ?? first.solver ?? 'explicit',
            iterations: (first.iterations ?? 0) + (second.iterations ?? 0),
            residualNorm: Math.max(first.residualNorm ?? 0, second.residualNorm ?? 0),
            converged: true,
            accepted: true,
            retryable: false,
            ...(conditionEstimate > 0 ? { conditionEstimate } : {})
          });
        }
        report = Object.freeze({
          accepted: true,
          requestedDt: dt,
          advancedDt: dt,
          attempts,
          retryAttempted: retries > 0,
          retrySubsteps: retries,
          diagnostics: accepted,
          ...(primary.accepted === false ? { primaryFailure: primary } : {})
        });
      } catch (cause) {
        if (!reportedFailure)
          report = Object.freeze({
            accepted: false,
            requestedDt: dt,
            advancedDt: 0,
            attempts,
            retryAttempted: retries > 0,
            retrySubsteps: retries,
            diagnostics: Object.freeze({
              accepted: false,
              converged: false,
              retryable: false,
              ...(cause instanceof PhysicsEvaluationError &&
              (cause.code === 'NON_FINITE_INPUT' || cause.code === 'IMPLICIT_SOLVER_DID_NOT_CONVERGE')
                ? { errorCode: cause.code }
                : {}),
              failureReason: 'native-step-error'
            }),
            ...(primary?.accepted === false ? { primaryFailure: primary } : {})
          });
        throw cause;
      }
    }
  };
}
