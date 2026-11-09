import type { ExperimentStateV1 } from '../contracts/experiment';
import { parseProductRoute, serializeProductRoute, type ProductRoute } from '../contracts/routes';
import { failure, success, type ContractResult } from '../contracts/validation';
import { decodeShareToken, encodeShareToken } from './share';
import { decodeProductSetupToken, encodeProductSetupToken } from './product-setup-codec';
import type { ProductSetupV1 } from './product-setup';

/** Route syntax alone cannot certify that its token belongs to the selected system. */
export function resolveProductRoute(
  input: string
): ContractResult<{ route: ProductRoute; experiment?: ExperimentStateV1; setup?: ProductSetupV1 }> {
  const parsed = parseProductRoute(input);
  if (!parsed.ok) return parsed;
  const route = parsed.value;
  if (route.kind !== 'lab-system' || route.stateToken === undefined) return success({ route });
  if (route.stateToken.startsWith('ps1.')) {
    const setup = decodeProductSetupToken(route.stateToken);
    if (!setup.ok) return setup;
    if (setup.value.experiment.systemId !== route.systemId)
      return failure(
        'route-state-mismatch',
        '$.systemId',
        'Route and shared setup select different systems.',
        'keep-original'
      );
    return success({ route, experiment: setup.value.experiment, setup: setup.value });
  }
  const state = decodeShareToken(route.stateToken);
  if (!state.ok) return state;
  if (state.value.systemId !== route.systemId)
    return failure(
      'route-state-mismatch',
      '$.systemId',
      'Route and shared experiment select different systems.',
      'keep-original'
    );
  return success({ route, experiment: state.value });
}

/** Full public controls are additive; the existing pe1 physical-only creator
 * retains its original wire format and behavior. */
export function createProductSetupRoute(input: unknown): ContractResult<string> {
  const encoded = encodeProductSetupToken(input);
  if (!encoded.ok) return encoded;
  const setup = decodeProductSetupToken(encoded.value);
  if (!setup.ok) return setup;
  return serializeProductRoute({
    kind: 'lab-system',
    systemId: setup.value.experiment.systemId,
    stateToken: encoded.value
  });
}

export function createExperimentRoute(input: unknown): ContractResult<string> {
  const encoded = encodeShareToken(input);
  if (!encoded.ok) return encoded;
  const state = decodeShareToken(encoded.value);
  if (!state.ok) return state;
  return serializeProductRoute({ kind: 'lab-system', systemId: state.value.systemId, stateToken: encoded.value });
}
