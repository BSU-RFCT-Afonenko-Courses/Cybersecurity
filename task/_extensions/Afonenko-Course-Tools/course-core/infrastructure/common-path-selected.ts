/** Производные выбранные записи: hash binding к текущему запуску, не новый NativeRun. */
import {join,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {metadataBytes} from './metadata-closure.ts';
import {sourceFile} from './source-identities.ts';
import type {CommonPathWitness} from './common-path-binding.ts';
import type {NativeRunPointer} from './native-run.ts';
import {verifiedRetirement,type ExportRetirement} from './native-export-retirement.ts';
export type SelectedCommonPathRef={source:string;format:string;file:string;sha1:string;sha256:string};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const fail=(s:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',s,{field:'project-materialization'})};
export async function selectedHash(b:Uint8Array,a='SHA-256'){return Array.from(new Uint8Array(await crypto.subtle.digest(a,new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('')}
/** Чистая named-проекция; авторизацию completed lifecycle проверяет вызывающий END. */
export function selectedConfigurationHashes(p:NativeRunPointer,w?:CommonPathWitness){
 const r=p.commonPathRetirement;if(!r)return p.configurationHashes;
 if(!w?.temporaryExportProfile||stable(r)!==stable(w.temporaryExportProfile)||r.profile!==p.profiles[0]||r.file!=='_quarto-'+r.profile+'.yml'||w.configurationInputs[r.file]!==r.sha256||p.configurationHashes[r.file]!==false) return fail('Нет exact named retirement configuration');
 return {...p.configurationHashes,[r.file]:r.sha1};
}
function identity(p:NativeRunPointer,w?:CommonPathWitness){return {schema:p.schema,projectRoot:p.projectRoot,directory:p.directory,profiles:p.profiles,outputDirectory:p.outputDirectory,initialInputFiles:p.initialInputFiles,renderAll:p.renderAll,configurationHashes:selectedConfigurationHashes(p,w),commonPathBinding:p.commonPathBinding,ownedConfigOverlay:p.ownedConfigOverlay}}
async function selectedRecord(p:NativeRunPointer,w:CommonPathWitness,row:CommonPathWitness['documents'][number],captured?:{entry:unknown;physical:unknown}){
 const source=w.sourceIdentities.sources.find(s=>s.source===row.source);if(!source||!w.sourceHashes[row.source])return fail('Нет selected source identity');
 const files:Record<string,string|false>={};
 for(const origin of w.metadataClosure.origins)if(origin.context.source===null||origin.context.source===row.source){if(Object.hasOwn(files,origin.path)&&files[origin.path]!==origin.sha256)fail('Неоднозначный selected metadata origin');files[origin.path]=origin.sha256}
 for(const [name,hash] of Object.entries(w.nativeExtensionMetadata.files))files[name]=hash;
 for(const [name,hash] of Object.entries(w.configurationInputs))if(Object.hasOwn(p.configurationHashes,name))files[resolve(p.projectRoot,name)]=hash;
 for(const entry of Object.values(row.canonicalDeclarations?.projects??{}))for(const file of entry['common-files']){const hash=w.commonSourceHashes[file.source];if(!hash)fail('Нет selected common source hash');files[resolve(p.projectRoot,file.source)]=hash}
 const entry=captured?undefined:await Deno.lstat(join(p.projectRoot,row.source)),physical=captured?undefined:await Deno.lstat(source.physicalPath);
 const state=(s:Deno.FileInfo)=>({dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,gid:s.gid,size:s.size,mtime:s.mtime?.getTime(),ctime:s.ctime?.getTime()});
 return {schema:'course-common-selected-v1',binding:identity(p,w),row,source,sourceHash:w.sourceHashes[row.source],files,entry:captured?captured.entry:state(entry!),physical:captured?captured.physical:state(physical!)};
}
async function encoded(p:NativeRunPointer,w:CommonPathWitness,row:CommonPathWitness['documents'][number],captured?:{entry:unknown;physical:unknown}){
 const bytes=new TextEncoder().encode(stable(await selectedRecord(p,w,row,captured))),key=await selectedHash(new TextEncoder().encode(row.source+'\0'+row.format));
 return {bytes,ref:{source:row.source,format:row.format,file:'selected-common-paths/'+key+'.json',sha1:await selectedHash(bytes,'SHA-1'),sha256:await selectedHash(bytes)}};
}
/** Только после полного producer admission; pointer ещё не опубликован. */
export async function publishSelectedCommonPaths(p:NativeRunPointer,w:CommonPathWitness):Promise<SelectedCommonPathRef[]>{
 const dir=join(p.directory,'selected-common-paths');await Deno.mkdir(dir,{mode:0o700});const refs:SelectedCommonPathRef[]=[],seen=new Set<string>();
 for(const row of w.documents){const {bytes,ref}=await encoded(p,w,row);if(seen.has(ref.file))fail('Повторный selected source/format');seen.add(ref.file);await Deno.writeFile(join(p.directory,ref.file),bytes,{createNew:true,mode:0o600});refs.push(ref)}return refs;
}
async function readRecord(p:NativeRunPointer,ref:SelectedCommonPathRef,w?:CommonPathWitness){
 if(Object.keys(ref).sort().join(',')!=='file,format,sha1,sha256,source'||typeof ref.source!=='string'||typeof ref.format!=='string'||ref.file!=='selected-common-paths/'+await selectedHash(new TextEncoder().encode(ref.source+'\0'+ref.format))+'.json'||!/^[a-f0-9]{40}$/.test(ref.sha1)||!/^[a-f0-9]{64}$/.test(ref.sha256))fail('Некорректный selected ref');
 const path=join(p.directory,ref.file),bytes=await metadataBytes(path),stat=await Deno.lstat(path);if(!bytes||(stat.mode!&0o7777)!==0o600||await selectedHash(bytes)!==ref.sha256||await selectedHash(bytes,'SHA-1')!==ref.sha1)fail('Selected record bytes/type/hash drift');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(value.schema!=='course-common-selected-v1'||stable(value.binding)!==stable(identity(p,w))||value.row?.source!==ref.source||value.row?.format!==ref.format)fail('Selected record принадлежит другому pointer/source/format');return value;
}
/** END перепроверяет exact refset и все bytes по полному admitted witness. */
export async function assertSelectedCommonPaths(p:NativeRunPointer,w:CommonPathWitness,retirement?:ExportRetirement){
 if(p.commonPathRetirement&&(!verifiedRetirement(retirement)||retirement.root!==p.projectRoot||retirement.file!==p.commonPathRetirement.file||retirement.sha256!==p.commonPathRetirement.sha256))fail('Нет admitted completed retirement capability');
 if(p.commonPathDocuments===undefined)return;const refs=p.commonPathDocuments;if(!Array.isArray(refs)||refs.length!==w.documents.length)fail('Неполный selected refset');
 const names:string[]=[];for(const [i,row] of w.documents.entries()){const captured=await readRecord(p,refs[i],w),expected=await encoded(p,w,row,captured);if(stable(expected.ref)!==stable(refs[i]))fail('Selected refset не выводится из global witness');names.push(expected.ref.file.split('/')[1])}
 const actual=[];for await(const e of Deno.readDir(join(p.directory,'selected-common-paths'))){if(!e.isFile||e.isSymlink)fail('Selected record directory type drift');actual.push(e.name)}if(stable(actual.sort())!==stable(names.sort()))fail('Лишняя/отсутствующая selected record');
}
/** Локальная capture-граница; unrelated inputs проверяются полным BEGIN/END. */
export async function readSelectedCommonPath(p:NativeRunPointer,source:string,format:string){
 if(!Array.isArray(p.commonPathDocuments))return fail('Нет selected refs');const refs=p.commonPathDocuments.filter(r=>r.source===source&&r.format===format);if(refs.length!==1)throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID','Неизвестный source/format текущего witness',{source,field:'native-run'});const ref=refs[0],record=await readRecord(p,ref);
 const pointer=join(p.projectRoot,'_generated/course-spec/active-native-run.json'),before=await Deno.readTextFile(pointer);if(stable(JSON.parse(before))!==stable(p))fail('Selected pointer не current');
 const check=async()=>{const live=await sourceFile(p.projectRoot,source),entry=await Deno.lstat(join(p.projectRoot,source)),physical=await Deno.lstat(live.physicalPath);
  const state=(s:Deno.FileInfo)=>({dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,gid:s.gid,size:s.size,mtime:s.mtime?.getTime(),ctime:s.ctime?.getTime()});
  if(stable(state(entry))!==stable(record.entry)||stable(state(physical))!==stable(record.physical))fail('Selected source entry identity drift');if(live.physicalPath!==record.source.physicalPath||live.linkTarget!==record.source.linkTarget||await selectedHash(live.bytes)!==record.sourceHash)fail('Selected source bytes/identity drift');
  for(const [path,hash] of Object.entries(record.files)){const bytes=await metadataBytes(path);if((bytes?await selectedHash(bytes):false)!==hash)fail('Selected config/include/common closure drift: '+path)}
  if(await Deno.readTextFile(pointer)!==before)fail('Selected pointer changed during capture');await readRecord(p,ref);
 };await check();const result=record.row;await check();return result as CommonPathWitness['documents'][number];
}
