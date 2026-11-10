import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createCoreWorkspace } from '../../lab/views/core-workspace';
import type { ResolvedRoute, RouteView } from '../types';

/** This module is loaded only after a supported physical system route is selected. */
export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment, setup } = context;
  if (route.kind !== 'lab-system' || !['system:double', 'system:compound-double'].includes(route.systemId))
    throw new Error('A supported core laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createCoreWorkspace(document, system, experiment, setup), title: `${system.name.ko} · 실험실` };
}
