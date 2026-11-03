import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { capabilitySeeds, stageForFile, type CapabilitySeed } from './inventory-map';

export interface InventoryItem {
  id: string;
  category: string;
  label: string;
  ownerFile: string;
  futureStage: number | null;
  line: number;
  evidence: string;
  assignment: 'semantic-owner' | 'module-family';
  semanticCapability?: string;
  note?: string;
}

export interface ImportEdge {
  ownerFile: string;
  line: number;
  specifier: string;
  kind: 'import' | 'export' | 'dynamic-import' | 'import-type' | 'asset-url';
  target: string | null;
}

export interface Inventory {
  schemaVersion: 'pendulum-baseline-inventory/v1';
  productVersion: string;
  sourceDigest: string;
  scope: string[];
  files: {
    ownerFile: string;
    sha256: string;
    futureStage: number | null;
    bytes: number;
    assignment: 'semantic-owner' | 'module-family';
  }[];
  capabilities: InventoryItem[];
  facts: InventoryItem[];
  imports: ImportEdge[];
  unresolvedDynamicImports: { ownerFile: string; line: number; expression: string }[];
  errors: string[];
  summary: Record<string, number>;
}

const slash = (value: string): string => value.replaceAll('\\', '/');
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const sourcePattern = /\.(?:[cm]?[jt]sx?)$/;
const scanRoots = [
  'src',
  'scripts',
  'wasm',
  'css',
  'public',
  'tests',
  'e2e',
  'data',
  'config',
  'documents/examples',
  'documents/schemas'
];
const scanRootFiles = [
  'app.html',
  'reviewer.html',
  'package.json',
  'jsr.json',
  'standalone-manifest.json',
  'vite.config.ts',
  'vite.config.lib.ts',
  'vite.config.standalone.ts',
  'vite.config.landing-kernel.ts'
];

/** Only these exact new build guards are outside the legacy command fingerprint. */
function isRedesignHarnessCommand(name: string, command: unknown): boolean {
  return (
    name.startsWith('redesign:') ||
    (['prebuild', 'prebuild:lib', 'prebuild:standalone'].includes(name) && command === 'npm run redesign:catalog:check')
  );
}

/**
 * S04 adds one HTML input and isolates Vite's preload helper from legacy engines.
 * Compare that legacy projection, retaining every other build byte and AST fact.
 * The exact additions are narrow: different targets or build behavior still fail.
 * S22 also permits precisely local blob media for recorded-video observations.
 * Project that additive directive out; keep the frozen S01 fingerprint unchanged.
 * S24 adds one exact reviewer navigation link and one exact lazy route wrapper.
 * Remove only those known bytes; altered routes, labels, imports or console code
 * remain in the legacy fingerprint and AST rather than being silently hidden.
 */
export function legacySourceText(file: string, text: string): string {
  const normalized = text.replaceAll('\r\n', '\n');
  if (file === 'public/_headers') return normalized.replace("; media-src 'self' blob:", '');
  if (file === 'src/reviewer/main.ts')
    return normalized
      .replace(
        "  const researchLink = element('a', undefined, 'Research package');\n" +
          "  researchLink.href = './reviewer.html?view=project#/project';\n" +
          '  nav.append(appLink, paperLink, repoLink, researchLink);',
        '  nav.append(appLink, paperLink, repoLink);'
      )
      .replace(
        'async function startReviewer(): Promise<void> {\n' +
          "  if (window.location.hash === '#/project') {\n" +
          "    const module = await import('./project');\n" +
          '    module.mountResearchReviewer(document);\n' +
          '  } else await render();\n' +
          '}\n\n' +
          'startReviewer().catch((error) => {',
        'render().catch((error) => {'
      );
  if (file !== 'vite.config.ts') return normalized;
  return normalized
    .replace('        "media-src \'self\' blob:",\n', '')
    .replace(
      "      input: {\n        app: 'app.html',\n        next: 'next.html',\n        reviewer: 'reviewer.html'\n      },",
      "      input: {\n        app: 'app.html',\n        reviewer: 'reviewer.html'\n      },"
    )
    .replace(
      "        manualChunks(id: string) {\n          if (id === '\\0vite/preload-helper.js') return 'preload-helper';\n",
      '        manualChunks(id: string) {\n'
    );
}

export function inventoryFiles(root: string): string[] {
  const files: string[] = [];
  function visit(relative: string): void {
    // Keep the frozen legacy baseline separate from the additive product layer and its harnesses.
    if (
      /^(?:src\/product|css\/product|tests\/product|scripts\/redesign|tests\/characterization|e2e\/redesign)(?:\/|$)/.test(
        relative
      )
    )
      return;
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isDirectory()) {
      for (const entry of readdirSync(absolute).sort()) visit(`${relative}/${entry}`);
    } else if (relative !== 'src/reviewer/project.ts' && relative !== 'src/reviewer/project.css') {
      // These two S24 additions have their own product tests. Every other file
      // in the existing reviewer family, including unknown additions, is scanned.
      files.push(relative);
    }
  }
  for (const entry of [...scanRoots, ...scanRootFiles]) visit(entry);
  return [...new Set(files)].sort();
}

function declarationName(node: ts.Node): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    node.name
  )
    return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return undefined;
}

function unwrap(node: ts.Expression): ts.Expression {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))
    return unwrap(node.expression);
  if (ts.isCallExpression(node) && node.expression.getText() === 'Object.freeze' && node.arguments[0])
    return unwrap(node.arguments[0]);
  return node;
}

function literal(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

/** Resolves source extensions, directory barrels and Vite query suffixes without executing modules. */
export function resolveRelativeImport(root: string, ownerFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const clean = specifier.split(/[?#]/)[0]!;
  const absolute = path.resolve(root, path.dirname(ownerFile), clean);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) return null;
  const bases = [absolute];
  if (/\.[cm]?jsx?$/.test(absolute))
    bases.push(absolute.replace(/\.[cm]?jsx?$/, '.ts'), absolute.replace(/\.[cm]?jsx?$/, '.tsx'));
  const candidates = bases.flatMap((base) => [
    base,
    ...['.ts', '.tsx', '.js', '.mjs', '.json', '.d.ts'].map((extension) => base + extension),
    ...['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((index) => path.join(base, index))
  ]);
  const resolved = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return resolved ? slash(path.relative(root, resolved)) : null;
}

function parse(root: string, file: string): ts.SourceFile {
  return ts.createSourceFile(
    path.join(root, file),
    legacySourceText(file, readFileSync(path.join(root, file), 'utf8')),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  );
}

/** No product module is imported/executed. All observations come from files and the TS compiler API. */
export function buildInventory(root: string, seeds: readonly CapabilitySeed[] = capabilitySeeds): Inventory {
  root = path.resolve(root);
  const names = inventoryFiles(root);
  const errors: string[] = [];
  const facts = new Map<string, InventoryItem>();
  const imports: ImportEdge[] = [];
  const unresolvedDynamicImports: Inventory['unresolvedDynamicImports'] = [];
  const sourceFiles = new Map(
    names.filter((file) => sourcePattern.test(file)).map((file) => [file, parse(root, file)])
  );
  const ownership = new Map<string, CapabilitySeed>();
  for (const seed of seeds) if (!ownership.has(seed.ownerFile)) ownership.set(seed.ownerFile, seed);
  const lineOf = (source: ts.SourceFile, node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const add = (
    category: string,
    label: string,
    ownerFile: string,
    line: number,
    evidence: string,
    suffix = label,
    stage = stageForFile(ownerFile)
  ): void => {
    const id = `${category}:${ownerFile}#${suffix}`;
    const semantic = ownership.get(ownerFile);
    if (!facts.has(id))
      facts.set(id, {
        id,
        category,
        label,
        ownerFile,
        futureStage: stage,
        line,
        evidence,
        assignment: semantic ? 'semantic-owner' : 'module-family',
        ...(semantic ? { semanticCapability: semantic.id } : {})
      });
  };

  const files = names.map((ownerFile) => {
    const data = readFileSync(path.join(root, ownerFile));
    // Source text is LF-normalised so Git autocrlf does not change baseline identity.
    const textLike =
      /\.(?:[cm]?[jt]sx?|json|html|css|csv|svg|xml|txt|webmanifest)$/.test(ownerFile) ||
      ownerFile.endsWith('/_headers');
    let normalized = textLike ? Buffer.from(legacySourceText(ownerFile, data.toString('utf8'))) : data;
    if (ownerFile === 'package.json') {
      const manifest = JSON.parse(normalized.toString('utf8')) as Record<string, unknown>;
      const commands = manifest.scripts as Record<string, unknown> | undefined;
      if (commands)
        manifest.scripts = Object.fromEntries(
          Object.entries(commands).filter(([name, command]) => !isRedesignHarnessCommand(name, command))
        );
      normalized = Buffer.from(JSON.stringify(manifest));
    }
    return {
      ownerFile,
      sha256: sha256(normalized),
      futureStage: stageForFile(ownerFile),
      bytes: normalized.byteLength,
      assignment: ownership.has(ownerFile) ? ('semantic-owner' as const) : ('module-family' as const)
    };
  });
  const capabilities = seeds.map((seed): InventoryItem => {
    const source = sourceFiles.get(seed.ownerFile);
    let declaration: ts.Node | undefined;
    if (source) {
      const visit = (node: ts.Node): void => {
        if (declarationName(node) === seed.symbol) declaration ??= node;
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    if (!source || !declaration)
      errors.push(`Missing semantic capability declaration: ${seed.id} => ${seed.ownerFile}#${seed.symbol}`);
    return {
      id: seed.id,
      category: seed.category,
      label: seed.label,
      ownerFile: seed.ownerFile,
      futureStage: seed.futureStage,
      line: source && declaration ? lineOf(source, declaration) : 0,
      evidence: `Declaration ${seed.symbol}`,
      assignment: 'semantic-owner',
      ...(seed.note ? { note: seed.note } : {})
    };
  });

  function edge(source: ts.SourceFile, file: string, node: ts.Node, specifier: string, kind: ImportEdge['kind']): void {
    if (!specifier.startsWith('.')) return;
    const target = resolveRelativeImport(root, file, specifier);
    imports.push({ ownerFile: file, line: lineOf(source, node), specifier, kind, target });
    if (!target) errors.push(`Broken ${kind}: ${file}:${lineOf(source, node)} => ${specifier}`);
  }
  for (const [file, source] of sourceFiles) {
    add(
      file.startsWith('tests/') || file.startsWith('e2e/') ? 'test-module' : 'source-module',
      path.basename(file),
      file,
      1,
      'Complete source scan'
    );
    if (/\.worker\.[jt]s$|^public\/sw\.js$/.test(file)) add('worker', file, file, 1, 'Worker entrypoint');
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && literal(node.moduleSpecifier) !== null)
        edge(source, file, node, literal(node.moduleSpecifier)!, 'import');
      if (ts.isExportDeclaration(node) && literal(node.moduleSpecifier) !== null)
        edge(source, file, node, literal(node.moduleSpecifier)!, 'export');
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && literal(node.argument.literal) !== null)
        edge(source, file, node, literal(node.argument.literal)!, 'import-type');
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const value = literal(node.arguments[0]);
        if (value !== null) edge(source, file, node, value, 'dynamic-import');
        else
          unresolvedDynamicImports.push({
            ownerFile: file,
            line: lineOf(source, node),
            expression: node.getText(source).replaceAll('\r\n', '\n')
          });
      }
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === 'URL' &&
        node.arguments?.[1]?.getText(source) === 'import.meta.url' &&
        literal(node.arguments?.[0]) !== null
      )
        edge(source, file, node, literal(node.arguments?.[0])!, 'asset-url');
      if (file.startsWith('src/')) {
        const name = declarationName(node);
        if (
          name &&
          (ts.isVariableDeclaration(node) ||
            (ts.canHaveModifiers(node) &&
              ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)))
        ) {
          const exported = ts.isVariableDeclaration(node)
            ? ts.isVariableDeclarationList(node.parent) &&
              ts.isVariableStatement(node.parent.parent) &&
              node.parent.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
            : true;
          if (exported) add('exported-declaration', name, file, lineOf(source, node), ts.SyntaxKind[node.kind]);
          if (exported && /(?:preset|fixture)/i.test(name))
            add('preset', name, file, lineOf(source, node), 'Exported preset/fixture declaration');
          if (/schema|storage.*key|db.*version|db.*name/i.test(name))
            add(
              'storage-schema',
              name,
              file,
              lineOf(source, node),
              'Schema/storage declaration candidate (not every item is persisted)'
            );
        }
        if (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) {
          const property = node.name.getText(source).replaceAll(/['"]/g, '');
          const initializer = ts.isPropertyAssignment(node)
            ? node.initializer
            : node.type && ts.isLiteralTypeNode(node.type)
              ? node.type.literal
              : undefined;
          const value = literal(initializer);
          if (/^(?:schema|schemaVersion|formatVersion)$/.test(property) && value)
            add('storage-schema', value, file, lineOf(source, node), `Literal ${property}`, value);
          if (property === 'kind' && value && /(?:Protocol|protocol|Job|worker)/.test(file))
            add('worker-message', value, file, lineOf(source, node), 'Literal protocol discriminator', value);
        }
        if (ts.isCallExpression(node)) {
          const method = ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : node.expression.getText(source);
          const first = literal(node.arguments[0]);
          if (first && ['getItem', 'setItem', 'removeItem', 'openDatabase'].includes(method))
            add('storage-key', first, file, lineOf(source, node), `Literal ${method} call`);
          if (first && ['num', 'str', 'bool', 'numberControl', 'button', 'checkbox', 'selectControl'].includes(method))
            add('control', first, file, lineOf(source, node), `Literal ${method} control declaration/read`);
          if (
            first &&
            ['get', 'set', 'has', 'delete'].includes(method) &&
            /searchParams|params|query/i.test(node.expression.getText(source))
          )
            add('route-parameter', first, file, lineOf(source, node), 'URL/query access');
          if (method === 'publishPublicApi') {
            for (const [index, argument] of node.arguments.entries()) {
              const value = unwrap(argument);
              if (ts.isObjectLiteralExpression(value))
                for (const property of value.properties)
                  if (property.name && !ts.isComputedPropertyName(property.name)) {
                    const key = property.name.getText(source).replaceAll(/['"]/g, '');
                    add(
                      'public-global',
                      index === 0 ? `PendulumLab.${key}` : key,
                      file,
                      lineOf(source, property),
                      index === 0 ? 'publishPublicApi stable member' : 'publishPublicApi legacy alias',
                      key,
                      28
                    );
                  }
            }
          }
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          const name = node.name.text;
          const value = unwrap(node.initializer);
          if (name === 'integratorRegistry' && ts.isObjectLiteralExpression(value)) {
            for (const property of value.properties)
              if (property.name)
                add(
                  'integrator',
                  property.name.getText(source).replaceAll(/['"]/g, ''),
                  file,
                  lineOf(source, property),
                  `Registry ${name}`,
                  property.name.getText(source),
                  7
                );
          }
          if (
            ['SYSTEM_SPEC_KINDS', 'EXPANSION_MODEL_IDS', 'EXPANSION_MODEL_DEFINITIONS'].includes(name) &&
            ts.isArrayLiteralExpression(value)
          ) {
            for (const element of value.elements) {
              let id = literal(element);
              if (ts.isObjectLiteralExpression(element)) {
                const property = element.properties.find(
                  (entry) => ts.isPropertyAssignment(entry) && entry.name.getText(source) === 'id'
                );
                if (property && ts.isPropertyAssignment(property)) id = literal(property.initializer);
              }
              if (id)
                add(
                  'system-registration',
                  id,
                  file,
                  lineOf(source, element),
                  `Registry ${name}`,
                  `${name}:${id}`,
                  capabilities.find((item) => item.id === `system:${id}`)?.futureStage ?? null
                );
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  for (const file of names) {
    if (/^tests\/fixtures\/|\/[^/]*snapshots\/|^data\/|^documents\/examples\//.test(file))
      add('fixture', file, file, 1, 'Fixture/example/observation asset');
    if (!sourcePattern.test(file)) add('asset', path.basename(file), file, 1, 'Complete asset scan');
    if (!/\.(?:html|ts)$/.test(file) || /^(tests|e2e)\//.test(file)) continue;
    const text = legacySourceText(file, readFileSync(path.join(root, file), 'utf8'));
    for (const match of text.matchAll(/<(input|select|textarea|button)\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/g)) {
      if (match[2]!.includes('${')) continue;
      add('control', match[2]!, file, text.slice(0, match.index).split('\n').length, `Literal HTML ${match[1]} id`);
    }
    for (const match of text.matchAll(/\bdata-tab\s*=\s*["']([^"']+)["']/g)) {
      if (match[1]!.includes('${')) continue;
      add(
        'route',
        `?tab=${match[1]}`,
        file,
        text.slice(0, match.index).split('\n').length,
        'Literal HTML data-tab',
        match[1],
        3
      );
    }
  }

  // Resolve every published entrypoint and all named/star re-exports with the TS checker.
  // This is a compiler model, not a runtime import (DOM/worker initialization never runs).
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    allowJs: true,
    resolveJsonModule: true
  };
  const program = ts.createProgram(
    [...sourceFiles.keys()].map((file) => path.join(root, file)),
    options
  );
  const checker = program.getTypeChecker();
  const sourceModule = (file: string): ts.SourceFile | undefined => program.getSourceFile(path.join(root, file));
  const packagePath = path.join(root, 'package.json');
  const pkg = existsSync(packagePath)
    ? (JSON.parse(readFileSync(packagePath, 'utf8')) as {
        version?: string;
        exports?: Record<string, unknown>;
        scripts?: Record<string, string>;
      })
    : {};
  for (const [name, command] of Object.entries(pkg.scripts ?? {})
    .filter(([name, command]) => !isRedesignHarnessCommand(name, command))
    .sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const ownerFile = command.match(/scripts\/[\w./-]+\.(?:ts|mjs|js|py|ps1)/)?.[0] ?? 'package.json';
    add('cli-command', name, ownerFile, 1, `package.json script: ${command}`, name);
  }
  for (const subpath of Object.keys(pkg.exports ?? {}).sort()) {
    const file = subpath === '.' ? 'src/lib.ts' : `src/lib/${subpath.slice(2)}.ts`;
    const source = sourceModule(file);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!source || !symbol) {
      errors.push(`Published entrypoint has no source module: ${subpath} => ${file}`);
      continue;
    }
    add('public-entrypoint', subpath, file, 1, 'package.json exports subpath', subpath, 2);
    for (const entry of checker.getExportsOfModule(symbol)) {
      const target = entry.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry;
      const declarations = target.getDeclarations();
      const declaration = declarations?.find((item) =>
        slash(path.relative(root, item.getSourceFile().fileName)).startsWith('src/')
      );
      if (!declaration) {
        errors.push(`Unresolved public export: ${subpath}#${entry.name}`);
        continue;
      }
      const ownerFile = slash(path.relative(root, declaration.getSourceFile().fileName));
      add(
        'public-api',
        `${subpath}#${entry.name}`,
        ownerFile,
        lineOf(declaration.getSourceFile(), declaration),
        `Published ${file}; ${target.flags & ts.SymbolFlags.Value ? 'runtime value' : 'type only'}`,
        `${subpath}#${entry.name}`,
        stageForFile(ownerFile)
      );
    }
  }
  // A file can resolve while a renamed/deleted named import no longer exists.
  for (const [file] of sourceFiles) {
    const source = sourceModule(file);
    if (!source) continue;
    if (file.startsWith('src/')) {
      const publicMembers = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'publishPublicApi' && node.arguments[0]) {
          const api = checker.getTypeAtLocation(node.arguments[0]);
          for (const property of checker.getPropertiesOfType(api)) {
            add(
              'public-global',
              `PendulumLab.${property.name}`,
              file,
              lineOf(source, node),
              'publishPublicApi member resolved through TypeScript object/spread type',
              property.name,
              28
            );
          }
        }
        ts.forEachChild(node, publicMembers);
      };
      publicMembers(source);
    }
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = literal(statement.moduleSpecifier);
      if (!specifier?.startsWith('.')) continue;
      const targetFile = resolveRelativeImport(root, file, specifier);
      const targetSource = targetFile && sourceModule(targetFile);
      const targetSymbol = targetSource && checker.getSymbolAtLocation(targetSource);
      if (!targetSource || !targetFile || !sourcePattern.test(targetFile)) continue; // CSS/Wasm/JSON assets have no TS export namespace.
      const exported = new Set(
        targetSymbol ? checker.getExportsOfModule(targetSymbol).map((symbol) => symbol.name) : []
      );
      const required: string[] = [];
      if (ts.isImportDeclaration(statement)) {
        if (statement.importClause?.name) required.push('default');
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings))
          required.push(...bindings.elements.map((element) => (element.propertyName ?? element.name).text));
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause))
        required.push(...statement.exportClause.elements.map((element) => (element.propertyName ?? element.name).text));
      for (const name of required)
        if (!exported.has(name))
          errors.push(`Broken named binding: ${file}:${lineOf(source, statement)} => ${specifier}#${name}`);
    }
  }

  const allItems = [...capabilities, ...facts.values()];
  for (const item of allItems) {
    if (!existsSync(path.join(root, item.ownerFile))) errors.push(`Missing owner: ${item.id}`);
    if (item.futureStage === null || item.futureStage < 2 || item.futureStage > 30)
      errors.push(`Orphan item (no future stage): ${item.id}`);
  }
  for (const file of files)
    if (file.futureStage === null) errors.push(`Unassigned source/asset family: ${file.ownerFile}`);
  const ids = capabilities.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate semantic capability IDs');
  const systemIds = new Set(
    capabilities.filter((item) => item.category === 'system').map((item) => item.id.slice('system:'.length))
  );
  for (const item of facts.values())
    if (item.category === 'system-registration' && !systemIds.has(item.label))
      errors.push(`Orphan registered system: ${item.id}`);
  const summary: Record<string, number> = {
    files: files.length,
    filesWithSemanticOwner: files.filter((file) => file.assignment === 'semantic-owner').length,
    filesWithModuleFamilyAssignment: files.filter((file) => file.assignment === 'module-family').length,
    semanticCapabilities: capabilities.length,
    facts: facts.size,
    relativeImports: imports.length,
    brokenImports: errors.filter((error) => error.startsWith('Broken ')).length,
    orphans: errors.filter((error) => /Orphan|Unassigned|Missing owner|Missing semantic/.test(error)).length,
    unresolvedDynamicImports: unresolvedDynamicImports.length
  };
  for (const item of capabilities)
    summary[`capability:${item.category}`] = (summary[`capability:${item.category}`] ?? 0) + 1;
  for (const item of facts.values()) summary[`fact:${item.category}`] = (summary[`fact:${item.category}`] ?? 0) + 1;
  return {
    schemaVersion: 'pendulum-baseline-inventory/v1',
    productVersion: pkg.version ?? 'unknown',
    sourceDigest: sha256(files.map((file) => `${file.ownerFile}\0${file.sha256}`).join('\n')),
    scope: [...scanRoots, ...scanRootFiles],
    files,
    capabilities: capabilities.sort((a, b) => a.id.localeCompare(b.id, 'en')),
    facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    imports: imports.sort(
      (a, b) =>
        a.ownerFile.localeCompare(b.ownerFile, 'en') || a.line - b.line || a.specifier.localeCompare(b.specifier, 'en')
    ),
    unresolvedDynamicImports,
    errors: [...new Set(errors)].sort(),
    summary
  };
}

/** One record per line keeps the exhaustive machine artifact reviewable in Git. */
export function serializeInventory(inventory: Inventory): string {
  return `{\n${Object.entries(inventory)
    .map(
      ([key, value]) =>
        `  ${JSON.stringify(key)}: ${Array.isArray(value) ? `[\n${value.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]` : JSON.stringify(value)}`
    )
    .join(',\n')}\n}\n`;
}

export function inventoryMarkdown(inventory: Inventory): string {
  const lines = [
    '# S01 기능 보존 인벤토리',
    '',
    `제품 버전: ${inventory.productVersion}. 원본 집합 SHA-256: \`${inventory.sourceDigest}\`.`,
    '',
    '이 문서는 `scripts/redesign/inventory.ts --write`가 생성한다. 기본 실행과 `--check`는 읽기 전용이다. 제품 모듈을 실행하지 않고 TypeScript AST, 타입 검사기의 export 해석, 파일 내용을 조사한다.',
    '',
    '## 범위와 해석',
    '',
    '- `capabilities`는 소유 선언을 직접 지정한 의미 단위다. 여러 알고리즘을 한 기능으로 묶기도 하며, 서로 다른 표현/사용 경로를 분리하기도 한다. 기능 수를 시스템 registry 개수와 혼동하지 않는다.',
    '- `facts`는 모든 소스 모듈, export 선언, 공개 API, literal 제어/URL/schema, registry 항목, worker 메시지, preset, 기존 테스트와 fixture 자산의 기계 관찰이다. 함수 하나나 파일 하나가 사용자 기능 하나라는 주장이 아니다.',
    '- 각 항목의 ownerFile/line은 기존 구현 근거이며 futureStage는 재설계 연결 책임이다. 모든 기존 항목은 최종 S28 동등성 심사 대상이다. stage 지정은 새 기능 구현이나 동등성 통과를 의미하지 않는다.',
    '- src 전체(단수 worker 및 wasm 포함), 기존 CLI/검증 scripts, wasm 원본, CSS/PWA, 기존 HTML, 패키지/빌드/설정, tests/e2e의 데이터와 이미지, 실험 데이터 및 문서 예제/schema를 포함한다. S01 자체의 scripts/redesign, tests/characterization과 e2e/redesign은 순환 snapshot 방지를 위해 제외한다. package.json은 redesign:* 실행 별칭만 제외하고 기존 CLI 명령/API/의존성 manifest를 hash한다.',
    '- assignment=semantic-owner는 명시적 기능의 소유 파일이며 module-family는 검토된 기존 디렉터리/파일 패턴의 연결 책임 배정이다. 후자는 개별 사용자 기능을 의미론적으로 검토했다는 표시가 아니다. 두 수를 분리해 보고하며 알려지지 않은 src 디렉터리는 실패한다.',
    '- 동적으로 조립한 control ID, URL, 외부 모듈명은 literal 목록만으로 완전 증명할 수 없다. 전체 모듈/공개 선언 소유권과 기존 런타임 테스트를 보조 증거로 보존한다. 네트워크 주소와 사용자 데이터는 읽지 않는다.',
    '- 정적/리터럴 동적 relative import, type import, new URL 자산과 named binding을 검사한다. 생성된 dist, reports의 과거 측정값, node_modules, 배포 산출물은 제품 원본 인벤토리에 중복 포함하지 않는다.',
    '',
    '## 자동 검사',
    '',
    '| 항목 | 개수 |',
    '|---|---:|',
    ...Object.entries(inventory.summary).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## 의미 단위와 연결 책임',
    '',
    '| ID | 기능 | 구현 소유 선언 | 단계 | 현재 제한 |',
    '|---|---|---|---:|---|',
    ...inventory.capabilities.map(
      (item) =>
        `| ${item.id} | ${item.label} | [${item.ownerFile}:${item.line}](../../../${item.ownerFile}) — ${item.evidence} | S${String(item.futureStage).padStart(2, '0')} | ${item.note ?? ''} |`
    ),
    '',
    '## 검사 오류',
    '',
    ...(inventory.errors.length
      ? inventory.errors.map((error) => `- ${error}`)
      : ['없음. 소유권/향후 단계 누락 0, 깨진 relative import/named binding 0.']),
    '',
    '## 리터럴로 해석되지 않은 동적 import',
    '',
    ...(inventory.unresolvedDynamicImports.length
      ? inventory.unresolvedDynamicImports.map((item) => `- ${item.ownerFile}:${item.line}: \`${item.expression}\``)
      : ['없음.']),
    '',
    '상세 필드/공개 심볼/legacy control ID/저장 schema/worker 메시지/fixture 목록과 원본 hash는 [inventory.json](inventory.json)에 있다. 내용 검토는 자동·소스 확인이며 사람/물리 전문가 검토 완료로 표시하지 않는다.',
    ''
  ];
  return lines.join('\n');
}

function main(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const inventory = buildInventory(root);
  const json = serializeInventory(inventory);
  const markdown = inventoryMarkdown(inventory);
  const jsonPath = path.join(root, 'documents/redesign/baseline/inventory.json');
  const markdownPath = path.join(root, 'documents/redesign/baseline/inventory.md');
  if (process.argv.includes('--write')) {
    if (inventory.errors.length)
      throw new Error(`Inventory is invalid; refusing to replace baseline:\n${inventory.errors.join('\n')}`);
    writeFileSync(jsonPath, json);
    writeFileSync(markdownPath, markdown);
  } else if (process.argv.includes('--check')) {
    for (const [file, expected] of [
      [jsonPath, json],
      [markdownPath, markdown]
    ] as const)
      if (!existsSync(file) || readFileSync(file, 'utf8').replaceAll('\r\n', '\n') !== expected)
        inventory.errors.push(`Baseline stale: ${slash(path.relative(root, file))}`);
  }
  process.stdout.write(`${JSON.stringify({ ...inventory.summary, errors: inventory.errors }, null, 2)}\n`);
  if (inventory.errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
