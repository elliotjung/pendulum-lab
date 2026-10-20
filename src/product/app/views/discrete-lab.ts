import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createDiscreteWorkspace } from '../../lab/views/discrete-workspace';
import { DISCRETE_SYSTEM_IDS } from '../../adapters/physics/discrete';
import type { ResolvedRoute, RouteView } from '../types';
import '../../../../css/product/discrete.css';
export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind !== 'lab-system' || !(DISCRETE_SYSTEM_IDS as readonly string[]).includes(route.systemId))
    throw new Error('A supported discrete laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createDiscreteWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
