/**
 * The tangent-space machinery (variational RHS, central-difference Jacobian,
 * Gram-Schmidt reorthonormalization, seed frame) now lives in `physics/` since
 * it depends only on the physics primitives. This module re-exports it so the
 * established `chaos/variational` import path keeps working unchanged.
 */
export {
  mulberry32,
  numericalJacobian,
  makeVariationalRhs,
  jacobianTrustMetadata,
  gramSchmidt,
  seedTangentFrame
} from '../physics/variational';
