import { describe, expect, test } from 'vitest';
import type { RuntimeSnapshot } from '../src/types/domain';
import {
  PWA_UPDATE_RECOVERY_MAX_BYTES,
  PWA_UPDATE_RECOVERY_SCHEMA,
  PWA_UPDATE_RECOVERY_TTL_MS,
  serializePwaUpdateRecovery,
  validatePwaUpdateRecovery,
  type UpdateRecoveryV2
} from '../src/app/PwaLifecycle';

const now = Date.parse('2026-08-24T06:00:00.000Z');

function snapshot(): RuntimeSnapshot {
  return {
    schemaVersion: 'pendulum-session/v10-ts',
    systemType: 'double',
    method: 'rk4',
    mode: 'research',
    dt: 0.003,
    tolerance: 1e-7,
    stepsPerFrame: 6,
    damping: 0,
    parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
    state: [1, 0.8, 0, 0],
    simTime: 12.5,
    seed: 42,
    hash: 'test-hash'
  };
}

function currentRecovery(overrides: Partial<UpdateRecoveryV2> = {}): UpdateRecoveryV2 {
  const savedAt = now - 60_000;
  return {
    schemaVersion: PWA_UPDATE_RECOVERY_SCHEMA,
    savedAt: new Date(savedAt).toISOString(),
    expiresAt: new Date(savedAt + PWA_UPDATE_RECOVERY_TTL_MS).toISOString(),
    snapshot: snapshot(),
    wasRunning: true,
    focusId: 'dt',
    restorePolicy: 'paused-safe-mode',
    ...overrides
  };
}

describe('PWA update recovery validation', () => {
  test('accepts the current bounded schema without mutating its snapshot', () => {
    const recovery = currentRecovery();
    const result = validatePwaUpdateRecovery(JSON.stringify(recovery), now);

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(result.reason);
    expect(result.migratedFromV1).toBe(false);
    expect(result.recovery.restorePolicy).toBe('paused-safe-mode');
    expect(result.recovery.snapshot).toMatchObject({ method: 'rk4', simTime: 12.5, seed: 42 });
  });

  test('migrates a valid v1 record and assigns the bounded current TTL', () => {
    const savedAt = now - 24 * 60 * 60 * 1000;
    const result = validatePwaUpdateRecovery(
      JSON.stringify({
        schemaVersion: 'pendulum-pwa-update-recovery/v1',
        savedAt: new Date(savedAt).toISOString(),
        snapshot: snapshot(),
        wasRunning: false,
        focusId: null
      }),
      now
    );

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(result.reason);
    expect(result.migratedFromV1).toBe(true);
    expect(result.recovery).toMatchObject({
      schemaVersion: PWA_UPDATE_RECOVERY_SCHEMA,
      restorePolicy: 'paused-safe-mode',
      wasRunning: false
    });
    expect(Date.parse(result.recovery.expiresAt) - Date.parse(result.recovery.savedAt)).toBe(
      PWA_UPDATE_RECOVERY_TTL_MS
    );
  });

  test('classifies v1 and v2 records at or beyond their TTL as expired', () => {
    const savedAt = now - PWA_UPDATE_RECOVERY_TTL_MS;
    const v1 = validatePwaUpdateRecovery(
      JSON.stringify({
        schemaVersion: 'pendulum-pwa-update-recovery/v1',
        savedAt: new Date(savedAt).toISOString(),
        snapshot: snapshot(),
        wasRunning: true,
        focusId: 'pauseBtn'
      }),
      now
    );
    const v2 = validatePwaUpdateRecovery(
      JSON.stringify(
        currentRecovery({
          savedAt: new Date(savedAt).toISOString(),
          expiresAt: new Date(now).toISOString()
        })
      ),
      now
    );

    expect(v1.status).toBe('expired');
    expect(v2.status).toBe('expired');
  });

  test('rejects non-canonical dates, an overlong TTL, malformed snapshot, and unbounded focus', () => {
    const nonCanonicalDate = currentRecovery({ savedAt: '2026-08-24 05:59:00Z' });
    const overlongTtl = currentRecovery({
      expiresAt: new Date(now + PWA_UPDATE_RECOVERY_TTL_MS + 1).toISOString()
    });
    const malformedSnapshot = currentRecovery({ snapshot: { ...snapshot(), dt: Number.NaN } });
    const unboundedFocus = currentRecovery({ focusId: 'x'.repeat(129) });

    expect(validatePwaUpdateRecovery(JSON.stringify(nonCanonicalDate), now).status).toBe('corrupt');
    expect(validatePwaUpdateRecovery(JSON.stringify(overlongTtl), now).status).toBe('corrupt');
    expect(validatePwaUpdateRecovery(JSON.stringify(malformedSnapshot), now).status).toBe('corrupt');
    expect(validatePwaUpdateRecovery(JSON.stringify(unboundedFocus), now).status).toBe('corrupt');
  });

  test('fails closed for oversized, corrupt, and unsupported records', () => {
    const oversized = `{"payload":"${'a'.repeat(PWA_UPDATE_RECOVERY_MAX_BYTES)}"}`;

    expect(validatePwaUpdateRecovery(oversized, now).status).toBe('oversize');
    expect(validatePwaUpdateRecovery('{not-json', now).status).toBe('corrupt');
    expect(
      validatePwaUpdateRecovery(JSON.stringify({ schemaVersion: 'pendulum-pwa-update-recovery/v99' }), now).status
    ).toBe('unsupported');
  });

  test('enforces the UTF-8 byte cap before a record can be stored', () => {
    expect(() => serializePwaUpdateRecovery(currentRecovery())).not.toThrow();
    expect(() => serializePwaUpdateRecovery({ payload: '🚀'.repeat(PWA_UPDATE_RECOVERY_MAX_BYTES / 2) })).toThrow(
      /exceeds/u
    );
  });
});
