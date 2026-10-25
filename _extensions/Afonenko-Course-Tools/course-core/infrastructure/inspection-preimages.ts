/** Exact stock stdout, scoped only to one private native run. */
import {join,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {readOwnedProfileEvidenceInPhase} from './owned-export-profile.ts';
import type {CommonPathWitness} from './common-path-binding.ts';
const fail=(s:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})};
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
const hex=(h:unknown):h is string=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
async function directory(path:string){const s=await Deno.lstat(path);if(s.isSymlink||!s.isDirectory||await Deno.realPath(path)!==path||(s.mode!==null&&(s.mode&0o7777)!==0o700))fail('Private inspection directory/type/mode: '+path)}
async function rootDirectory(root:string){if(resolve(root)!==root||await Deno.realPath(root)!==root||!(await Deno.lstat(root)).isDirectory)fail('Чужой private inspection run')}
/** Reader never creates/repairs evidence. Exact set is derived from existing refs. */
export async function checkInspectionStore(root:string,refs:ReadonlySet<string>){
 try{
 await rootDirectory(root);if([...refs].some(h=>!hex(h)))fail('Некорректный inspection ref');
 const top=join(root,'inspections'),dir=join(top,'sha256');await directory(top);await directory(dir);
 const names=async(path:string)=>{const a=[];for await(const e of Deno.readDir(path))a.push(e.name);return a.sort()};
 if(stable(await names(top))!==stable(['sha256'])||stable(await names(dir))!==stable([...refs].map(h=>h+'.json').sort()))fail('Private inspection inventory missing/extra');
 const result:Record<string,any>={};
 for(const h of refs){const path=join(dir,h+'.json'),s=await Deno.lstat(path);if(s.isSymlink||!s.isFile||await Deno.realPath(path)!==path||(s.mode!==null&&(s.mode&0o7777)!==0o600))fail('Private inspection file/type/mode');const bytes=await Deno.readFile(path);if(await hash(bytes)!==h)fail('Original inspection bytes/hash изменены');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))fail('Нет original stock inspection');result[h]=value;
 }return result;
 }catch(e){if((e as any)?.code==='NATIVE.COMMON_PATH_BINDING_INVALID')throw e;return fail('Private inspection evidence unavailable: '+String(e))}
}
export async function storeInspection(root:string,text:string,refs:Set<string>){
 const bytes=new TextEncoder().encode(text),h=await hash(bytes);await rootDirectory(root);
 if(!refs.size){await Deno.mkdir(join(root,'inspections'),{mode:0o700});await Deno.mkdir(join(root,'inspections/sha256'),{mode:0o700})}
 await checkInspectionStore(root,refs);
 const path=join(root,'inspections/sha256',h+'.json');
 if(refs.has(h)){const old=await Deno.readFile(path);if(old.length!==bytes.length||old.some((v,i)=>v!==bytes[i]))fail('Same-H original bytes collision')}
 else {await Deno.writeFile(path,bytes,{createNew:true,mode:0o600});refs.add(h)}
 await checkInspectionStore(root,refs);return h;
}
// Только callback lifetime: capability не сериализуется и не хранит live cache.
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
export type InspectionSnapshot=Readonly<{readonly inspectionPhase:unique symbol}>;
// Сам binding — только конечный JSON data graph; admission не выполняет getters/toJSON.
function admitBinding(binding:object):Readonly<{value:object}>{
 try{
  const states=new WeakMap<object,number>();
  type Frame={value:object;exit?:boolean;prototype?:object|null;properties?:[string,unknown][]};
  const stack:Frame[]=[{value:binding}];
  while(stack.length){
   const frame=stack.pop()!,value=frame.value;
   if(frame.exit){
    Object.freeze(value);
    if(Object.getPrototypeOf(value)!==frame.prototype||!Object.isFrozen(value))fail('Inspection binding freeze/prototype отказал');
    const keys=Reflect.ownKeys(value);if(keys.length!==frame.properties!.length)fail('Inspection binding descriptors изменены');
    for(const [key,expected] of frame.properties!){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value')||d.value!==expected||d.writable||d.configurable||d.enumerable!==(frame.prototype===Array.prototype&&key==='length'?false:true))fail('Inspection binding data изменены')}
    states.set(value,2);continue;
   }
   if(states.get(value)===1)fail('Cycle в inspection binding');if(states.get(value)===2)continue;
   const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
   if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)fail('Inspection binding не plain JSON');
   const keys=Reflect.ownKeys(value),properties:[string,unknown][]=[],children:object[]=[];
   let length=0;if(array){const d=Object.getOwnPropertyDescriptor(value,'length');if(!d||!Object.hasOwn(d,'value')||!Number.isSafeInteger(d.value)||d.value<0)fail('Inspection array length');length=d!.value;if(keys.length!==length+1)fail('Inspection array не dense')}
   for(const key of keys){
    if(typeof key!=='string')fail('Symbol key в inspection binding');const d=Object.getOwnPropertyDescriptor(value,key!);
    if(!d||!Object.hasOwn(d,'value')||!(array&&key==='length')&&(!d.enumerable||array&&(!/^(0|[1-9][0-9]*)$/.test(key as string)||Number(key!)>=length))||array&&key==='length'&&d.enumerable)fail('Inspection binding не JSON data property');
    const child=d!.value;properties.push([key as string,child]);
    if(child!==null&&typeof child==='object')children.push(child);
    else if(!(child===null||typeof child==='string'||typeof child==='boolean'||typeof child==='number'&&Number.isFinite(child)))fail('Non-JSON value в inspection binding');
   }
   states.set(value,1);stack.push({value,exit:true,prototype,properties});for(let i=children.length-1;i>=0;i--)stack.push({value:children[i]});
  }
  return Object.freeze({value:binding});
 }catch{return fail('Inspection binding admission отказал')}
}
type SnapshotState={root:string;refs:string;binding:Readonly<{value:object}>;all:Record<string,any>;originals?:{owner:any;physical:Record<string,any>;lexical:Record<string,any>}};
const snapshots=new WeakMap<object,SnapshotState>(),phaseOwners=new WeakSet<object>(),writers=new Set<string>();
export async function withInspectionSnapshot<T>(root:string,refs:ReadonlySet<string>,binding:object,use:(phase:InspectionSnapshot)=>Promise<T>):Promise<T>{
 if(binding===null||typeof binding!=='object')fail('Inspection binding root не object');
 if(phaseOwners.has(binding))fail('Reentrant inspection phase');phaseOwners.add(binding);
 const phase=Object.freeze({}) as InspectionSnapshot;
 try{const admitted=admitBinding(binding),referenceIdentity=stable([...refs].sort()),all=freeze(await checkInspectionStore(root,refs));
  if(stable([...refs].sort())!==referenceIdentity)fail('Inspection refs изменены во время snapshot');
  snapshots.set(phase,{root,refs:referenceIdentity,binding:admitted,all});return await use(phase);
 }finally{snapshots.delete(phase);phaseOwners.delete(binding)}
}
export function inspectionSnapshotData(phase:InspectionSnapshot,root:string,refs:ReadonlySet<string>,binding:object){
 const state=snapshots.get(phase);if(!state||state.root!==root||state.refs!==stable([...refs].sort())||state.binding.value!==binding)fail('Foreign/expired inspection phase');return state!.all;
}
/** Append-only writer: каждое новое stdout читается/проверяется один раз, старые — на фазовой границе. */
export async function withInspectionWriter<T>(root:string,use:(writer:{append:(text:string)=>Promise<string>;snapshot:()=>Promise<Record<string,any>>})=>Promise<T>,initialRefs:ReadonlySet<string>=new Set()):Promise<T>{
 if(writers.has(root))fail('Reentrant inspection writer');writers.add(root);let active=true,writing=false;const refs=new Set<string>(initialRefs);
 const current=()=>{if(!active||!writers.has(root)||writing)fail('Expired/reentrant inspection writer')};
 const writer=Object.freeze({
  append:async(text:string)=>{current();writing=true;try{
   const bytes=new TextEncoder().encode(text),h=await hash(bytes);await rootDirectory(root);
   const top=join(root,'inspections'),dir=join(top,'sha256');if(!refs.size){await Deno.mkdir(top,{mode:0o700});await Deno.mkdir(dir,{mode:0o700})}
   await directory(top);await directory(dir);const path=join(dir,h+'.json');
   if(!refs.has(h))await Deno.writeFile(path,bytes,{createNew:true,mode:0o600});
   const info=await Deno.lstat(path);if(!info.isFile||info.isSymlink||await Deno.realPath(path)!==path||info.mode!==null&&(info.mode&0o7777)!==0o600)fail('Append original type/mode');
   const actual=await Deno.readFile(path);if(actual.length!==bytes.length||actual.some((b,i)=>b!==bytes[i])||await hash(actual)!==h)fail('Append original bytes/collision');
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(actual));if(!value||typeof value!=='object'||Array.isArray(value))fail('Append не original inspection');refs.add(h);return h;
  }finally{writing=false}},
  snapshot:async()=>{current();writing=true;try{return freeze(await checkInspectionStore(root,refs))}finally{writing=false}}
 });try{if(refs.size)await checkInspectionStore(root,refs);return await use(writer)}finally{active=false;writers.delete(root)}
}
export function inspectionRefs(w:CommonPathWitness){
 const sources=w.inputFiles,rows=w.sourceIdentities?.sources;
 if(new Set(sources).size!==sources.length||!Array.isArray(rows)||rows.length!==sources.length||stable(rows.map(r=>r.source))!==stable(sources)||stable(Object.keys(w.documentInspectionHashes).sort())!==stable([...sources].sort()))fail('Неполный original inspection scope');
 const extra=w.sourceInspectionRefs??[];if(w.schema==='course-common-files-path-binding-v1'&&(w.ownedConfigOverlay!==undefined||w.sourceInspectionRefs!==undefined)||w.schema==='course-common-files-path-binding-v2'&&(!w.ownedConfigOverlay||!Array.isArray(extra)||!extra.length||new Set(extra).size!==extra.length))fail('Нет closed explicit source-role refset');
 const refs=[w.ownerInspectionHash,...Object.values(w.documentInspectionHashes),...rows.map(r=>r.physicalInspectionHash),...extra];if(refs.some(h=>!hex(h)))fail('Некорректный original inspection hash');return new Set(refs);
}
/** Cross-role bindings use original stock shape, never an arbitrary JSON preimage. */
export async function originalInspections(w:CommonPathWitness){
 return await withInspectionSnapshot(w.runDirectory,inspectionRefs(w),w,phase=>originalInspectionsInPhase(w,phase));
}
export async function originalInspectionsInPhase(w:CommonPathWitness,phase:InspectionSnapshot){
 const all=inspectionSnapshotData(phase,w.runDirectory,inspectionRefs(w),w),state=snapshots.get(phase)!;if(state.originals)return state.originals;const owner=all[w.ownerInspectionHash],physical:Record<string,any>={},lexical:Record<string,any>={};
 const owned=await readOwnedProfileEvidenceInPhase(w,phase);
 const object=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const keys=(v:any,names:string[])=>object(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
 const formats=(v:any)=>object(v)&&Object.keys(v).length>0&&Object.values(v).every((f:any)=>object(f)&&object(f.identifier)&&typeof f.identifier['target-format']==='string'&&!!f.identifier['target-format']&&typeof f.identifier['base-format']==='string'&&!!f.identifier['base-format']&&object(f.metadata));
 const configs=(v:any)=>{if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||resolve(w.projectRoot,x)!==x)||new Set(v).size!==v.length)fail('Нет original config inventory');return v};
 const raw=(doc:any,path:string)=>{const v=doc.fileInformation?.[path];if(!v||!v.metadata||typeof v.metadata!=='object'||Array.isArray(v.metadata)||!Array.isArray(v.includeMap))fail('Нет original raw physical/lexical key');return v};
 if(owner.dir!==w.projectRoot||owner.quarto?.version!==w.quartoVersion||!owner.config||!owner.fileInformation||!Array.isArray(owner.files?.input)||stable(configs(owner.files.config))!==stable(w.metadataClosure.nativeConfigFiles.owner))fail('Original owner/Quarto/config role mismatch');
 for(const row of w.sourceIdentities.sources){
  const p=all[row.physicalInspectionHash],d=all[w.documentInspectionHashes[row.source]],path=resolve(w.projectRoot,row.source);physical[row.source]=p;lexical[row.source]=d;
  if(row.nativeOwner!==w.projectRoot||!owner.files.input.includes(path)||!owner.fileInformation[row.source]||p.project?.dir!==w.projectRoot||p.quarto?.version!==w.quartoVersion||!formats(p.formats)||d.project?.dir!==w.projectRoot||d.quarto?.version!==w.quartoVersion||!formats(d.formats)||stable(configs(d.project.files?.config))!==stable(w.metadataClosure.nativeConfigFiles.documents[row.source]))fail('Original physical/lexical source/owner/config mismatch');
  if(p.project.files&&Object.hasOwn(p.project.files,'config')){
   if(stable(configs(p.project.files.config))!==stable(w.metadataClosure.nativeConfigFiles.owner))fail('Original physical profile/config mismatch');
  }else if(row.linkTarget===null||row.physicalPath===path||owner.files.input.includes(row.physicalPath)||!keys(p.project.files,['input'])||!Array.isArray(p.project.files.input)||p.project.files.input.length||!keys(p.project.config,['project','engines'])||!keys(p.project.config.project,[])||!Array.isArray(p.project.config.engines)||stable(p.project.config.engines)!==stable(owner.config.engines)||!Array.isArray(p.project.engines)||p.project.engines.length||!keys(p.project.fileInformation,[])||stable(p.engines)!==stable(d.engines)||p.quarto.version!==d.quarto.version)fail('Нет exact original unlisted physical alias shape');
  const a=raw(p,row.physicalPath),b=raw(d,path),c=owner.fileInformation[row.source];if(stable(a.metadata)!==stable(b.metadata)||stable(b.metadata)!==stable(c.metadata)||stable(b.includeMap)!==stable(c.includeMap))fail('Original raw role mismatch');
  if(stable((owned?['json']:Object.keys(d.formats)).map(f=>['pdf','beamer'].includes(f)?'latex':f).sort())!==stable(w.documents.filter(v=>v.source===row.source).map(v=>v.format).sort()))fail('Original lexical format scope mismatch');
 }
 return state.originals=Object.freeze({owner,physical:Object.freeze(physical),lexical:Object.freeze(lexical)});
}
