import type { ResearchProjectBundle } from '../../provenance/contracts';

export interface ResearchProjectSession {
  bundle: ResearchProjectBundle | undefined;
  previous: ResearchProjectBundle | undefined;
  pending: ResearchProjectBundle | undefined;
}

const sessions = new WeakMap<Document, ResearchProjectSession>();

/** Internal route changes keep one active project per document; a reload still requires explicit file/local restore. */
export function readResearchProjectSession(document: Document): ResearchProjectSession {
  const state = sessions.get(document);
  return state ? { ...state } : { bundle: undefined, previous: undefined, pending: undefined };
}

/** Preserve immutable bundle references without copying large raw files or writing any storage keys. */
export function saveResearchProjectSession(document: Document, state: ResearchProjectSession): void {
  sessions.set(document, { ...state });
}
