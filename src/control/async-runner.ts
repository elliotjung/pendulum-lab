import { ilqrSolve } from './solver-core';
import type { IlqrOptions, IlqrProblem, IlqrResult } from './ilqr-types';

export interface IlqrAsyncOptions extends IlqrOptions {
  /** Iterations per cooperative chunk before yielding to the event loop. */
  chunkIterations?: number;
  /** Called with the accumulated result after every chunk. */
  onProgress?: (partial: IlqrResult) => void;
  /** Return true to stop early; the accumulated result is returned as-is. */
  shouldStop?: () => boolean;
}

/**
 * Cooperative iLQR for UI contexts: runs `ilqrSolve` in warm-started chunks,
 * yielding to the event loop between chunks so a long optimisation cannot
 * freeze the page.
 */
export async function ilqrSolveAsync(problem: IlqrProblem, options: IlqrAsyncOptions = {}): Promise<IlqrResult> {
  const totalIterations = options.maxIterations ?? 200;
  const chunk = Math.max(1, options.chunkIterations ?? 10);
  let us: readonly (readonly number[])[] | undefined = problem.uInit;
  let combined: IlqrResult | null = null;
  let done = 0;
  while (done < totalIterations) {
    const chunkProblem: IlqrProblem = { ...problem };
    if (us) chunkProblem.uInit = us;
    const result = ilqrSolve(chunkProblem, { ...options, maxIterations: Math.min(chunk, totalIterations - done) });
    done += result.iterations;
    if (combined) {
      combined = {
        ...result,
        iterations: combined.iterations + result.iterations,
        // Each chunk's first entry replays the previous chunk's final cost.
        costHistory: [...combined.costHistory, ...result.costHistory.slice(1)]
      };
    } else {
      combined = result;
    }
    us = result.us.map((u) => Array.from(u));
    options.onProgress?.(combined);
    if (result.converged || options.shouldStop?.() || result.iterations === 0) {
      combined.converged = result.converged;
      break;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return combined!;
}
