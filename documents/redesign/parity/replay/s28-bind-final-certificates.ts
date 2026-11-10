/** Final-only binder. It never converts historical reports into captures. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { evidenceHash, evidencePath, sourceHash, type EvidenceDigest, type ParityExecutionCapture } from '../scripts/redesign/parity-capture';
import { parseRunnerReport, runnerCaseKey, runnerRelativePath, type RunnerCase } from '../scripts/redesign/parity-runner-report';
import { validateParityCertificates, validatePreservationCases, type ParityCertificateBundle, type ParityCertificatePolicy, type ParityCaseEvidence } from '../scripts/redesign/parity-certificate';
import { extractEmbeddedArtifact } from '../scripts/redesign/parity-artifacts';
import { requiredPreservationCases } from '../scripts/redesign/parity-preservation';
import { parseZip } from '../src/research/zipBundle';

const root=process.cwd(), taskRequire=createRequire(import.meta.url);
const outputRoot=process.env.S28_CERTIFICATE_OUTPUT??'documents/redesign/parity';
if(outputRoot!=='documents/redesign/parity'&&!outputRoot.startsWith('tmp/'))throw Error('Replay output must use a fresh tmp directory.');
evidencePath(root,outputRoot);
const artifactRoot=outputRoot==='documents/redesign/parity'?'documents/redesign/parity/evidence/exports':`${outputRoot}/exports`;
const {closure}=taskRequire('./s28-source-closure.cjs') as {closure:(entries:string[])=>string[]};
const read=(file:string)=>JSON.parse(fs.readFileSync(evidencePath(root,file),'utf8'));
const plan=read('tmp/S28-certificate-case-plan.json');
const policy=read('documents/redesign/parity/S28-certificate-policy.json') as ParityCertificatePolicy;
if(plan.missing.length||plan.summary.rowsWithAllFourFacets!==134||policy.rowIds.length!==134)
 throw Error('The reviewed candidate/policy plan is incomplete.');
const executionPlanPath=process.env.S28_BROWSER_CAPTURE_PLAN??'tmp/S28-final-browser-capture-plan-r2.json';
const executionPlan=read(executionPlanPath);
const browserGroups=executionPlan.groups;
if(executionPlan.schema!=='pendulum-s28-browser-capture-plan/v1'||!Array.isArray(browserGroups)||!browserGroups.length||
 typeof executionPlan.frozenBuildRoot!=='string'||typeof executionPlan.buildCapturePath!=='string')
 throw Error('A reviewed complete browser group manifest and frozen build are required.');
const captures:({id:string}&EvidenceDigest)[]=[];
const configurationReceipts:{captureId:string;capture:EvidenceDigest;report:EvidenceDigest;configuration:EvidenceDigest;reportConfigFile:string;verification:string}[]=[];
const reports=new Map<string,readonly RunnerCase[]>();
const browserCaptureByCase=new Map<string,string>();
const groupIds=new Set<string>(),capturePaths=new Set<string>(),reportPaths=new Set<string>(),runNames=new Set<string>(),fileAssignments=new Set<string>();
const expectedTotals=new Map<string,number>();
const liveSourceHashes=new Map<string,string>();
function liveHash(file:string){if(!liveSourceHashes.has(file))liveSourceHashes.set(file,sourceHash(root,file));return liveSourceHashes.get(file)!;}
/** Snapshot bytes belong to their test file, including every project and nested asset. */
function snapshotSourcePaths(files:string[]):string[]{
 const dependencies=new Set<string>();
 function visit(relative:string){
  const absolute=evidencePath(root,relative),stat=fs.lstatSync(absolute);
  if(stat.isSymbolicLink())throw Error(`Snapshot source refuses symbolic links: ${relative}`);
  if(stat.isDirectory())for(const name of fs.readdirSync(absolute).sort())visit(`${relative}/${name}`);
  else if(stat.isFile())dependencies.add(relative);
  else throw Error(`Unsupported snapshot source type: ${relative}`);
 }
 for(const file of files){const directory=`${file}-snapshots`;if(fs.existsSync(evidencePath(root,directory)))visit(directory);}
 return [...dependencies].sort();
}
function testAndSnapshotClosure(files:string[]):string[]{return [...new Set([...closure(files),...snapshotSourcePaths(files)])].sort();}
function loadExecution(id:string,file:string,kind:'vitest'|'playwright',expectedReportPath?:string){
 const bytes=fs.readFileSync(evidencePath(root,file)),capture=JSON.parse(bytes.toString('utf8')) as ParityExecutionCapture;
 if(!capture.valid||capture.exitCode!==0||capture.errors.length||!capture.report)
  throw Error(`No successful fresh final capture for ${id}.`);
 if(capture.kind!==kind||expectedReportPath&&capture.report.path!==expectedReportPath)throw Error('Unexpected final runner kind or report path.');
 const raw=fs.readFileSync(evidencePath(root,capture.report.path));
 if(evidenceHash(raw)!==capture.report.sha256)throw Error('Final report bytes changed.');
 const rawReport=JSON.parse(raw.toString('utf8'));
 const parsed=parseRunnerReport(root,kind,rawReport);
 if(parsed.errors.length)throw Error(parsed.errors.join('\n'));
 if(kind==='playwright'){
  const actualConfigs=capture.command.flatMap((argument,index)=>argument.startsWith('--config=')?[argument.slice('--config='.length)]:argument==='--config'?[capture.command[index+1]]:[]);
  if(actualConfigs.length!==1||typeof actualConfigs[0]!=='string'||!actualConfigs[0]||actualConfigs[0].startsWith('--'))
   throw Error(`Browser capture ${id} must declare exactly one actual config argument.`);
  const configurationPath=runnerRelativePath(root,actualConfigs[0]);
  evidencePath(root,configurationPath);
  const reportConfigFile=rawReport?.config?.configFile;
  if(typeof reportConfigFile!=='string'||runnerRelativePath(root,reportConfigFile)!==configurationPath)
   throw Error(`Browser capture ${id} actual command and raw report config paths disagree.`);
  const capturedConfigurations=capture.sources.filter(source=>source.path===configurationPath);
  const currentConfigurationSha256=liveHash(configurationPath);
  if(capturedConfigurations.length!==1||capturedConfigurations[0]!.sha256!==currentConfigurationSha256)
   throw Error(`Browser capture ${id} actual config bytes are stale or uncaptured: ${configurationPath}`);
  configurationReceipts.push({captureId:id,capture:{path:file,sha256:evidenceHash(bytes)},report:capture.report,configuration:{path:configurationPath,sha256:currentConfigurationSha256},reportConfigFile,verification:'Producer precheck: exact actual command config path equals unchanged raw report configFile; its uniquely captured LF-normalized SHA-256 equals current config bytes. The independent core certificate validator does not separately repeat this current-config precheck.'});
 }
 captures.push({id,path:file,sha256:evidenceHash(bytes)});reports.set(id,parsed.cases);
 return {capture,cases:parsed.cases};
}
loadExecution('unit',process.env.S28_UNIT_CAPTURE??'documents/redesign/parity/evidence/final-parity-unit.capture.json','vitest');
for(const group of browserGroups){
 if(!group||typeof group.id!=='string'||!group.id||group.id==='unit'||groupIds.has(group.id)||
  !['chromium','mobile-chrome'].includes(group.project)||!Array.isArray(group.files)||!group.files.length||
  new Set(group.files).size!==group.files.length||group.files.some((file:unknown)=>typeof file!=='string'||!/^e2e\/.+\.spec\.ts$/.test(file))||
  typeof group.capturePath!=='string'||typeof group.reportPath!=='string'||
  !group.capturePath.startsWith('documents/redesign/parity/evidence/')||!group.reportPath.startsWith('documents/redesign/parity/evidence/')||
  capturePaths.has(group.capturePath)||reportPaths.has(group.reportPath)||
  typeof group.runName!=='string'||!group.runName||runNames.has(group.runName)||
  !Number.isSafeInteger(group.expectedCases)||group.expectedCases<=0)
  throw Error('Malformed or duplicate browser capture group.');
 groupIds.add(group.id);capturePaths.add(group.capturePath);reportPaths.add(group.reportPath);runNames.add(group.runName);
 for(const file of group.files){const key=JSON.stringify([file,group.project]);if(fileAssignments.has(key))throw Error(`A browser file is assigned twice: ${key}`);fileAssignments.add(key);}
 expectedTotals.set(group.project,(expectedTotals.get(group.project)??0)+group.expectedCases);
 const actual=loadExecution(group.id,group.capturePath,'playwright',group.reportPath);
 if(actual.capture.build?.root!==executionPlan.frozenBuildRoot||actual.capture.buildCapture?.path!==executionPlan.buildCapturePath)
  throw Error(`Group ${group.id} is not bound to the one reviewed frozen production build.`);
 if(actual.cases.length!==group.expectedCases)throw Error(`Group ${group.id} expected ${group.expectedCases} actual cases, got ${actual.cases.length}.`);
 const capturedSources=new Map(actual.capture.sources.map(source=>[source.path,source.sha256]));
 const currentTestClosure=testAndSnapshotClosure(group.files);
 for(const source of currentTestClosure)if(capturedSources.get(source)!==liveHash(source))throw Error(`Group ${group.id} has stale or uncaptured test/helper/snapshot dependency: ${source}`);
 const actualKeys=new Set<string>();
 for(const test of actual.cases){
  if(test.project!==group.project||!group.files.includes(test.file))throw Error(`Unexpected file/project in group ${group.id}.`);
  const key=runnerCaseKey(test);
  if(actualKeys.has(key)||browserCaptureByCase.has(key))throw Error(`Duplicate exact browser case across the group manifest: ${key}`);
  actualKeys.add(key);browserCaptureByCase.set(key,group.id);
 }
 for(const file of group.files)if(!actual.cases.some(test=>test.file===file))throw Error(`Declared browser file has no actual executed case: ${group.id}/${file}`);
 const expectedIdentities=group.expectedCaseIdentities??executionPlan.collectionCases?.filter((test:any)=>test.project===group.project&&group.files.includes(test.file));
 if(!Array.isArray(expectedIdentities)||expectedIdentities.length!==group.expectedCases)
  throw Error(`Group ${group.id} needs the exact collected expected case identities.`);
 const expectedKeys=new Set(expectedIdentities.map((test:any)=>runnerCaseKey(test)));
 if(expectedKeys.size!==expectedIdentities.length||expectedIdentities.some((test:any)=>test.project!==group.project||!group.files.includes(test.file))||
  expectedKeys.size!==actualKeys.size||[...expectedKeys].some(key=>!actualKeys.has(key)))
  throw Error(`Group ${group.id} is missing, replacing or duplicating collected case identities.`);
}
const requiredTotals=executionPlan.expectedCasesByProject??{chromium:560,'mobile-chrome':560};
if(Object.keys(requiredTotals).length!==2||[...expectedTotals].some(([project,count])=>count!==requiredTotals[project])||
 !['chromium','mobile-chrome'].every(project=>expectedTotals.has(project)))throw Error('Browser group project totals disagree with the reviewed complete collection.');
const totalCases=[...expectedTotals.values()].reduce((n,count)=>n+count,0);
if(totalCases!==(executionPlan.expectedTotalCases??1120))throw Error('Browser group coverage total is incomplete.');
for(const project of ['chromium','mobile-chrome'])if([...fileAssignments].filter(key=>JSON.parse(key)[1]===project).length!==(executionPlan.fileCountPerProject??44))
 throw Error(`Browser group file union is incomplete for ${project}.`);
const fields=['facet','file','title','project','sourcePaths','assertion','route','comparison','roundtripSchema','exported','exportNotApplicable'] as const;
const rows=policy.rowIds.map(id=>({id,evidence:plan.entries.filter((entry:any)=>entry.rowId===id).map((entry:any)=>{
 const captureId=entry.project===null?'unit':browserCaptureByCase.get(runnerCaseKey(entry));
 if(!captureId)throw Error(`No exact passing group capture for ${entry.file} / ${entry.title} / ${entry.project}.`);
 const matches=reports.get(captureId)?.filter(c=>runnerCaseKey(c)===runnerCaseKey(entry));
 if(matches?.length!==1||matches[0]!.status!=='passed')throw Error(`Missing/ambiguous fresh final case ${id}: ${entry.file} / ${entry.title} / ${entry.project}`);
 const sourcePaths=entry.project===null?entry.sourcePaths:[...new Set([...entry.sourcePaths,...snapshotSourcePaths([entry.file])])].sort();
 return {...Object.fromEntries(fields.filter(k=>entry[k]!==undefined).map(k=>[k,entry[k]])),sourcePaths,captureId} as unknown as ParityCaseEvidence;
})}));
// Supplement actual ZIP export claims with the exact six-export API case,
// whose unchanged report retains the executed ZIP bytes as an embedded body.
for(const id of ['exporter:zip','exporter:package']){
 const reference=rows.find(r=>r.id==='exporter:notebook')!.evidence.find(e=>e.facet==='export'&&e.project==='chromium')!;
 const row=rows.find(r=>r.id===id)!;
 const sourcePaths=[...new Set([...reference.sourcePaths,...policy.requiredSources[id]!])].sort();
 row.evidence.push({...reference,sourcePaths,assertion:'Invokes the real versioned research API ZIP export, awaits and reads its actual download, parses the ZIP with the unchanged native parser and checks the project manifest and every retained artifact byte count.',exported:{schemaOrMime:'application/zip; pendulum-research-project/v1',assertionOnly:true}});
}
const bundle:ParityCertificateBundle={schema:'pendulum-parity-certificates/v1',inventorySha256:policy.inventorySha256,captures,rows};
let result=validateParityCertificates(root,bundle,policy);
if(!result.valid){fs.writeFileSync('tmp/S28-final-certificate-binding-errors.json',JSON.stringify(result,null,2)+'\n');throw Error(result.errors.slice(0,12).join('\n'));}

const retainedRows=new Set<string>(),artifactByIdentity=new Map<string,{retained:EvidenceDigest;name?:string}>();
const artifacts:{rowId:string;captureId:string;file:string;title:string;project:string|null;attachmentName:string;digest:EvidenceDigest;provenance:string}[]=[];
const wanted=new Set(['analysis:experiment-design','runtime:jobs','analysis:integrator-comparison','route:tabs','importer:workspace','storage-schema:research-db','exporter:zip','exporter:package','exporter:notebook','exporter:figure']);
for(const row of rows){
 if(!wanted.has(row.id))continue;
 for(const item of row.evidence){
  if(item.facet!=='export'||!item.exported||item.project!=='chromium'||retainedRows.has(row.id))continue;
  const test=reports.get(item.captureId)!.find(c=>runnerCaseKey(c)===runnerCaseKey(item))!;
  const original=plan.entries.find((entry:any)=>entry.rowId===row.id&&entry.facet==='export'&&runnerCaseKey(entry)===runnerCaseKey(item));
  const expectedName=original?.attachmentNameHint as string|undefined;
  const suitable=test.attachments.filter(a=>expectedName?a.name===expectedName:
   row.id==='exporter:zip'||row.id==='exporter:package'?a.contentType==='application/zip':
   row.id==='exporter:notebook'?a.name.endsWith('.ipynb'):
   row.id==='exporter:figure'?a.contentType==='text/html':
   row.id==='storage-schema:research-db'?a.name==='original-research-db-backup':
   row.id==='importer:workspace'?a.name==='original-workspace-backup':false);
  if(suitable.length!==1)continue;
  const attachment=suitable[0]!,key=JSON.stringify([item.captureId,runnerCaseKey(item),attachment.name]);
  let retained=artifactByIdentity.get(key);
  if(!retained){
   if(attachment.path){
    if(!attachment.path.startsWith('documents/redesign/parity/evidence/'))throw Error('Direct retained artifact is not portable evidence.');
    retained={retained:{path:attachment.path,sha256:evidenceHash(fs.readFileSync(evidencePath(root,attachment.path)))}};
   }else if(attachment.embeddedSha256){
    const extension=attachment.contentType==='application/zip'?'.zip':attachment.name.endsWith('.ipynb')?'.ipynb':attachment.contentType==='text/html'?'.html':'.json';
    const output=`${artifactRoot}/${row.id.replaceAll(/[^A-Za-z0-9_-]/g,'-')}-${attachment.embeddedSha256.slice(0,12)}${extension}`;
    if(fs.existsSync(evidencePath(root,output))){
     if(evidenceHash(fs.readFileSync(evidencePath(root,output)))!==attachment.embeddedSha256)throw Error('Existing portable export bytes disagree.');
     retained={retained:{path:output,sha256:attachment.embeddedSha256},name:attachment.name};
    }else{
     const digest=extractEmbeddedArtifact(root,captures.find(c=>c.id===item.captureId)!,item,attachment.name,output);
     retained={retained:digest,name:attachment.name};
    }
   }else continue;
   artifactByIdentity.set(key,retained);
  }
  Reflect.set(item,'exported',{...item.exported,assertionOnly:false,retained:retained.retained,...(retained.name?{embeddedAttachmentName:retained.name}:{})});
  artifacts.push({rowId:row.id,captureId:item.captureId,file:item.file,title:item.title,project:item.project,attachmentName:attachment.name,digest:retained.retained,provenance:retained.name?'Exact canonical base64 bytes embedded by the actual runner; capture/report remain unchanged.':'Exact actual runner attachment path; file bytes are independently pinned.'});
  retainedRows.add(row.id);
 }
}
result=validateParityCertificates(root,bundle,policy);
if(!result.valid)throw Error(result.errors.join('\n'));
const archiveDerivatives:{container:EvidenceDigest;entryPath:string;digest:EvidenceDigest;provenance:string}[]=[];
const zip=artifacts.find(a=>a.digest.path.endsWith('.zip'));
if(zip){
 const csv=parseZip(fs.readFileSync(evidencePath(root,zip.digest.path))).find(entry=>entry.path.endsWith('.csv'));
 if(csv){
  const digest={path:`${artifactRoot}/executed-archive-source-${evidenceHash(csv.data).slice(0,12)}.csv`,sha256:evidenceHash(csv.data)};
  const output=evidencePath(root,digest.path);
  if(fs.existsSync(output)){if(evidenceHash(fs.readFileSync(output))!==digest.sha256)throw Error('Existing archive derivative bytes disagree.');}
  else fs.writeFileSync(output,csv.data,{flag:'wx'});
  archiveDerivatives.push({container:zip.digest,entryPath:csv.path,digest,provenance:'Exact CSV entry bytes decoded from the actual executed ZIP export. This is an archive derivative, not a separately asserted browser download or a fabricated source capture.'});
 }
}
const ledgerFile='documents/redesign/parity/S28-preservation-exceptions.json',ledger=read(ledgerFile);
for(const entry of ledger.exceptions){
 const reference=captures.find(c=>c.id==='unit')!;
 const bindings=requiredPreservationCases(entry.path).map(required=>({...required,project:null as null,sourcePaths:closure([required.file,...entry.requiredSources]),assertion:entry.path==='src/app/SimulationClock.ts'?'Exact immutable pre-extension native clock differential and versioned additive transaction-boundary characterization preserve old frame/native state/debt/drop/reset behavior and reject invalid state atomically.':entry.path==='scripts/public-vitest-report.mjs'?'Executes the immutable pre-S28 public publisher and the additive publisher on identical benign inputs with byte-identical output; separately verifies UNC and escaped fixture-path redaction using the unchanged public-artifact privacy audit, preserving raw input report bytes.':'Runs the unchanged pre-S28 copier from its pinned immutable Git blob and the additive copier on identical fixtures; compares the complete default output bytes and verifies isolated destinations and path refusal.'}));
 const proof=validatePreservationCases(root,reference,bindings,entry.requiredSources);
 if(!proof.valid)throw Error(proof.errors.join('\n'));
 entry.capture={path:reference.path,sha256:reference.sha256};entry.cases=bindings;
}
fs.mkdirSync(evidencePath(root,outputRoot),{recursive:true});
fs.writeFileSync(`${outputRoot}/S28-certificates.json`,JSON.stringify(bundle,null,2)+'\n');
fs.writeFileSync(outputRoot==='documents/redesign/parity'?ledgerFile:`${outputRoot}/S28-preservation-exceptions.json`,JSON.stringify(ledger,null,2)+'\n');
const indexPath=outputRoot==='documents/redesign/parity'?'documents/redesign/parity/evidence/retained-export-index.json':`${outputRoot}/retained-export-index.json`;
fs.writeFileSync(indexPath,JSON.stringify({schema:'pendulum-executed-export-index/v1',browserCollection:{plan:{path:executionPlanPath,sha256:evidenceHash(fs.readFileSync(evidencePath(root,executionPlanPath)))},actualCases:totalCases,actualGroupCount:browserGroups.length,expectedCasesByProject:requiredTotals},browserConfigurations:{scope:'Explicit producer command/report/current-config precheck receipts; not a claim of an additional core-validator check.',actualBrowserCaptures:configurationReceipts.length,receipts:configurationReceipts},artifacts,archiveDerivatives},null,2)+'\n');
console.log(JSON.stringify({outputRoot,verifiedRows:result.verifiedIds.length,captureCount:captures.length,browserGroups:browserGroups.length,actualBrowserCases:totalCases,bindings:rows.reduce((n,r)=>n+r.evidence.length,0),retainedExports:artifacts.length,preservationExceptions:ledger.exceptions.length}));
