/** Конечные native pre-writer намерения одного owned run, не готовые JSON facts. */
import {basename,dirname,join,relative,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {openNativeJsonOutput} from './owned-config-entry.ts';
import type {NativeRunPointer} from './native-run.ts';
import type {OverlaySourceContext} from './owned-config-overlay.ts';
import type {NativeJsonSlot} from './owned-config-source.ts';
export const nativeJsonIntentDirectory='native-json-intents';
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
function fail(message:string):never{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',message,{field:'project-materialization'})}
const keys=(v:any,n:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===n.sort().join(',');
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
async function binding(p:NativeRunPointer){return await hash(new TextEncoder().encode(stable({schema:p.schema,projectRoot:p.projectRoot,directory:p.directory,profiles:p.profiles,outputDirectory:p.outputDirectory,initialInputFiles:p.initialInputFiles,renderAll:p.renderAll,configurationHashes:p.configurationHashes,commonPathBinding:p.commonPathBinding,commonPathDocuments:p.commonPathDocuments,ownedConfigOverlay:p.ownedConfigOverlay})))}
export async function nativeJsonIntentName(source:string){return await hash(new TextEncoder().encode(source+'\0json'))+'.json'}
export function actualNativeJsonSlot(p:NativeRunPointer,ctx:OverlaySourceContext,source:string,writer:string,documentOutput:string):NativeJsonSlot{
 const input=resolve(p.projectRoot,source),id=ctx.identities[source];
 if(!ctx.selected.includes(source)||!id||id.linkTarget!==null||id.physicalPath!==input||typeof writer!=='string'||resolve(writer)!==writer||dirname(writer)!==dirname(input)||writer===input||!writer.startsWith(p.projectRoot+'/')||/[\\\0]/.test(writer)||basename(writer)==='-')fail('Нет exact native JSON writer source/output');
 const temporary=relative(p.projectRoot,writer).replaceAll('\\','/'),slot={source,temporary,final:resolve(p.outputDirectory,temporary)};
 if(![writer,slot.final].includes(documentOutput))fail('Quarto document output не соответствует actual writer');
 return slot;
}
async function record(p:NativeRunPointer,slot:NativeJsonSlot,documentOutput:string){return {schema:'course-native-json-intent-v1',binding:await binding(p),slot,documentOutput}}
const dirIdentity=(s:Deno.FileInfo)=>({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode});
/** Held записи и exact directory inventory остаются неизменны до закрытия snapshot. */
export async function captureNativeJsonIntents(p:NativeRunPointer,ctx:OverlaySourceContext){
 const directory=join(p.directory,nativeJsonIntentDirectory),initial=await Deno.lstat(directory);
 if(!initial.isDirectory||initial.isSymlink||initial.mode===null||(initial.mode&0o7777)!==0o700||await Deno.realPath(directory)!==directory)fail('Нет private native JSON intent directory');
 const expected=new Map<string,string>();for(const source of ctx.selected)expected.set(await nativeJsonIntentName(source),source);
 const names:string[]=[],slots:NativeJsonSlot[]=[],identities:Record<string,unknown>={},held:Awaited<ReturnType<typeof openNativeJsonOutput>>[]=[];
 const close=()=>{for(const view of held)view.close()};
 try{
  for await(const entry of Deno.readDir(directory)){
   if(!entry.isFile||entry.isSymlink||!expected.has(entry.name))fail('Лишний/чужой native JSON intent');
   const source=expected.get(entry.name)!,view=await openNativeJsonOutput(p.directory,nativeJsonIntentDirectory+'/'+entry.name);held.push(view);
   if((view.identity.mode&0o7777)!==0o600||view.bytes.length>16*1024)fail('Native JSON intent mode/size');
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(view.bytes));
   if(!keys(value,['schema','binding','slot','documentOutput'])||value.schema!=='course-native-json-intent-v1'||value.binding!==await binding(p)||!keys(value.slot,['source','temporary','final'])||value.slot.source!==source||typeof value.slot.temporary!=='string'||typeof value.documentOutput!=='string')fail('Чужой native JSON intent binding');
   const slot=actualNativeJsonSlot(p,ctx,source,resolve(p.projectRoot,value.slot.temporary),value.documentOutput);
   if(stable(slot)!==stable(value.slot)||slots.some(old=>old.temporary===slot.temporary||old.final===slot.final))fail('Повторный/неканонический native JSON intent');
   names.push(entry.name);slots.push(slot);identities[entry.name]={identity:view.identity,sha256:await hash(view.bytes)};
  }
  slots.sort((a,b)=>a.source.localeCompare(b.source));names.sort();
  const checkHeld=async()=>{
   if(stable(dirIdentity(await Deno.lstat(directory)))!==stable(dirIdentity(initial))||await Deno.realPath(directory)!==directory)fail('Native JSON intent directory replaced');
   for(const view of held)await view.check();
  };
  const check=async()=>{
   await checkHeld();
   const actual=[];for await(const entry of Deno.readDir(directory)){if(!entry.isFile||entry.isSymlink)fail('Native JSON intent entry replaced');actual.push(entry.name)}
   if(stable(actual.sort())!==stable(names))fail('Native JSON intent inventory changed');await checkHeld();
  };await check();return {slots,records:identities,identity:stable({directory:dirIdentity(initial),records:identities}),check,checkHeld,close};
 }catch(error){close();throw error}
}
/** create-new разрешает одну запись на selected source; payload сам не выдаёт output proof. */
export async function writeNativeJsonIntent(p:NativeRunPointer,slot:NativeJsonSlot,documentOutput:string){
 const name=await nativeJsonIntentName(slot.source),path=join(p.directory,nativeJsonIntentDirectory,name),bytes=new TextEncoder().encode(stable(await record(p,slot,documentOutput)));
 await Deno.writeFile(path,bytes,{createNew:true,mode:0o600});
 const view=await openNativeJsonOutput(p.directory,nativeJsonIntentDirectory+'/'+name);
 try{if((view.identity.mode&0o7777)!==0o600||await hash(view.bytes)!==await hash(bytes))fail('Native JSON intent create-new readback');await view.check();return view.identity}finally{view.close()}
}
