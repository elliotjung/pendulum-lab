import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { courses } from '../../../content/learn/curriculum';
import { learnModules } from '../../../content/learn/modules';
import type { EquationBlock, LearnUnit } from '../../../src/product/learn/schema';
import { validateLearnUnit } from '../../../src/product/learn/validation';
const ids = [
  ...Array.from({ length: 12 }, (_, i) => `6.${i + 1}`),
  ...Array.from({ length: 13 }, (_, i) => `7.${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `8.${i + 1}`)
];
const units = await Promise.all(
  ids.map(async (id) => {
    return (await learnModules[`course-${id[0]}/${id}`]!()).default as LearnUnit;
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

describe('S27 complete bifurcation extended systems and research curricula', () => {
  it('publishes all37 new units and exactly86 total with no reserved content', () => {
    expect(units.map((u) => u.id)).toEqual(ids);
    expect(Object.keys(learnModules)).toHaveLength(86);
    expect(courses.every((c) => c.units.every((u) => u.availability === 'published'))).toBe(true);
    expect(new Set(units.map((u) => u.summary.ko)).size).toBe(37);
    expect(new Set(units.map((u) => u.focusExperiment.tasks[0]?.prediction.ko)).size).toBe(37);
  });
  it.each(units.map((u) => [u.id, u] as const))(
    '%s provides a sourced bilingual inquiry, failure case and two checks',
    (_id, u) => {
      expect(validateLearnUnit(u)).toEqual({ ok: true, value: u });
      expect(u.kind).toBe('published');
      expect(u.objectives.length).toBeGreaterThanOrEqual(2);
      expect(u.concepts.length).toBeGreaterThanOrEqual(3);
      expect(u.equations.length).toBeGreaterThanOrEqual(2);
      expect(u.checks.length).toBeGreaterThanOrEqual(2);
      expect(u.glossary.length).toBeGreaterThan(0);
      expect(u.review).toMatchObject({
        schemaVerified: true,
        automatedVerified: true,
        sourceChecked: true,
        humanReviewed: false
      });
      expect(u.review.note.ko).toMatch(/사람|전문가/);
      expect(u.concepts.map((c) => `${c.title.ko} ${c.body.ko}`).join(' ')).toMatch(
        /실패|한계|오판|불안정|오해|유한|편향|불연속/
      );
      for (const task of u.focusExperiment.tasks)
        for (const part of [task.prediction, task.action, task.expected, task.explanation]) {
          expect(part.ko.length).toBeGreaterThan(15);
          expect(part.en.length).toBeGreaterThan(15);
        }
      for (const c of u.references) {
        expect(new URL(c.url).protocol).toBe('https:');
        expect(c.locator.en.length).toBeGreaterThan(20);
        expect(c.accessedOn).toBe('2026-11-05');
      }
      const file = `content/learn/${u.courseId}/${u.id}.ts`,
        source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\b(?:eval|Function|setTimeout|Worker|Math)\s*[.(]/);
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const statement of ast.statements) {
        if (ts.isImportDeclaration(statement))
          expect((statement.moduleSpecifier as ts.StringLiteral).text).not.toMatch(/physics|runtime|workers|adapters/);
        expect(ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)).toBe(false);
      }
    }
  );
  it.each(units.map((u) => [u.id, u] as const))('%s rejects rebinding and changed hidden conditions', (_id, u) => {
    expect(
      validateLearnUnit({
        ...u,
        focusExperiment: { ...u.focusExperiment, kind: 'configuration', plotIds: ['configuration'] }
      }).ok
    ).toBe(false);
    expect(validateLearnUnit({ ...u, focusExperiment: { ...u.focusExperiment, exposedFields: ['unknown'] } }).ok).toBe(
      false
    );
    expect(
      validateLearnUnit({
        ...u,
        focusExperiment: {
          ...u.focusExperiment,
          defaultPreset: {
            ...u.focusExperiment.defaultPreset,
            fields: u.focusExperiment.defaultPreset.fields.map((f, i) => (i ? f : { ...f, value: f.value + 0.1 }))
          }
        }
      }).ok
    ).toBe(false);
  });
  it.each(units.map((u) => [u.id, u] as const))('%s derives dimensionally consistent equations', (_id, u) => {
    for (const e of u.equations)
      for (const relation of e.expression.split(';')) {
        const sides = relation.trim().split(/\s*(?:<=|>=|=|<|>)\s*/);
        expect(sides.length, `${u.id}/${e.id}`).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < sides.length - 1; i++) {
          const lhs = sides[i]!,
            rhs = sides[i + 1]!;
          if (/^-?\d+(?:\.\d+)?$/.test(lhs) || /^-?\d+(?:\.\d+)?$/.test(rhs)) continue;
          expect(dimensionOf(lhs, e.symbols), `${u.id}/${e.id}: ${relation}`).toEqual(dimensionOf(rhs, e.symbols));
        }
      }
  });
});
