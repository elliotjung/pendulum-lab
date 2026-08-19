/**
 * Public compatibility facade for promoted WebGPU chaos diagnostics.
 *
 * Full-spectrum execution, CLV promotion, and FTLE promotion are kept in
 * independent modules so a change to one diagnostic cannot weaken another's
 * CPU-oracle gate.
 */
export {
  cpuDoublePendulumClv,
  resolveWebgpuClvSettings,
  webgpuDoublePendulumFullSpectrumCandidate
} from './gpuFullSpectrumPromotion';
export { promotedDoublePendulumClv, webgpuDoublePendulumClvCandidate } from './gpuClvPromotion';
export {
  promotedDoublePendulumVariationalFtleField,
  resolveWebgpuFtleOptions,
  webgpuDoublePendulumVariationalFtleFieldCandidate
} from './gpuFtlePromotion';
export type {
  WebgpuClvCandidate,
  WebgpuClvOptions,
  WebgpuClvPromotion,
  WebgpuFtleFieldCandidate,
  WebgpuFtleFieldOptions,
  WebgpuFtleFieldPromotion,
  WebgpuFullSpectrumCandidate
} from './gpuChaosPromotionContracts';
