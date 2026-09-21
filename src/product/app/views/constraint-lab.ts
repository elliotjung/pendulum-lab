import { catalog } from '../../catalog';
import { rememberSystem } from '../../lab/library';
import { createConstraintWorkspace } from '../../lab/views/constraint-workspace';
import type { ResolvedRoute, RouteView } from '../types';
import '../../../../css/product/constraint.css';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind !== 'lab-system' || !['system:spring', 'system:rope', 'system:double-string'].includes(route.systemId))
    throw new Error('A supported constraint laboratory system route is required.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createConstraintWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
