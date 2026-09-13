import { courses } from '../../../content/learn/curriculum';
import { catalog, supportsSystem } from '../catalog';
import {
  PLANAR_FIELDS,
  PLANAR_INTEGRATOR_IDS,
  PLANAR_SYSTEM_IDS,
  MAX_PLANAR_STEPS
} from '../adapters/physics/planar-schema';
import { inspectSafeData } from '../persistence/safe-data';
import { MAX_LEARN_FOCUS_SECONDS, MAX_LEARN_FOCUS_STEPS, type LearnCourse, type LearnUnit } from './schema';
import { array, courseShape, unitShape } from './validation-shapes';

export type LearnValidation<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly string[] };

function unique(values: readonly string[], path: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${path}: duplicate ${value}.`);
    seen.add(value);
  }
}

/** Translation keys are stable, unique within the authored document and scoped to its owner. */
function checkTextKeys(value: unknown, prefix: string, errors: string[]): void {
  const keys: string[] = [];
  const visit = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    if (typeof record.key === 'string' && typeof record.ko === 'string' && typeof record.en === 'string') {
      if (!record.key.startsWith(prefix)) errors.push(`translation key ${record.key}: expected prefix ${prefix}.`);
      keys.push(record.key);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  unique(keys, 'translation keys', errors);
}

export function validateLearnCourses(input: unknown): LearnValidation<readonly LearnCourse[]> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return { ok: false, errors: safe.issues.map((entry) => `${entry.path}: ${entry.message}`) };
  const errors: string[] = [];
  array(courseShape, 1, 8)(safe.value, 'courses', errors);
  if (errors.length) return { ok: false, errors };
  const value = safe.value as unknown as readonly LearnCourse[];
  unique(
    value.map((course) => course.id),
    'courses',
    errors
  );
  unique(
    value.map((course) => String(course.order)),
    'course order',
    errors
  );
  unique(
    value.flatMap((course) => course.units.map((entry) => entry.id)),
    'units',
    errors
  );
  for (const course of value) {
    if (course.id !== `course-${course.order}`) errors.push(`${course.id}: order must match course ID.`);
    checkTextKeys(course, `learn.${course.id}.`, errors);
    for (const summary of course.units) {
      if (summary.courseId !== course.id || !summary.id.startsWith(`${course.order}.`))
        errors.push(`${summary.id}: course ID mismatch.`);
      if ((summary.availability === 'planned') !== (summary.contentVersion === null))
        errors.push(`${summary.id}: planned units need null version; available units need a positive version.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateLearnUnit(
  input: unknown,
  curriculum: readonly LearnCourse[] = courses
): LearnValidation<LearnUnit> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return { ok: false, errors: safe.issues.map((entry) => `${entry.path}: ${entry.message}`) };
  const errors: string[] = [];
  unitShape(safe.value, 'unit', errors);
  if (errors.length) return { ok: false, errors };
  const value = safe.value as unknown as LearnUnit;
  const summary = curriculum
    .find((course) => course.id === value.courseId)
    ?.units.find((entry) => entry.id === value.id);
  if (!summary) errors.push(`${value.courseId}/${value.id}: unknown unit ID.`);
  else {
    if (summary.availability !== value.kind || summary.contentVersion !== value.contentVersion)
      errors.push(`${value.id}: metadata availability/version mismatch.`);
    if (JSON.stringify(summary.title) !== JSON.stringify(value.title))
      errors.push(`${value.id}: title must match curriculum metadata.`);
  }
  checkTextKeys(value, `learn.${value.courseId}.${value.id}.`, errors);
  unique(
    [
      ...value.prerequisites,
      ...value.concepts,
      ...value.equations,
      ...value.figures,
      ...value.glossary,
      ...value.checks,
      ...value.references
    ].map((block) => block.id),
    'block IDs',
    errors
  );
  const citations = new Set(value.references.map((citation) => citation.id));
  const usedCitations = new Set<string>();
  for (const block of [...value.concepts, ...value.equations, ...value.figures]) {
    unique(block.citationIds, `${block.id}.citationIds`, errors);
    for (const id of block.citationIds) {
      usedCitations.add(id);
      if (!citations.has(id)) errors.push(`${block.id}: broken citation ${id}.`);
    }
  }
  for (const citation of value.references) {
    if (!usedCitations.has(citation.id)) errors.push(`${citation.id}: orphan citation.`);
    try {
      const url = new URL(citation.url);
      if (url.protocol !== 'https:' || url.username || url.password || /[\s\u0000-\u001f]/.test(citation.url))
        throw new Error();
    } catch {
      errors.push(`${citation.id}: expected safe absolute HTTPS citation URL.`);
    }
    const date = new Date(`${citation.accessedOn}T00:00:00.000Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== citation.accessedOn)
      errors.push(`${citation.id}: invalid access date.`);
  }
  for (const prerequisite of value.prerequisites) {
    unique(
      prerequisite.recommendedUnits.map((ref) => `${ref.courseId}/${ref.unitId}`),
      prerequisite.id,
      errors
    );
    for (const ref of prerequisite.recommendedUnits) {
      if (
        !curriculum.some(
          (course) => course.id === ref.courseId && course.units.some((entry) => entry.id === ref.unitId)
        )
      )
        errors.push(`${prerequisite.id}: broken prerequisite ${ref.courseId}/${ref.unitId}.`);
      if (ref.courseId === value.courseId && ref.unitId === value.id)
        errors.push(`${prerequisite.id}: self prerequisite.`);
    }
  }
  for (const equation of value.equations) {
    const symbols = equation.symbols.map((entry) => entry.symbol);
    unique(symbols, `${equation.id}.symbols`, errors);
    // This grammar is display-only, deliberately limited, and is never evaluated.
    if (!/^[a-zA-Z0-9_\s+*/^().,;=<>!-]+$/.test(equation.expression))
      errors.push(`${equation.id}: unsupported expression syntax.`);
    const tokens = [...equation.expression.matchAll(/[a-zA-Z_][a-zA-Z0-9_]*/g)];
    const identifiers = new Set(tokens.map((token) => token[0]));
    const functions = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log']);
    for (const token of tokens) {
      const identifier = token[0];
      const isFunctionCall =
        functions.has(identifier) && /^\s*\(/.test(equation.expression.slice(token.index + identifier.length));
      if (!isFunctionCall && !symbols.includes(identifier))
        errors.push(`${equation.id}: missing variable description/unit for ${identifier}.`);
    }
    for (const symbol of symbols)
      if (!identifiers.has(symbol)) errors.push(`${equation.id}: unused variable ${symbol}.`);
  }
  for (const figure of value.figures) {
    const nodes = figure.nodes.map((node) => node.id);
    unique(nodes, `${figure.id}.nodes`, errors);
    unique(
      figure.lines.map((line) => `${line.from}/${line.to}`),
      `${figure.id}.lines`,
      errors
    );
    for (const line of figure.lines)
      if (!nodes.includes(line.from) || !nodes.includes(line.to) || line.from === line.to)
        errors.push(`${figure.id}: invalid figure connection.`);
  }
  for (const check of value.checks) {
    unique(
      check.options.map((option) => option.id),
      `${check.id}.options`,
      errors
    );
    if (!check.options.some((option) => option.id === check.correctOptionId))
      errors.push(`${check.id}: missing correct option.`);
  }
  checkExperiment(value, errors);
  if (
    value.kind === 'published' &&
    (value.focusExperiment.status !== 'ready' ||
      value.labTransfer.status !== 'ready' ||
      !value.review.automatedVerified ||
      !value.review.sourceChecked)
  )
    errors.push(
      `${value.id}: publication requires executable experiment, transfer, automated verification and source checks.`
    );
  if (value.focusExperiment.status === 'planned' && value.review.automatedVerified)
    errors.push(`${value.id}: planned experiment cannot claim automated scientific verification.`);
  // Human review requires a future explicit reviewer record; a boolean alone is not evidence.
  if (value.review.humanReviewed) errors.push(`${value.id}: human review requires an attributable reviewer record.`);
  if (!value.review.schemaVerified) errors.push(`${value.id}: available content requires schema verification.`);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

function checkExperiment(value: LearnUnit, errors: string[]): void {
  const focus = value.focusExperiment;
  unique(focus.plotIds, 'focusExperiment.plotIds', errors);
  unique(
    focus.tasks.map((task) => task.id),
    'focusExperiment.tasks',
    errors
  );
  if (focus.status !== value.labTransfer.status)
    errors.push('focusExperiment: execution and transfer readiness differ.');
  const system = catalog.systems.find((entry) => entry.id === focus.systemId);
  if (!system) errors.push(`focusExperiment: broken system reference ${focus.systemId}.`);
  const integrator = catalog.integrators.find((entry) => entry.id === focus.defaultPreset.integratorId);
  if (
    !integrator ||
    (system &&
      (!supportsSystem(integrator.compatibility, system) ||
        system.stepping.kind !== 'selectable' ||
        !system.stepping.integratorIds.includes(integrator.id)))
  )
    errors.push('focusExperiment: incompatible or missing integrator.');
  unique(focus.analysisIds, 'focusExperiment.analysisIds', errors);
  for (const id of focus.analysisIds) {
    const analysis = catalog.analyses.find((entry) => entry.id === id);
    if (!analysis || (system && !supportsSystem(analysis.compatibility, system)))
      errors.push(`focusExperiment: incompatible or missing analysis ${id}.`);
  }
  // Declarations refer to the existing S07 input schema; no engine is imported here.
  if (!(PLANAR_SYSTEM_IDS as readonly string[]).includes(focus.systemId))
    errors.push('focusExperiment: no available product field schema for this system.');
  if (!(PLANAR_INTEGRATOR_IDS as readonly string[]).includes(focus.defaultPreset.integratorId))
    errors.push('focusExperiment: integrator lacks product execution evidence.');
  const known = new Map(PLANAR_FIELDS.map((field) => [field.id, field]));
  unique(focus.exposedFields, 'focusExperiment.exposedFields', errors);
  unique(
    focus.fixedFields.map((field) => field.id),
    'focusExperiment.fixedFields',
    errors
  );
  unique(
    focus.defaultPreset.fields.map((field) => field.id),
    'focusExperiment.defaultPreset.fields',
    errors
  );
  for (const id of focus.exposedFields) {
    if (!known.has(id)) errors.push(`focusExperiment: unknown exposed field ${id}.`);
    if (focus.fixedFields.some((field) => field.id === id))
      errors.push(`focusExperiment: ${id} cannot be exposed and fixed.`);
  }
  for (const field of [...focus.fixedFields, ...focus.defaultPreset.fields]) {
    const metadata = known.get(field.id);
    if (!metadata || metadata.unit !== field.unit || field.value < metadata.min || field.value > metadata.max)
      errors.push(`focusExperiment: invalid field/unit/range ${field.id}.`);
  }
  const preset = new Map(focus.defaultPreset.fields.map((field) => [field.id, field]));
  for (const id of known.keys()) if (!preset.has(id)) errors.push(`focusExperiment: preset missing field ${id}.`);
  if (focus.status === 'ready') {
    if (focus.systemId !== 'system:double')
      errors.push('focusExperiment: course-one execution requires the point-mass double pendulum.');
    const requiredPlots = {
      configuration: ['configuration'],
      kinematics: ['cartesian', 'angular'],
      'energy-matrix': ['mass-matrix', 'energy-terms'],
      lagrange: ['derivation', 'acceleration'],
      'term-balance': ['acceleration'],
      'normal-modes': ['linear-modes'],
      'energy-exchange': ['energy-exchange'],
      sensitivity: ['sensitivity']
    } as const;
    for (const plot of requiredPlots[focus.kind])
      if (!focus.plotIds.includes(plot)) errors.push(`focusExperiment: ${focus.kind} requires plot ${plot}.`);
    for (const id of known.keys())
      if (!focus.exposedFields.includes(id) && !focus.fixedFields.some((field) => field.id === id))
        errors.push(`focusExperiment: ready declaration must expose or fix ${id}.`);
    if (
      focus.kind === 'normal-modes' &&
      ['m1', 'm2', 'l1', 'l2'].some((id) => !focus.fixedFields.some((field) => field.id === id && field.value === 1))
    )
      errors.push('focusExperiment: course-one normal modes require unit masses and lengths.');
    if (!focus.fixedFields.some((field) => field.id === 'gamma' && field.value === 0))
      errors.push('focusExperiment: course-one conservative observations require fixed zero damping.');
    if (focus.kind === 'normal-modes' && (preset.get('g')?.value ?? 0) <= 0)
      errors.push('focusExperiment: normal modes require positive gravity.');
    const duration = preset.get('duration')?.value ?? 0;
    const step = preset.get('step')?.value ?? 0;
    if (duration > MAX_LEARN_FOCUS_SECONDS || Math.ceil(duration / step) > MAX_LEARN_FOCUS_STEPS)
      errors.push('focusExperiment: ready declaration exceeds the bounded Focus execution budget.');
  }
  for (const field of focus.fixedFields)
    if (preset.get(field.id)?.value !== field.value || preset.get(field.id)?.unit !== field.unit)
      errors.push(`focusExperiment: fixed field ${field.id} differs from preset.`);
  const duration = preset.get('duration')?.value ?? 0;
  const step = preset.get('step')?.value ?? 0;
  if (step > duration || Math.ceil(duration / step) > MAX_PLANAR_STEPS)
    errors.push('focusExperiment: invalid duration/step budget.');
  if (value.labTransfer.systemId !== focus.systemId || value.labTransfer.sourceUnitId !== value.id)
    errors.push('labTransfer: source/system reference mismatch.');
}
