import { describe, expect, it } from 'vitest';
import {
  GPU_TIER_DETAILS,
  GPU_TIER_LABELS,
  gpuResultTier,
  gpuTierBadge
} from '../src/runtime/promotionContract';
import {
  GPU_KERNELS,
  adapterFeatureFingerprint,
  gpuKernelHashes,
  gpuKernelSetHash
} from '../src/runtime/gpuKernelRegistry';

describe('gpu result tier classifier', () => {
  it('promotes only webgpu results with a passed oracle comparison', () => {
    expect(gpuResultTier({ backend: 'webgpu', oracleComparisonPassed: true })).toBe('promoted');
  });

  it('classifies webgpu results without a passed oracle gate as candidates', () => {
    expect(gpuResultTier({ backend: 'webgpu', oracleComparisonPassed: false })).toBe('accelerated-candidate');
    expect(gpuResultTier({ backend: 'webgpu', oracleComparisonPassed: null })).toBe('accelerated-candidate');
    expect(gpuResultTier({ backend: 'webgpu' })).toBe('accelerated-candidate');
  });

  it('classifies every non-webgpu backend as cpu fallback regardless of comparison', () => {
    expect(gpuResultTier({ backend: 'cpu', oracleComparisonPassed: true })).toBe('cpu-fallback');
    expect(gpuResultTier({ backend: 'cpu', oracleComparisonPassed: null })).toBe('cpu-fallback');
    expect(gpuResultTier({ backend: 'worker' })).toBe('cpu-fallback');
    expect(gpuResultTier({ backend: '' })).toBe('cpu-fallback');
  });

  it('badge output carries the matching label and detail for each tier', () => {
    for (const [input, tier] of [
      [{ backend: 'webgpu', oracleComparisonPassed: true }, 'promoted'],
      [{ backend: 'webgpu', oracleComparisonPassed: false }, 'accelerated-candidate'],
      [{ backend: 'cpu', oracleComparisonPassed: null }, 'cpu-fallback']
    ] as const) {
      const badge = gpuTierBadge(input);
      expect(badge.tier).toBe(tier);
      expect(badge.label).toBe(GPU_TIER_LABELS[tier]);
      expect(badge.detail).toBe(GPU_TIER_DETAILS[tier]);
    }
    expect(GPU_TIER_LABELS.promoted).toBe('GPU promoted');
    expect(GPU_TIER_LABELS['accelerated-candidate']).toBe('GPU candidate');
    expect(GPU_TIER_LABELS['cpu-fallback']).toBe('CPU fallback');
  });
});

describe('gpu kernel registry', () => {
  it('registers all shipped WGSL kernels with unique ids and non-trivial sources', () => {
    const ids = GPU_KERNELS.map((kernel) => kernel.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'ensemble-rk4',
      'ensemble-stats-reduction',
      'lyapunov-full-spectrum',
      'clv-forward-backward',
      'variational-ftle-field',
      'flip-basin-field',
      'sweep-lambda-field',
      'nchain-trajectory-tape',
      'nchain-variational-stm-qr'
    ]);
    for (const kernel of GPU_KERNELS) {
      expect(kernel.source).toContain('@compute');
      expect(kernel.source.length).toBeGreaterThan(200);
    }
  });

  it('hashes are per-source: distinct kernels get distinct hashes', () => {
    const hashes = gpuKernelHashes();
    expect(hashes).toHaveLength(GPU_KERNELS.length);
    expect(new Set(hashes.map((entry) => entry.wgslHash)).size).toBe(hashes.length);
    for (const entry of hashes) {
      expect(entry.wgslHash).toMatch(/^[0-9a-f]+$/i);
      expect(entry.bytes).toBeGreaterThan(0);
    }
  });

  it('kernel-set hash is deterministic and reflects every kernel', () => {
    expect(gpuKernelSetHash()).toBe(gpuKernelSetHash());
    expect(gpuKernelSetHash().length).toBeGreaterThan(0);
  });

  it('adapter feature fingerprint is order-insensitive and null-safe', () => {
    const a = adapterFeatureFingerprint({ features: ['f16', 'timestamp-query'], limits: { maxBufferSize: 1024, maxBindGroups: 4 } });
    const b = adapterFeatureFingerprint({ features: ['timestamp-query', 'f16'], limits: { maxBindGroups: 4, maxBufferSize: 1024 } });
    expect(a).toBe(b);
    const c = adapterFeatureFingerprint({ features: ['f16'], limits: { maxBufferSize: 1024 } });
    expect(c).not.toBe(a);
    expect(adapterFeatureFingerprint(null)).toBeNull();
    expect(adapterFeatureFingerprint(undefined)).toBeNull();
  });
});
