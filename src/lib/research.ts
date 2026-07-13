/**
 * @packageDocumentation
 *
 * `research` — reproducible-research tooling: deterministic sampling plans,
 * adaptive experiment design, ZIP bundles with checksums, provenance graphs,
 * notebook/figure pipelines, library UX helpers, the CLI batch spec, and the
 * worker job protocol (pure handlers usable headlessly in Node).
 */

export * from '../research/researchSampling';
export * from '../research/experimentDesign';
export * from '../research/sobolSensitivity';
export * from '../research/surrogate';
export * from '../research/parameterEstimation';
export * from '../research/experimentalDataImport';
export * from '../research/videoTracking';
export * from '../research/sindy';
export * from '../research/complexEig';
export * from '../research/eigenGeneral';
export * from '../research/unitaryFloquet';
export * from '../research/svd';
export * from '../research/dmd';
export * from '../research/havok';
export * from '../research/qkrFloquet';
export * from '../research/qkrViewModel';
export * from '../research/reservoir';
export * from '../research/hamiltonianLearning';
export * from '../research/lanczos';
export * from '../research/arnoldi';
export * from '../research/zipBundle';
export * from '../research/provenance';
export * from '../research/notebookBuilder';
export * from '../research/figurePipeline';
export * from '../research/libraryUx';
export * from '../research/structurePreservation';
export * from '../research/cliBatchSpec';
export * from '../research/certifiedWorkbench';
export * from '../research/flagshipCertification';
export { hashText, csvCell, dataUrlByteEstimate } from '../research/researchExportUtils';

// Worker job protocol (pure handlers usable headlessly).
export { runChaosJob } from '../workers/chaosProtocol';
export type {
  BasinRequest,
  BasinResponse,
  BifurcationJobSettings,
  BifurcationRequest,
  BifurcationResponse,
  ChaosErrorResponse,
  ChaosRequest,
  ChaosResponse,
  ClvRequest,
  ClvResponse,
  CodimTwoRequest,
  CodimTwoResponse,
  FtleRequest,
  FtleResponse,
  LyapunovRequest,
  LyapunovResponse,
  LyapunovSpectrumRequest,
  LyapunovSpectrumResponse,
  RqaJobSettings,
  RqaRequest,
  RqaResponse,
  StudyPointJobSettings,
  StudyPointRequest,
  StudyPointResponse,
  WadaConvergenceRequest,
  WadaConvergenceResponse,
  ZeroOneJobSettings,
  ZeroOneRequest,
  ZeroOneResponse
} from '../workers/chaosProtocol';
export { JobEngine, jobPhases, JOB_PROTOCOL_V2 } from '../workers/jobProtocol';
export type { JobControlMessage, JobEventMessage, JobInboundMessage, JobStatus, JobCheckpointState, JobSubmitMessage, PhaseRunner } from '../workers/jobProtocol';
