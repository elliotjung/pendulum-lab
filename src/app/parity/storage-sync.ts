/**
 * Public compatibility barrel for research persistence.
 *
 * Schema migration/validation, local-cache synchronization, IndexedDB mirroring,
 * and explicit user import/export flows remain independently testable.
 */
export { researchCleanupCutoff } from './storage-cleanup';
export {
  clampNumber,
  clippedText,
  finiteNumber,
  isPlainObject,
  isoText,
  optionalFinite,
  sanitizeStringList
} from './research-storage-validation';

export * from './storage-schema';
export * from './storage-local-cache';
export * from './storage-import-export';
