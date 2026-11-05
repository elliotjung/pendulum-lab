import { researchFocusDeclaration } from '../experiments/research-focus-definitions';
import { catalog, supportsSystem } from '../catalog';
import type { LearnUnit } from './schema';
/** Bind every research unit to the exact reviewed adapter declaration, even if its kind is forged. */
export function checkResearchExperiment(value: LearnUnit, errors: string[]): void {
  let declaration: ReturnType<typeof researchFocusDeclaration>;
  try {
    declaration = researchFocusDeclaration(value.id);
  } catch {
    errors.push('focusExperiment: unknown research experiment.');
    return;
  }
  const focus = value.focusExperiment;
  if (
    value.courseId !== `course-${value.id.split('.')[0]}` ||
    focus.kind !==
      (value.id.startsWith('4.')
        ? 'nonlinear-control'
        : value.id.startsWith('5.')
          ? 'chaos-measurement'
          : 'research-workflow')
  )
    errors.push('focusExperiment: research course/experiment mismatch.');
  if (
    focus.status !== 'ready' ||
    value.labTransfer.status !== 'ready' ||
    focus.systemId !== declaration.systemId ||
    value.labTransfer.systemId !== declaration.systemId ||
    value.labTransfer.sourceUnitId !== value.id
  )
    errors.push('focusExperiment: native system/transfer readiness mismatch.');
  const quantities = declaration.fields.map(({ id, value, unit }) => ({ id, value, unit }));
  const expected = {
    plotIds: ['diagnostics'],
    exposedFields: declaration.exposed,
    fixedFields: quantities.filter((f) => !declaration.exposed.includes(f.id)),
    defaultPreset: { integratorId: declaration.integratorId, fields: quantities },
    analysisIds: declaration.analysisIds
  };
  for (const key of Object.keys(expected) as (keyof typeof expected)[])
    if (JSON.stringify(focus[key]) !== JSON.stringify(expected[key]))
      errors.push(`focusExperiment: ${key} differs from the reviewed research declaration.`);
  const system = catalog.systems.find((s) => s.id === declaration.systemId);
  if (!system) errors.push('focusExperiment: missing native research system.');
  if (declaration.integratorId === 'internal') {
    if (system?.stepping.kind !== 'internal') errors.push('focusExperiment: unsupported internal stepper.');
  } else {
    const integrator = catalog.integrators.find((i) => i.id === declaration.integratorId);
    if (
      !integrator ||
      !system ||
      system.stepping.kind !== 'selectable' ||
      !system.stepping.integratorIds.includes(integrator.id) ||
      !supportsSystem(integrator.compatibility, system)
    )
      errors.push('focusExperiment: incompatible native integrator.');
  }
  for (const id of declaration.analysisIds) {
    const analysis = catalog.analyses.find((a) => a.id === id);
    if (!analysis || !system || !supportsSystem(analysis.compatibility, system))
      errors.push(`focusExperiment: incompatible analysis ${id}.`);
  }
  if (new Set(focus.tasks.map((t) => t.id)).size !== focus.tasks.length)
    errors.push('focusExperiment.tasks: duplicate research task.');
}
