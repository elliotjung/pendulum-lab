/** Recover a request id without trusting accessors or proxy traps. */
export function safeRequestId(value: unknown): string {
  try {
    if (value !== null && typeof value === 'object') {
      const id = (value as { id?: unknown }).id;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // Accessor/proxy failures are treated as malformed input.
  }
  return 'unknown';
}

/** Format arbitrary thrown values without invoking an untrusted conversion path. */
export function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return error.message || error.name;
    return String(error);
  } catch {
    return 'unknown request error';
  }
}
