import { catalog } from '../../catalog';
import { createLibrary, rememberSystem } from '../../lab/library';
import { createWorkspace } from '../../lab/workspace';
import { createLegacyMigrationPanel } from '../../persistence/legacy-migration-panel';
import type { ResolvedRoute, RouteView } from '../types';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind === 'lab') {
    const element = createLibrary(document);
    const migration = createLegacyMigrationPanel(document);
    element.append(migration.element);
    return { element, title: '실험실', dispose: migration.dispose };
  }
  if (route.kind !== 'lab-system') throw new Error('The laboratory view requires a Lab route.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
