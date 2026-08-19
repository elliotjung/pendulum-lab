/** Reproducible budget contract for gradient-trained research models. */
export interface ResearchTrainingProtocol {
  schemaVersion: 'pendulum-training-protocol/v1';
  seed: number;
  maxEpochs: number;
  patience: number;
  minDelta: number;
  maxDurationMs: number;
  maxMemoryMb: number;
  hardware: {
    backend: 'cpu' | 'wasm' | 'webgpu';
    vendor?: string;
    device?: string;
  };
}

export interface ResearchTrainingEpoch {
  epoch: number;
  loss: number;
  durationMs: number;
}

export interface ResearchTrainingResult<T> {
  schemaVersion: 'pendulum-training-result/v1';
  status: 'complete' | 'early-stopped' | 'time-budget-exhausted';
  protocol: ResearchTrainingProtocol;
  bestEpoch: number;
  bestLoss: number;
  epochs: ResearchTrainingEpoch[];
  model: T;
}

export interface ResearchTrainingAdapter<T> {
  /** Execute exactly one deterministic epoch for the supplied seed. */
  trainEpoch(epoch: number, seed: number): { loss: number; model: T } | Promise<{ loss: number; model: T }>;
  now?: () => number;
}

export function validateResearchTrainingProtocol(protocol: ResearchTrainingProtocol): void {
  if (protocol.schemaVersion !== 'pendulum-training-protocol/v1') throw new Error('Unknown training protocol schema.');
  if (!Number.isInteger(protocol.seed) || protocol.seed < 0 || protocol.seed > 0xffff_ffff)
    throw new Error('Training seed must be a uint32.');
  if (!Number.isInteger(protocol.maxEpochs) || protocol.maxEpochs < 1 || protocol.maxEpochs > 1_000_000)
    throw new Error('Training maxEpochs must be an integer in [1, 1000000].');
  if (!Number.isInteger(protocol.patience) || protocol.patience < 1 || protocol.patience > protocol.maxEpochs)
    throw new Error('Training patience must be in [1, maxEpochs].');
  if (!(protocol.minDelta >= 0) || !Number.isFinite(protocol.minDelta))
    throw new Error('Training minDelta must be finite and non-negative.');
  if (!(protocol.maxDurationMs > 0) || !Number.isFinite(protocol.maxDurationMs))
    throw new Error('Training maxDurationMs must be positive and finite.');
  if (!(protocol.maxMemoryMb > 0) || !Number.isFinite(protocol.maxMemoryMb))
    throw new Error('Training maxMemoryMb must be positive and finite.');
  if (!['cpu', 'wasm', 'webgpu'].includes(protocol.hardware.backend))
    throw new Error('Training backend must be cpu, wasm, or webgpu.');
}

/**
 * Run a model adapter under deterministic seed, early-stop, and wall-time
 * gates. Memory is a declared admission budget because portable browser heap
 * telemetry is unavailable; model-specific adapters must enforce it when they
 * allocate tensors.
 */
export async function runResearchTraining<T>(
  protocol: ResearchTrainingProtocol,
  adapter: ResearchTrainingAdapter<T>
): Promise<ResearchTrainingResult<T>> {
  validateResearchTrainingProtocol(protocol);
  const now = adapter.now ?? (() => performance.now());
  const startedAt = now();
  const epochs: ResearchTrainingEpoch[] = [];
  let bestLoss = Infinity;
  let bestEpoch = -1;
  let bestModel: T | undefined;
  let staleEpochs = 0;
  let status: ResearchTrainingResult<T>['status'] = 'complete';

  for (let epoch = 0; epoch < protocol.maxEpochs; epoch += 1) {
    if (now() - startedAt >= protocol.maxDurationMs) {
      status = 'time-budget-exhausted';
      break;
    }
    const epochStartedAt = now();
    const candidate = await adapter.trainEpoch(epoch, protocol.seed);
    if (!Number.isFinite(candidate.loss) || candidate.loss < 0)
      throw new Error(`Training epoch ${epoch} returned an invalid loss.`);
    epochs.push({ epoch, loss: candidate.loss, durationMs: Math.max(0, now() - epochStartedAt) });
    if (candidate.loss < bestLoss - protocol.minDelta) {
      bestLoss = candidate.loss;
      bestEpoch = epoch;
      bestModel = candidate.model;
      staleEpochs = 0;
    } else {
      staleEpochs += 1;
      if (staleEpochs >= protocol.patience) {
        status = 'early-stopped';
        break;
      }
    }
  }
  if (bestModel === undefined) throw new Error('Training budget expired before one valid epoch completed.');
  return {
    schemaVersion: 'pendulum-training-result/v1',
    status,
    protocol: structuredClone(protocol),
    bestEpoch,
    bestLoss,
    epochs,
    model: bestModel
  };
}
