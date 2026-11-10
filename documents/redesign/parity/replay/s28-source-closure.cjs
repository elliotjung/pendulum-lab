const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const seen=new Map();
function resolveLocal(from,specifier){
 if(!specifier.startsWith('.')) return undefined;
 const absolute=path.resolve(path.dirname(from),specifier.split('?')[0]);
 const options=[absolute,absolute+'.ts',absolute+'.tsx',absolute+'.d.ts',absolute+'.js',absolute+'.json',path.join(absolute,'index.ts'),path.join(absolute,'index.js'),...(absolute.endsWith('.js')?[absolute.slice(0,-3)+'.ts']:[])];
 const selected=options.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
 if(!selected)throw Error(`Unresolved policy import ${from}: ${specifier}`);
 const relative=path.relative(process.cwd(),selected).replaceAll('\\','/');
 if(relative.startsWith('../'))throw Error('Escaped policy source root');
 return relative;
}
function direct(file){
 if(seen.has(file))return seen.get(file);
 const references=new Set();
 if(/\.[cm]?[jt]sx?$/.test(file)){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function walk(node){
   let specifier;
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))specifier=node.moduleSpecifier.text;
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]))specifier=node.arguments[0].text;
   if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'&&node.arguments?.[0]&&ts.isStringLiteralLike(node.arguments[0]))specifier=node.arguments[0].text;
   if(specifier){const resolved=resolveLocal(file,specifier);if(resolved)references.add(resolved)}
   ts.forEachChild(node,walk);
  }
  walk(source);
 }
 const result=[...references].sort();seen.set(file,result);return result;
}
exports.closure=function closure(entries){
 const found=new Set();
 function visit(file){if(found.has(file))return;if(!fs.existsSync(file))throw Error(`Missing policy source ${file}`);found.add(file);direct(file).forEach(visit)}
 entries.forEach(visit);return [...found].sort();
};
