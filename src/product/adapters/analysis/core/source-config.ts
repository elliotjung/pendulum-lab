import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { ContractResult } from '../../../contracts/validation';
import { fromCanonicalPlanar, PLANAR_SYSTEM_IDS } from '../../physics/planar';
import { fromCanonicalChain, CHAIN_SYSTEM_IDS } from '../../physics/chain';
import { fromCanonicalConstraint, CONSTRAINT_SYSTEM_IDS } from '../../physics/constraint';
import { fromCanonicalSpatial, SPATIAL_SYSTEM_IDS } from '../../physics/spatial';
import { fromCanonicalDriven, DRIVEN_SYSTEM_IDS } from '../../physics/driven';
import { fromCanonicalNonlinear, NONLINEAR_SYSTEM_IDS } from '../../physics/nonlinear';
import { fromCanonicalNetwork, NETWORK_SYSTEM_IDS } from '../../physics/network';
import { fromCanonicalField, FIELD_SYSTEM_IDS } from '../../physics/field';
import { fromCanonicalDiscrete } from '../../physics/discrete-contract';
import { DISCRETE_SYSTEM_IDS } from '../../physics/discrete-schema';

function unwrap<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
  return result.value;
}
const includes = (ids: readonly string[], id: string) => ids.includes(id);

/** Analysis settings are deliberately separate from the physical restart contract. */
export function readDiagnosticConfiguration(experiment: ExperimentStateV1) {
  const physical = { ...experiment, analyses: [] };
  const id = experiment.systemId;
  if (includes(PLANAR_SYSTEM_IDS, id))
    return { family: 'planar', config: unwrap(fromCanonicalPlanar(physical)) } as const;
  if (includes(CHAIN_SYSTEM_IDS, id)) return { family: 'chain', config: unwrap(fromCanonicalChain(physical)) } as const;
  if (includes(CONSTRAINT_SYSTEM_IDS, id))
    return { family: 'constraint', config: unwrap(fromCanonicalConstraint(physical)) } as const;
  if (includes(SPATIAL_SYSTEM_IDS, id))
    return { family: 'spatial', config: unwrap(fromCanonicalSpatial(physical)) } as const;
  if (includes(DRIVEN_SYSTEM_IDS, id))
    return { family: 'driven', config: unwrap(fromCanonicalDriven(physical)) } as const;
  if (includes(NONLINEAR_SYSTEM_IDS, id))
    return { family: 'nonlinear', config: unwrap(fromCanonicalNonlinear(physical)) } as const;
  if (includes(NETWORK_SYSTEM_IDS, id))
    return { family: 'network', config: unwrap(fromCanonicalNetwork(physical)) } as const;
  if (includes(FIELD_SYSTEM_IDS, id)) return { family: 'field', config: unwrap(fromCanonicalField(physical)) } as const;
  if (includes(DISCRETE_SYSTEM_IDS, id))
    return { family: 'discrete', config: unwrap(fromCanonicalDiscrete(physical)) } as const;
  throw new Error(`지원하지 않는 진단 시스템입니다: ${id}`);
}
export type DiagnosticConfiguration = ReturnType<typeof readDiagnosticConfiguration>;
