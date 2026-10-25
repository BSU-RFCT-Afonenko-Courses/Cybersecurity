/** Единственный internal SOURCE → execution → restored lifecycle, ARCH82/84. */
import {join,resolve,relative,dirname,basename} from 'stdlib/path';
import {nativeJsonIntentDirectory,captureNativeJsonIntents,actualNativeJsonSlot,writeNativeJsonIntent} from './owned-json-writer.ts';
import {diagnostic} from '../domain/diagnostics.ts';
import {command,quartoExecutable} from './process.ts';
import {beginConfigEntry,openConfigEntryView,withOverlayRuntime,assertOverlayRuntimeBoundary,type EntryIdentity} from './owned-config-entry.ts';
import {captureSourceFiles,assertSourceFiles,captureSourceRoles,sourceRoleRefs,validateSourceRoles,captureSourceDependencies,assertSourceDependencies,overlayEntryState,assertOverlaySourceFiles,ownedCtimeRepresentation,admitNativeJsonSlots,nativeJsonSnapshot,assertNativeJsonDocument,assertNativeJsonAdapter,type NativeJsonSlot,type SourceFiles,type SourceDependencyClosure,type SourceInspectionRoles,type SourceRoleIdentities} from './owned-config-source.ts';
import {deriveExecutionConfig,assertExecutionMetadata,type DerivedInputProjection} from './owned-config-derive.ts';
import {overlayReference,restorationReference,validateRestorationRecord,validateCompletedRestorationRefs,type OwnedConfigOverlay,type RestorationReference} from './owned-config-proof.ts';
import {withInspectionWriter,type InspectionSnapshot,inspectionSnapshotData,inspectionRefs} from './inspection-preimages.ts';
import type {NativeRawPhase} from './native-raw-metadata.ts';
import {collectMetadataClosure,metadataBytes,nativeExtensionRoots,configIdentities,withOverlayMetadataReplay,type MetadataClosure} from './metadata-closure.ts';
import {section,invocationIdentity} from './common-path-binding.ts';
import {sourceFile,sourceMetadata,type CurrentSourceEvidence} from './source-identities.ts';
import type {CommonPathWitness} from './common-path-binding.ts';
import type {NativeRunPointer} from './native-run.ts';
const fail=(message:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',message,{field:'project-materialization'})};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=async(b:Uint8Array,alg='SHA-256')=>Array.from(new Uint8Array(await crypto.subtle.digest(alg,new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
const hashes=async(b:Uint8Array)=>({sha1:await hash(b,'SHA-1'),sha256:await hash(b)});
const keys=(v:any,n:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===n.sort().join(',');
const sameEntry=(a:EntryIdentity,b:EntryIdentity,ctime=true)=>stable(ctime?a:{...a,ctime:b.ctime})===stable(b);
const fixed='owned-export-source-context.json',rawSlot='owned-export-source-config.raw';
export type OverlaySourceContext={
 schema:'course-owned-export-source-context-v2';projectRoot:string;runDirectory:string;nonce:string;
 sourceProfiles:string[];selectionProfiles:string[];selected:string[];roles:SourceInspectionRoles;identities:SourceRoleIdentities;
 sourceParent:EntryIdentity;leaseEntry:EntryIdentity;sourceFiles:SourceFiles;dependencies:SourceDependencyClosure;metadataClosure:MetadataClosure;
 base:{file:'_quarto.yml'|'_quarto.yaml';present:true;hashes:{sha1:string;sha256:string};originalEntry:EntryIdentity};
 execution:{hashes:{sha1:string;sha256:string};preparedEntry:EntryIdentity;preparedFile:SourceFiles[string]};
 profile:{name:string;file:string;hashes:{sha1:string;sha256:string};entry:EntryIdentity};
 projection:DerivedInputProjection;runtime:Awaited<ReturnType<typeof openConfigEntryView>>['runtime'];
};
async function readPrivate(path:string){const s=await Deno.lstat(path);if(!s.isFile||s.isSymlink||await Deno.realPath(path)!==path||s.mode===null||(s.mode&0o7777)!==0o600)fail('Overlay private file type/mode');return await Deno.readFile(path)}
async function writePrivate(path:string,value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));await Deno.writeFile(path,bytes,{createNew:true,mode:0o600});if(stable(JSON.parse(new TextDecoder().decode(await readPrivate(path))))!==stable(value))fail('Overlay private create-new readback');return await hashes(bytes)}
async function inspect(root:string,profiles:string[],check:()=>Promise<unknown>){await check();const text=await command(quartoExecutable(),['inspect',root,'--profile',profiles.join(',')],root,{QUARTO_PROFILE:profiles.join(',')});await check();return text}
/** Lease precedes generated profile/source mutation. No author activation flag. */
export async function startOwnedConfigOverlay(root:string,sourceText:string,sourceProfiles:string[]){
 const bank=JSON.parse(sourceText);if(bank.dir!==root||bank.config?.project?.type!=='book')fail('Нет source book owner');
 const bases=(bank.files?.config??[]).filter((p:string)=>p===join(root,'_quarto.yml')||p===join(root,'_quarto.yaml'));if(bases.length!==1)fail('Не установлен единственный actual base config entry');
 const t=await beginConfigEntry(root,basename(bases[0]) as '_quarto.yml'|'_quarto.yaml');
 const baseline=await captureSourceFiles(root);let ctx:OverlaySourceContext|undefined,ref:OwnedConfigOverlay|undefined,active=false;
 const directory=join(root,'_generated/course-spec/native-runs',crypto.randomUUID());
 const checkInitial=async(profile?:string)=>{await t.checkSource();const live=await captureSourceFiles(root),expected={...baseline};if(profile){const row=live[profile];if(!row||Object.hasOwn(baseline,profile)||row.kind!=='file')fail('Не create-new owned profile');expected[profile]=row}if(stable(live)!==stable(expected))fail('Source drift до overlay preparation')};
 try{await checkInitial()}catch(e){t.close();throw e}
 return {
  close:t.close,
  async abort(){
   await t.recoverSource();
   if(ctx&&active){
    // Failed execution retires only its held config/profile entries. No completed capability.
    await t.quarantineProfile();
    const protectedPaths=await protectedOverlayPaths(root,ctx),seen=new Set<string>();
    for(const source of ctx.selected){
     const id=ctx.identities[source];if(id.linkTarget!==null||id.physicalPath!==resolve(root,source))continue;
     const file=basename(source),dot=file.lastIndexOf('.'),stem=dot>0?file.slice(0,dot):file,name=relative(root,join(dirname(resolve(root,source)),stem+'_files')).replaceAll('\\','/'),path=resolve(root,name);
     if(seen.has(name)||Object.hasOwn(ctx.sourceFiles,name)||protectedPaths.some(p=>path===resolve(p)||path.startsWith(resolve(p)+'/')||resolve(p).startsWith(path+'/')))continue;seen.add(name);
     try{await Deno.lstat(path)}catch(e){if(e instanceof Deno.errors.NotFound)continue;throw e}
     const destination=join(directory,'aborted-native-empty');try{await Deno.mkdir(destination,{mode:0o700})}catch(e){if(!(e instanceof Deno.errors.AlreadyExists))throw e}
     await t.quarantineEmptyNativeOutput(name,destination);
    }
    await t.retire(join(directory,rawSlot));await t.verifyRetired();active=false;
   }
  },
  async prepare(profile:string,bytes:Uint8Array,selected:string[],output:string){
   if(ctx||active||!/^course-export-[0-9a-f-]{36}$/.test(profile))fail('Неверная overlay preparation phase');
   const file='_quarto-'+profile+'.yml',owned=JSON.parse(new TextDecoder().decode(bytes));await checkInitial(file);
   if(owned.project?.['output-dir']!==output||stable(owned.project.render)!==stable(selected))fail('Owned profile selected/output mismatch');
   const sourceFiles=await captureSourceFiles(root);ownedCtimeRepresentation(t.source.identity.ctime,sourceFiles[t.source.entry]?.ctime);const sourceCheck=async()=>{await t.checkSource();await assertSourceFiles(root,sourceFiles)};
   // Fresh source frame must agree with the original stock source preimage.
   const fresh=JSON.parse(await inspect(root,sourceProfiles,sourceCheck));if(stable(fresh)!==stable(bank))fail('Source owner изменён после initial source inspect');
   const derived=await deriveExecutionConfig(bank,owned),executionBytes=new TextEncoder().encode(JSON.stringify(derived.config));
   const preparedEntry=await t.prepare(executionBytes),preparedFile=await overlayEntryState(join(t.leasePath,'execution.prepared'));
   const profileEntry=await t.bindProfile(file,bytes);
   const selectionProfiles=[profile,...sourceProfiles],selectionText=await inspect(root,selectionProfiles,sourceCheck),selection=JSON.parse(selectionText);
   await Deno.mkdir(directory,{recursive:true,mode:0o700});if(((await Deno.lstat(directory)).mode!&0o7777)!==0o700)fail('Нет private overlay run');
   let sourceRoles:Awaited<ReturnType<typeof captureSourceRoles>>|undefined,all:Record<string,any>|undefined;
   await withInspectionWriter(directory,async writer=>{sourceRoles=await captureSourceRoles({root,selected,sourceProfiles,selectionProfiles,sourceOwnerText:sourceText,selectionText,append:writer.append,check:()=>t.checkSource()});all=await writer.snapshot()});
   const roles=sourceRoles!.roles,identities=sourceRoles!.identities;
   const sourceIdentities={schema:'course-native-source-identities-v1' as const,sources:selected.map(source=>({source,physicalPath:identities[source].physicalPath,linkTarget:identities[source].linkTarget,nativeOwner:root,physicalInspectionHash:roles.physical[source]}))};
   const extensionRoots=nativeExtensionRoots(root,selection.extensions??[]),extensionFiles:string[]=[];
   for(const ext of selection.extensions??[])for(const name of ['_extension.yml','_extension.yaml']){const p=join(ext.path,name);if(await metadataBytes(p))extensionFiles.push(p)}
   const metadataClosure=await collectMetadataClosure({root,profiles:selectionProfiles,projectMetadata:selection.config,sourceIdentities,documents:selected.flatMap(source=>Object.keys(all![roles.lexical[source]].formats).map(format=>({source,format:['pdf','beamer'].includes(format)?'latex':format}))),nativeConfigFiles:{owner:configIdentities(root,selection.files.config),documents:Object.fromEntries(selected.map(source=>[source,configIdentities(root,all![roles.lexical[source]].project.files.config)]))},extensionFiles:[...new Set(extensionFiles)],includeMaps:Object.fromEntries(selected.map(source=>[source,selection.fileInformation[source].includeMap])),validateCanonical:section});
   const hookRoots=new Set(extensionRoots);
   for(const native of [bank,owned])for(const key of ['pre-render','post-render'])for(const hook of [native.config?.project?.[key]??native.project?.[key]].flat().filter(x=>x!==undefined)){
    if(typeof hook!=='string'||!hook||hook.includes('\0'))fail('Неподдержанный source hook dependency');const path=resolve(root,hook),parts=path.split('/'),at=parts.lastIndexOf('_extensions');
    if(at<1||await Deno.realPath(path)!==path||!(await Deno.lstat(path)).isFile)fail('Нет regular installed source hook dependency');hookRoots.add(parts.slice(0,at+1).join('/'));
   }
   const tool=JSON.parse(await invocationIdentity(root)),toolFiles=[tool.physical,join(dirname(tool.physical),'quarto.js')];
   for(const path of toolFiles)if(await Deno.realPath(path)!==path||!(await Deno.lstat(path)).isFile)fail('Нет closed stock Quarto runtime dependency');
   const dependencies=await captureSourceDependencies([...new Set([...metadataClosure.origins.map(o=>o.path),...toolFiles])],[...hookRoots]);
   ctx={schema:'course-owned-export-source-context-v2',projectRoot:root,runDirectory:directory,nonce:basename(directory),sourceProfiles:[...sourceProfiles],selectionProfiles,selected:[...selected],roles,identities,sourceParent:t.source.parent,leaseEntry:t.source.leaseIdentity,sourceFiles,dependencies,metadataClosure,base:{file:t.source.entry,present:true,hashes:await hashes(t.source.bytes),originalEntry:t.source.identity},execution:{hashes:await hashes(executionBytes),preparedEntry,preparedFile},profile:{name:profile,file,hashes:await hashes(bytes),entry:profileEntry},projection:derived.projection,runtime:t.source.runtime};
   await sourceCheck();await assertSourceDependencies(dependencies);await Deno.writeFile(join(directory,rawSlot),t.source.bytes,{createNew:true,mode:0o600});
   const sourceContext=await writePrivate(join(directory,fixed),ctx);ref={kind:'owned-config-overlay-v1',sourceContext};return {directory,ownedConfigOverlay:ref};
  },
  async activate(){
   if(!ctx||!ref||active)fail('Нет prepared overlay');await assertSourceFiles(root,ctx!.sourceFiles);await assertSourceDependencies(ctx!.dependencies);await t.quarantineSource();await t.installExecution();active=true;
   const entries=await t.activeEntries();await t.publishBootstrap(new TextEncoder().encode(JSON.stringify({schema:'course-owned-export-overlay-bootstrap-v1',projectRoot:root,runDirectory:directory,ownedConfigOverlay:ref,sourceEntry:entries.source,executionEntry:entries.execution})));await t.checkActive();
  },
  async checkActive(){if(!active)fail('Overlay не active');await t.checkActive()},
  async restore(){
   if(!ctx||!ref||!active)fail('Нет active overlay для restoration');await t.quarantineExecution();await t.restoreSource();await t.quarantineProfile();active=false;
   const restoredEntry=await t.restoredEntry();return {ctx,ref,restoredEntry,transaction:t};
  },
 };
}
// Только lifetime withOverlayCurrentCheck, без повторного admission из nested helpers.
type OverlayReadState={pointer:string;ref:string;ctx:OverlaySourceContext;boundary?:()=>Promise<OverlaySourceContext>;slots?:NativeJsonSlot[];intentsIdentity?:string;protected?:string[];owned?:any;adapters?:{contract:any;fragments:any[]}[];originals?:{w:CommonPathWitness;all:Record<string,any>}};
const overlayReads=new Map<string,OverlayReadState>();
function overlayRead(p:{projectRoot:string;directory:string;ownedConfigOverlay?:unknown}){const state=overlayReads.get(p.directory);if(state&&(state.ctx.projectRoot!==p.projectRoot||state.ref!==stable(p.ownedConfigOverlay)))fail('Foreign overlay operation');return state}
function immutable<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const c of Object.values(v))immutable(c);Object.freeze(v)}return v}
export async function assertOverlayBoundary(p:NativeRunPointer){const state=overlayRead(p);if(!state?.boundary||state.pointer!==stable(p))fail('Foreign/expired overlay operation');await state!.boundary!()}
export async function readOverlayContext(p:{projectRoot:string;directory:string;ownedConfigOverlay?:unknown}):Promise<OverlaySourceContext>{
 const admitted=overlayRead(p);if(admitted)return admitted.ctx;return await readOverlayContextFresh(p);
}
async function readOverlayContextFresh(p:{projectRoot:string;directory:string;ownedConfigOverlay?:unknown}):Promise<OverlaySourceContext>{
 const ref=overlayReference(p.ownedConfigOverlay),raw=await readPrivate(join(p.directory,fixed));if(await hash(raw)!==ref.sourceContext.sha256||await hash(raw,'SHA-1')!==ref.sourceContext.sha1)fail('Source-context ref/hash mismatch');
 const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) as OverlaySourceContext;
 if(!keys(c,['schema','projectRoot','runDirectory','nonce','sourceProfiles','selectionProfiles','selected','roles','identities','sourceParent','leaseEntry','sourceFiles','dependencies','metadataClosure','base','execution','profile','projection','runtime'])||c.schema!=='course-owned-export-source-context-v2'||c.projectRoot!==p.projectRoot||c.runDirectory!==p.directory||c.nonce!==basename(p.directory)||!/^[-0-9a-f]{36}$/.test(c.nonce)||join(c.projectRoot,'_generated/course-spec/native-runs',c.nonce)!==c.runDirectory||!keys(c.base,['file','present','hashes','originalEntry'])||!['_quarto.yml','_quarto.yaml'].includes(c.base.file)||c.base.present!==true||!keys(c.execution,['hashes','preparedEntry','preparedFile'])||!keys(c.profile,['name','file','hashes','entry'])||c.profile.file!=='_quarto-'+c.profile.name+'.yml'||stable(c.selectionProfiles)!==stable([c.profile.name,...c.sourceProfiles]))fail('Нет closed overlay source context');
 sourceRoleRefs(c.roles,c.selected);const source=await readPrivate(join(p.directory,rawSlot));if(await hash(source)!==c.base.hashes.sha256||await hash(source,'SHA-1')!==c.base.hashes.sha1)fail('Original source raw slot изменён');
 return c;
}
/** No wildcard: bootstrap admits only the one fixed active lease and its immutable context. */
export async function discoverOwnedConfigOverlay(root:string,profiles:string[],output:string){
 const lease=join(root,'_generated/course-spec/owned-config-overlay-lease');try{const s=await Deno.lstat(lease);if(s.isSymlink||!s.isDirectory||(s.mode!&0o7777)!==0o700||await Deno.realPath(lease)!==lease)fail('Foreign/orphan overlay lease')}catch(e){if(e instanceof Deno.errors.NotFound)return;throw e}
 const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readPrivate(join(lease,'bootstrap.json'))));
 if(!keys(b,['schema','projectRoot','runDirectory','ownedConfigOverlay','sourceEntry','executionEntry'])||b.schema!=='course-owned-export-overlay-bootstrap-v1'||b.projectRoot!==root)fail('Нет closed owned overlay bootstrap');
 const ctx=await readOverlayContext({projectRoot:root,directory:b.runDirectory,ownedConfigOverlay:b.ownedConfigOverlay});
 if(stable(profiles)!==stable([ctx.profile.name])||output!==join(root,'_generated/course-spec/export-output',ctx.profile.name)||!sameEntry(b.sourceEntry,ctx.base.originalEntry,false)||!sameEntry(b.executionEntry,ctx.execution.preparedEntry,false))fail('Overlay bootstrap identity/profile/output mismatch');
 const view=await openConfigEntryView(root,ctx.base.file);try{await view.check();if(!sameEntry(view.identity,b.executionEntry)||await hash(view.bytes)!==ctx.execution.hashes.sha256||await hash(view.bytes,'SHA-1')!==ctx.execution.hashes.sha1)fail('Нет current actual execution config')}finally{view.close()}
 const original=await readPrivate(join(lease,'source.raw'));if(await hash(original)!==ctx.base.hashes.sha256)fail('Active source backup изменён');
 const quarantined=await metadataBytes(join(lease,'quarantined-source'));if(!quarantined||await hash(quarantined)!==ctx.base.hashes.sha256)fail('Нет retained original source entry');
 return {directory:ctx.runDirectory,ownedConfigOverlay:overlayReference(b.ownedConfigOverlay),sourceInspectionRefs:[...sourceRoleRefs(ctx.roles,ctx.selected)]};
}

const dirIdentity=(a:EntryIdentity,b:EntryIdentity)=>['ino','devMajor','devMinor','uid','gid','mode'].every(k=>(a as any)[k]===(b as any)[k]);
/** Both independently stored role sets; execution owner stays genuine singleton. */
export async function overlayOriginalsInPhase(w:CommonPathWitness,phase:InspectionSnapshot,executionOwner:any,executionLexical:Record<string,any>){
 const ctx=await readOverlayContext({projectRoot:w.projectRoot,directory:w.runDirectory,ownedConfigOverlay:w.ownedConfigOverlay});
 if(stable(ctx.selected)!==stable(w.inputFiles)||stable(w.profiles)!==stable([ctx.profile.name])||stable([...sourceRoleRefs(ctx.roles,ctx.selected)].sort())!==stable([...(w.sourceInspectionRefs??[])].sort()))fail('Overlay explicit source/execution role scope mismatch');
 const all=inspectionSnapshotData(phase,w.runDirectory,inspectionRefs(w),w),original=validateSourceRoles(ctx.projectRoot,ctx.selected,ctx.sourceProfiles,ctx.roles,all,ctx.profile.name,ctx.identities);
 const owned=JSON.parse(new TextDecoder().decode(await readPrivate(join(w.runDirectory,'owned-export-profile.json'))));
 const derived=await deriveExecutionConfig(original.owner,owned),derivedBytes=new TextEncoder().encode(JSON.stringify(derived.config));
 if(stable(derived.projection)!==stable(ctx.projection)||stable(await hashes(derivedBytes))!==stable(ctx.execution.hashes))fail('Forged source/execution derivation pair');
 assertExecutionMetadata(original.owner,executionOwner,owned,ctx.projection);
 if(stable(section(original.selection.config['project-materialization']))!==stable(w.canonicalOwnerDeclarations))fail('Source/execution canonical declaration mismatch');
 for(const source of ctx.selected){const before=all[ctx.roles.lexical[source]].fileInformation[resolve(w.projectRoot,source)],after=executionLexical[source]?.fileInformation?.[resolve(w.projectRoot,source)];if(!before||!after||stable(before.metadata)!==stable(after.metadata)||stable(before.includeMap)!==stable(after.includeMap))fail('Source/execution raw document metadata mismatch')}
 return {ctx,original,all};
}
async function restorationFor(p:NativeRunPointer,ctx:OverlaySourceContext){
 const perRun=JSON.parse(new TextDecoder().decode(await readPrivate(join(p.directory,'native-run.json')))),rootCopy=JSON.parse(new TextDecoder().decode(await readPrivate(join(p.projectRoot,'_generated/course-spec/native-run.json'))));
 const ref=validateCompletedRestorationRefs(p,perRun,rootCopy),bytes=await readPrivate(join(p.directory,ref.file));if(await hash(bytes)!==ref.sha256||await hash(bytes,'SHA-1')!==ref.sha1)fail('Bound restoration record hash drift');
 return validateRestorationRecord(JSON.parse(new TextDecoder().decode(bytes)),{projectRoot:p.projectRoot,runDirectory:p.directory,file:ctx.base.file,sourceContext:overlayReference(p.ownedConfigOverlay).sourceContext,sourceConfig:ctx.base.hashes,executionConfig:ctx.execution.hashes,originalEntry:ctx.base.originalEntry});
}
function restoredCtime(ctx:OverlaySourceContext,timestamp:string){return ownedCtimeRepresentation(ctx.base.originalEntry.ctime,ctx.sourceFiles[ctx.base.file]?.ctime)(timestamp)}
/** Exact source identity/closure checks in either new-mode state; no legacy token. */
export async function assertOverlayCurrent(p:NativeRunPointer,ctx?:OverlaySourceContext){return await withOverlayCurrentCheck(p,ctx,check=>check())}
export async function withOverlayCurrentCheck<T>(p:NativeRunPointer,ctx:OverlaySourceContext|undefined,use:(check:()=>Promise<OverlaySourceContext>)=>Promise<T>,originals?:{w:CommonPathWitness;phase:InspectionSnapshot}){
 return await withOverlayRuntime(p.projectRoot,()=>withOverlayCurrentCheckUsing(p,ctx,use,originals));
}
async function withOverlayCurrentCheckUsing<T>(p:NativeRunPointer,ctx:OverlaySourceContext|undefined,use:(check:()=>Promise<OverlaySourceContext>)=>Promise<T>,originals?:{w:CommonPathWitness;phase:InspectionSnapshot}){
 if(overlayReads.has(p.directory))fail('Reentrant overlay operation');
 const actual=await readOverlayContextFresh(p);if(ctx&&stable(ctx)!==stable(actual))fail('Foreign admitted overlay context');ctx=immutable(actual);const bound=ctx,pointerIdentity=stable(p);
 const state:OverlayReadState={pointer:pointerIdentity,ref:stable(p.ownedConfigOverlay),ctx:bound,...(originals?{originals:{w:originals.w,all:inspectionSnapshotData(originals.phase,p.directory,inspectionRefs(originals.w),originals.w)}}:{})};
 const view=await openConfigEntryView(p.projectRoot,ctx.base.file);let nativeOutputIdentity:string|undefined;
 let heldSource:Awaited<ReturnType<typeof openConfigEntryView>>|undefined;try{if(p.overlayState==='active')heldSource=await openConfigEntryView(join(p.projectRoot,'_generated/course-spec/owned-config-overlay-lease'),'quarantined-source')}catch(e){view.close();throw e}
 overlayReads.set(p.directory,state);
 const local=async()=>{if(overlayReads.get(p.directory)!==state||stable(p)!==pointerIdentity)fail('Overlay pointer changed during operation');await view.check();await heldSource?.check();return bound};
 const check=async()=>{await local();await assertOverlayRuntimeBoundary(p.projectRoot);const current=await readOverlayContextFresh(p);if(stable(current)!==stable(bound))fail('Overlay context changed at boundary');state.owned=undefined;state.adapters=undefined;const ctx=bound;
  if(!dirIdentity(view.parent,ctx.sourceParent)||stable(view.runtime)!==stable(ctx.runtime))fail('Overlay source/tool/parent identity drift');
  const expected={...ctx.sourceFiles},dependencies=structuredClone(ctx.dependencies);
  if(p.overlayState==='active'){
   if(p.ownedConfigRestoration!==undefined)fail('Active overlay has restoration ref');
   try{await Deno.lstat(join(p.directory,'owned-export-restored-entry.json'));fail('Active overlay has final restoration slot')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}
   const b=JSON.parse(new TextDecoder().decode(await readPrivate(join(p.projectRoot,'_generated/course-spec/owned-config-overlay-lease/bootstrap.json'))));
   if(!heldSource||!dirIdentity(heldSource.parent,ctx.leaseEntry)||!sameEntry(heldSource.identity,b.sourceEntry)||!sameEntry(heldSource.identity,ctx.base.originalEntry,false)||stable(await hashes(heldSource.bytes))!==stable(ctx.base.hashes))fail('Active quarantined source identity/bytes drift');await heldSource!.check();
   if(stable(b.ownedConfigOverlay)!==stable(p.ownedConfigOverlay)||b.runDirectory!==p.directory||!sameEntry(view.identity,b.executionEntry)||!sameEntry(b.executionEntry,ctx.execution.preparedEntry,false)||stable(await hashes(view.bytes))!==stable(ctx.execution.hashes))fail('Active execution entry not bound to bootstrap');
   const live=await overlayEntryState(join(p.projectRoot,ctx.base.file));if(stable({...live,ctime:ctx.execution.preparedFile.ctime})!==stable(ctx.execution.preparedFile))fail('Prepared/execution entry identity changed');expected[ctx.base.file]=live;
   for(const name of Object.keys(dependencies.origins))if(name===join(p.projectRoot,ctx.base.file))dependencies.origins[name]=live;
  }else if(p.overlayState==='restored'){
   const record=await restorationFor(p,ctx);if(!sameEntry(view.identity,record.restoredEntry)||stable(await hashes(view.bytes))!==stable(ctx.base.hashes))fail('Source entry does not match bound restored identity');
   expected[ctx.base.file]={...expected[ctx.base.file],ctime:restoredCtime(ctx,record.restoredEntry.ctime)};delete expected[ctx.profile.file];
   for(const name of Object.keys(dependencies.origins)){if(name===join(p.projectRoot,ctx.base.file))dependencies.origins[name]={...(dependencies.origins[name] as any),ctime:restoredCtime(ctx,record.restoredEntry.ctime)};if(name===join(p.projectRoot,ctx.profile.file))dependencies.origins[name]=false}
   await assertRetiredOverlayInventory(p,ctx);
  }else fail('Нет closed overlay lifecycle state');
  const outputIdentity=await checkOverlaySourceInventory(p.projectRoot,ctx,expected,p);if(nativeOutputIdentity!==undefined&&nativeOutputIdentity!==outputIdentity)fail('Native JSON identity changed across currentness operation');nativeOutputIdentity=outputIdentity;await assertSourceDependencies(dependencies);await view.check();return ctx;
 };state.boundary=check;try{await check();const result=await use(local);await check();return result}finally{overlayReads.delete(p.directory);heldSource?.close();view.close()}
}
export async function assertRetiredOverlayInventory(p:NativeRunPointer,ctx:OverlaySourceContext){
 try{await Deno.lstat(join(p.projectRoot,'_generated/course-spec/owned-config-overlay-lease'));fail('Active/orphan lease remains after restoration')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}
 const dir=join(p.directory,'owned-export-config-quarantine'),info=await Deno.lstat(dir);if(!info.isDirectory||info.isSymlink||(info.mode!&0o7777)!==0o700||await Deno.realPath(dir)!==dir)fail('Нет exact retired private lease');
 const names=[];for await(const e of Deno.readDir(dir)){if(e.isSymlink||!e.isFile)fail('Retired private lease type drift');names.push(e.name)}if(stable(names.sort())!==stable(['bootstrap.json','quarantined-execution','retired-profile','source.raw']))fail('Retired private lease inventory missing/extra');
 const source=await readPrivate(join(dir,'source.raw')),execution=await readPrivate(join(dir,'quarantined-execution'));
 if(stable(await hashes(source))!==stable(ctx.base.hashes)||stable(await hashes(execution))!==stable(ctx.execution.hashes))fail('Retained original/execution bytes changed');
 const profile=await metadataBytes(join(dir,'retired-profile'));if(!profile||stable(await hashes(profile))!==stable(ctx.profile.hashes))fail('Retained owned profile bytes changed');
 const state=await overlayEntryState(join(dir,'quarantined-execution'));if(stable({...state,ctime:ctx.execution.preparedFile.ctime})!==stable(ctx.execution.preparedFile))fail('Retained execution identity changed');
 const old=ctx.sourceFiles[ctx.profile.file],prof=await overlayEntryState(join(dir,'retired-profile'));if(stable({...prof,ctime:old.ctime})!==stable(old))fail('Retained profile identity changed');
 const b=JSON.parse(new TextDecoder().decode(await readPrivate(join(dir,'bootstrap.json'))));if(!keys(b,['schema','projectRoot','runDirectory','ownedConfigOverlay','sourceEntry','executionEntry'])||b.projectRoot!==p.projectRoot||b.runDirectory!==p.directory||stable(b.ownedConfigOverlay)!==stable(p.ownedConfigOverlay)||!sameEntry(b.sourceEntry,ctx.base.originalEntry,false)||!sameEntry(b.executionEntry,ctx.execution.preparedEntry,false))fail('Retained bootstrap binding changed');
}

export const overlaySourceRefs=(ctx:OverlaySourceContext)=>sourceRoleRefs(ctx.roles,ctx.selected);

/** Единственные retained metadata inputs: completed RESTORED execution base/profile. */
export async function validatedOverlayReplayInputs(p:NativeRunPointer){
 if(p.schema!=='course-native-run-pointer-v3'||p.overlayState!=='restored')fail('Нет restored overlay replay');
 if(stable(JSON.parse(await Deno.readTextFile(join(p.projectRoot,'_generated/course-spec/active-native-run.json'))))!==stable(p))fail('Replay pointer не current');
 const ctx=await readOverlayContext(p);await restorationFor(p,ctx);await assertRetiredOverlayInventory(p,ctx);
 const result:Record<string,{retainedPath:string;sha256:string;liveSha256:string|false}>={
  [join(p.projectRoot,ctx.base.file)]:{retainedPath:join(p.directory,'owned-export-config-quarantine/quarantined-execution'),sha256:ctx.execution.hashes.sha256,liveSha256:ctx.base.hashes.sha256},
  [join(p.projectRoot,ctx.profile.file)]:{retainedPath:join(p.directory,'owned-export-profile.json'),sha256:ctx.profile.hashes.sha256,liveSha256:false},
 };
 for(const e of Object.values(result)){const bytes=await readPrivate(e.retainedPath);if(await hash(bytes)!==e.sha256)fail('Replay retained input hash mismatch')}
 return result;
}

/** Fresh SOURCE frame, separate from immutable genuine execution inspections. */
export async function validateRestoredOverlayNative(p:NativeRunPointer,w:CommonPathWitness,execution:{owner:any;physical:Record<string,any>;lexical:Record<string,any>},ctx:OverlaySourceContext,phase:InspectionSnapshot,check:()=>Promise<unknown>,rawPhase?:NativeRawPhase){
 if(p.overlayState!=='restored')fail('Нет restored source reader');
 const all=inspectionSnapshotData(phase,w.runDirectory,inspectionRefs(w),w),prior=validateSourceRoles(ctx.projectRoot,ctx.selected,ctx.sourceProfiles,ctx.roles,all,ctx.profile.name,ctx.identities);
 const owner=JSON.parse(await inspect(p.projectRoot,ctx.sourceProfiles,check));
 if(stable(owner)!==stable(prior.owner))fail('Restored fresh SOURCE owner отличается от admitted source frame');
 const information:Record<string,any>={},directInspections:Record<string,any>={},sourceHashes:Record<string,string>={};
 for(const source of w.inputFiles){
  await check();const old=w.sourceIdentities.sources.find(x=>x.source===source)!;if(!old)fail('Нет admitted execution source identity');
  const file=await sourceFile(p.projectRoot,source);if(file.physicalPath!==old.physicalPath||file.linkTarget!==old.linkTarget)fail('Restored source physical/lexical identity drift');
  const before=all[ctx.roles.lexical[source]],physical=all[ctx.roles.physical[source]];
  let raw=owner.fileInformation?.[source];
  if(!owner.files.input.includes(file.physicalPath)||!raw||old.linkTarget!==null){
   await check();const doc=JSON.parse(await command(quartoExecutable(),['inspect',file.physicalPath,'--profile',ctx.sourceProfiles.join(',')],p.projectRoot,{QUARTO_PROFILE:ctx.sourceProfiles.join(',')}));await check();directInspections[source]=doc;
   if(doc.project?.dir===p.projectRoot&&Array.isArray(doc.project.files?.config)){
    if(stable(configIdentities(p.projectRoot,doc.project.files.config))!==stable(configIdentities(p.projectRoot,owner.files.config)))fail('Restored direct native config scope drift');
   }else{
    // This predicate is backed only by this overlay's source/selection/execution proofs.
    // It does NOT issue or borrow the legacy ExportRetirement capability.
    const q=doc.project,input=file.physicalPath,dir=dirname(input);
    if(old.linkTarget!==null||input!==resolve(p.projectRoot,source)||owner.files.input.includes(input)||!prior.selection.files.input.includes(input)||execution.physical[source]?.project?.dir!==p.projectRoot||before.project?.dir!==p.projectRoot||!keys(q,['quarto','dir','engines','config','files','fileInformation','extensions'])||![p.projectRoot,dir].includes(q.dir)||!keys(q.files,['input'])||!Array.isArray(q.files.input)||q.files.input.length||!keys(q.config,['project','engines'])||!keys(q.config.project,[])||stable(q.config.engines)!==stable(owner.config.engines)||!Array.isArray(q.engines)||q.engines.length||!keys(q.fileInformation,[])||stable(q.quarto)!==stable(owner.quarto)||stable(doc.quarto)!==stable(owner.quarto)||stable(doc.engines)!==stable(owner.engines)||!Array.isArray(q.extensions)||q.extensions.some((e:any)=>typeof e?.path!=='string'||!owner.extensions.some((o:any)=>o.path===e.path)))fail('Не подтверждён exact overlay restored unlisted native shape');
   }
   raw=sourceMetadata(doc,file.physicalPath);
  }
  const sourceRaw=sourceMetadata(physical,file.physicalPath),lexRaw=sourceMetadata(before,resolve(p.projectRoot,source)),execRaw=sourceMetadata(execution.lexical[source],resolve(p.projectRoot,source));
  for(const admitted of [sourceRaw,lexRaw,execRaw])if(stable(raw.metadata)!==stable(admitted.metadata)||stable(raw.includeMap)!==stable(admitted.includeMap))fail('Restored raw metadata/include drift');
  sourceHashes[source]=await hash(file.bytes);if(sourceHashes[source]!==w.sourceHashes[source])fail('Restored source bytes changed');information[source]=raw;await check();
 }
 const sources:CurrentSourceEvidence={identities:w.sourceIdentities,information,directInspections,sourceHashes,quartoVersion:owner.quarto.version};
 // Replay only exact retained execution base/profile; every other origin stays live.
 const closure=await withOverlayMetadataReplay(p,check,token=>collectMetadataClosure({root:p.projectRoot,profiles:w.profiles,projectMetadata:execution.owner.config,sourceIdentities:w.sourceIdentities,documents:w.documents,nativeConfigFiles:w.metadataClosure.nativeConfigFiles,extensionFiles:Object.keys(w.nativeExtensionMetadata.files),includeMaps:Object.fromEntries(w.inputFiles.map(source=>[source,information[source].includeMap])),validateCanonical:section},undefined,undefined,token,rawPhase));
 if(stable(closure)!==stable(w.metadataClosure))fail('Restored execution metadata closure replay differs');
 await check();return {sources,closure};
}

/** Before the final ref exists: held producer transaction + immutable original source. */
export async function validateRestoredSourceBeforeCommit(p:NativeRunPointer,ctx:OverlaySourceContext,restoredEntry:EntryIdentity){
 const view=await openConfigEntryView(p.projectRoot,ctx.base.file);
 try{
  const expected={...ctx.sourceFiles,[ctx.base.file]:{...ctx.sourceFiles[ctx.base.file],ctime:restoredCtime(ctx,restoredEntry.ctime)}};delete expected[ctx.profile.file];
  const dependencies=structuredClone(ctx.dependencies);
  for(const name of Object.keys(dependencies.origins)){if(name===join(p.projectRoot,ctx.base.file))dependencies.origins[name]={...(dependencies.origins[name] as any),ctime:restoredCtime(ctx,restoredEntry.ctime)};if(name===join(p.projectRoot,ctx.profile.file))dependencies.origins[name]=false}
  const check=async()=>{await view.check();if(!sameEntry(view.identity,restoredEntry)||!sameEntry(view.identity,ctx.base.originalEntry,false)||!dirIdentity(view.parent,ctx.sourceParent)||stable(view.runtime)!==stable(ctx.runtime)||stable(await hashes(view.bytes))!==stable(ctx.base.hashes))fail('Нет held original restored source');await checkOverlaySourceInventory(p.projectRoot,ctx,expected,p,true);await assertSourceDependencies(dependencies);await assertRetiredOverlayInventory(p,ctx)};
  await check();const source=JSON.parse(await inspect(p.projectRoot,ctx.sourceProfiles,check));
  const original=await readPrivate(join(p.directory,'inspections/sha256',ctx.roles.owner+'.json'));if(await hash(original)!==ctx.roles.owner)fail('Original SOURCE inspection hash drift');const all=JSON.parse(new TextDecoder().decode(original));
  if(stable(source)!==stable(all))fail('Restored full SOURCE native frame changed');await check();
 }finally{view.close()}
}

/** Exact source/config/resource/private roles; no output glob or caller allowlist. */
async function protectedOverlayPaths(root:string,ctx:OverlaySourceContext){
 const state=overlayReads.get(ctx.runDirectory);if(state?.ctx===ctx&&state.protected)return state.protected;
 const frames=[];for(const h of [ctx.roles.owner,ctx.roles.selection]){if(state?.originals){const frame=state.originals.all[h];if(!frame)fail('Missing admitted SOURCE role');frames.push(frame)}else{const bytes=await readPrivate(join(ctx.runDirectory,'inspections/sha256',h+'.json'));if(await hash(bytes)!==h)fail('Protected SOURCE frame hash drift');frames.push(JSON.parse(new TextDecoder().decode(bytes)))}}
 const protectedPaths=new Set<string>([...ctx.metadataClosure.origins.map(o=>o.path),...Object.keys(ctx.dependencies.origins),...Object.keys(ctx.dependencies.extensions)]);
 for(const [name,row] of Object.entries(ctx.sourceFiles))if(name&&(row.kind!=='directory'||name.split('/').some(p=>['_extensions','private','reference','tests','solutions','grading-notes'].includes(p))))protectedPaths.add(resolve(root,name));
 const resources=(values:any)=>{if(values===undefined||values===null)return;for(const value of [values].flat()){if(typeof value!=='string'||!value)fail('Не установлен protected resource source');if(value.startsWith('!')||/^[a-z]+:\/\//i.test(value))continue;const wildcard=value.search(/[*?\[\]{}]/),prefix=wildcard<0?value:value.slice(0,wildcard);protectedPaths.add(resolve(root,prefix||'.'))}};
 const declarations=(value:any)=>{const canonical=section(value);for(const p of Object.values(canonical?.projects??{}))for(const file of p['common-files'])protectedPaths.add(resolve(root,file.source))};
 for(const frame of frames){
  for(const key of ['resources','configResources']){const files=frame.files?.[key];if(!Array.isArray(files))fail('Нет protected native resource inventory');for(const f of files){if(typeof f!=='string')fail('Некорректный native resource origin');protectedPaths.add(resolve(root,f))}}
  resources(frame.config?.project?.resources);resources(frame.config?.resources);declarations(frame.config?.['project-materialization']);
  for(const source of ctx.selected){const meta=frame.fileInformation?.[source]?.metadata;if(meta){resources(meta.resources);resources(meta.project?.resources);declarations(meta['project-materialization'])}}
 }
 const result=[...protectedPaths];if(state?.ctx===ctx)state.protected=result;return result;
}

/** Pre-hook authenticates selected inputs, without inventing a forced writer recipe. */
export async function admitOverlayNativeOutputs(p:NativeRunPointer,ctx:OverlaySourceContext,frames:Record<string,any>){
 if(stable(Object.keys(frames).sort())!==stable([...ctx.selected].sort()))fail('Нет exact selected native writer scope');
 for(const source of ctx.selected)if(ctx.identities[source]?.linkTarget!==null||ctx.identities[source]?.physicalPath!==resolve(p.projectRoot,source)||frames[source]?.project?.dir!==p.projectRoot||!frames[source]?.fileInformation?.[resolve(p.projectRoot,source)])fail('Нет authenticated regular native writer source');
 const snapshot=await captureNativeJsonIntents(p,ctx);try{if(snapshot.slots.length)fail('Native writer intents существовали до render');await snapshot.check()}finally{snapshot.close()}
}
async function overlayOutputSlots(p:NativeRunPointer,ctx:OverlaySourceContext){
 const state=overlayRead(p),snapshot=await captureNativeJsonIntents(p,ctx);
 try{
  if(state?.intentsIdentity!==undefined&&state.intentsIdentity!==snapshot.identity)fail('Native writer intent identity/inventory changed across operation');
  if(state){state.intentsIdentity=snapshot.identity;state.slots=snapshot.slots}
  const slots=snapshot.slots,protectedPaths=await protectedOverlayPaths(p.projectRoot,ctx);
  for(const slot of slots){const path=resolve(p.projectRoot,slot.temporary);if(Object.hasOwn(ctx.sourceFiles,slot.temporary)||protectedPaths.some(p=>path===resolve(p)||path.startsWith(resolve(p)+'/')||resolve(p).startsWith(path+'/')))fail('Native writer intent пересекает source/protected role')}
  const names=new Set(await Promise.all(slots.map(async slot=>await hash(new TextEncoder().encode(slot.source+'\0json'),'SHA-1')+'.json')));
  for await(const entry of Deno.readDir(join(p.directory,'documents')))if(!entry.isFile||entry.isSymlink||!names.has(entry.name))fail('Actual native document без writer intent');
  await snapshot.check();return slots;
 }finally{snapshot.close()}
}
/** Native intent admission is a separate selected boundary; pointer stays immutable. */
export async function admitOverlayNativeWriter(p:NativeRunPointer,source:string,format:string,writer:string,documentOutput:string,selectedCheck:()=>Promise<unknown>){
 if(p.schema!=='course-native-run-pointer-v3'||p.overlayState!=='active'||format!=='json')fail('Нет active owned JSON writer');
 return await withOverlayRuntime(p.projectRoot,async()=>{
  const ctx=await readOverlayContext(p),view=await openConfigEntryView(p.projectRoot,ctx.base.file);
  let retained:Awaited<ReturnType<typeof openConfigEntryView>>|undefined,snapshot:Awaited<ReturnType<typeof captureNativeJsonIntents>>|undefined,outputs:Awaited<ReturnType<typeof nativeJsonSnapshot>>|undefined;
  try{
   retained=await openConfigEntryView(join(p.projectRoot,'_generated/course-spec/owned-config-overlay-lease'),'quarantined-source');
   const check=async()=>{
    await view.check();await retained!.check();await selectedCheck();
    if(stable(await readOverlayContextFresh(p))!==stable(ctx))fail('Native writer source context changed');
    const b=JSON.parse(new TextDecoder().decode(await readPrivate(join(p.projectRoot,'_generated/course-spec/owned-config-overlay-lease/bootstrap.json'))));
    if(b.projectRoot!==p.projectRoot||b.runDirectory!==p.directory||stable(b.ownedConfigOverlay)!==stable(p.ownedConfigOverlay)||!sameEntry(view.identity,b.executionEntry)||!sameEntry(view.identity,ctx.execution.preparedEntry,false)||!sameEntry(retained!.identity,b.sourceEntry)||!sameEntry(retained!.identity,ctx.base.originalEntry,false)||!dirIdentity(view.parent,ctx.sourceParent)||!dirIdentity(retained!.parent,ctx.leaseEntry)||stable(view.runtime)!==stable(ctx.runtime)||stable(await hashes(view.bytes))!==stable(ctx.execution.hashes)||stable(await hashes(retained!.bytes))!==stable(ctx.base.hashes))fail('Native writer не bound к active execution/source entries');
    try{await Deno.lstat(join(p.directory,'native-run.json'));fail('Completed run не разрешает native writer')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}
   };
   await check();snapshot=await captureNativeJsonIntents(p,ctx);
   const slot=actualNativeJsonSlot(p,ctx,source,writer,documentOutput);
   if(snapshot.slots.some(old=>old.source===source||old.temporary===slot.temporary||old.final===slot.final))fail('Повторный native writer source/output');
   outputs=await nativeJsonSnapshot(p.projectRoot,snapshot.slots,true,slot=>capturedNativeJson(p,slot));
   const absent=async()=>{
    await admitNativeJsonSlots(p.projectRoot,ctx.sourceFiles,[slot],await protectedOverlayPaths(p.projectRoot,ctx));
    try{await Deno.lstat(slot.final);fail('Native final output существовал до writer')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}
    let parent=dirname(slot.final);while(parent!==p.projectRoot){try{const s=await Deno.lstat(parent);if(!s.isDirectory||s.isSymlink||s.uid!==ctx.sourceFiles[''].uid||s.dev!==ctx.sourceFiles[''].dev||await Deno.realPath(parent)!==parent)fail('Native final parent не canonical same-owner')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}const next=dirname(parent);if(next===parent||!parent.startsWith(p.projectRoot+'/'))fail('Native final parent вне owner');parent=next}
   };
   await absent();await snapshot.check();await outputs.check();await check();
   await writeNativeJsonIntent(p,slot,documentOutput);
   await snapshot.checkHeld();await outputs.check();await absent();await check();
   const after=await captureNativeJsonIntents(p,ctx);try{if(after.slots.length!==snapshot.slots.length+1||!after.slots.some(s=>stable(s)===stable(slot))||Object.entries(snapshot.records).some(([name,value])=>stable(after.records[name])!==stable(value)))fail('Native intent append изменил existing records');await after.check();await snapshot.checkHeld();await outputs.check()}finally{after.close()}
  }finally{outputs?.close();snapshot?.close();retained?.close();view.close()}
 });
}
async function capturedNativeJson(p:NativeRunPointer,slot:NativeJsonSlot){
 const name=await hash(new TextEncoder().encode(slot.source+'\0json'),'SHA-1')+'.json',path=join(p.directory,'documents',name),before=await Deno.lstat(path);
 if(!before.isFile||before.isSymlink||await Deno.realPath(path)!==path||before.size>64*1024*1024)fail('Нет bounded actual native document');
 const d=JSON.parse(await Deno.readTextFile(path)),after=await Deno.lstat(path);if(stable([before.dev,before.ino,before.mode,before.size,before.mtime,before.ctime])!==stable([after.dev,after.ino,after.mode,after.size,after.mtime,after.ctime]))fail('Captured document changed');
 const ctx=await readOverlayContext(p),state=overlayRead(p);let owned=state?.owned;if(!owned){const ownedBytes=await readPrivate(join(p.directory,'owned-export-profile.json'));if(stable(await hashes(ownedBytes))!==stable(ctx.profile.hashes))fail('Owned course profile hash drift');owned=immutable(JSON.parse(new TextDecoder().decode(ownedBytes)));if(state)state.owned=owned}
 assertNativeJsonDocument(p.projectRoot,p.outputDirectory,p.profiles,owned.course?.id,slot,d);
 if((d.resources?.capturedFiles??[]).some((r:any)=>typeof r.source==='string'&&resolve(p.projectRoot,r.source)===resolve(p.projectRoot,slot.temporary)))fail('Native JSON output enrolled as student resource');
 let admitted=state?.adapters;if(!admitted){admitted=[];const adapters=join(p.directory,'adapters');for await(const entry of Deno.readDir(adapters)){if(!entry.isDirectory||entry.isSymlink)fail('Native adapter entry type');const dir=join(adapters,entry.name),contract=JSON.parse(await Deno.readTextFile(join(dir,'contract.json')));if(contract.name!==entry.name)fail('Native adapter contract mismatch');const fragments=[];for await(const file of Deno.readDir(dir)){if(!file.isFile||file.name==='contract.json'||!file.name.endsWith('.json'))continue;fragments.push(JSON.parse(await Deno.readTextFile(join(dir,file.name))))}admitted.push(immutable({contract,fragments}))}if(state)state.adapters=admitted}
 for(const {contract,fragments} of admitted)for(const fragment of fragments)if(fragment.source===slot.source)assertNativeJsonAdapter(p.projectRoot,p.outputDirectory,slot,d,fragment,contract.name);
}
async function finalNativeJson(p:NativeRunPointer,slots:NativeJsonSlot[],outputs:string[]){
 const {openNativeJsonOutput}=await import('./owned-config-entry.ts');
 for(const slot of slots){if(outputs.filter(path=>path===slot.final).length!==1)fail('Нет exact relocated native JSON output');const view=await openNativeJsonOutput(p.outputDirectory,relative(p.outputDirectory,slot.final).replaceAll('\\','/'));try{await capturedNativeJson(p,slot);const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(view.bytes));if(!Array.isArray(body.blocks)||!Array.isArray(body['pandoc-api-version']))fail('Relocated output не native JSON');await view.check()}finally{view.close()}}
}
export async function assertOverlayFinalOutputs(p:NativeRunPointer,outputs:string[]){
 if(p.schema!=='course-native-run-pointer-v3')return;return await withOverlayRuntime(p.projectRoot,async()=>{const ctx=await readOverlayContext(p),slots=await overlayOutputSlots(p,ctx);if(stable(slots.map(s=>s.source).sort())!==stable([...ctx.selected].sort()))fail('Неполный native JSON writer scope');const snapshot=await nativeJsonSnapshot(p.projectRoot,slots,false,()=>Promise.resolve());try{await finalNativeJson(p,slots,outputs);await snapshot.check()}finally{snapshot.close()}});
}
async function checkOverlaySourceInventory(root:string,ctx:OverlaySourceContext,expected:SourceFiles,p?:NativeRunPointer,final=false){
 const slots=p?await overlayOutputSlots(p,ctx):[],active=!!p&&p.overlayState==='active'&&!final;
 const snapshot=await nativeJsonSnapshot(root,slots,active,slot=>capturedNativeJson(p!,slot));
 try{await assertOverlaySourceFiles(root,expected,ctx.sourceFiles,ctx.selected,ctx.identities,await protectedOverlayPaths(root,ctx),snapshot.states);await snapshot.check();if(p&&!active){const run=JSON.parse(await Deno.readTextFile(join(p.directory,'native-run.json')));await finalNativeJson(p,slots,run.outputFiles);await snapshot.check()}return stable(snapshot.identities)}finally{snapshot.close()}
}
