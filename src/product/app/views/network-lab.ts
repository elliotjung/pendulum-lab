import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createNetworkWorkspace } from '../../lab/views/network-workspace';
import { NETWORK_SYSTEM_IDS } from '../../adapters/physics/network';
import type { ResolvedRoute, RouteView } from '../types';
import '../../../../css/product/network.css';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind !== 'lab-system' || !(NETWORK_SYSTEM_IDS as readonly string[]).includes(route.systemId))
    throw new Error('A supported network laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createNetworkWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
