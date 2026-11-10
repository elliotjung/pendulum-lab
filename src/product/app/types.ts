import type { ExperimentStateV1 } from '../contracts/experiment';
import type { ProductRoute } from '../contracts/routes';
import type { ProductSetupV1 } from '../persistence/product-setup';

export type ProductSpace = 'learn' | 'lab';

export interface ResolvedRoute {
  readonly route: ProductRoute;
  readonly experiment?: ExperimentStateV1;
  readonly setup?: ProductSetupV1;
}

export interface RouteView {
  readonly element: HTMLElement;
  readonly title: string;
  readonly dispose?: () => void;
}

export interface RouteModule {
  createView(context: ResolvedRoute, document: Document): RouteView;
}

export type RouteError = 'invalid-route' | 'chunk-error' | 'render-error';

export interface RoutePort {
  readHash(): string;
  replaceHash(hash: string): void;
  subscribe(listener: () => void): () => void;
}

export interface RoutePresentation {
  loading(space: ProductSpace): void;
  cancelled(space: ProductSpace | null): void;
  ready(view: RouteView, space: ProductSpace): void;
  error(kind: RouteError, space: ProductSpace | null): void;
}
