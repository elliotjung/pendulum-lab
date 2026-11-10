import type { BatchAggregate, BatchSnapshot } from '../lab/experiments/contracts';
import type { ObservationArtifact, ObservationPreview } from '../observations/types';
import type { InverseResult } from '../adapters/analysis/inverse/contracts';
import type { ResearchProjectBundle } from '../provenance/contracts';

export interface ProductStudyRunOptions {
  resume?: boolean;
  failedOnly?: boolean;
}
export interface ProductResearchBatchProvider {
  snapshot(): BatchSnapshot | undefined;
  prepare(): void;
  run(options: ProductStudyRunOptions): Promise<BatchSnapshot>;
  cancel(): void;
  comparison(): BatchAggregate;
}
export interface ProductResearchObservationSnapshot {
  preview?: ObservationPreview;
  confirmed?: ObservationArtifact;
  result?: InverseResult;
}
export interface ProductResearchObservationProvider {
  snapshot(): ProductResearchObservationSnapshot;
}
export interface ProductResearchProjectProvider {
  snapshot(): { bundle?: ResearchProjectBundle; busy: boolean };
  /** Start the same guarded native package-worker capture as the visible control. */
  saveCurrentExperiment(): void;
  /** Start the actual S24 ZIP export; snapshot.busy reports its in-flight state. */
  exportBundle(): void;
}
interface Providers {
  batch: ProductResearchBatchProvider;
  observation: ProductResearchObservationProvider;
  project: ProductResearchProjectProvider;
}
const providers = new WeakMap<Document, Partial<Providers>>();
export function bindProductResearch<K extends keyof Providers>(document: Document, kind: K, provider: Providers[K]) {
  const entry = providers.get(document) ?? {};
  entry[kind] = provider;
  providers.set(document, entry);
  return () => {
    if (entry[kind] === provider) Reflect.deleteProperty(entry, kind);
  };
}
export function getProductResearch<K extends keyof Providers>(document: Document, kind: K): Providers[K] | undefined {
  return providers.get(document)?.[kind];
}
export function requireProductResearch<K extends keyof Providers>(document: Document, kind: K): Providers[K] {
  const value = getProductResearch(document, kind);
  if (!value)
    throw new Error(
      `${kind === 'batch' ? '다중 실험' : kind === 'observation' ? '관측·역문제' : '연구 프로젝트'} 도구를 현재 실험실에서 먼저 여세요. 연결되지 않은 legacy 저장소를 대신 사용하지 않았습니다.`
    );
  return value;
}
