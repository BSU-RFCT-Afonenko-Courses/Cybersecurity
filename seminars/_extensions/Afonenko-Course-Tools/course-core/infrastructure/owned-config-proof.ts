/** Closed references нового private lifecycle; сами по себе не capability. */
import type {EntryIdentity} from './owned-config-entry.ts';
import {join,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
const fail=(message:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',message,{field:'project-materialization'})};
const keys=(v:any,n:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===n.sort().join(',');
export type OwnedConfigOverlay={kind:'owned-config-overlay-v1';sourceContext:{sha1:string;sha256:string}};
export function overlayReference(value:unknown):OwnedConfigOverlay{
 const v=value as any;
 if(!keys(v,['kind','sourceContext'])||v.kind!=='owned-config-overlay-v1'||!keys(v.sourceContext,['sha1','sha256'])||typeof v.sourceContext.sha1!=='string'||!/^[a-f0-9]{40}$/.test(v.sourceContext.sha1)||typeof v.sourceContext.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sourceContext.sha256))fail('Некорректный closed owned-config overlay ref');
 return v;
}
/** Вызывается только новой веткой. Старые v2/v1 не получают fallback/default. */
export function overlayVersions(pointerSchema:unknown,witnessSchema:unknown,pointerRef:unknown,witnessRef:unknown,state:unknown,restoration?:unknown):'active'|'restored'{
 if(pointerSchema!=='course-native-run-pointer-v3'||witnessSchema!=='course-common-files-path-binding-v2'||!['active','restored'].includes(state as string))fail('Несогласованные private overlay versions/state');
 const p=overlayReference(pointerRef),w=overlayReference(witnessRef);if(p.sourceContext.sha1!==w.sourceContext.sha1||p.sourceContext.sha256!==w.sourceContext.sha256)fail('Source-context refs pointer/witness не совпадают');
 if(state==='active'&&restoration!==undefined)fail('Active overlay не имеет final restoration ref');if(state==='restored')restorationReference(restoration);
 return state as 'active'|'restored';
}

export type RestorationReference={file:'owned-export-restored-entry.json';sha1:string;sha256:string};
const hashes=(v:any)=>keys(v,['sha1','sha256'])&&typeof v.sha1==='string'&&/^[a-f0-9]{40}$/.test(v.sha1)&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256);
export function restorationReference(value:unknown):RestorationReference{
 const v=value as any;if(!keys(v,['file','sha1','sha256'])||v.file!=='owned-export-restored-entry.json'||!hashes({sha1:v.sha1,sha256:v.sha256}))fail('Нет exact restored-entry ref');return v;
}
export type RestorationRecord={schema:'course-owned-export-restored-entry-v1';projectRoot:string;runDirectory:string;file:'_quarto.yml'|'_quarto.yaml';sourceContext:{sha1:string;sha256:string};sourceConfig:{sha1:string;sha256:string};executionConfig:{sha1:string;sha256:string};originalEntry:EntryIdentity;restoredEntry:EntryIdentity};
export type RestorationBinding=Pick<RestorationRecord,'projectRoot'|'runDirectory'|'file'|'sourceContext'|'sourceConfig'|'executionConfig'|'originalEntry'>;
function identity(value:any):asserts value is EntryIdentity{
 if(!keys(value,['ino','devMajor','devMinor','uid','gid','mode','size','mtime','ctime'])||!['ino','size'].every(k=>typeof value[k]==='string'&&/^(?:0|[1-9][0-9]*)$/.test(value[k]))||!['devMajor','devMinor','uid','gid'].every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=0xffffffff)||!Number.isInteger(value.mode)||value.mode<0||(value.mode&0o170000)!==0o100000||value.mode>0xffff||!['mtime','ctime'].every(k=>typeof value[k]==='string'&&/^-?(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]{0,8})$/.test(value[k]))||BigInt(value.size)>16n*1024n*1024n)fail('Нет closed original EntryIdentity');
}
/** Pure shape/relation only: caller values do NOT grant a restoration capability. */
export function validateRestorationRecord(value:unknown,bound:RestorationBinding):RestorationRecord{
 const r=value as any;if(!keys(r,['schema','projectRoot','runDirectory','file','sourceContext','sourceConfig','executionConfig','originalEntry','restoredEntry'])||r.schema!=='course-owned-export-restored-entry-v1'||r.projectRoot!==bound.projectRoot||r.runDirectory!==bound.runDirectory||r.file!==bound.file||!['_quarto.yml','_quarto.yaml'].includes(r.file)||resolve(r.projectRoot)!==r.projectRoot||!/^[-0-9a-f]{36}$/.test(r.runDirectory.slice(r.runDirectory.lastIndexOf('/')+1))||join(r.projectRoot,'_generated/course-spec/native-runs',r.runDirectory.slice(r.runDirectory.lastIndexOf('/')+1))!==r.runDirectory)fail('Restoration record root/run/schema mismatch');
 for(const key of ['sourceContext','sourceConfig','executionConfig'] as const)if(!hashes(r[key])||!hashes(bound[key])||r[key].sha1!==bound[key].sha1||r[key].sha256!==bound[key].sha256)fail('Restoration original context/config ref mismatch');
 identity(r.originalEntry);identity(r.restoredEntry);identity(bound.originalEntry);
 for(const k of Object.keys(bound.originalEntry) as (keyof EntryIdentity)[])if(r.originalEntry[k]!==bound.originalEntry[k]||(k!=='ctime'&&r.restoredEntry[k]!==bound.originalEntry[k]))fail('Нет exact original inode/owner/fullmode/mtime transition');
 return r;
}
/** Ref refresh cannot select a new final record independently of BOTH completed copies. */
export function validateCompletedRestorationRefs(pointer:{schema:string;overlayState?:string;directory:string;ownedConfigRestoration?:unknown},perRun:any,rootCopy:any){
 if(pointer.schema!=='course-native-run-pointer-v3'||pointer.overlayState!=='restored')fail('Нет completed-restored pointer');
 const ref=restorationReference(pointer.ownedConfigRestoration);
 for(const copy of [perRun,rootCopy]){
  const other=restorationReference(copy?.ownedConfigRestoration);if(copy?.directory!==pointer.directory||other.file!==ref.file||other.sha1!==ref.sha1||other.sha256!==ref.sha256)fail('Restoration ref не связан с обеими completed NativeRun copies');
 }
 return ref;
}
