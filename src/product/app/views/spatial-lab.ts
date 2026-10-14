import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createSpatialWorkspace } from '../../lab/views/spatial-workspace';
import { SPATIAL_SYSTEM_IDS } from '../../adapters/physics/spatial-schema';
import type { ResolvedRoute, RouteView } from '../types';
import '../../../../css/product/spatial.css';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind !== 'lab-system' || !(SPATIAL_SYSTEM_IDS as readonly string[]).includes(route.systemId))
    throw new Error('A supported spatial laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createSpatialWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
