import type { RuntimeSnapshot } from '../types/domain';
import { exactRecoveryLabSnapshot } from './LabSnapshotRestore';

export const PWA_UPDATE_RECOVERY_SCHEMA = 'pendulum-pwa-update-recovery/v2' as const;
export const PWA_UPDATE_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PWA_UPDATE_RECOVERY_MAX_BYTES = 64 * 1024;
export const PWA_UPDATE_REQUESTED_KEY = 'pendulum-lab/pwa-update-requested';

const LEGACY_UPDATE_RECOVERY_KEY = 'pendulum-lab/pwa-update-recovery/v1';
const UPDATE_RECOVERY_KEY = 'pendulum-lab/pwa-update-recovery/v2';
const RECOVERY_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_RECOVERY_FOCUS_ID_LENGTH = 128;

export interface UpdateRecoveryV2 {
  schemaVersion: typeof PWA_UPDATE_RECOVERY_SCHEMA;
  savedAt: string;
  expiresAt: string;
  snapshot: RuntimeSnapshot;
  wasRunning: boolean;
  focusId: string | null;
  restorePolicy: 'paused-safe-mode';
}

export type UpdateRecoveryValidation =
  | {
      status: 'valid' | 'expired';
      recovery: UpdateRecoveryV2;
      bytes: number;
      migratedFromV1: boolean;
      reason?: string;
    }
  | {
      status: 'oversize' | 'corrupt' | 'unsupported';
      bytes: number;
      migratedFromV1: false;
      reason: string;
    };

export interface StoredUpdateRecovery {
  key: typeof UPDATE_RECOVERY_KEY | typeof LEGACY_UPDATE_RECOVERY_KEY;
  validation: UpdateRecoveryValidation;
}

function serializedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

export function isBoundedRecoveryFocusId(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_RECOVERY_FOCUS_ID_LENGTH &&
      !/[\u0000-\u001f\u007f]/u.test(value))
  );
}

function parseIsoTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : Number.NaN;
}

/** Serialize only after enforcing the session-storage recovery byte budget. */
export function serializePwaUpdateRecovery(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Recovery data is not serializable.');
  if (serializedByteLength(serialized) > PWA_UPDATE_RECOVERY_MAX_BYTES) {
    throw new Error(`Recovery data exceeds the ${PWA_UPDATE_RECOVERY_MAX_BYTES}-byte limit.`);
  }
  return serialized;
}

/** Validate an untrusted recovery record without reading browser storage. */
export function validatePwaUpdateRecovery(raw: string, nowMs = Date.now()): UpdateRecoveryValidation {
  const bytes = serializedByteLength(raw);
  if (bytes > PWA_UPDATE_RECOVERY_MAX_BYTES) {
    return {
      status: 'oversize',
      bytes,
      migratedFromV1: false,
      reason: `Recovery record exceeds ${PWA_UPDATE_RECOVERY_MAX_BYTES} bytes.`
    };
  }

  let record: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainRecord(parsed)) throw new Error('Recovery record must be an object.');
    record = parsed;
  } catch (error) {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: error instanceof Error ? error.message : 'Recovery JSON could not be parsed.'
    };
  }

  const schemaVersion = record.schemaVersion;
  const isV1 = schemaVersion === 'pendulum-pwa-update-recovery/v1';
  const isV2 = schemaVersion === PWA_UPDATE_RECOVERY_SCHEMA;
  if (!isV1 && !isV2) {
    return {
      status: 'unsupported',
      bytes,
      migratedFromV1: false,
      reason: typeof schemaVersion === 'string' ? `Unsupported schema ${schemaVersion}.` : 'Missing recovery schema.'
    };
  }

  const allowedKeys = isV1
    ? new Set(['schemaVersion', 'savedAt', 'snapshot', 'wasRunning', 'focusId'])
    : new Set(['schemaVersion', 'savedAt', 'expiresAt', 'snapshot', 'wasRunning', 'focusId', 'restorePolicy']);
  if (!hasOnlyKeys(record, allowedKeys)) {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: 'Recovery record contains unsupported fields.'
    };
  }

  const savedAtMs = parseIsoTimestamp(record.savedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(savedAtMs) || savedAtMs > nowMs + RECOVERY_CLOCK_SKEW_MS) {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: 'Recovery save time is invalid.'
    };
  }
  if (typeof record.wasRunning !== 'boolean' || !isBoundedRecoveryFocusId(record.focusId)) {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: 'Recovery playback or focus metadata is invalid.'
    };
  }

  const expiresAtMs = isV1 ? savedAtMs + PWA_UPDATE_RECOVERY_TTL_MS : parseIsoTimestamp(record.expiresAt);
  if (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= savedAtMs ||
    expiresAtMs - savedAtMs > PWA_UPDATE_RECOVERY_TTL_MS
  ) {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: 'Recovery expiration is invalid.'
    };
  }
  if (!isV1 && record.restorePolicy !== 'paused-safe-mode') {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: 'Recovery restore policy is invalid.'
    };
  }

  let snapshot: RuntimeSnapshot;
  try {
    snapshot = exactRecoveryLabSnapshot(record.snapshot as RuntimeSnapshot);
  } catch (error) {
    return {
      status: 'corrupt',
      bytes,
      migratedFromV1: false,
      reason: error instanceof Error ? error.message : 'Recovery snapshot is invalid.'
    };
  }

  const recovery: UpdateRecoveryV2 = {
    schemaVersion: PWA_UPDATE_RECOVERY_SCHEMA,
    savedAt: new Date(savedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    snapshot,
    wasRunning: record.wasRunning,
    focusId: record.focusId,
    restorePolicy: 'paused-safe-mode'
  };
  const expired = nowMs >= expiresAtMs;
  return {
    status: expired ? 'expired' : 'valid',
    recovery,
    bytes,
    migratedFromV1: isV1,
    ...(expired ? { reason: 'Recovery point expired.' } : {})
  };
}

/** Commit a bounded v2 record before removing any legacy copy. */
export function storePwaUpdateRecovery(recovery: UpdateRecoveryV2, storage = window.sessionStorage): void {
  storage.setItem(UPDATE_RECOVERY_KEY, serializePwaUpdateRecovery(recovery));
  try {
    storage.removeItem(LEGACY_UPDATE_RECOVERY_KEY);
  } catch {
    // The current record is durable; stale v1 cleanup is optional.
  }
}

/** Read and transactionally migrate a valid v1 recovery record. */
export function readStoredPwaUpdateRecovery(
  nowMs = Date.now(),
  storage = window.sessionStorage
): StoredUpdateRecovery | null {
  let key: StoredUpdateRecovery['key'] = UPDATE_RECOVERY_KEY;
  let raw: string | null;
  try {
    raw = storage.getItem(UPDATE_RECOVERY_KEY);
    if (raw === null) {
      key = LEGACY_UPDATE_RECOVERY_KEY;
      raw = storage.getItem(LEGACY_UPDATE_RECOVERY_KEY);
    }
  } catch {
    return null;
  }
  if (raw === null) return null;
  const validation = validatePwaUpdateRecovery(raw, nowMs);

  if (key === LEGACY_UPDATE_RECOVERY_KEY && validation.status === 'valid' && validation.migratedFromV1) {
    try {
      const migrated = serializePwaUpdateRecovery(validation.recovery);
      storage.setItem(UPDATE_RECOVERY_KEY, migrated);
      try {
        storage.removeItem(LEGACY_UPDATE_RECOVERY_KEY);
      } catch {
        // v2 is durable; an inaccessible stale v1 copy is safe to leave alone.
      }
      return { key: UPDATE_RECOVERY_KEY, validation: validatePwaUpdateRecovery(migrated, nowMs) };
    } catch (error) {
      console.warn('Pendulum Lab retained the v1 update recovery because migration could not be committed.', error);
    }
  }
  return { key, validation };
}

export function clearStoredPwaUpdateRecovery(storage = window.sessionStorage): boolean {
  try {
    storage.removeItem(UPDATE_RECOVERY_KEY);
    storage.removeItem(LEGACY_UPDATE_RECOVERY_KEY);
    storage.removeItem(PWA_UPDATE_REQUESTED_KEY);
    return true;
  } catch {
    return false;
  }
}
