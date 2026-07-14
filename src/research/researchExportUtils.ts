/** Small deterministic helpers shared by research export surfaces. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function dataUrlByteEstimate(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  // Spreadsheet applications can interpret cells beginning with these
  // characters as formulas. Prefix a literal apostrophe before RFC 4180
  // quoting so exported, user-influenced labels stay data when opened in a
  // spreadsheet while ordinary numeric research columns remain unchanged.
  const literal = typeof value !== 'number' && /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(literal) ? `"${literal.replace(/"/g, '""')}"` : literal;
}
