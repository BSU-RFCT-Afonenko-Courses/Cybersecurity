/** Закрытая связь lexical input с единственным regular physical origin. */
import {dirname,join,relative,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {command,quartoExecutable} from './process.ts';
import {metadataBytes,freshOwnerData,inspectFreshDocument,type FreshOwnerFrame} from './metadata-closure.ts';
import {assertRetiredRegularDocument,verifiedRetirement,type RetiredRegularContext,type ExportRetirement} from './native-export-retirement.ts';
const fail=(s:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
export type SourceIdentity={source:string;physicalPath:string;linkTarget:string|null;nativeOwner:string;physicalInspectionHash:string};
export type SourceIdentities={schema:'course-native-source-identities-v1';sources:SourceIdentity[]};
const keys=(v:any,names:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
function lexical(source:unknown):asserts source is string{if(typeof source!=='string'||!source||/^[\/\\]/.test(source)||/[\\\0:*?\[\]{}]/.test(source)||source.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git'))fail('Недопустимый lexical input')}
export async function sourceFile(root:string,source:string){
 try{lexical(source);let path=root;const parts=source.split('/');
 for(const part of parts.slice(0,-1)){path=join(path,part);const info=await Deno.lstat(path);if(info.isSymlink||!info.isDirectory)fail('Linked parent input: '+source)}
 const input=join(root,source),info=await Deno.lstat(input);let linkTarget:string|null=null;
 if(info.isSymlink){linkTarget=await Deno.readLink(input);if(!linkTarget||linkTarget.includes('\0'))fail('Некорректная input ссылка')}
 else if(!info.isFile)fail('Input не file: '+source);
 const physicalPath=linkTarget===null?input:resolve(dirname(input),linkTarget);
 const rel=relative(root,physicalPath);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||resolve(root,rel)!==physicalPath)fail('Physical input вне owner');
 if(await Deno.realPath(input)!==physicalPath)fail('Цепочка/неоднозначная input ссылка');
 const bytes=await metadataBytes(physicalPath);if(!bytes)fail('Нет physical input');
 return {source,physicalPath,linkTarget,bytes:bytes!};
 }catch(e){if((e as any)?.code==='NATIVE.COMMON_PATH_BINDING_INVALID')throw e;return fail('Не подтверждён regular input: '+source+' ('+String(e)+')')}
}
export function sourceMetadata(doc:any,path:string,source?:string){
 const info=doc.fileInformation?.[path]??(source?doc.fileInformation?.[source]:undefined);
 if(!info||!info.metadata||typeof info.metadata!=='object'||!Array.isArray(info.includeMap))fail('Нет raw input metadata: '+path);return info;
}
export async function inspectSources(root:string,sources:string[],profiles:string[],expected?:SourceIdentities,retirement?:ExportRetirement,proof?:{retiredContext?:RetiredRegularContext;originals?:Record<string,any>;before?:()=>Promise<unknown>;capture?:(text:string)=>Promise<unknown>;frame?:FreshOwnerFrame}){
 if(retirement!==undefined&&!verifiedRetirement(retirement))fail('Не доказан retirement capability');
 if(new Set(sources).size!==sources.length)fail('Повторный lexical input');
 if(expected!==undefined&&(!keys(expected,['schema','sources'])||expected.schema!=='course-native-source-identities-v1'||!Array.isArray(expected.sources)||expected.sources.length!==sources.length))fail('Нет закрытого sourceIdentities');
 const records:SourceIdentity[]=[],inspections:Record<string,any>={},sourceHashes:Record<string,string>={};
 for(const [i,source] of sources.entries()){
  const old:any=expected?.sources[i];
  if(expected!==undefined&&(!keys(old,['source','physicalPath','linkTarget','nativeOwner','physicalInspectionHash'])||old.source!==source||typeof old.physicalPath!=='string'||!(old.linkTarget===null||typeof old.linkTarget==='string'&&!!old.linkTarget)||old.nativeOwner!==root||typeof old.physicalInspectionHash!=='string'||!/^[a-f0-9]{64}$/.test(old.physicalInspectionHash)))fail('Некорректная source identity');
  await proof?.before?.();
  const before=await sourceFile(root,source),args=profiles.length?['--profile',profiles.join(',')]:[];
  const text=proof?.frame?await inspectFreshDocument(proof.frame,root,profiles,before.physicalPath,proof.before??(async()=>{})):await command(quartoExecutable(),['inspect',before.physicalPath,...args],root,{QUARTO_PROFILE:profiles.join(',')}),doc=JSON.parse(text);
  if(doc.project?.dir!==root||await Deno.realPath(doc.project.dir)!==root){if(!old)fail('Чужой physical native owner: '+source);await assertRetiredRegularDocument(doc,before.physicalPath,old,source,proof?.retiredContext)}
  sourceMetadata(doc,before.physicalPath);
  if(old){const original=proof?.originals?.[source];if(!original||original.quarto?.version!==doc.quarto?.version)fail('Нет original source provenance');sameSourceMetadata(sourceMetadata(original,old.physicalPath),sourceMetadata(doc,before.physicalPath))}
  await proof?.capture?.(text);await proof?.before?.();
  const after=await sourceFile(root,source);
  if(before.physicalPath!==after.physicalPath||before.linkTarget!==after.linkTarget||await hash(before.bytes)!==await hash(after.bytes))fail('Input identity drift во время inspect');
  const row:SourceIdentity={source,physicalPath:before.physicalPath,linkTarget:before.linkTarget,nativeOwner:root,physicalInspectionHash:old?.physicalInspectionHash??await hash(new TextEncoder().encode(text))};
  if(old&&(old.physicalPath!==row.physicalPath||old.linkTarget!==row.linkTarget||old.nativeOwner!==row.nativeOwner))fail('Source identity устарела: '+source);
  records.push(row);inspections[source]=doc;sourceHashes[source]=await hash(before.bytes);
 }
 return {identities:{schema:'course-native-source-identities-v1',sources:records} as SourceIdentities,inspections,sourceHashes};
}
export function sameSourceMetadata(physical:any,lexical:any){if(stable(physical.metadata)!==stable(lexical.metadata))fail('Physical/lexical raw metadata не совпадают')}

/** Actual raw records: owner rows для regular inputs; direct stdout для исключений. */
export type CurrentSourceEvidence={identities:SourceIdentities;information:Record<string,any>;directInspections:Record<string,any>;sourceHashes:Record<string,string>;quartoVersion:string};
export async function inspectCurrentSources(root:string,sources:string[],profiles:string[],expected:SourceIdentities,frame:FreshOwnerFrame,retirement:ExportRetirement|undefined,proof:{originals:{physical:Record<string,any>;lexical:Record<string,any>};retiredContext?:RetiredRegularContext;before:()=>Promise<unknown>}):Promise<CurrentSourceEvidence>{
 const native=freshOwnerData(frame,root,profiles),information:Record<string,any>={},directInspections:Record<string,any>={},sourceHashes:Record<string,string>={},records:SourceIdentity[]=[];
 if(!keys(expected,['schema','sources'])||expected.schema!=='course-native-source-identities-v1'||!Array.isArray(expected.sources)||expected.sources.length!==sources.length||new Set(sources).size!==sources.length)fail('Нет exact current source identities');
 for(const [i,source] of sources.entries()){
  const old=expected.sources[i];if(!keys(old,['source','physicalPath','linkTarget','nativeOwner','physicalInspectionHash'])||old.source!==source||old.nativeOwner!==root||typeof old.physicalPath!=='string'||!(old.linkTarget===null||typeof old.linkTarget==='string'&&!!old.linkTarget)||!/^[a-f0-9]{64}$/.test(old.physicalInspectionHash))fail('Некорректная current source identity');
  await proof.before();const before=await sourceFile(root,source);
  if(before.physicalPath!==old.physicalPath||before.linkTarget!==old.linkTarget)fail('Source identity устарела: '+source);
  const row=native.fileInformation[source],regular=old.linkTarget===null&&old.physicalPath===resolve(root,source)&&native.files.input.includes(old.physicalPath)&&row!==undefined;
  if(regular){
   if(!row||!row.metadata||typeof row.metadata!=='object'||Array.isArray(row.metadata)||!Array.isArray(row.includeMap))fail('Нет actual owner raw source record');
   const physical=proof.originals.physical[source],lexical=proof.originals.lexical[source];
   if(!physical||!lexical||physical.quarto?.version!==native.quarto?.version||lexical.quarto?.version!==native.quarto?.version)fail('Quarto original/current identity изменена');
   const a=sourceMetadata(physical,old.physicalPath),b=sourceMetadata(lexical,resolve(root,source));sameSourceMetadata(a,row);sameSourceMetadata(b,row);
   if(stable(a.includeMap)!==stable(row.includeMap)||stable(b.includeMap)!==stable(row.includeMap))fail('Original/current includeMap изменён');
   information[source]=row;records.push(old);sourceHashes[source]=await hash(before.bytes);
  }else{
   const direct=await inspectSources(root,[source],profiles,{schema:expected.schema,sources:[old]},retirement,{originals:proof.originals.physical,retiredContext:proof.retiredContext,before:proof.before,frame});
   const doc=direct.inspections[source];directInspections[source]=doc;information[source]=sourceMetadata(doc,old.physicalPath);records.push(direct.identities.sources[0]);sourceHashes[source]=direct.sourceHashes[source];
  }
  await proof.before();const after=await sourceFile(root,source);
  if(before.physicalPath!==after.physicalPath||before.linkTarget!==after.linkTarget||await hash(before.bytes)!==await hash(after.bytes))fail('Source drift во время current owner inspection');
 }
 return {identities:{schema:expected.schema,sources:records},information,directInspections,sourceHashes,quartoVersion:native.quarto?.version};
}
