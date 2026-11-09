/** Pure codecs: no localStorage, browser navigation, engine invocation or migration side effects. */
export { parseExperiment, serializeExperiment, parseUiState, serializeUiState } from './serialization';
export { encodeShareToken, decodeShareToken } from './share';
export type { ShareEnvelopeV1 } from './share';
export { createExperimentRoute, createProductSetupRoute, resolveProductRoute } from './share-route';
export {
  PRODUCT_SETUP_SCHEMA,
  MAX_PRODUCT_SETUP_FILE_BYTES,
  validateProductSetup,
  parseProductSetup,
  serializeProductSetup
} from './product-setup';
export type { ProductSetupV1, ProductSetupControlsV1 } from './product-setup';
export { encodeProductSetupToken, decodeProductSetupToken } from './product-setup-codec';
