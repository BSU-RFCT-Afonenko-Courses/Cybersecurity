/** Закрытый native metadata inventory. Значения и merge остаются у Quarto. */
import {basename,dirname,join,relative,resolve,parse} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {validatedOverlayReplayInputs} from './owned-config-overlay.ts';
import type {NativeRunPointer} from './native-run.ts';
import {quartoExecutable,command} from './process.ts';
import {withNativeRawPhase,prepareNativeQmdRaw,nativeRawMetadata,type NativeRawPhase} from './native-raw-metadata.ts';
import type {SourceIdentities,CurrentSourceEvidence} from './source-identities.ts';
import {assertRetiredRegularDocument,assertUnlistedFallback,verifiedRetirement,type RetiredRegularContext,type ExportRetirement} from './native-export-retirement.ts';
const fail=(s:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
type Context={source:string|null;format:string|null;declaredBy:string|null};
type Kind='owner-config'|'profile-config'|'native-config'|'qmd'|'directory-metadata'|'include-metadata'|'extension-metadata';
type EdgeKind='native-config'|'metadata-file'|'directory'|'include'|'extension';
type Origin={path:string;context:Context;kind:Kind;sha256:string|false;nativeMetadataHash:string|false;commonPresence:'absent'|'supported-canonical'};
type Edge={from:string;to:string;context:Context;kind:EdgeKind};
export interface MetadataClosure {schema:'course-native-metadata-closure-v1';nativeConfigFiles:{owner:string[];documents:Record<string,string[]>};origins:Origin[];dependencies:Edge[];noCommon:boolean}
export type MetadataDocument={source:string;format:string};
// Внутренний capability живёт лишь в callback одного реального stock owner вызова.
const ownerFrames=new WeakMap<object,{root:string;profiles:string[];native:any;documents:Map<string,string>}>();
export type FreshOwnerFrame=object & {readonly __freshOwnerFrame:never};
function freezeNative(value:any):any{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeNative(child);Object.freeze(value)}return value}
export function freshOwnerData(frame:FreshOwnerFrame,root:string,profiles:string[]){
 const value=ownerFrames.get(frame);if(!value||value.root!==root||stable(value.profiles)!==stable(profiles))fail('Чужой/завершённый current owner frame');return value!.native;
}
export async function withFreshOwnerFrame<T>(root:string,profiles:string[],check:()=>Promise<unknown>,use:(frame:FreshOwnerFrame)=>Promise<T>):Promise<T>{
 await check();const args=profiles.length?['--profile',profiles.join(',')]:[];
 const native=JSON.parse(await command(quartoExecutable(),['inspect',root,...args],root,{QUARTO_PROFILE:profiles.join(',')}));await check();
 if(native.dir!==root||await Deno.realPath(native.dir)!==root||!native.fileInformation||typeof native.fileInformation!=='object'||Array.isArray(native.fileInformation)||!Array.isArray(native.files?.input)||native.files.input.some((p:any)=>typeof p!=='string'||resolve(root,p)!==p)||new Set(native.files.input).size!==native.files.input.length)fail('Не установлен current native owner/input inventory');
 configIdentities(root,native.files.config);
 const frame=Object.freeze({}) as FreshOwnerFrame;ownerFrames.set(frame,{root,profiles:[...profiles],native:freezeNative(native),documents:new Map()});
 try{return await use(frame)}finally{ownerFrames.delete(frame)}
}

/** Actual direct exception response belongs only to this live owner side. */
export async function inspectFreshDocument(frame:FreshOwnerFrame,root:string,profiles:string[],input:string,check:()=>Promise<unknown>):Promise<string>{
 freshOwnerData(frame,root,profiles);await check();const state=ownerFrames.get(frame)!,args=profiles.length?['--profile',profiles.join(',')]:[],key=stable({input,root,profiles,tool:quartoExecutable(),environment:Deno.env.toObject(),cwd:Deno.cwd()}),reuse=!Deno.env.get('COURSE_PERF_MODE')||Deno.env.get('COURSE_PERF_MODE')==='off';
 if(reuse&&state.documents.has(key)){await check();return state.documents.get(key)!}
 const text=await command(quartoExecutable(),['inspect',input,...args],root,{QUARTO_PROFILE:profiles.join(',')});await check();freshOwnerData(frame,root,profiles);if(reuse)state.documents.set(key,text);return text;
}

export type MetadataInputs={root:string;profiles:string[];projectMetadata:any;sourceIdentities:SourceIdentities;documents:MetadataDocument[];nativeConfigFiles:MetadataClosure['nativeConfigFiles'];extensionFiles:string[];includeMaps:Record<string,{source:string;target:string}[]>;validateCanonical:(value:unknown)=>unknown};
const keys=(v:any,names:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
export function nativeExtensionRoots(root:string,extensions:any[]){
 const roots=new Set<string>([join(root,'_extensions')]);
 for(const e of extensions){
  if(typeof e.path!=='string'||!e.path.startsWith('/')&& !/^[A-Za-z]:[\\/]/.test(e.path))fail('Неизвестный native extension path');
  let dir=e.path;while(basename(dir)!=='_extensions'){const next=dirname(dir);if(next===dir)fail('Неизвестный native extension namespace');dir=next}roots.add(dir);
 }return [...roots].sort();
}
export function commonKey(raw:any):boolean{
 if(!raw||typeof raw!=='object')return false;
 return Object.entries(raw).some(([k,v])=>k==='project-materialization'||commonKey(v));
}
function nestedCommon(raw:any,top=true):boolean{
 if(!raw||typeof raw!=='object')return false;
 return Object.entries(raw).some(([k,v])=>k==='project-materialization'?!top:nestedCommon(v,false));
}
export function physical(root:string,path:string){
 if(typeof path!=='string'||!path||path.includes('\0'))fail('Неизвестная native metadata identity');
 return resolve(root,path);
}
export async function metadataBytes(path:string):Promise<Uint8Array|undefined>{
 if(resolve(path)!==path)fail('Неканоническая native metadata identity');
 let current=parse(path).root;
 for(const part of relative(current,path).split(/[\\/]/).filter(Boolean)){
  current=join(current,part);
  try{if((await Deno.lstat(current)).isSymlink)fail('Symlink в metadata closure: '+path)}catch(e){if(e instanceof Deno.errors.NotFound)return;throw e}
 }
 if(!(await Deno.lstat(path)).isFile||await Deno.realPath(path)!==path)fail('Metadata origin не regular file: '+path);
 return await Deno.readFile(path);
}
// Raw extraction memo принадлежит только текущей закрытой операции.

function plain(value:any):any{
 if(!value||typeof value!=='object'||typeof value.t!=='string')fail('Неизвестный native Meta value');
 if(value.t==='MetaMap')return Object.fromEntries(Object.entries(value.c).map(([k,v])=>[k,plain(v)]));
 if(value.t==='MetaList')return value.c.map(plain);
 if(value.t==='MetaBool'||value.t==='MetaString')return value.c;
 if(value.t==='MetaInlines')return value.c.map((v:any)=>{if(v.t==='Str')return v.c;if(v.t==='Space')return ' ';fail('Неподтверждённое native metadata scalar')}).join('');
 fail('Неподтверждённая форма native metadata');
}
// Только top-level dependencies includedMetadata; рекурсивный merge не воспроизводится.
function metadataRefs(meta:any):string[]{
 const result:string[]=[];
 for(const key of ['metadata-file','metadata-files'])if(Object.hasOwn(meta,key)){
  const value=plain(meta[key]);
  if(value===''||value===false)continue;
  if(key==='metadata-file'){if(typeof value!=='string')fail('Неизвестный native metadata-file');result.push(value)}
  else {if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))fail('Неизвестный native metadata-files');result.push(...value)}
 }
 // Вложенные edges требуют отдельного stock provenance, которого этот transport не даёт.
 const nested=(x:any,top=true):boolean=>!!x&&typeof x==='object'&&Object.entries(x).some(([k,v])=>['metadata-file','metadata-files'].includes(k)?!top:nested(v,false));
 if(nested(meta))fail('Не установлен native scope вложенного metadata-file');
 return result;
}
function normalize(c:MetadataClosure):MetadataClosure{
 const sort=<T>(xs:T[])=>xs.sort((a,b)=>stable(a).localeCompare(stable(b)));
 return {...c,origins:sort(c.origins),dependencies:sort(c.dependencies)};
}
export function configIdentities(root:string,files:any):string[]{
 if(!Array.isArray(files)||files.some(f=>typeof f!=='string'))fail('Нет native config inventory');
 const paths=files.map((f:string)=>physical(root,f));if(new Set(paths).size!==paths.length)fail('Повторный native config origin');return paths;
}
export type OverlayMetadataReplay=object & {readonly __overlayMetadataReplay:never};
const overlayMetadataReplays=new WeakMap<object,{root:string;entries:Awaited<ReturnType<typeof validatedOverlayReplayInputs>>;check:()=>Promise<unknown>}>();
/** Only exact restored-v3 base/profile retained inputs; no caller file/map override. */
export async function withOverlayMetadataReplay<T>(p:NativeRunPointer,check:()=>Promise<unknown>,use:(token:OverlayMetadataReplay)=>Promise<T>):Promise<T>{
 const entries=await validatedOverlayReplayInputs(p),token=Object.freeze({}) as OverlayMetadataReplay;
 overlayMetadataReplays.set(token,{root:p.projectRoot,entries,check});try{await check();return await use(token)}finally{overlayMetadataReplays.delete(token)}
}
export async function collectMetadataClosure(input:MetadataInputs,retired?:{file:string;sha256:string},prior?:MetadataClosure,overlayReplay?:OverlayMetadataReplay,rawPhase?:NativeRawPhase):Promise<MetadataClosure>{
 if(!rawPhase)return await withNativeRawPhase(input.root,phase=>collectMetadataClosure(input,retired,prior,overlayReplay,phase));
 const replay=overlayReplay&&overlayMetadataReplays.get(overlayReplay);if(overlayReplay&&(!replay||replay.root!==input.root||retired))fail('Чужой/expired overlay metadata replay');

 const {root,profiles,documents,nativeConfigFiles,extensionFiles,includeMaps}=input;
 const preload:{path:string;bytes:Uint8Array;kind:'qmd'|'include-metadata'}[]=[];
 for(const source of new Set(documents.map(d=>d.source))){const identity=input.sourceIdentities.sources.find(x=>x.source===source);if(!identity)fail('Missing raw preload source identity');const bytes=await metadataBytes(identity!.physicalPath);if(bytes)preload.push({path:identity!.physicalPath,bytes,kind:'qmd'});
  for(const inc of includeMaps[source]??[]){const lexical=physical(root,inc.source),path=physical(dirname(lexical),inc.target);if(!relative(root,path)||relative(root,path).startsWith('..'))fail('Raw preload include outside owner');const bytes=await metadataBytes(path);if(bytes)preload.push({path,bytes,kind:'include-metadata'})}
 }
 await prepareNativeQmdRaw(rawPhase,root,preload);
 const origins=new Map<string,Origin>(),edges=new Map<string,Edge>(),profileRefs=new Map<string,string[]>();let noCommon=true;
 const ctx=(source:string|null,format:string|null,declaredBy:string|null):Context=>({source,format,declaredBy});
 const edge=(from:string,to:string,context:Context,kind:EdgeKind)=>{const e={from,to,context,kind};edges.set(stable(e),e)};
 const fixed=['_quarto.yml','_quarto.yaml',...profiles.flatMap(p=>['_quarto-'+p+'.yml','_quarto-'+p+'.yaml'])].map(p=>join(root,p));
 const configs=new Set([...nativeConfigFiles.owner,...Object.values(nativeConfigFiles.documents).flat()]);
 const add=async(path:string,context:Context,kind:Kind,supported=false)=>{
  path=physical(root,path);const key=stable({path,context});if(origins.has(key))return;
  const replayEntry=replay?.entries[path];await replay?.check();const bytes=await metadataBytes(replayEntry?.retainedPath??path);if(replayEntry&&(!bytes||await hash(bytes)!==replayEntry.sha256))fail('Retained execution metadata bytes changed');
  if(retired&&path===join(root,retired.file)){
   if(bytes)fail('Retired profile появился снова');
   const old=prior?.origins.find(o=>stable({path:o.path,context:o.context})===key);
   if(!old||old.sha256!==retired.sha256)fail('Нет исходного metadata proof owned profile');origins.set(key,old!);return;
  }
  if(!bytes){origins.set(key,{path,context,kind,sha256:false,nativeMetadataHash:false,commonPresence:'absent'});return}
  const meta=await nativeRawMetadata(rawPhase!,root,path,bytes,kind,replayEntry?.retainedPath);await replay?.check();
  const has=commonKey(meta);if(has){
   if(!supported||nestedCommon(meta)||!Object.hasOwn(meta,'project-materialization'))fail('Неподтверждённый common metadata origin: '+path);
   // Не допускаем null/пустой/overridden raw declaration под effective null.
   const raw=plain(meta['project-materialization']);if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Неоднозначная raw common declaration: '+path);input.validateCanonical(raw);
   noCommon=false;
  }
  origins.set(key,{path,context,kind,sha256:await hash(bytes),nativeMetadataHash:await hash(new TextEncoder().encode(stable(meta))),commonPresence:has?'supported-canonical':'absent'});
  // Supplemental files не являются рекурсивно потреблёнными sources metadata-file.
  if(kind==='profile-config')profileRefs.set(path,metadataRefs(meta));
  if(['owner-config','qmd','directory-metadata','include-metadata','extension-metadata'].includes(kind)){
   for(const ref of metadataRefs(meta)){
    if(!ref||ref.includes('\0')||/^[a-z]+:\/\//i.test(ref))fail('Не установлен physical metadata-file edge');
    let base=['qmd','include-metadata'].includes(kind)?dirname(resolve(root,context.source!)):dirname(path);
    if(kind==='extension-metadata')fail('Не установлен stock dependency scope extension metadata');
    // Directory metadata paths stock rebases only when the file exists at directory scope.
    if(kind==='directory-metadata'){
     if(!context.source)fail('Нет directory input context');
     const candidate=resolve(base,ref);base=await metadataBytes(candidate)?base:dirname(resolve(root,context.source!));
    }
    const target=physical(base,ref),child=ctx(context.source,context.format,path);
    edge(path,target,child,'metadata-file');
    await add(target,child,'native-config');
   }
  }
 };
 for(const path of fixed){const kind=/_quarto-(?:[^/]+)\.ya?ml$/.test(path)?'profile-config':'owner-config';await add(path,ctx(null,null,null),kind,true)}
 for(const file of nativeConfigFiles.owner){const c=ctx(null,null,fixed.includes(file)?null:root);edge(root,file,c,'native-config');if(!fixed.includes(file))await add(file,c,'native-config')}
 const projectRefs:string[]=[];
 for(const key of ['metadata-file','metadata-files'])if(input.projectMetadata?.[key]){
  const v=input.projectMetadata[key];if(key==='metadata-file'){if(typeof v!=='string')fail('Неизвестный native project metadata-file');projectRefs.push(v)}else{if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))fail('Неизвестный native project metadata-files');projectRefs.push(...v)}
 }
 for(const d of documents){
  const context=ctx(d.source,d.format,null),lexicalSource=join(root,d.source),identity=input.sourceIdentities.sources.find(x=>x.source===d.source);if(!identity)fail('Нет admitted source identity');const source=identity!.physicalPath;
  for(const ref of projectRefs){
   const declarations=[...profileRefs].filter(([_path,refs])=>refs.includes(ref));if(!declarations.length)fail('Не установлен raw origin native project metadata-file');
   // projectMetadataForInputFile rebases существующие owner paths; missing paths остаются input-relative.
   const candidate=physical(root,ref),exists=await metadataBytes(candidate),base=exists?root:dirname(lexicalSource),target=physical(base,ref);
   for(const [from] of declarations){const c=ctx(d.source,d.format,from);if(!exists){edge(from,candidate,c,'metadata-file');await add(candidate,c,'native-config')}edge(from,target,c,'metadata-file');await add(target,c,'native-config')}
  }
  await add(source,context,'qmd',true);
  for(const file of nativeConfigFiles.documents[d.source]??[]){const c=fixed.includes(file)?ctx(null,null,null):ctx(d.source,d.format,source);edge(source,file,c,'native-config');if(!fixed.includes(file))await add(file,c,'native-config')}
  let dir=dirname(lexicalSource);
  while(true){
   for(const name of ['_metadata.yml','_metadata.yaml',...(dir===root?[]:['_quarto.yml','_quarto.yaml'])]){
    const path=join(dir,name),c=ctx(d.source,d.format,source);edge(source,path,c,'directory');
    await add(path,c,'directory-metadata');
    if(name.startsWith('_quarto')&&await metadataBytes(path))fail('Вложенный owner не поддержан: '+path);
   }
   if(dir===root)break;const next=dirname(dir);if(next===dir)fail('Directory scope вне owner');dir=next;
  }
  for(const inc of includeMaps[d.source]??[]){
   const lexicalFrom=physical(root,inc.source),from=lexicalFrom===lexicalSource?source:lexicalFrom,to=physical(dirname(lexicalFrom),inc.target);
   if(!relative(root,to)||relative(root,to).startsWith('..'))fail('Include metadata вне owner');
   const c=ctx(d.source,d.format,from);edge(from,to,c,'include');await add(to,c,'include-metadata');
  }
 }
 for(const file of extensionFiles){const c=ctx(null,null,root);edge(root,file,c,'extension');await add(file,c,'extension-metadata')}
 for(const path of configs){
  if(![...origins.values()].some(o=>o.path===path))fail('Native config origin без raw extraction: '+path);
 }
 for(const o of origins.values()){const bytes=await metadataBytes(o.path),expected=replay?.entries[o.path]?.liveSha256??(retired&&o.path===join(root,retired.file)?false:o.sha256);if((bytes?await hash(bytes):false)!==expected)fail('Metadata drift после native extraction: '+o.path)}
 const c:MetadataClosure={schema:'course-native-metadata-closure-v1',nativeConfigFiles,origins:[...origins.values()],dependencies:[...edges.values()],noCommon};return normalize(c);
}
export function closureInputs(root:string,c:MetadataClosure){
 const result:Record<string,string|false>={};for(const o of c.origins){const name=relative(root,o.path).replaceAll('\\','/');if(name&&!name.startsWith('../')&&!name.startsWith('/')&&!/^[A-Za-z]:/.test(name)&&!['qmd','include-metadata','extension-metadata'].includes(o.kind)){if(Object.hasOwn(result,name)&&result[name]!==o.sha256)fail('Несогласованный hash metadata origin');result[name]=o.sha256}}
 return result;
}
export async function validateMetadataClosure(root:string,profiles:string[],documents:MetadataDocument[],extensionFiles:string[],extensionRoots:string[],value:MetadataClosure,validateCanonical:MetadataInputs['validateCanonical'],sourceIdentities:SourceIdentities,sourceEvidence:CurrentSourceEvidence,frame:FreshOwnerFrame,retired?:ExportRetirement,proof?:{retiredContext?:RetiredRegularContext;check:()=>Promise<unknown>;owner:(native:any)=>void;rawPhase?:NativeRawPhase}){
 if(retired!==undefined&&!verifiedRetirement(retired))fail('Нет validated completed retirement');
 const c=value;
 if(!keys(c,['schema','nativeConfigFiles','origins','dependencies','noCommon'])||c.schema!=='course-native-metadata-closure-v1'||typeof c.noCommon!=='boolean'||!keys(c.nativeConfigFiles,['owner','documents'])||!Array.isArray(c.origins)||!Array.isArray(c.dependencies)||!c.nativeConfigFiles.documents||typeof c.nativeConfigFiles.documents!=='object')fail('Нет закрытого metadataClosure');
 if(stable(Object.keys(c.nativeConfigFiles.documents).sort())!==stable([...new Set(documents.map(d=>d.source))].sort()))fail('Неполный document config inventory');
 for(const list of [c.nativeConfigFiles.owner,...Object.values(c.nativeConfigFiles.documents)]){if(stable(configIdentities(root,list))!==stable(list))fail('Неканонический native config inventory')}
 const validHash=(v:any)=>v===false||typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const kinds=['owner-config','profile-config','native-config','qmd','directory-metadata','include-metadata','extension-metadata'];
 const validContext=(x:any)=>keys(x,['source','format','declaredBy'])&&(x.source===null||documents.some(d=>d.source===x.source&&d.format===x.format))&&(x.source!==null||x.format===null)&&(x.declaredBy===null||typeof x.declaredBy==='string'&&physical(root,x.declaredBy)===x.declaredBy);
 for(const o of c.origins)if(!keys(o,['path','context','kind','sha256','nativeMetadataHash','commonPresence'])||typeof o.path!=='string'||physical(root,o.path)!==o.path||!validContext(o.context)||!kinds.includes(o.kind)||!validHash(o.sha256)||!validHash(o.nativeMetadataHash)||(o.sha256===false)!==(o.nativeMetadataHash===false)||!['absent','supported-canonical'].includes(o.commonPresence))fail('Некорректный metadata origin');
 for(const e of c.dependencies)if(!keys(e,['from','to','context','kind'])||typeof e.from!=='string'||typeof e.to!=='string'||physical(root,e.from)!==e.from||physical(root,e.to)!==e.to||!validContext(e.context)||!['native-config','metadata-file','directory','include','extension'].includes(e.kind))fail('Некорректный metadata dependency edge');
 // Stock inventory подтверждает union; receipt paths сами не являются provenance.
 const active=profiles.filter(p=>!retired||'_quarto-'+p+'.yml'!==retired.file),args=active.length?['--profile',active.join(',')]:[];
 await proof?.check();const native=freshOwnerData(frame,root,active);await proof?.check();
 if(native.dir!==root||!native.fileInformation)fail('Не установлен current metadata owner');proof?.owner(native);
 if(stable(nativeExtensionRoots(root,native.extensions??[]))!==stable(extensionRoots))fail('Native extension roots не соответствуют current stock inventory');
 if(native.quarto?.version!==sourceEvidence.quartoVersion)fail('Quarto metadata identity изменена');
 const retiredPath=retired?join(root,retired.file):undefined;
 if(retiredPath&&(!c.nativeConfigFiles.owner.includes(retiredPath)||Object.values(c.nativeConfigFiles.documents).some(files=>!files.includes(retiredPath))))fail('Нет одного original retired config origin');
 const expected=c.nativeConfigFiles.owner.filter(p=>p!==retiredPath);
 if(stable(configIdentities(root,native.files?.config))!==stable(expected))fail('Native config inventory изменён');
 for(const files of Object.values(c.nativeConfigFiles.documents))if(stable(files.filter(p=>p!==retiredPath))!==stable(expected))fail('Document config inventory не соответствует owner');
 const includes:MetadataInputs['includeMaps']={};
 for(const source of new Set(documents.map(d=>d.source))){
  let information=native.fileInformation[source];
  // Retired generated render scope может содержать inputs вне обычного render-list.
  if(!information){
   await proof?.check();const doc=JSON.parse(await inspectFreshDocument(frame,root,active,join(root,source),proof?.check??(async()=>{})));await proof?.check();
   const identity=sourceIdentities.sources.find(x=>x.source===source);if(!identity)fail('Нет source identity');
   if(doc.project?.dir!==root)await assertRetiredRegularDocument(doc,join(root,source),identity!,source,proof?.retiredContext);
   if(doc.project?.files&&Object.hasOwn(doc.project.files,'config')){if(stable(configIdentities(root,doc.project.files.config))!==stable(expected))fail('Чужой metadata config scope')}
   else if(doc.project?.dir===root)assertUnlistedFallback(doc,join(root,source),native,retired,source);else await assertRetiredRegularDocument(doc,join(root,source),identity!,source,proof?.retiredContext);
   information=doc.fileInformation?.[source]??doc.fileInformation?.[join(root,source)];
  }
  if(!information||!Array.isArray(information.includeMap))fail('Отсутствует native include metadata inventory');
  const identity=sourceIdentities.sources.find(x=>x.source===source);if(!identity)fail('Нет source identity');
  const raw=sourceEvidence.information[source];if(!raw||stable(raw.metadata)!==stable(information.metadata))fail('Physical/lexical raw metadata изменены');
  if(!native.files.input.includes(join(root,source))&&!verifiedRetirement(retired))fail('Source вне current native inventory');
  const physical=sourceEvidence.directInspections[source];if(physical&&retired&&!Object.hasOwn(physical.project?.files??{},'config')){if(physical.project?.dir===root)assertUnlistedFallback(physical,identity!.physicalPath,native,retired,source);else await assertRetiredRegularDocument(physical,identity!.physicalPath,identity!,source,proof?.retiredContext)}
  includes[source]=information.includeMap;
 }
 const actual=await collectMetadataClosure({root,profiles,projectMetadata:native.config,sourceIdentities,documents,nativeConfigFiles:c.nativeConfigFiles,extensionFiles,includeMaps:includes,validateCanonical},retired,c,undefined,proof?.rawPhase);
 if(stable(actual)!==stable(c))fail('Metadata closure/origin/edge/hash изменён');
 return actual;
}
