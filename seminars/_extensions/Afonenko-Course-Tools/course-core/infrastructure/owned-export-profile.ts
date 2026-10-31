/** Private fixed raw profile slot; never a metadata/CLI writer selector. */
import {basename,dirname,fromFileUrl,join,relative,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {metadataBytes} from './metadata-closure.ts';
import {checkInspectionStore,inspectionRefs,withInspectionSnapshot,inspectionSnapshotData,type InspectionSnapshot} from './inspection-preimages.ts';
import {verifiedRetirement,type ExportRetirement} from './native-export-retirement.ts';
import type {CommonPathWitness} from './common-path-binding.ts';
import {overlayReference,restorationReference,type OwnedConfigOverlay} from './owned-config-proof.ts';
import type {NativeRunPointer} from './native-run.ts';
function fail(s:string):never{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})}
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=async(b:Uint8Array,a='SHA-256')=>Array.from(new Uint8Array(await crypto.subtle.digest(a,new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
const keys=(v:any,n:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===n.sort().join(',');
const filename='owned-export-profile.json';
type Context=Pick<CommonPathWitness,'projectRoot'|'runDirectory'|'profiles'|'outputDirectory'|'inputFiles'|'configurationInputs'|'temporaryExportProfile'|'forcedWriter'|'ownedConfigOverlay'>;
function reserved(w:Context){return w.profiles.some(p=>p.startsWith('course-export-'))||w.outputDirectory.startsWith(join(w.projectRoot,'_generated/course-spec/export-output')+'/')||w.temporaryExportProfile!==undefined||w.forcedWriter!==undefined}
async function inventory(w:Context,owned:boolean){
 if(resolve(w.runDirectory)!==w.runDirectory||await Deno.realPath(w.runDirectory)!==w.runDirectory||!(await Deno.lstat(w.runDirectory)).isDirectory)fail('Private owned run path не regular');
 const dirs=new Set(['documents','adapters','inspections','resources','selected-common-paths']),files=new Set(['common-files-path-binding.json','native-run.json',...(owned?[filename]:[])]);
 if(w.ownedConfigOverlay){dirs.add('native-json-intents');overlayReference(w.ownedConfigOverlay);files.add('owned-export-source-context.json');files.add('owned-export-source-config.raw');let p:any;try{p=JSON.parse(await Deno.readTextFile(join(w.projectRoot,'_generated/course-spec/active-native-run.json')))}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}
 if(p?.schema==='course-native-run-pointer-v3'&&p.directory===w.runDirectory&&stable(p.ownedConfigOverlay)===stable(w.ownedConfigOverlay)&&p.overlayState==='restored'){restorationReference(p.ownedConfigRestoration);files.add('owned-export-restored-entry.json');dirs.add('owned-export-config-quarantine')}
 }
 for await(const e of Deno.readDir(w.runDirectory)){if(e.isSymlink||(dirs.has(e.name)?!e.isDirectory:!files.has(e.name)||!e.isFile))fail('Лишний/type private run artifact: '+e.name)}
}
function profileShape(w:Context,bytes:Uint8Array){
 const t=w.temporaryExportProfile;if(!t||!keys(t,['profile','file','sha1','sha256'])||!/^course-export-[0-9a-f-]{36}$/.test(t.profile)||t.profile!==w.profiles[0]||t.file!=='_quarto-'+t.profile+'.yml'||!/^[a-f0-9]{64}$/.test(t.sha256)||!/^[a-f0-9]{40}$/.test(t.sha1)||w.configurationInputs[t.file]!==t.sha256||(!w.ownedConfigOverlay&&(w.profiles[1]!=='full'||w.profiles.slice(2).some(p=>!p||!/^[a-z][a-z0-9-]*$/.test(p)||['full','student'].includes(p)||p.startsWith('course-export-')))||w.ownedConfigOverlay&&w.profiles.length!==1)||new Set(w.profiles).size!==w.profiles.length)fail('Нет exact owned profile/context');
 if(!/^[0-9a-f-]{36}$/.test(basename(w.runDirectory))||resolve(w.projectRoot,'_generated/course-spec/native-runs',basename(w.runDirectory))!==w.runDirectory||w.outputDirectory!==join(w.projectRoot,'_generated/course-spec/export-output',t.profile))fail('Owned nonce/output не current');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes))}catch{fail('Нет exact raw generated JSON profile')}
 const pr=value.project;
 if(!w.inputFiles.length||!keys(value,['project','course','course-export-context','format','filters','crossref'])||!keys(pr,['type','render','output-dir','pre-render','post-render'])||pr.type!=='default'||typeof pr['pre-render']!=='string'||typeof pr['post-render']!=='string'||typeof pr['output-dir']!=='string'||resolve(w.projectRoot,pr['output-dir'])!==w.outputDirectory||!Array.isArray(pr.render)||pr.render.length!==w.inputFiles.length||new Set(pr.render).size!==pr.render.length||pr.render.some((x:any)=>typeof x!=='string'||!w.inputFiles.includes(x))||!keys(value.course,['id','view'])||typeof value.course.id!=='string'||!/^[a-z][a-z0-9-]*$/.test(value.course.id)||value.course.view!=='full'||value['course-export-context']!==true||stable(value.format)!==stable({json:{}})||stable(value.filters)!==stable(['course-core'])||stable(value.crossref)!==stable({}))fail('Не подтверждена closed owned profile shape');
 return value;
}
/** Pure pre-capability read. This does NOT authorize an absent active profile. */
async function readOwnedSlot(w:Context){
 try{
 const owned=reserved(w);await inventory(w,owned);
 if(!owned){try{await Deno.lstat(join(w.runDirectory,filename));fail('Orphan owned profile artifact')}catch(e){if(e instanceof Deno.errors.NotFound)return;throw e}}
 if(!keys(w.forcedWriter,['kind'])||w.forcedWriter!.kind!=='owned-export-json')fail('Owned writer marker отсутствует/не closed');
 const path=join(w.runDirectory,filename),s=await Deno.lstat(path);if(s.isSymlink||!s.isFile||s.mode!==null&&(s.mode&0o7777)!==0o600)fail('Owned raw profile type/mode');
 const bytes=await metadataBytes(path);if(!bytes||await hash(bytes)!==w.temporaryExportProfile?.sha256||await hash(bytes,'SHA-1')!==w.temporaryExportProfile?.sha1)fail('Owned raw profile bytes/hash изменены');return {bytes,value:profileShape(w,bytes)};
 }catch(e){if((e as any)?.code==='NATIVE.COMMON_PATH_BINDING_INVALID')throw e;return fail('Owned profile evidence unavailable; fresh capture required: '+String(e))}
}
/** Early capture authority is the actual canonical producer module, never a caller root. */
function producerHooks(value:any){const extension=dirname(dirname(fromFileUrl(import.meta.url)));if(value.project['pre-render']!==join(extension,'entrypoints/pre.ts')||value.project['post-render']!==join(extension,'entrypoints/post.ts'))fail('Owned producer hook pair mismatch')}
/** Nonrecursive original owner frame; full original-role validation follows in the caller. */
export async function readOwnedProfileEvidence(w:CommonPathWitness){
 const evidence=await readOwnedSlot(w);if(!evidence)return;
 return await withInspectionSnapshot(w.runDirectory,inspectionRefs(w),w,phase=>readOwnedProfileEvidenceInPhase(w,phase));
}
const admittedProfiles=new WeakMap<InspectionSnapshot,Promise<Awaited<ReturnType<typeof readOwnedSlot>>>>();
/** Внутренний original owner уже проверен в конечной inspection-фазе. Raw slot принимается один раз; assertOwnedProfileCurrentInPhase перечитывает его на boundary. */
export async function readOwnedProfileEvidenceInPhase(w:CommonPathWitness,phase:InspectionSnapshot){
 const owner=inspectionSnapshotData(phase,w.runDirectory,inspectionRefs(w),w)[w.ownerInspectionHash];
 let admitted=admittedProfiles.get(phase);if(!admitted){admitted=readOwnedSlot(w);admittedProfiles.set(phase,admitted)}const evidence=await admitted;if(!evidence)return;
 if(owner.dir!==w.projectRoot||owner.quarto?.version!==w.quartoVersion||!owner.config||!Array.isArray(owner.files?.config)||stable(owner.files.config)!==stable(w.metadataClosure.nativeConfigFiles.owner)||!Array.isArray(owner.files?.input)||w.inputFiles.some(s=>!owner.files.input.includes(resolve(w.projectRoot,s)))||owner.config.course?.id!==evidence.value.course.id||owner.config.course?.view!=='full'||owner.config['course-export-context']!==true)fail('Owned original owner frame mismatch');
 const project=owner.config.project;
 if(!project||stable(project['pre-render'])!==stable([evidence.value.project['pre-render']])||stable(project['post-render'])!==stable([evidence.value.project['post-render']]))fail('Owned original singleton hook pair mismatch');
 return evidence;
}
/** Producer-only early checks run before the original owner preimage exists. */
export async function assertProducerProfileCurrent(p:NativeRunPointer,w:Context){
 const evidence=await readOwnedSlot(w);if(!evidence)return;
 producerHooks(evidence.value);const t=w.temporaryExportProfile!,active=await metadataBytes(join(w.projectRoot,t.file));
 if(p.commonPathRetirement||p.configurationHashes[t.file]!==t.sha1||!active||active.length!==evidence.bytes.length||active.some((b,i)=>b!==evidence.bytes[i]))fail('Active producer profile не равен original bytes');
 await readOwnedSlot(w);
}
export async function assertOwnedProfileCurrent(p:NativeRunPointer,w:CommonPathWitness,retirement?:ExportRetirement){
 return await assertOwnedProfileCurrentUsing(p,w,()=>readOwnedProfileEvidence(w),retirement);
}
export async function assertOwnedProfileCurrentInPhase(p:NativeRunPointer,w:CommonPathWitness,phase:InspectionSnapshot,retirement?:ExportRetirement){
 inspectionSnapshotData(phase,w.runDirectory,inspectionRefs(w),w);return await assertOwnedProfileCurrentUsing(p,w,()=>readOwnedSlot(w),retirement);
}
async function assertOwnedProfileCurrentUsing(p:NativeRunPointer,w:CommonPathWitness,read:()=>ReturnType<typeof readOwnedProfileEvidence>,retirement?:ExportRetirement){
 const evidence=await read();if(!evidence){if(p.commonPathRetirement)fail('Retirement без owned writer');return}
 if(p.projectRoot!==w.projectRoot||p.directory!==w.runDirectory||p.outputDirectory!==w.outputDirectory||stable(p.profiles)!==stable(w.profiles))fail('Чужой owned profile pointer');
 const t=w.temporaryExportProfile!,active=await metadataBytes(join(w.projectRoot,t.file));
 if(retirement!==undefined){if(!verifiedRetirement(retirement)||retirement.root!==w.projectRoot||retirement.file!==t.file||retirement.sha256!==t.sha256||stable(p.commonPathRetirement)!==stable(t)||p.configurationHashes[t.file]!==false||active)fail('Нет exact completed retirement owned profile')}
 else if(p.schema==='course-native-run-pointer-v3'&&p.overlayState==='restored'){if(!w.ownedConfigOverlay||p.commonPathRetirement||stable(p.ownedConfigOverlay)!==stable(w.ownedConfigOverlay)||p.configurationHashes[t.file]!==t.sha1||active)fail('Нет exact restored owned profile transition');restorationReference(p.ownedConfigRestoration)}
 else if(p.commonPathRetirement||p.configurationHashes[t.file]!==t.sha1||!active||active.length!==evidence.bytes.length||active.some((b,i)=>b!==evidence.bytes[i]))fail('Active owned profile не равен original bytes');
 await read();
}
export async function captureOwnedProfile(p:NativeRunPointer,selected:string[]){
 const context:Context={projectRoot:p.projectRoot,runDirectory:p.directory,profiles:p.profiles,outputDirectory:p.outputDirectory,inputFiles:selected,configurationInputs:{},...(p.ownedConfigOverlay?{ownedConfigOverlay:p.ownedConfigOverlay}:{})};
 if(!reserved(context)){await readOwnedSlot(context);return {context}}
 const profile=p.profiles[0],file='_quarto-'+profile+'.yml',bytes=await metadataBytes(join(p.projectRoot,file));if(!bytes)fail('Нет active generated profile');
 const temporaryExportProfile={profile,file,sha256:await hash(bytes),sha1:await hash(bytes,'SHA-1')},forcedWriter={kind:'owned-export-json' as const};Object.assign(context,{temporaryExportProfile,forcedWriter,configurationInputs:{[file]:temporaryExportProfile.sha256}});producerHooks(profileShape(context,bytes));
 await inventory(context,true);try{await Deno.writeFile(join(p.directory,filename),bytes,{createNew:true,mode:0o600})}catch(e){fail('Owned raw profile create-new отказал: '+String(e))};await assertProducerProfileCurrent(p,context);
 return {context,temporaryExportProfile,forcedWriter};
}
