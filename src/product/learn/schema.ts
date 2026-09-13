/** JSON-compatible authoring contracts. Content declares references, never executable physics. */
import type { CanonicalUnit } from '../contracts/quantities';

export const LEARN_COURSE_SCHEMA = 'pendulum-learn-course/v1' as const;
export const LEARN_UNIT_SCHEMA = 'pendulum-learn-unit/v1' as const;
/** Shared authoring/storage limit: every validated unit must fit the progress model. */
export const MAX_LEARN_CHECKPOINTS = 64;
/** Bounded instructional runs; longer work belongs in the full Lab. */
export const MAX_LEARN_FOCUS_STEPS = 20_000;
export const MAX_LEARN_FOCUS_SECONDS = 20;
export type LearnLocale = 'ko' | 'en';
export interface LearnText {
  readonly key: string;
  readonly ko: string;
  readonly en: string;
}
export interface UnitRef {
  readonly courseId: string;
  readonly unitId: string;
}
export interface UnitSummary {
  readonly id: string;
  readonly courseId: string;
  readonly title: LearnText;
  readonly availability: 'sample' | 'published' | 'planned';
  readonly contentVersion: number | null;
}
export interface LearnCourse {
  readonly schema: typeof LEARN_COURSE_SCHEMA;
  readonly id: string;
  readonly order: number;
  readonly title: LearnText;
  readonly description: LearnText;
  readonly units: readonly UnitSummary[];
}
export interface PrerequisiteBlock {
  readonly id: string;
  readonly title: LearnText;
  readonly body: LearnText;
  /** Recommendations only; they never control access or capability permissions. */
  readonly recommendedUnits: readonly UnitRef[];
}
export interface ConceptBlock {
  readonly id: string;
  readonly title: LearnText;
  readonly body: LearnText;
  readonly citationIds: readonly string[];
}
export interface EquationBlock {
  readonly id: string;
  readonly title: LearnText;
  /** Restricted plain mathematical text. No TeX/HTML evaluation or executable expressions. */
  readonly expression: string;
  readonly accessibleText: LearnText;
  readonly symbols: readonly { readonly symbol: string; readonly meaning: LearnText; readonly unit: CanonicalUnit }[];
  readonly citationIds: readonly string[];
}
export interface FigureBlock {
  readonly id: string;
  readonly title: LearnText;
  readonly caption: LearnText;
  readonly alt: LearnText;
  /** Fixed author-supplied normalized drawing, not simulation data. */
  readonly nodes: readonly { readonly id: string; readonly x: number; readonly y: number; readonly label: LearnText }[];
  readonly lines: readonly { readonly from: string; readonly to: string }[];
  readonly citationIds: readonly string[];
}
export interface GlossaryEntry {
  readonly id: string;
  readonly term: LearnText;
  readonly definition: LearnText;
}
export interface ChoiceCheckpoint {
  readonly id: string;
  readonly prompt: LearnText;
  readonly options: readonly { readonly id: string; readonly label: LearnText; readonly feedback: LearnText }[];
  readonly correctOptionId: string;
  readonly explanation: LearnText;
}
export interface Citation {
  readonly id: string;
  readonly title: LearnText;
  readonly authors: string;
  readonly url: string;
  readonly locator: LearnText;
  readonly accessedOn: string;
}
export interface FocusExperimentDefinition {
  readonly status: 'planned' | 'ready';
  readonly kind:
    | 'configuration'
    | 'kinematics'
    | 'energy-matrix'
    | 'lagrange'
    | 'term-balance'
    | 'normal-modes'
    | 'energy-exchange'
    | 'sensitivity';
  readonly plotIds: readonly (
    | 'configuration'
    | 'cartesian'
    | 'angular'
    | 'mass-matrix'
    | 'energy-terms'
    | 'derivation'
    | 'acceleration'
    | 'linear-modes'
    | 'energy-exchange'
    | 'sensitivity'
  )[];
  readonly systemId: string;
  readonly exposedFields: readonly string[];
  readonly fixedFields: readonly { readonly id: string; readonly value: number; readonly unit: CanonicalUnit }[];
  readonly defaultPreset: {
    readonly integratorId: string;
    readonly fields: readonly { readonly id: string; readonly value: number; readonly unit: CanonicalUnit }[];
  };
  readonly analysisIds: readonly string[];
  readonly guidance: readonly LearnText[];
  readonly successCriteria: readonly LearnText[];
  readonly tasks: readonly {
    readonly id: string;
    readonly prediction: LearnText;
    readonly action: LearnText;
    readonly expected: LearnText;
    readonly explanation: LearnText;
  }[];
}
export interface LearnUnit {
  readonly schema: typeof LEARN_UNIT_SCHEMA;
  readonly id: string;
  readonly courseId: string;
  readonly contentVersion: number;
  readonly kind: 'sample' | 'published';
  readonly title: LearnText;
  readonly summary: LearnText;
  readonly objectives: readonly LearnText[];
  readonly prerequisites: readonly PrerequisiteBlock[];
  readonly concepts: readonly ConceptBlock[];
  readonly equations: readonly EquationBlock[];
  readonly figures: readonly FigureBlock[];
  readonly glossary: readonly GlossaryEntry[];
  readonly checks: readonly ChoiceCheckpoint[];
  readonly focusExperiment: FocusExperimentDefinition;
  readonly labTransfer: {
    readonly status: 'planned' | 'ready';
    readonly systemId: string;
    readonly sourceUnitId: string;
    readonly description: LearnText;
  };
  readonly references: readonly Citation[];
  readonly review: {
    readonly schemaVerified: boolean;
    readonly automatedVerified: boolean;
    readonly sourceChecked: boolean;
    readonly humanReviewed: boolean;
    readonly note: LearnText;
  };
}

export function learnText(key: string, ko: string, en: string): LearnText {
  return { key, ko, en };
}
