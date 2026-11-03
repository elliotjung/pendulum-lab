import type {
  AddResearchArtifactOptions,
  CaptureResearchRunOptions,
  ResearchProjectBundle
} from '../../provenance/contracts';

export type ProjectPackageRequest =
  | { id: string; operation: 'import'; bytes: Uint8Array }
  | { id: string; operation: 'export'; bundle: ResearchProjectBundle }
  | { id: string; operation: 'reviewer'; bundle: ResearchProjectBundle }
  | { id: string; operation: 'attach'; bundle: ResearchProjectBundle; options: AddResearchArtifactOptions }
  | { id: string; operation: 'capture'; bundle: ResearchProjectBundle; options: CaptureResearchRunOptions };
export type ProjectPackageEvent =
  | { type: 'progress'; id: string; fraction: number; message: string }
  | { type: 'imported'; id: string; bundle: ResearchProjectBundle }
  | { type: 'updated'; id: string; bundle: ResearchProjectBundle }
  | { type: 'exported'; id: string; bytes: Uint8Array }
  | { type: 'reviewed'; id: string; bytes: Uint8Array }
  | { type: 'cancelled'; id: string }
  | { type: 'error'; id: string; message: string };
