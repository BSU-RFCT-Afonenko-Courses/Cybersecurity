/** Внутренний capability завершённого exporter run; не caller flag/receipt default. */
import {basename,dirname,join,relative,resolve} from 'stdlib/path';
import type {NativeRunPointer} from './native-run.ts';
import type {CommonPathWitness} from './common-path-binding.ts';
import {readOwnedProfileEvidenceInPhase,readOwnedProfileEvidence} from './owned-export-profile.ts';
import {checkInspectionStore,inspectionRefs,inspectionSnapshotData,type InspectionSnapshot} from './inspection-preimages.ts';
import {metadataBytes,configIdentities,nativeExtensionRoots,freshOwnerData,type FreshOwnerFrame} from './metadata-closure.ts';
import {command,quartoExecutable} from './process.ts';
import type {SourceIdentity} from './source-identities.ts';
import {diagnostic} from '../domain/diagnostics.ts';
const fail=(s:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const equalSet=(a:string[],b:string[])=>Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&new Set(b).size===b.length&&stable([...a].sort())===stable([...b].sort());
const keys=(v:any,names:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
const issued=new WeakSet<object>();
const hash=async(bytes:Uint8Array,algorithm='SHA-256')=>Array.from(new Uint8Array(await crypto.subtle.digest(algorithm,new Uint8Array(bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
export type ExportRetirement={readonly root:string;readonly file:string;readonly sha256:string;readonly sources:readonly string[]};
export function verifiedRetirement(value:unknown):value is ExportRetirement{return !!value&&typeof value==='object'&&issued.has(value)}
async function read(path:string){const bytes=await metadataBytes(path);if(!bytes)fail('Нет completed export evidence: '+path);try{return JSON.parse(new TextDecoder().decode(bytes!))}catch{fail('Некорректный completed export evidence: '+path)}}
function inside(root:string,path:string){const rel=relative(root,path);if(!rel||rel==='..'||rel.startsWith('../')||resolve(root,rel)!==path)fail('Completed export path вне scope');return path}
const completedStates=new WeakMap<InspectionSnapshot,{identity:string;pending:Promise<void>}>();
/** Полнота уже записанного run проверяется также ДО записи retirement transition. */
export async function validateCompletedExportScope(p:NativeRunPointer,w:CommonPathWitness,phase?:InspectionSnapshot,fresh=false){
 if(!phase)return await validateCompletedExportScopeUsing(p,w);
 inspectionSnapshotData(phase,w.runDirectory,inspectionRefs(w),w);const identity=stable(p),old=completedStates.get(phase);
 if(old&&old.identity!==identity)fail('Completed state changed inside operation');
 if(old&&!fresh)return await old.pending;
 const pending=validateCompletedExportScopeUsing(p,w,phase);completedStates.set(phase,{identity,pending});return await pending;
}
async function validateCompletedExportScopeUsing(p:NativeRunPointer,w:CommonPathWitness,phase?:InspectionSnapshot){
 if(phase)await readOwnedProfileEvidenceInPhase(w,phase);else{await readOwnedProfileEvidence(w);await checkInspectionStore(p.directory,inspectionRefs(w))}
 if(stable(await read(join(p.projectRoot,'_generated/course-spec/active-native-run.json')))!==stable(p))fail('Completed export pointer уже не current');
 if(!phase){const witnessBytes=await metadataBytes(join(p.directory,'common-files-path-binding.json'));if(!witnessBytes||await hash(witnessBytes)!==p.commonPathBinding.sha256||await hash(witnessBytes,'SHA-1')!==p.commonPathBinding.sha1||stable(JSON.parse(new TextDecoder().decode(witnessBytes)))!==stable(w))fail('Completed witness/ref не current')}
 const initial=p.initialInputFiles;if(!Array.isArray(initial)||!initial.length||!equalSet(initial,w.inputFiles.map(s=>resolve(p.projectRoot,s)))||stable(initial)!==stable(w.inputFiles.map(s=>resolve(p.projectRoot,s))))fail('Нет exact initial export inputs');
 if(!w.sourceIdentities||!Array.isArray(w.sourceIdentities.sources)||w.sourceIdentities.sources.some(s=>!s||typeof s.source!=='string')||stable(w.sourceIdentities.sources.map(s=>s.source))!==stable(w.inputFiles)||!equalSet(Object.keys(w.documentInspectionHashes),w.inputFiles)||Object.values(w.documentInspectionHashes).some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))fail('Нет полного identity/inspection scope');
 if(!/^[-0-9a-f]{36}$/.test(basename(p.directory))||resolve(p.projectRoot,'_generated/course-spec/native-runs',basename(p.directory))!==p.directory)fail('Чужой run nonce');
 const run=await read(join(p.directory,'native-run.json')),copy=await read(join(p.projectRoot,'_generated/course-spec/native-run.json'));
 if(stable(run)!==stable(copy)||run.schema!=='course-native-run-v1'||run.directory!==p.directory||run.projectRoot!==p.projectRoot||run.outputDirectory!==p.outputDirectory||run.renderAll!==p.renderAll||stable(run.profiles)!==stable(p.profiles)||!Array.isArray(run.documents)||!run.documents.length||!Array.isArray(run.outputFiles)||!equalSet(run.inputFiles,initial!))fail('Нет exact completed export run');
 const expected=w.documents.map(d=>d.source+'\0'+d.format),actual:string[]=[],outputs:string[]=[],byKey=new Map<string,any>();
 for(const d of run.documents){
  if(!d||d.scope!=='document'||d.source!==d.document?.source||!w.inputFiles.includes(d.source)||d.document.exportContext!==true||d.document.format!=='json'||stable(d.document.profiles)!==stable(p.profiles)||typeof d.document.output!=='string')fail('Неполный completed source/format');
  const key=d.source+'\0'+d.document.format,out=inside(p.outputDirectory,resolve(p.outputDirectory,d.document.output));
  if(!await metadataBytes(out))fail('Нет current native output');actual.push(key);outputs.push(out);byKey.set(key,d);
 }
 if(!equalSet(actual,expected)||!equalSet(run.documents.map((d:any)=>d.source),w.inputFiles)||!equalSet(outputs,run.outputFiles))fail('Completed source/format/output set изменён');
 const captured:string[]=[];
 for await(const e of Deno.readDir(join(p.directory,'documents'))){
  if(e.isSymlink||!e.isFile||!e.name.endsWith('.json'))fail('Чужая запись private document inventory');
  const d=await read(join(p.directory,'documents',e.name)),key=d.source+'\0'+d.document?.format,done=byKey.get(key);if(!done)fail('Лишний private captured document');
  if(d.document.output!==done.document.output){
   const original=inside(p.projectRoot,resolve(p.outputDirectory,d.document.output)),relocated=inside(p.outputDirectory,resolve(p.outputDirectory,relative(p.projectRoot,original)));
   if(d.document.exportContext!==true||d.document.format!=='json'||relocated!==resolve(p.outputDirectory,done.document.output))fail('Private output mapping изменён');d.document.output=done.document.output;
  }
  if(stable(d)!==stable(done))fail('Private/completed document не совпадают');captured.push(key);
 }
 if(!equalSet(captured,expected))fail('Неполный private document inventory');
 if(phase)await readOwnedProfileEvidenceInPhase(w,phase);else{await readOwnedProfileEvidence(w);await checkInspectionStore(p.directory,inspectionRefs(w))}
}
/** Не вызывает pointer/loadNativeRun и не создаёт новый proof. */
export async function completedExportRetirement(p:NativeRunPointer,w:CommonPathWitness,phase?:InspectionSnapshot):Promise<ExportRetirement|undefined>{
 const r=p.commonPathRetirement;if(!r)return;
 if(stable(await read(join(p.projectRoot,'_generated/course-spec/active-native-run.json')))!==stable(p))fail('Retirement pointer уже не current');
 if(!phase){const witnessBytes=await metadataBytes(join(p.directory,'common-files-path-binding.json'));if(!witnessBytes||await hash(witnessBytes)!==p.commonPathBinding.sha256||await hash(witnessBytes,'SHA-1')!==p.commonPathBinding.sha1||stable(JSON.parse(new TextDecoder().decode(witnessBytes)))!==stable(w))fail('Retirement witness/ref не current')}
 if(!w.temporaryExportProfile||stable(r)!==stable(w.temporaryExportProfile)||!keys(r,['profile','file','sha1','sha256'])||!/^course-export-[0-9a-f-]{36}$/.test(r.profile)||r.profile!==p.profiles[0]||r.file!=='_quarto-'+r.profile+'.yml'||w.configurationInputs[r.file]!==r.sha256||p.configurationHashes[r.file]!==false||p.outputDirectory!==join(p.projectRoot,'_generated/course-spec/export-output',r.profile))fail('Не доказан generated retirement lifecycle');
 if(await metadataBytes(join(p.projectRoot,r.file)))fail('Retired profile снова существует');
 await validateCompletedExportScope(p,w,phase);
 const token=Object.freeze({root:p.projectRoot,file:r.file,sha256:r.sha256,sources:Object.freeze([...w.inputFiles])});issued.add(token);return token;
}
/** Отсутствие config объясняет только точная live stock форма вне render-list. */
export function assertUnlistedFallback(doc:any,input:string,owner:any,retirement:ExportRetirement|undefined,source:string){
 if(!verifiedRetirement(retirement)||!retirement.sources.includes(source)||owner.dir!==retirement.root||doc.project?.dir!==retirement.root||!Array.isArray(owner.files?.input)||owner.files.input.includes(input)||!keys(doc.project.files,['input'])||!Array.isArray(doc.project.files.input)||doc.project.files.input.length||!keys(doc.project.config,['project','engines'])||!keys(doc.project.config.project,[])||!Array.isArray(doc.project.config.engines)||stable(doc.project.config.engines)!==stable(owner.config?.engines)||stable(doc.engines)!==stable(owner.engines)||doc.quarto?.version!==owner.quarto?.version)fail('Не подтверждён retired unlisted native fallback');
}

/** Private candidate context; only a completed retirement can create its live owner frame. */
export type RetiredRegularContext=object;
const regularContexts=new WeakMap<RetiredRegularContext,{p:NativeRunPointer;w:CommonPathWitness;originals:{owner:any;physical:Record<string,any>;lexical:Record<string,any>};retirement:ExportRetirement;owner:any}>();
async function currentRetiredOwner(p:NativeRunPointer,w:CommonPathWitness,originals:{owner:any},retirement:ExportRetirement,check:()=>Promise<unknown>,frame?:FreshOwnerFrame,phase?:InspectionSnapshot){
 if(!verifiedRetirement(retirement)||retirement.root!==p.projectRoot||w.projectRoot!==p.projectRoot||w.runDirectory!==p.directory||stable(retirement.sources)!==stable(w.inputFiles))fail('Нет closed retired regular scope');
 await check();await validateCompletedExportScope(p,w,phase);
 const active=p.profiles.filter(x=>'_quarto-'+x+'.yml'!==retirement.file),args=active.length?['--profile',active.join(',')]:[];
 const owner=frame?freshOwnerData(frame,p.projectRoot,active):JSON.parse(await command(quartoExecutable(),['inspect',p.projectRoot,...args],p.projectRoot,{QUARTO_PROFILE:active.join(',')}));await check();
 const retiredPath=join(p.projectRoot,retirement.file),original=originals.owner,expected=w.metadataClosure.nativeConfigFiles.owner.filter(x=>x!==retiredPath);
 if(owner.dir!==p.projectRoot||await Deno.realPath(owner.dir)!==p.projectRoot||owner.quarto?.version!==w.quartoVersion||original.dir!==p.projectRoot||!Array.isArray(owner.files?.input)||!owner.fileInformation||!w.metadataClosure.nativeConfigFiles.owner.includes(retiredPath)||stable(configIdentities(p.projectRoot,original.files?.config))!==stable(w.metadataClosure.nativeConfigFiles.owner)||stable(configIdentities(p.projectRoot,owner.files?.config))!==stable(expected)||Object.values(w.metadataClosure.nativeConfigFiles.documents).some(files=>!files.includes(retiredPath)||stable(files.filter(x=>x!==retiredPath))!==stable(expected)))fail('Нет independently current retired owner/config');
 if(stable(nativeExtensionRoots(p.projectRoot,owner.extensions??[]))!==stable(w.nativeExtensionMetadata.roots)||stable(owner.config?.['project-materialization']??null)!==stable(original.config?.['project-materialization']??null))fail('Retired current owner metadata/extension scope изменён');
 await check();await validateCompletedExportScope(p,w,phase);return owner;
}
export async function prepareRetiredRegularContext(p:NativeRunPointer,w:CommonPathWitness,originals:{owner:any;physical:Record<string,any>;lexical:Record<string,any>},retirement:ExportRetirement,check:()=>Promise<unknown>,frame?:FreshOwnerFrame,phase?:InspectionSnapshot):Promise<RetiredRegularContext>{
 const owner=await currentRetiredOwner(p,w,originals,retirement,check,frame,phase),token=Object.freeze({});regularContexts.set(token,{p,w,originals,retirement,owner});return token;
}
export async function checkRetiredRegularContext(token:RetiredRegularContext,check:()=>Promise<unknown>){const c=regularContexts.get(token);if(!c)fail('Чужой retired regular context');await check();if(!verifiedRetirement(c!.retirement))fail('Expired retired context')}
/** Exact native standalone response is a document context, never a new admitted owner. */
export async function assertRetiredRegularDocument(doc:any,input:string,identity:SourceIdentity,source:string,token:RetiredRegularContext|undefined){
 const c=token&&regularContexts.get(token);if(!c)fail('Нет private retired regular context');
 const {p,w,originals,owner}=c!,old=w.sourceIdentities.sources.find(x=>x.source===source),original=originals.physical[source],lexical=originals.lexical[source],project=doc.project,dir=dirname(input),rel=relative(p.projectRoot,dir),retiredPath=join(p.projectRoot,c!.retirement.file);
 if(!old||stable(old)!==stable(identity)||old.linkTarget!==null||old.physicalPath!==input||input!==resolve(p.projectRoot,source)||old.nativeOwner!==p.projectRoot||!originals.owner.files.input.includes(input)||owner.files.input.includes(input)||original?.project?.dir!==p.projectRoot||lexical?.project?.dir!==p.projectRoot||stable(configIdentities(p.projectRoot,original.project.files?.config))!==stable(w.metadataClosure.nativeConfigFiles.owner)||stable(configIdentities(p.projectRoot,lexical.project.files?.config))!==stable(w.metadataClosure.nativeConfigFiles.documents[source])||!w.metadataClosure.nativeConfigFiles.documents[source].includes(retiredPath))fail('Нет original listed regular retired identity');
 if(!rel||rel==='..'||rel.startsWith('../')||resolve(p.projectRoot,rel)!==dir||await Deno.realPath(dir)!==dir||!keys(project,['quarto','dir','engines','config','files','fileInformation','extensions'])||project.dir!==dir||!keys(project.files,['input'])||!Array.isArray(project.files.input)||project.files.input.length||!keys(project.config,['project','engines'])||!keys(project.config.project,[])||stable(project.config.engines)!==stable(owner.config?.engines)||!Array.isArray(project.engines)||project.engines.length||!keys(project.fileInformation,[])||stable(project.quarto)!==stable(original.quarto)||stable(doc.quarto)!==stable(original.quarto)||stable(doc.engines)!==stable(original.engines)||stable(doc.engines)!==stable(owner.engines)||!Array.isArray(project.extensions)||project.extensions.some((e:any)=>typeof e?.path!=='string'||!owner.extensions?.some((o:any)=>o.path===e.path)))fail('Нет exact retired standalone native shape');
 const raw=doc.fileInformation?.[input],prior=original.fileInformation?.[input],lex=lexical.fileInformation?.[input],ownerRaw=originals.owner.fileInformation[source];
 if(!raw||!raw.metadata||typeof raw.metadata!=='object'||Array.isArray(raw.metadata)||!Array.isArray(raw.includeMap)||stable(raw.metadata)!==stable(prior?.metadata)||stable(raw.metadata)!==stable(lex?.metadata)||stable(raw.metadata)!==stable(ownerRaw?.metadata)||stable(raw.includeMap)!==stable(prior?.includeMap)||stable(raw.includeMap)!==stable(lex?.includeMap)||stable(raw.includeMap)!==stable(ownerRaw?.includeMap))fail('Retired standalone raw metadata/include mismatch');
}
