/** Private phase-local stock native extraction; no persisted currentness cache. */
import {dirname,fromFileUrl,join,parse,relative} from 'stdlib/path';
import {quartoExecutable} from './process.ts';
import {invocationIdentity,digest,stable} from './common-path-binding.ts';
import {diagnostic} from '../domain/diagnostics.ts';
const fail=(s:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})};
export type NativeRawPhase=object&{readonly __nativeRawPhase:never};
type Kind='qmd'|'include-metadata';
type Row={path:string;bytes:Uint8Array;kind:Kind};
type State={root:string;invocation:string;helper:string;helperIdentity:string;localInvocation:string;localHelper:string;cache:Map<string,any>;rows?:Row[];scope?:string;api?:number[];batch:boolean;failed?:boolean};
const phases=new WeakMap<NativeRawPhase,State>();
async function bytes(path:string){let current=parse(path).root;for(const part of relative(current,path).split(/[\\/]/).filter(Boolean)){current=join(current,part);const s=await Deno.lstat(current);if(s.isSymlink)fail('Symlink in native raw input')};if(await Deno.realPath(path)!==path||!(await Deno.lstat(path)).isFile)fail('Nonregular native raw input');return await Deno.readFile(path)}
async function helperIdentity(path:string,content=true){const s=await Deno.lstat(path);if(!s.isFile||s.isSymlink||await Deno.realPath(path)!==path)fail('Native helper type/path changed');return stable({...(content?{hash:await digest(await bytes(path))}:{}),dev:s.dev,ino:s.ino,mode:s.mode,size:s.size,mtime:s.mtime?.getTime(),ctime:s.ctime?.getTime()})}
async function check(state:State,full=false){if(state.failed)fail('Failed native raw phase');if(await invocationIdentity(state.root,full)!==(full?state.invocation:state.localInvocation)||await helperIdentity(state.helper,full)!==(full?state.helperIdentity:state.localHelper))fail('Native raw tool/helper/context changed')}
function stateFor(phase:NativeRawPhase,root:string){const state=phases.get(phase);if(!state||state.root!==root)fail('Foreign/expired native raw phase');return state!}
function freeze(v:any):any{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v)}return v}
export async function withNativeRawPhase<T>(root:string,use:(phase:NativeRawPhase)=>Promise<T>):Promise<T>{
 const phase=Object.freeze({}) as NativeRawPhase,helper=fromFileUrl(new URL('./native-qmd-raw.lua',import.meta.url)),state:State={root,invocation:await invocationIdentity(root),helper,helperIdentity:await helperIdentity(helper),localInvocation:await invocationIdentity(root,false),localHelper:await helperIdentity(helper,false),cache:new Map(),batch:false};phases.set(phase,state);
 try{const result=await use(phase);await check(state,true);return result}finally{phases.delete(phase)}
}
/** Полный fence native группы перед публикацией, не на memo/accessor. */
export async function assertNativeRawBoundary(phase:NativeRawPhase,root:string){await check(stateFor(phase,root),true)}
export async function prepareNativeQmdRaw(phase:NativeRawPhase,root:string,rows:Row[]){
 const state=stateFor(phase,root);try{const unique=new Map<string,Row>();await check(state);
 for(const row of rows){const live=await bytes(row.path);if(await digest(live)!==await digest(row.bytes))fail('Native raw preload bytes changed');const key=row.path+'\0'+row.kind;if(unique.has(key)&&await digest(unique.get(key)!.bytes)!==await digest(row.bytes))fail('Conflicting raw preload');unique.set(key,{...row,bytes:new Uint8Array(row.bytes)})}
 const scope=stable(await Promise.all([...unique.values()].map(async r=>({path:r.path,kind:r.kind,hash:await digest(r.bytes)}))));if(state.scope!==undefined&&state.scope!==scope)fail('Native raw preload scope drift');state.scope=scope;state.rows??=[...unique.values()];await check(state);
 }catch(e){state.failed=true;throw e}
}
async function batch(state:State){
 if(state.batch||!state.api)return;state.batch=true;
 const eligible:Row[]=[];
 for(const row of state.rows??[]){let text="";try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(row.bytes)}catch{fail('Invalid UTF8 native raw origin')}
  if(!text.startsWith('\uFEFF')&&!/[\r\t]/.test(text))eligible.push(row);
 }
 if(!eligible.length)return;await check(state,true);
 for(const row of state.rows??[])if(await digest(await bytes(row.path))!==await digest(row.bytes))fail('Raw batch source drift');
 const metaString=(c:string)=>({t:'MetaString',c});
 const rows=await Promise.all(eligible.map(async row=>({t:'MetaMap',c:{path:metaString(row.path),kind:metaString(row.kind),hash:metaString(await digest(row.bytes)),text:metaString(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(row.bytes))}})));
 const input={'pandoc-api-version':state.api,meta:{rows:{t:'MetaList',c:rows}},blocks:[]};
 const child=new Deno.Command(quartoExecutable(),{args:['pandoc','--from','json','--to',state.helper],cwd:state.root,stdin:'piped',stdout:'piped',stderr:'piped'}).spawn();const writer=child.stdin.getWriter();await writer.write(new TextEncoder().encode(JSON.stringify(input)));await writer.close();const output=await child.output();if(!output.success||new TextDecoder().decode(output.stderr).trim())fail('Native QMD batch refused: '+new TextDecoder().decode(output.stderr));
 let value:any;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output.stdout))}catch{fail('Invalid native QMD batch JSON')}
 if(!value||Object.keys(value).join(',')!=='rows'||!Array.isArray(value.rows)||value.rows.length!==eligible.length)fail('Native QMD batch row scope mismatch');
 for(const [i,row] of eligible.entries()){const result=value.rows[i];if(!result||Object.keys(result).sort().join(',')!=='document,hash,kind,path'||result.path!==row.path||result.kind!==row.kind||result.hash!==await digest(row.bytes)||typeof result.document!=='string')fail('Native QMD batch row binding mismatch');let doc:any;try{doc=JSON.parse(result.document)}catch{fail('Invalid native QMD document')};if(stable(doc['pandoc-api-version'])!==stable(state.api)||!doc.meta||typeof doc.meta!=='object'||Array.isArray(doc.meta)||!Array.isArray(doc.blocks))fail('Invalid native QMD metadata');state.cache.set(row.path+'\0'+await digest(row.bytes)+'\0'+row.kind,freeze(doc.meta))}
 await check(state,true);for(const row of state.rows??[])if(await digest(await bytes(row.path))!==await digest(row.bytes))fail('Raw batch source drift');
}
export async function nativeRawMetadata(phase:NativeRawPhase,root:string,path:string,value:Uint8Array,kind:string,retainedPath?:string){
 const state=stateFor(phase,root);try{const h=await digest(value),key=path+'\0'+h+'\0'+kind,qmd=kind==='qmd'||kind==='include-metadata';await check(state);
 if(qmd)await batch(state);if(state.cache.has(key)){if(await digest(await bytes(retainedPath??path))!==h)fail('Raw memo input drift');await check(state);return state.cache.get(key)}
 await check(state,true);const output=await new Deno.Command(quartoExecutable(),{args:['pandoc','--from','markdown','--to','json',...(qmd?[path]:['--metadata-file',retainedPath??path])],cwd:dirname(path),stdin:'null',stdout:'piped',stderr:'piped'}).output();const error=new TextDecoder().decode(output.stderr);if(!output.success||error.trim())fail('Native raw metadata extraction refused: '+path+'\n'+error);
 let doc:any;try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output.stdout))}catch{fail('Invalid native metadata AST')};if(!doc.meta||typeof doc.meta!=='object'||Array.isArray(doc.meta)||!Array.isArray(doc['pandoc-api-version'])||doc['pandoc-api-version'].some((v:any)=>!Number.isInteger(v)||v<0))fail('Missing typed native metadata');if(state.api&&stable(state.api)!==stable(doc['pandoc-api-version']))fail('Native JSON API drift');state.api??=doc['pandoc-api-version'];
 if(await digest(await bytes(retainedPath??path))!==h)fail('Metadata drift during native extraction');await check(state,true);state.cache.set(key,freeze(doc.meta));return doc.meta;
 }catch(e){state.failed=true;throw e}
}
