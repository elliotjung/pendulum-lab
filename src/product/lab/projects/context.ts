import type { ResearchProject, ResearchProjectBundle } from '../../provenance/contracts';

export interface ProjectEditorContext {
  get(): ResearchProjectBundle | undefined;
  change(update: (project: ResearchProject) => ResearchProject, message: string): void;
  download(data: string | Uint8Array, filename: string, mediaType: string): void;
  fail(cause: unknown): void;
}

let sequence = 0;
export function projectItemId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}
