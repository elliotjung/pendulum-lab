import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { courses } from '../../../content/learn/curriculum';
import { learnModules } from '../../../content/learn/modules';
import { loadLearnUnit } from '../../../src/product/learn/loader';
import type { EquationBlock, LearnUnit } from '../../../src/product/learn/schema';
import { validateLearnUnit } from '../../../src/product/learn/validation';

const ids = [2, 3].flatMap((course) => Array.from({ length: 9 }, (_, i) => `${course}.${i + 1}`));
const units = await Promise.all(
  ids.map(async (id) => {
    const loaded = await loadLearnUnit(`course-${id[0]}`, id);
    if (loaded.status !== 'ready') throw new Error(`${id}: expected a published, valid unit (${loaded.status}).`);
    return loaded.unit;
  })
);

/** Independent test-only SI algebra; it never evaluates authored equations as executable code. */
type Dim = readonly [number, number, number];
const scalar: Dim = [0, 0, 0];
const dimensions: Readonly<Record<string, Dim>> = {
  '1': scalar,
  rad: scalar,
  kg: [1, 0, 0],
  m: [0, 1, 0],
  s: [0, 0, 1],
  'm/s': [0, 1, -1],
  'm/s^2': [0, 1, -2],
  'rad/s': [0, 0, -1],
  'rad/s^2': [0, 0, -2],
  's^-1': [0, 0, -1],
  's^-2': [0, 0, -2],
  'kg*m^2': [1, 2, 0],
  'kg*m^2/s': [1, 2, -1],
  N: [1, 1, -2],
  'N/rad': [1, 1, -2],
  'N*s/rad': [1, 1, -1],
  'N/m': [1, 0, -2],
  'N*s/m': [1, 0, -1],
  J: [1, 2, -2],
  'J*s': [1, 2, -1],
  W: [1, 2, -3],
  Hz: [0, 0, -1]
};

function dimensionOf(source: string, symbols: EquationBlock['symbols']): Dim {
  const file = ts.createSourceFile('dimension.ts', `(${source.replaceAll('^', '**')})`, ts.ScriptTarget.Latest);
  const first = file.statements[0];
  if (!first || !ts.isExpressionStatement(first)) throw new Error(`Invalid equation: ${source}`);
  function visit(node: ts.Expression): Dim {
    if (ts.isParenthesizedExpression(node)) return visit(node.expression);
    if (ts.isNumericLiteral(node)) return scalar;
    if (ts.isIdentifier(node)) {
      const unit = symbols.find((entry) => entry.symbol === node.text)?.unit;
      if (!unit || !dimensions[unit]) throw new Error(`Missing dimension for ${node.text}.`);
      return dimensions[unit];
    }
    if (ts.isPrefixUnaryExpression(node)) return visit(node.operand);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length === 1) {
      const value = visit(node.arguments[0]!);
      if (node.expression.text === 'abs') return value;
      if (node.expression.text === 'sqrt') return value.map((v) => v / 2) as unknown as Dim;
      expect(['sin', 'cos', 'tan', 'exp', 'log']).toContain(node.expression.text);
      expect(value, source).toEqual(scalar);
      return scalar;
    }
    if (ts.isBinaryExpression(node)) {
      const lhs = visit(node.left);
      const rhs = visit(node.right);
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken:
        case ts.SyntaxKind.MinusToken:
          expect(rhs, source).toEqual(lhs);
          return lhs;
        case ts.SyntaxKind.AsteriskToken:
          return lhs.map((v, i) => v + rhs[i]!) as unknown as Dim;
        case ts.SyntaxKind.SlashToken:
          return lhs.map((v, i) => v - rhs[i]!) as unknown as Dim;
        case ts.SyntaxKind.AsteriskAsteriskToken: {
          expect(rhs, source).toEqual(scalar);
          const power = Number(node.right.getText(file));
          if (!Number.isFinite(power)) {
            expect(lhs, 'Variable powers require a dimensionless base.').toEqual(scalar);
            return scalar;
          }
          return lhs.map((v) => v * power) as unknown as Dim;
        }
      }
    }
    throw new Error(`Unsupported dimensional syntax: ${source}`);
  }
  return visit(first.expression);
}

describe('S25 complete courses two and three', () => {
  it('rejects rebinding a reviewed numerical unit to the older configuration-only experiment', () => {
    const unit = units[0]!;
    expect(
      validateLearnUnit({
        ...unit,
        focusExperiment: { ...unit.focusExperiment, kind: 'configuration', plotIds: ['configuration'] }
      }).ok
    ).toBe(false);
  });

  it.each([
    [
      'another native system',
      (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, systemId: 'system:triple' } })
    ],
    [
      'unavailable solver',
      (unit: LearnUnit) => ({
        ...unit,
        focusExperiment: {
          ...unit.focusExperiment,
          defaultPreset: { ...unit.focusExperiment.defaultPreset, integratorId: 'integrator:dopri5' }
        }
      })
    ],
    [
      'hidden physical change',
      (unit: LearnUnit) => ({
        ...unit,
        focusExperiment: {
          ...unit.focusExperiment,
          defaultPreset: {
            ...unit.focusExperiment.defaultPreset,
            fields: unit.focusExperiment.defaultPreset.fields.map((field) =>
              field.id === 'm1' ? { ...field, value: 2 } : field
            )
          }
        }
      })
    ],
    [
      'unknown exposed coordinate',
      (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, exposedFields: ['position'] } })
    ],
    [
      'wrong plot binding',
      (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, plotIds: ['configuration'] } })
    ],
    [
      'missing physical diagnostic',
      (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, analysisIds: [] } })
    ],
    [
      'another transfer source',
      (unit: LearnUnit) => ({ ...unit, labTransfer: { ...unit.labTransfer, sourceUnitId: '2.2' } })
    ]
  ] as const)('rejects %s in a published experiment declaration', (_label, mutate) => {
    expect(validateLearnUnit(mutate(units[0]!)).ok).toBe(false);
  });

  it('publishes exactly eighteen requested units and preserves the S25 unit set', () => {
    expect(units.map((unit) => unit.id)).toEqual(ids);
    expect(Object.keys(learnModules).filter((key) => /^course-[123]\//.test(key))).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `course-1/1.${i + 1}`),
      ...ids.map((id) => `course-${id[0]}/${id}`)
    ]);
    expect(courses.slice(4).every((course) => course.units.every((unit) => unit.availability === 'planned'))).toBe(
      true
    );
    expect(new Set(units.map((unit) => unit.summary.ko)).size).toBe(18);
    expect(new Set(units.map((unit) => unit.focusExperiment.tasks[0]?.prediction.ko)).size).toBe(18);
  });

  it.each(units.map((unit) => [unit.id, unit] as const))('%s provides a complete, sourced inquiry', (_id, unit) => {
    expect(validateLearnUnit(unit)).toEqual({ ok: true, value: unit });
    expect(unit.kind).toBe('published');
    expect(unit.objectives.length).toBeGreaterThanOrEqual(2);
    expect(unit.concepts.length).toBeGreaterThanOrEqual(3);
    expect(unit.equations.length).toBeGreaterThanOrEqual(2);
    expect(unit.checks.length).toBeGreaterThanOrEqual(2);
    expect(unit.glossary.length).toBeGreaterThan(0);
    expect(unit.focusExperiment.status).toBe('ready');
    expect(unit.labTransfer).toMatchObject({ status: 'ready', sourceUnitId: unit.id });
    expect(unit.review).toMatchObject({
      schemaVerified: true,
      automatedVerified: true,
      sourceChecked: true,
      humanReviewed: false
    });
    expect(unit.review.note.ko).toMatch(/사람|전문가/);
    for (const task of unit.focusExperiment.tasks) {
      for (const part of [task.prediction, task.action, task.expected, task.explanation]) {
        expect(part.ko.length).toBeGreaterThan(15);
        expect(part.en.length).toBeGreaterThan(15);
      }
    }
    for (const citation of unit.references) {
      expect(new URL(citation.url).protocol).toBe('https:');
      expect(citation.locator.en.length).toBeGreaterThan(20);
      expect(citation.accessedOn).toBe('2026-11-04');
    }
    const filename = `content/learn/${unit.courseId}/${unit.id}.ts`;
    const source = readFileSync(filename, 'utf8');
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    expect(source).not.toMatch(/\b(?:eval|Function|setTimeout|Worker|Math)\s*[.(]/);
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) {
        const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
        expect(specifier).not.toMatch(/physics|chaos|research|runtime|workers|adapters/);
      }
      expect(ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)).toBe(false);
    }
  });

  it.each(units.map((unit) => [unit.id, unit] as const))(
    '%s equations have consistent declared SI dimensions',
    (_id, unit) => {
      for (const equation of unit.equations) {
        for (const relation of equation.expression.split(';')) {
          const sides = relation.trim().split(/\s*(?:<=|>=|=|<|>)\s*/);
          expect(sides.length, `${unit.id}/${equation.id}`).toBeGreaterThanOrEqual(2);
          for (let i = 0; i < sides.length - 1; i++) {
            const lhs = sides[i]!;
            const rhs = sides[i + 1]!;
            if (/^-?\d+(?:\.\d+)?$/.test(lhs) || /^-?\d+(?:\.\d+)?$/.test(rhs)) continue;
            expect(dimensionOf(lhs, equation.symbols), `${unit.id}/${equation.id}: ${relation}`).toEqual(
              dimensionOf(rhs, equation.symbols)
            );
          }
        }
      }
    }
  );
});
