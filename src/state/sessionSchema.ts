/** Session v11 is the first schema that defines the compound double-pendulum model. */
export const SESSION_SCHEMA_VERSION = 'pendulum-session/v11-ts' as const;

/** Historical point-mass-only schema retained for an explicit read migration. */
export const LEGACY_SESSION_SCHEMA_V10 = 'pendulum-session/v10-ts' as const;
