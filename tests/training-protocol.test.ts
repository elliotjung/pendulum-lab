import { describe, expect, it } from 'vitest';
import { runResearchTraining, type ResearchTrainingProtocol } from '../src/research/trainingProtocol';

const protocol: ResearchTrainingProtocol = {
  schemaVersion: 'pendulum-training-protocol/v1',
  seed: 42,
  maxEpochs: 20,
  patience: 3,
  minDelta: 0.01,
  maxDurationMs: 10_000,
  maxMemoryMb: 256,
  hardware: { backend: 'cpu' }
};

describe('research training protocol', () => {
  it('pins seed, hardware budget, best checkpoint, and early stopping', async () => {
    let clock = 0;
    const result = await runResearchTraining(protocol, {
      now: () => clock++,
      trainEpoch: (epoch, seed) => ({ loss: epoch < 2 ? 1 / (epoch + 1) : 0.5, model: { epoch, seed } })
    });
    expect(result.status).toBe('early-stopped');
    expect(result.bestEpoch).toBe(1);
    expect(result.model).toEqual({ epoch: 1, seed: 42 });
    expect(result.protocol.hardware.backend).toBe('cpu');
  });

  it('rejects a protocol without bounded reproducibility controls', async () => {
    await expect(
      runResearchTraining({ ...protocol, patience: 0 }, { trainEpoch: () => ({ loss: 1, model: null }) })
    ).rejects.toThrow(/patience/);
  });
});
