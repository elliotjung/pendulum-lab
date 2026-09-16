import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createChainWorkspace } from '../../lab/views/chain-workspace';
import type { ResolvedRoute, RouteView } from '../types';
import '../../../../css/product/chain.css';

/** Load the variable-DOF UI only when a triple/chain route is selected. */
export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind !== 'lab-system' || !['system:triple', 'system:chain'].includes(route.systemId))
    throw new Error('A supported chain laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createChainWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
