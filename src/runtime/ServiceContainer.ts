/**
 * Minimal, dependency-free typed service container (DI container).
 *
 * It is the canonical place where runtime services (state store, event bus,
 * command registry, physics adapter, worker bridge, and the adopted legacy
 * runtime) are registered and resolved. The container replaces the previous
 * pattern of scattering bare `globalThis.App` / `globalThis.Physics` writes:
 * everything now has a single, typed source of truth with explicit lifecycle.
 *
 * Design goals:
 * - Zero runtime dependencies (matches the rest of the engine).
 * - Typed tokens via a service-map interface, so `resolve` returns the right
 *   type without casts at call sites.
 * - Lazy singletons by default, with an opt-out for transient factories.
 * - Deterministic, throwing resolution (an unknown token is a programmer error,
 *   never a silent `undefined`), plus a non-throwing `tryResolve` for optional
 *   services such as the legacy runtime that may be absent under `file://`.
 */

export type ServiceFactory<C, T> = (container: C) => T;

interface Registration<C> {
  factory: ServiceFactory<C, unknown>;
  singleton: boolean;
}

/**
 * Generic container keyed by a service-map interface `M`. Tokens are the keys of
 * `M`; the resolved value type is `M[token]`.
 */
export class ServiceContainer<M extends object = Record<string, unknown>> {
  private readonly registrations = new Map<keyof M, Registration<ServiceContainer<M>>>();
  private readonly instances = new Map<keyof M, unknown>();

  /** Register a lazily-constructed service. Singleton unless `singleton: false`. */
  register<K extends keyof M>(
    token: K,
    factory: ServiceFactory<ServiceContainer<M>, M[K]>,
    options: { singleton?: boolean } = {}
  ): this {
    this.registrations.set(token, {
      factory: factory as ServiceFactory<ServiceContainer<M>, unknown>,
      singleton: options.singleton ?? true
    });
    // A fresh registration invalidates any previously cached singleton.
    this.instances.delete(token);
    return this;
  }

  /** Register an already-constructed value as a singleton. */
  registerValue<K extends keyof M>(token: K, value: M[K]): this {
    this.registrations.set(token, { factory: () => value, singleton: true });
    this.instances.set(token, value);
    return this;
  }

  /** True when a token has a registration. */
  has<K extends keyof M>(token: K): boolean {
    return this.registrations.has(token);
  }

  /** Resolve a service. Throws when the token is not registered. */
  resolve<K extends keyof M>(token: K): M[K] {
    const registration = this.registrations.get(token);
    if (!registration) throw new Error(`ServiceContainer: no registration for "${String(token)}"`);
    if (registration.singleton && this.instances.has(token)) return this.instances.get(token) as M[K];
    const value = registration.factory(this) as M[K];
    if (registration.singleton) this.instances.set(token, value);
    return value;
  }

  /** Resolve a service, or return `undefined` when it is not registered. */
  tryResolve<K extends keyof M>(token: K): M[K] | undefined {
    return this.has(token) ? this.resolve(token) : undefined;
  }

  /** List registered tokens (useful for diagnostics panels). */
  tokens(): Array<keyof M> {
    return [...this.registrations.keys()];
  }

  /** Drop a single cached singleton without removing its registration. */
  invalidate<K extends keyof M>(token: K): void {
    this.instances.delete(token);
  }

  /** Clear all registrations and instances (primarily for tests). */
  reset(): void {
    this.registrations.clear();
    this.instances.clear();
  }
}
