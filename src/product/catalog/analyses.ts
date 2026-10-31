import type { AnalysisDefinition } from '../contracts/catalog';
import { coreAnalyses } from './analyses-core';
import { geometryAnalyses } from './analyses-geometry';
import { stabilityAnalyses } from './analyses-stability';
import { physicalAnalyses } from './analyses-physical';
import { researchAnalyses } from './analyses-research';

/** Explicit semantic groups; importing this catalog does not load legacy engines. */
export const analyses: readonly AnalysisDefinition[] = [
  ...coreAnalyses,
  ...geometryAnalyses,
  ...stabilityAnalyses.map((definition) => ({
    ...definition,
    tags: [...definition.tags, 'product-stability-workflow-v1'],
    computation: { ...definition.computation, location: 'worker' as const, cancellable: true }
  })),
  ...physicalAnalyses,
  ...researchAnalyses
];
