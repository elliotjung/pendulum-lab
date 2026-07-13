import type { PendulumLegacyApp, PendulumLegacyPhysics } from '../types/globals';

export function legacyNamespace(): { App?: PendulumLegacyApp; Physics?: PendulumLegacyPhysics } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window as Window & { PendulumLabLegacyRuntime?: { App?: PendulumLegacyApp; Physics?: PendulumLegacyPhysics } }
  ).PendulumLabLegacyRuntime;
}

export function legacyApp(): PendulumLegacyApp | undefined {
  if (typeof window === 'undefined') return undefined;
  return legacyNamespace()?.App ?? window.App;
}

export function legacyPhysics(): PendulumLegacyPhysics | undefined {
  if (typeof window === 'undefined') return undefined;
  return legacyNamespace()?.Physics ?? window.Physics;
}

export function legacyAdopted(): boolean {
  return Boolean(legacyApp());
}
