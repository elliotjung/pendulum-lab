const BASE64URL = /^[A-Za-z0-9_-]+$/u;

export function encodeBase64UrlText(textValue: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(textValue)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeBase64UrlText(value: string): string {
  if (!BASE64URL.test(value) || value.length % 4 === 1) throw new Error('invalid base64url');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(`${base64}${'='.repeat((4 - (value.length % 4)) % 4)}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (item) => item.charCodeAt(0)));
}
