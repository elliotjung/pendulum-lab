import type { CanonicalUnit } from '../contracts/quantities';
import type { ExperimentStateV1 } from '../contracts/experiment';

/** S26 authoring declarations. Numerical work stays in the existing native adapters. */
export interface ResearchFocusField {
  readonly id: string;
  readonly label: string;
  readonly unit: CanonicalUnit;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}
export interface ResearchFocusDeclaration {
  readonly systemId: string;
  readonly integratorId: string;
  readonly fields: readonly ResearchFocusField[];
  readonly exposed: readonly string[];
  readonly analysisIds: readonly string[];
}
export type ResearchFields = Readonly<Record<string, number>>;
export interface ResearchFocusResult {
  readonly schema: 'pendulum-research-focus/v1';
  readonly unitId: string;
  readonly fields: ResearchFields;
  readonly canonical: ExperimentStateV1;
  readonly metrics: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: number;
    readonly unit: string;
  }[];
  readonly tables: readonly {
    readonly id: string;
    readonly title: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly (number | string)[])[];
  }[];
  readonly charts: readonly {
    readonly id: string;
    readonly title: string;
    readonly xLabel: string;
    readonly yLabel: string;
    readonly mode?: 'line' | 'scatter';
    readonly series: readonly {
      readonly label: string;
      readonly points: readonly { readonly x: number; readonly y: number }[];
    }[];
  }[];
  readonly warnings: readonly string[];
}
