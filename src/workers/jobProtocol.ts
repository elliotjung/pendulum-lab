/**
 * Public facade for chaos job protocol V2.
 *
 * Contracts and phase planning live in `jobProtocolTypes`, hostile-boundary
 * validation lives in `jobProtocolValidation`, and execution/lifecycle state
 * lives in `JobEngine`. Keeping this facade stable preserves the package API.
 */
export {
  JOB_PROTOCOL_V2,
  jobPhases,
  type JobCheckpointState,
  type JobControlMessage,
  type JobEventMessage,
  type JobInboundMessage,
  type JobStatus,
  type JobSubmitMessage
} from './jobProtocolTypes';
export {
  isJobEventMessage,
  isJobInboundMessage,
  validateChaosJobRequest,
  validateJobCheckpoint,
  validateJobInboundMessage
} from './jobProtocolValidation';
export { defaultPhaseRunner, JobEngine, type PhaseRunner } from './JobEngine';
