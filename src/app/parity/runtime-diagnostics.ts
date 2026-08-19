/**
 * Public compatibility barrel for diagnostics.
 *
 * Validation UI, numerical probes, and runtime snapshot rendering have
 * independent lifecycles and are kept in focused modules.
 */
export * from './runtime-diagnostics-validation';
export * from './runtime-diagnostics-probes';
export * from './runtime-diagnostics-renderers';
