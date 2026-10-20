import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createFieldWorkspace } from '../../lab/views/field-workspace';
import { FIELD_SYSTEM_IDS } from '../../adapters/physics/field';
import type { ResolvedRoute, RouteView } from '../types';
import '../../../../css/product/field.css';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind !== 'lab-system' || !(FIELD_SYSTEM_IDS as readonly string[]).includes(route.systemId))
    throw new Error('A supported field laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createFieldWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
