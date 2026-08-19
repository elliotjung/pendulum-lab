/**
 * Compatibility facade for stochastic stepper families.
 *
 * Additive, multiplicative, and matrix-noise algorithms now live in separate
 * modules so their numerical assumptions and work bounds can be reviewed in
 * isolation. Existing imports from `stochasticSteppers` remain source-stable.
 */
export { eulerMaruyamaStep, eulerMaruyamaStepCore } from './stochasticAdditive';
export { milsteinStep, milsteinStepCore } from './stochasticMultiplicative';
export {
  commutativeMilsteinStep,
  commutativeMilsteinStepCore,
  stochasticHeunStratonovichStep,
  stochasticHeunStratonovichStepCore
} from './stochasticMatrixNoise';
export { assertFiniteBuffer, assertUint32Seed, gaussianSampler } from './stochasticStepperShared';
export type { LangevinScheme } from './stochasticMetadata';
export type { StateDependentVector } from './stochasticMultiplicative';
export type { DiffusionMatrix, DiffusionMatrixJacobian, MatrixSdeScratch } from './stochasticMatrixNoise';
export type { GaussianSampler } from './stochasticStepperShared';
