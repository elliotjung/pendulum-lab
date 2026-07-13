import {
  runExpansionSuite,
  runResearchMatrixStudy,
  runGoldenExpansionCenter,
  type ExpansionSuiteConfig,
  type ExpansionSuiteResult,
  type ExpansionResearchMatrixResult,
  type GoldenCenterResult
} from '../physics/expandedModels';
import type { IntegratorId } from '../types/domain';

/**
 * One protocol for every heavy Expansion-family job (the model suite, the
 * Research Matrix study, and the Golden Center sweep) so they all run off the
 * UI thread through a single worker, with one pure dispatcher (`runExpansionJob`)
 * shared by the worker and the main-thread fallback — mirroring how
 * `chaosProtocol.runChaosJob` backs both the chaos worker and its fallback.
 */
export type ExpansionJobRequest =
  | { kind: 'suite'; config: ExpansionSuiteConfig; includeLyapunov?: boolean }
  | { kind: 'matrix'; config: ExpansionSuiteConfig; gridSize: number }
  | { kind: 'golden'; presetIds: string[]; methods?: IntegratorId[] };

export type ExpansionJobResult =
  | { kind: 'suite'; result: ExpansionSuiteResult }
  | { kind: 'matrix'; result: ExpansionResearchMatrixResult }
  | { kind: 'golden'; result: GoldenCenterResult };

export interface ExpansionWorkerRequest {
  id: string;
  request: ExpansionJobRequest;
}

export type ExpansionWorkerResponse =
  | { id: string; ok: true; result: ExpansionJobResult; elapsedMs: number }
  | { id: string; ok: false; error: string; elapsedMs: number };

/** Pure dispatcher: run one Expansion-family job. Used by the worker and the fallback. */
export function runExpansionJob(request: ExpansionJobRequest): ExpansionJobResult {
  switch (request.kind) {
    case 'suite':
      return {
        kind: 'suite',
        result: runExpansionSuite(request.config, { includeLyapunov: Boolean(request.includeLyapunov) })
      };
    case 'matrix':
      return { kind: 'matrix', result: runResearchMatrixStudy(request.config, { gridSize: request.gridSize }) };
    case 'golden':
      return { kind: 'golden', result: runGoldenExpansionCenter(request.presetIds, request.methods) };
    default: {
      const exhaustive: never = request;
      throw new Error(`unknown expansion job: ${JSON.stringify(exhaustive)}`);
    }
  }
}
