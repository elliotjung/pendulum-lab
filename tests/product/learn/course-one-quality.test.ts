import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { courses } from '../../../content/learn/curriculum';
import { learnModules } from '../../../content/learn/modules';
import { PLANAR_FIELDS } from '../../../src/product/adapters/physics/planar-schema';
import { loadLearnUnit } from '../../../src/product/learn/loader';
import type { EquationBlock, LearnUnit } from '../../../src/product/learn/schema';
import { validateLearnUnit } from '../../../src/product/learn/validation';

const units = await Promise.all(
  Array.from({ length: 8 }, async (_, i) => {
    const result = await loadLearnUnit('course-1', `1.${i + 1}`);
    if (result.status !== 'ready') throw new Error(`Unit 1.${i + 1} is not ready.`);
    return result.unit;
  })
);

/** Test-only dimensional algebra: never evaluates the authored physics or feeds a simulation. */
type Dimension = readonly [mass: number, length: number, time: number];
const scalar: Dimension = [0, 0, 0];
const dimensions: Readonly<Record<string, Dimension>> = {
  '1': scalar,
  rad: scalar,
  kg: [1, 0, 0],
  m: [0, 1, 0],
  s: [0, 0, 1],
  'rad/s': [0, 0, -1],
  'rad/s^2': [0, 0, -2],
  's^-1': [0, 0, -1],
  'm/s': [0, 1, -1],
  'm/s^2': [0, 1, -2],
  'kg*m^2': [1, 2, 0],
  'kg*m^2/s': [1, 2, -1],
  J: [1, 2, -2]
};
function dimensionOf(source: string, symbols: EquationBlock['symbols']): Dimension {
  const parsed = ts.createSourceFile('quantity.ts', `(${source.replaceAll('^', '**')})`, ts.ScriptTarget.Latest);
  const statement = parsed.statements[0];
  if (!statement || !ts.isExpressionStatement(statement)) throw new Error('Expected an arithmetic expression.');
  function visit(node: ts.Expression): Dimension {
    if (ts.isParenthesizedExpression(node)) return visit(node.expression);
    if (ts.isNumericLiteral(node)) return scalar;
    if (ts.isIdentifier(node)) {
      const unit = symbols.find((entry) => entry.symbol === node.text)?.unit;
      const dimension = unit && dimensions[unit];
      if (!dimension) throw new Error(`No dimension for ${node.text} (${unit}).`);
      return dimension;
    }
    if (ts.isPrefixUnaryExpression(node)) return visit(node.operand);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length === 1) {
      const arg = visit(node.arguments[0]!);
      if (node.expression.text === 'abs') return arg;
      if (node.expression.text === 'sqrt') return arg.map((v) => v / 2) as unknown as Dimension;
      expect(['sin', 'cos', 'exp', 'log']).toContain(node.expression.text);
      expect(arg, source).toEqual(scalar);
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
          return lhs.map((v, i) => v + rhs[i]!) as unknown as Dimension;
        case ts.SyntaxKind.SlashToken:
          return lhs.map((v, i) => v - rhs[i]!) as unknown as Dimension;
        case ts.SyntaxKind.AsteriskAsteriskToken: {
          const power = Number(node.right.getText(parsed));
          if (!Number.isFinite(power)) throw new Error('Expected constant exponent.');
          return lhs.map((v) => v * power) as unknown as Dimension;
        }
      }
    }
    throw new Error(`Unexpected arithmetic syntax in ${source}.`);
  }
  return visit(statement.expression);
}

function assertLiteralData(node: ts.Expression): void {
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      expect(ts.isPropertyAssignment(property), 'Data may not contain methods or spreads.').toBe(true);
      if (ts.isPropertyAssignment(property)) assertLiteralData(property.initializer);
    }
  } else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(assertLiteralData);
  else if (ts.isPrefixUnaryExpression(node)) {
    expect(node.operator).toBe(ts.SyntaxKind.MinusToken);
    expect(ts.isNumericLiteral(node.operand)).toBe(true);
  } else {
    expect(
      ts.isStringLiteral(node) ||
        ts.isNumericLiteral(node) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind),
      'Authored lessons must contain only literal data.'
    ).toBe(true);
  }
}

describe('S09 complete course-one authoring quality', () => {
  it('publishes precisely the requested eight units with unique questions and focused experiments', () => {
    expect(Object.keys(learnModules)).toEqual(units.map((unit) => `course-1/${unit.id}`));
    expect(courses.slice(1).every((course) => course.units.every((unit) => unit.availability === 'planned'))).toBe(
      true
    );
    expect(new Set(units.map((unit) => unit.summary.ko)).size).toBe(8);
    expect(units.map((unit) => unit.focusExperiment.kind)).toEqual([
      'configuration',
      'kinematics',
      'energy-matrix',
      'lagrange',
      'term-balance',
      'normal-modes',
      'energy-exchange',
      'sensitivity'
    ]);
  });

  it.each(units.map((unit) => [unit.id, unit] as const))(
    '%s has complete bilingual inquiry, evidence and declarative executable coverage',
    (_id, unit) => {
      expect(validateLearnUnit(unit)).toEqual({ ok: true, value: unit });
      expect(unit.kind).toBe('published');
      expect(unit.concepts.some((concept) => concept.id === 'synthesis')).toBe(true);
      expect(unit.glossary.length).toBeGreaterThan(0);
      expect(unit.prerequisites[0]?.body.ko).toContain('고정 지지점');
      expect(unit.focusExperiment.status).toBe('ready');
      expect(unit.labTransfer.status).toBe('ready');
      const declared = [...unit.focusExperiment.exposedFields, ...unit.focusExperiment.fixedFields.map((f) => f.id)];
      expect([...declared].sort()).toEqual(PLANAR_FIELDS.map((f) => f.id).sort());
      for (const task of unit.focusExperiment.tasks) {
        for (const part of [task.prediction, task.action, task.expected, task.explanation]) {
          expect(part.ko.length).toBeGreaterThan(15);
          expect(part.en.length).toBeGreaterThan(15);
        }
        expect(task.expected.en).toMatch(/within|below|tolerance/);
      }
      expect(unit.review).toMatchObject({
        schemaVerified: true,
        automatedVerified: true,
        sourceChecked: true,
        humanReviewed: false
      });
      expect(unit.review.note.ko).toContain('아직 완료되지 않았습니다');
      for (const reference of unit.references) {
        expect(['www.damtp.cam.ac.uk', 'underactuated.mit.edu', 'materias.df.uba.ar', 'github.com']).toContain(
          new URL(reference.url).hostname
        );
        expect(reference.locator.en.length).toBeGreaterThan(40);
        expect(reference.accessedOn).toBe('2026-09-14');
      }
      const path = `content/learn/course-1/${unit.id}.ts`;
      const module = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of module.statements) {
        if (ts.isImportDeclaration(statement)) expect(statement.importClause?.isTypeOnly).toBe(true);
        else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            expect(declaration.initializer).toBeDefined();
            assertLiteralData(declaration.initializer!);
          }
        } else expect(ts.isExportAssignment(statement)).toBe(true);
      }
    }
  );

  it.each(units.map((unit) => [unit.id, unit] as const))(
    '%s equations preserve declared SI dimensions',
    (_id, unit) => {
      for (const equation of unit.equations) {
        for (const relation of equation.expression.split(';')) {
          const sides = relation.trim().split(/\s*[=<>]\s*/);
          expect(sides.length).toBeGreaterThanOrEqual(2);
          // A bare numerical constant inherits its declared quantity unit, e.g. tau = 1 s;
          // zero on a balance equation is valid in every dimension.
          for (let i = 0; i < sides.length - 1; i += 1) {
            const left = sides[i]!;
            const right = sides[i + 1]!;
            if (/^-?\d+(\.\d+)?$/.test(left) || /^-?\d+(\.\d+)?$/.test(right)) continue;
            expect(dimensionOf(left, equation.symbols), `${unit.id}/${equation.id}: ${relation}`).toEqual(
              dimensionOf(right, equation.symbols)
            );
          }
        }
      }
    }
  );

  it('keeps earlier saved 1.1 checkpoint identities, answers and version intact', () => {
    const unit = units[0]!;
    expect(unit.contentVersion).toBe(1);
    expect(unit.checks.map((check) => [check.id, check.correctOptionId])).toEqual([
      ['coordinates', 'two'],
      ['downward-position', 'below']
    ]);
  });

  it('marks the energy-reference conversion and the finite-time sensitivity limitation explicitly', () => {
    const energy = units[6]!;
    expect(energy.equations.some((eq) => eq.expression.includes('Eshift = E-Emin'))).toBe(true);
    expect(energy.focusExperiment.tasks[0]?.expected.en).toContain('minus hanging-equilibrium energy');
    const sensitivity = units[7]!;
    expect(sensitivity.concepts.some((block) => block.body.en.includes('slightly changes energy'))).toBe(true);
    expect(sensitivity.concepts.some((block) => block.body.en.includes('does not prove infinite-time chaos'))).toBe(
      true
    );
    expect(sensitivity.references[0]?.locator.en).toContain('notes 8, 12, 26');
  });
});

describe('S09 executable declaration guards', () => {
  function edited(index: number, change: (unit: LearnUnit) => unknown) {
    const clone = structuredClone(units[index]!);
    return change(clone);
  }
  it.each([
    [
      'wrong experiment kind',
      0,
      (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, kind: 'sensitivity' } })
    ],
    ['missing inquiry', 0, (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, tasks: [] } })],
    [
      'missing kinematics angle plot',
      1,
      (unit: LearnUnit) => ({ ...unit, focusExperiment: { ...unit.focusExperiment, plotIds: ['cartesian'] } })
    ],
    [
      'movable damping',
      0,
      (unit: LearnUnit) => ({
        ...unit,
        focusExperiment: {
          ...unit.focusExperiment,
          exposedFields: [...unit.focusExperiment.exposedFields, 'gamma'],
          fixedFields: unit.focusExperiment.fixedFields.filter((field) => field.id !== 'gamma')
        }
      })
    ],
    [
      'variable normal-mode mass',
      5,
      (unit: LearnUnit) => ({
        ...unit,
        focusExperiment: {
          ...unit.focusExperiment,
          exposedFields: [...unit.focusExperiment.exposedFields, 'm1'],
          fixedFields: unit.focusExperiment.fixedFields.filter((field) => field.id !== 'm1')
        }
      })
    ],
    [
      'unimplemented compound focus',
      0,
      (unit: LearnUnit) => ({
        ...unit,
        focusExperiment: { ...unit.focusExperiment, systemId: 'system:compound-double' },
        labTransfer: { ...unit.labTransfer, systemId: 'system:compound-double' }
      })
    ],
    [
      'oversized instruction run',
      0,
      (unit: LearnUnit) => ({
        ...unit,
        focusExperiment: {
          ...unit.focusExperiment,
          fixedFields: unit.focusExperiment.fixedFields.map((field) =>
            field.id === 'duration' ? { ...field, value: 21 } : field
          ),
          defaultPreset: {
            ...unit.focusExperiment.defaultPreset,
            fields: unit.focusExperiment.defaultPreset.fields.map((field) =>
              field.id === 'duration' ? { ...field, value: 21 } : field
            )
          }
        }
      })
    ]
  ] as const)('rejects %s before publication', (_label, index, change) => {
    expect(validateLearnUnit(edited(index, change)).ok).toBe(false);
  });
});
