/** Только controlled config-entry transaction; не author API и не общий FS layer. */
import {join,resolve,relative} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
const fail=(message:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',message,{field:'project-materialization'})};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
const c=(s:string)=>new TextEncoder().encode(s+'\0');
const MAX_CONFIG_BYTES=16*1024*1024;
const DIR=0o200000,NOFOLLOW=0o400000,CLOEXEC=0o2000000,CREATE=0o100,EXCL=0o200;
export type EntryIdentity={ino:string;devMajor:number;devMinor:number;uid:number;gid:number;mode:number;size:string;mtime:string;ctime:string};
function decodeIdentity(b:Uint8Array):EntryIdentity{const v=new DataView(b.buffer);if((v.getUint32(0,true)&0x7ff)!==0x7ff)fail('Нет required native identity fields');return {ino:v.getBigUint64(32,true).toString(),devMajor:v.getUint32(136,true),devMinor:v.getUint32(140,true),uid:v.getUint32(20,true),gid:v.getUint32(24,true),mode:v.getUint16(28,true),size:v.getBigUint64(40,true).toString(),mtime:v.getBigInt64(112,true)+':'+v.getUint32(120,true),ctime:v.getBigInt64(96,true)+':'+v.getUint32(104,true)}}
const same=(a:EntryIdentity,b:EntryIdentity,content=true)=>a.ino===b.ino&&a.devMajor===b.devMajor&&a.devMinor===b.devMinor&&a.uid===b.uid&&a.gid===b.gid&&a.mode===b.mode&&(!content||a.size===b.size&&a.mtime===b.mtime&&a.ctime===b.ctime);
export type RuntimeFile={path:string;bytes:number;sha256:string;identity:{dev:number|null;ino:number|null;mode:number|null;size:number;mtime:number|undefined;ctime:number|undefined}};
export async function overlayRuntimeIdentity(){
 if(Deno.build.os!=='linux'||Deno.build.arch!=='x86_64')fail('Config overlay требует поддержанный Linux x86_64 до source write');
 if(Object.entries(Deno.env.toObject()).some(([k,v])=>k.startsWith('LD_')&&!!v))fail('Неподдержанный loader environment; значения не выводятся');
 const paths=new Set<string>();
 for(const p of ['/usr/lib/libc.so.6','/usr/lib/x86_64-linux-gnu/libc.so.6','/lib/x86_64-linux-gnu/libc.so.6']){
  try{paths.add(await Deno.realPath(p))}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}
 }
 if(paths.size!==1)fail('Не установлен единственный fixed system libc');
 const file=async(path:string):Promise<RuntimeFile>=>{path=await Deno.realPath(path);const s=await Deno.lstat(path);if(!s.isFile||s.isSymlink||s.mode===null||(s.mode&0o022))fail('Небезопасная stock runtime identity');const bytes=await Deno.readFile(path);const after=await Deno.lstat(path);if(s.dev!==after.dev||s.ino!==after.ino||s.mode!==after.mode||s.size!==after.size||s.mtime?.getTime()!==after.mtime?.getTime()||s.ctime?.getTime()!==after.ctime?.getTime())fail('Runtime drift во время fingerprint');return {path,bytes:bytes.length,sha256:await hash(bytes),identity:{dev:s.dev,ino:s.ino,mode:s.mode,size:s.size,mtime:s.mtime?.getTime(),ctime:s.ctime?.getTime()}}};
 return {library:await file([...paths][0]),deno:await file(Deno.execPath()),loaderEnvironment:'absent' as const};
}
// Один held runtime на конечную группу read-only views; standalone reader остаётся fresh.
const readerRuntimes=new Map<string,Awaited<ReturnType<typeof overlayRuntimeIdentity>>>();
export async function withOverlayRuntime<T>(root:string,use:()=>Promise<T>):Promise<T>{
 if(readerRuntimes.has(root))return await use();
 const runtime=await overlayRuntimeIdentity();readerRuntimes.set(root,runtime);
 try{const result=await use();if(stable(await overlayRuntimeIdentity())!==stable(runtime))fail('Overlay runtime changed at group boundary');return result}finally{readerRuntimes.delete(root)}
}
export async function assertOverlayRuntimeBoundary(root:string){const runtime=readerRuntimes.get(root);if(!runtime||stable(await overlayRuntimeIdentity())!==stable(runtime))fail('Overlay runtime changed at boundary')}
async function readerRuntime(root:string){for(const [owner,runtime] of readerRuntimes)if(root===owner||root.startsWith(owner+'/'))return runtime;return await overlayRuntimeIdentity()}
export async function beginConfigEntry(root:string,entry:'_quarto.yml'|'_quarto.yaml'){
 if(!['_quarto.yml','_quarto.yaml'].includes(entry)||resolve(root)!==root||await Deno.realPath(root)!==root)fail('Неканонический config owner');
 const runtime=await overlayRuntimeIdentity(),environment=await hash(new TextEncoder().encode(stable(Deno.env.toObject())));
 const lib=Deno.dlopen(runtime.library.path,{
  openat:{parameters:['i32','buffer','i32','u32'],result:'i32'},close:{parameters:['i32'],result:'i32'},
  mkdirat:{parameters:['i32','buffer','u32'],result:'i32'},
  renameat2:{parameters:['i32','buffer','i32','buffer','u32'],result:'i32'},statx:{parameters:['i32','buffer','i32','u32','buffer'],result:'i32'},
  pread:{parameters:['i32','buffer','usize','i64'],result:'isize'},write:{parameters:['i32','buffer','usize'],result:'isize'},fsync:{parameters:['i32'],result:'i32'},
  __errno_location:{parameters:[],result:'pointer'},
 } as const);
 const F=lib.symbols,fds=new Set<number>();let closed=false;
 const errno=()=>new Deno.UnsafePointerView(F.__errno_location()!).getInt32();
 const open=(parent:number,name:string,flags:number,mode=0)=>{const fd=F.openat(parent,c(name),flags|NOFOLLOW|CLOEXEC,mode);if(fd<0)fail('Anchored open отказал: '+name+' errno='+errno());fds.add(fd);return fd};
 const close=(fd:number)=>{if(fds.delete(fd))F.close(fd)};
 const info=(fd:number,name=''):EntryIdentity=>{const b=new Uint8Array(256);if(F.statx(fd,c(name),name?0x100:0x1000,0x7ff,b)!==0)fail('Anchored statx отказал errno='+errno());return decodeIdentity(b)};
 const read=(fd:number)=>{const before=info(fd),size=Number(before.size);if(!Number.isSafeInteger(size)||size<0||size>MAX_CONFIG_BYTES)fail('Config size не поддержан');const bytes=new Uint8Array(size);let off=0;while(off<size){const n=Number(F.pread(fd,bytes.subarray(off),BigInt(size-off),BigInt(off)));if(n<=0)fail('Anchored config read отказал');off+=n}const extra=new Uint8Array(1);if(Number(F.pread(fd,extra,1n,BigInt(size)))!==0||stable(info(fd))!==stable(before))fail('Config drift во время read');return bytes};
 const equal=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 let rootfd:number,rootIdentity:EntryIdentity;try{rootfd=open(-100,root,DIR);rootIdentity=info(rootfd)}catch(e){for(const fd of [...fds])close(fd);lib.close();throw e}let leasefd=-1,originalfd=-1,executionfd=-1;let retiredPath:string|undefined;let retiredRunfd=-1;
 const leasePath=join(root,'_generated/course-spec/owned-config-overlay-lease');
 let bootstrap: {bytes:Uint8Array;identity:EntryIdentity}|undefined,profileEntry:{name:string;bytes:Uint8Array;fd:number;identity:EntryIdentity;retired:boolean}|undefined;
 let state='source';let sourceBytes:Uint8Array,sourceIdentity:EntryIdentity,sourceHeldIdentity:EntryIdentity,sourceRestoredIdentity:EntryIdentity,executionBytes:Uint8Array,executionIdentity:EntryIdentity,leaseIdentity:EntryIdentity;
 const parentCurrent=()=>{const path=info(-100,root);if(!same(path,rootIdentity,false)||(path.mode&0o170000)!==0o040000)fail('Config parent identity изменилась')};
 const runtimeUnchanged=async()=>{for(const old of [runtime.library,runtime.deno]){if(await Deno.realPath(old.path)!==old.path)return false;const s=await Deno.lstat(old.path);if(!s.isFile||s.isSymlink||stable({dev:s.dev,ino:s.ino,mode:s.mode,size:s.size,mtime:s.mtime?.getTime(),ctime:s.ctime?.getTime()})!==stable(old.identity))return false}return true};
 const runtimeCurrent=async()=>{if(closed)fail('Закрытый config transaction');parentCurrent();if(!same(info(-100,retiredPath??leasePath),leaseIdentity,false)||await Deno.realPath(retiredPath??leasePath)!==(retiredPath??leasePath))fail('Lease namespace/identity изменены');for(const name of ['_quarto.yml.local','_quarto.yaml.local']){try{await Deno.lstat(join(root,name));fail('Unconditional .local появился во время transaction')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}}if(await Deno.realPath(root)!==root||!await runtimeUnchanged()||await hash(new TextEncoder().encode(stable(Deno.env.toObject())))!==environment)fail('Config transaction runtime/parent/environment изменён')};
 const current=(name:string,expected:EntryIdentity,bytes:Uint8Array)=>{const fd=open(rootfd,name,0);try{if(!same(info(fd),expected)||!equal(read(fd),bytes))fail('Config entry bytes/identity/fullmode изменены')}finally{close(fd)}};
 const held=(fd:number,expected:EntryIdentity,bytes:Uint8Array)=>{if(!same(info(fd),expected)||!equal(read(fd),bytes))fail('Quarantine bytes/identity/fullmode изменены')};
 const rebind=(fd:number,expected:EntryIdentity,bytes:Uint8Array)=>{const actual=info(fd);if(!same({...actual,ctime:expected.ctime},expected)||!equal(read(fd),bytes))fail('Named rename identity/bytes изменены');return actual};
 const move=(fromfd:number,from:string,tofd:number,to:string)=>{if(F.renameat2(fromfd,c(from),tofd,c(to),1)!==0)fail('No-replace rename отказал: '+from+' -> '+to+' errno='+errno())};
 const create=(name:string,bytes:Uint8Array)=>{const fd=open(leasefd,name,2|CREATE|EXCL,0o600);let offset=0;while(offset<bytes.length){const n=Number(F.write(fd,new Uint8Array(bytes.subarray(offset)),BigInt(bytes.length-offset)));if(n<=0)fail('Private config write отказал');offset+=n}if(F.fsync(fd)!==0)fail('Private config fsync отказал');return fd};
 const dispose=()=>{if(!closed){for(const fd of [...fds])close(fd);lib.close();closed=true}};
 try{
  if((rootIdentity.mode&0o170000)!==0o040000||rootIdentity.uid!==Deno.uid())fail('Config owner должен принадлежать текущему operator');
  for(const name of ['_quarto.yml.local','_quarto.yaml.local']){try{await Deno.lstat(join(root,name));fail('Unconditional .local config не поддержан')}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}}
  originalfd=open(rootfd,entry,0);sourceIdentity=info(originalfd);sourceHeldIdentity=sourceIdentity;if((sourceIdentity.mode&0o170000)!==0o100000||sourceIdentity.uid!==Deno.uid())fail('Нужен regular same-owner source config');sourceBytes=read(originalfd);
  // Native no-replace capability на том же filesystem; ошибка EEXIST не пишет entry.
  if(F.renameat2(rootfd,c(entry),rootfd,c(entry),1)!==-1||errno()!==17)fail('Нет требуемого no-replace primitive до source write');
  current(entry,sourceIdentity,sourceBytes);parentCurrent();
  let parent=rootfd;for(const name of ['_generated','course-spec']){if(F.mkdirat(parent,c(name),0o700)!==0&&errno()!==17)fail('Не создан private parent');const next=open(parent,name,DIR);if(info(next).uid!==Deno.uid())fail('Foreign private parent');parent=next;}
  if(F.mkdirat(parent,c('owned-config-overlay-lease'),0o700)!==0)fail('Активный/orphan config lease блокирует новый capture');leasefd=open(parent,'owned-config-overlay-lease',DIR);leaseIdentity=info(leasefd);if((info(leasefd).mode&0o7777)!==0o700)fail('Private lease mode');
  current(entry,sourceIdentity,sourceBytes);const backup=create('source.raw',sourceBytes),sourceRawIdentity=info(backup);if(!equal(read(backup),sourceBytes))fail('Private source backup readback');close(backup);
  const freeze=(v:any):any=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v)}return v};
  freeze(runtime);const source=Object.freeze({entry,bytes:new Uint8Array(sourceBytes),identity:Object.freeze({...sourceIdentity}),backupIdentity:Object.freeze({...sourceRawIdentity}),leaseIdentity:Object.freeze({...leaseIdentity}),parent:Object.freeze({...rootIdentity}),runtime,environmentSha256:environment});
  const privateInventory=async(path:string)=>{
   if(await Deno.realPath(path)!==path||!same(info(-100,path),leaseIdentity,false))fail('Private quarantine namespace/identity drift');
   const names=[];for await(const e of Deno.readDir(path)){if(e.isSymlink||!e.isFile)fail('Private quarantine type drift');names.push(e.name)}
   if(stable(names.sort())!==stable(['quarantined-execution','source.raw',...(bootstrap?['bootstrap.json']:[]),...(profileEntry?['retired-profile']:[])].sort()))fail('Private quarantine inventory missing/extra');
   const raw=open(leasefd,'source.raw',0);try{if(!same(info(raw),sourceRawIdentity)||(info(raw).mode&0o7777)!==0o600||!equal(read(raw),sourceBytes))fail('Private source backup drift')}finally{close(raw)}
   const exec=open(leasefd,'quarantined-execution',0);try{if(!same(info(exec),executionIdentity)||!equal(read(exec),executionBytes))fail('Private execution quarantine drift')}finally{close(exec)}
   if(bootstrap){const b=open(leasefd,'bootstrap.json',0);try{if(!same(info(b),bootstrap.identity)||!equal(read(b),bootstrap.bytes))fail('Overlay bootstrap drift')}finally{close(b)}}
   if(profileEntry){if(!profileEntry.retired)fail('Owned profile не quarantined');const p=open(leasefd,'retired-profile',0);try{if(!same(info(p),profileEntry.identity)||!equal(read(p),profileEntry.bytes))fail('Retired owned profile drift')}finally{close(p)}}
   if(!same(info(-100,path),leaseIdentity,false))fail('Private quarantine parent drift');
  };

  const api={source,leasePath,close:dispose,
   async checkSource(){await runtimeCurrent();current(entry,sourceIdentity,sourceBytes);held(originalfd,sourceHeldIdentity,sourceBytes)},
   async prepare(bytes:Uint8Array){if(state!=='source')fail('Неверная config prepare фаза');await api.checkSource();if(bytes.length>MAX_CONFIG_BYTES)fail('Execution config size не поддержан');executionBytes=new Uint8Array(bytes);executionfd=create('execution.prepared',executionBytes);executionIdentity=info(executionfd);if(!equal(read(executionfd),executionBytes))fail('Execution readback');state='prepared';return Object.freeze({...executionIdentity})},
   async bindProfile(name:string,bytes:Uint8Array){if(state!=='prepared'||profileEntry||!/^_quarto-course-export-[0-9a-f-]{36}\.yml$/.test(name))fail('Нет closed generated profile binding');await api.checkSource();const fd=open(rootfd,name,0),identity=info(fd);if((identity.mode&0o170000)!==0o100000||identity.uid!==Deno.uid()||!equal(read(fd),bytes))fail('Generated profile bytes/type/owner mismatch');profileEntry={name,bytes:new Uint8Array(bytes),fd,identity,retired:false};return Object.freeze({...identity})},
   async activeEntries(){await api.checkActive();return {source:Object.freeze({...info(originalfd)}),execution:Object.freeze({...info(executionfd)})}},
   async publishBootstrap(bytes:Uint8Array){if(state!=='active'||bootstrap||!profileEntry||bytes.length>MAX_CONFIG_BYTES)fail('Неверная bootstrap publication phase');await api.checkActive();const fd=create('bootstrap.json',bytes);bootstrap={bytes:new Uint8Array(bytes),identity:info(fd)};close(fd)},
   async quarantineSource(){if(state!=='prepared')fail('Неверная source quarantine фаза');await api.checkSource();move(rootfd,entry,leasefd,'quarantined-source');sourceHeldIdentity=rebind(originalfd,sourceHeldIdentity,sourceBytes);const fd=open(leasefd,'quarantined-source',0);try{if(!same(info(fd),sourceHeldIdentity)||!equal(read(fd),sourceBytes))fail('Перемещён foreign source; bytes сохранены')}finally{close(fd)}state='source-quarantined'},
   async installExecution(){if(state!=='source-quarantined')fail('Неверная execution install фаза');await runtimeCurrent();held(originalfd,sourceHeldIdentity,sourceBytes);held(executionfd,executionIdentity,executionBytes);move(leasefd,'execution.prepared',rootfd,entry);executionIdentity=rebind(executionfd,executionIdentity,executionBytes);current(entry,executionIdentity,executionBytes);state='active'},
   async checkActive(){if(state!=='active')fail('Нет active execution config');await runtimeCurrent();held(originalfd,sourceHeldIdentity,sourceBytes);current(entry,executionIdentity,executionBytes)},
   async quarantineExecution(){await api.checkActive();move(rootfd,entry,leasefd,'quarantined-execution');executionIdentity=rebind(executionfd,executionIdentity,executionBytes);const fd=open(leasefd,'quarantined-execution',0);try{if(!same(info(fd),executionIdentity)||!equal(read(fd),executionBytes))fail('Перемещён foreign execution; bytes сохранены')}finally{close(fd)}state='execution-quarantined'},
   async restoreSource(){if(state!=='execution-quarantined')fail('Неверная restore фаза');await runtimeCurrent();held(originalfd,sourceHeldIdentity,sourceBytes);move(leasefd,'quarantined-source',rootfd,entry);sourceRestoredIdentity=rebind(originalfd,sourceHeldIdentity,sourceBytes);sourceHeldIdentity=sourceRestoredIdentity;current(entry,sourceRestoredIdentity,sourceBytes);state='restored'},
   async recoverSource(){
    if(state==='active')await api.quarantineExecution();
    if(state==='execution-quarantined')await api.restoreSource();
    else if(state==='source-quarantined'){await runtimeCurrent();held(originalfd,sourceHeldIdentity,sourceBytes);move(leasefd,'quarantined-source',rootfd,entry);sourceRestoredIdentity=rebind(originalfd,sourceHeldIdentity,sourceBytes);sourceHeldIdentity=sourceRestoredIdentity;current(entry,sourceRestoredIdentity,sourceBytes);state='restored'}
    if(state==='restored'||state==='lease-retired')await api.checkRestored();else if(state==='source'||state==='prepared')await api.checkSource();else fail('Неподтверждённая failure restoration phase');
   },
   async quarantineEmptyNativeOutput(name:string,destination:string){
    if(state!=='restored')fail('Native EMPTY cleanup требует активную failure-restoration фазу');
    await api.checkRestored();
    const parts=name.split('/'),target=relative(root,destination).replaceAll('\\','/');
    if(parts.some(p=>!p||p==='.'||p==='..'||/[\\\0]/.test(p))||!parts.at(-1)!.endsWith('_files')||!/^_generated\/course-spec\/native-runs\/[0-9a-f-]{36}\/aborted-native-empty$/.test(target))fail('Нет finite native EMPTY quarantine scope');
    const openDirectories=(parts:string[])=>{
     let fd=rootfd;const chain:{parent:number;name:string;fd:number;identity:EntryIdentity}[]=[];
     for(const name of parts){const next=open(fd,name,DIR),identity=info(next);if(identity.uid!==rootIdentity.uid||identity.devMajor!==rootIdentity.devMajor||identity.devMinor!==rootIdentity.devMinor)fail('Foreign native EMPTY parent');chain.push({parent:fd,name,fd:next,identity});fd=next}
     const check=()=>{parentCurrent();for(const item of chain)if(!same(info(item.fd),item.identity,false)||!same(info(item.parent,item.name),item.identity,false))fail('Native EMPTY quarantine parent replaced')};check();return {fd,check};
    };
    const parent=openDirectories(parts.slice(0,-1)),leaf=parts.at(-1)!,fd=open(parent.fd,leaf,DIR),before=info(fd),path=join(root,name);
    const regularEmptyDirectory=(s:EntryIdentity)=>{if((s.mode&0o170000)!==0o040000||(s.mode&0o7777)!==0o755||s.uid!==rootIdentity.uid||s.gid!==rootIdentity.gid||s.devMajor!==rootIdentity.devMajor||s.devMinor!==rootIdentity.devMinor)fail('Не native same-owner EMPTY directory')};
    regularEmptyDirectory(before);
    const names=[];for await(const entry of Deno.readDir(path)){if(entry.isSymlink||!entry.isDirectory||entry.name!=='mediabag')fail('Native EMPTY quarantine содержит чужие files');names.push(entry.name)}
    if(names.length>1)fail('Лишний native EMPTY child');
    let child:{fd:number;identity:EntryIdentity}|undefined;
    if(names.length){const childfd=open(fd,'mediabag',DIR),identity=info(childfd);regularEmptyDirectory(identity);for await(const _entry of Deno.readDir(join(path,'mediabag')))fail('Непустой native mediabag');child={fd:childfd,identity}}
    const check=()=>{parent.check();if(!same(info(fd),before)||!same(info(parent.fd,leaf),before))fail('Native EMPTY changed before quarantine');if(child&&(!same(info(child.fd),child.identity)||!same(info(fd,'mediabag'),child.identity)))fail('Native EMPTY child changed')};
    // No-replace rename preserves the entire entry even if a final namespace race is detected.
    const targetParent=openDirectories(target.split('/'));check();targetParent.check();
    const quarantine=crypto.randomUUID();move(parent.fd,leaf,targetParent.fd,quarantine);
    const after=info(fd);if(!same({...after,ctime:before.ctime},before)||!same(info(targetParent.fd,quarantine),after))fail('Подменённый native EMPTY entry сохранён в quarantine: '+join(destination,quarantine));
    targetParent.check();parent.check();await api.checkRestored();return {name,quarantine,identity:after};
   },
   async checkRestored(){if(!['restored','lease-retired'].includes(state))fail('Нет restored config');await runtimeCurrent();current(entry,sourceRestoredIdentity,sourceBytes)},
   async quarantineProfile(){if(state!=='restored'||!profileEntry||profileEntry.retired)fail('Неверная profile quarantine phase');await api.checkRestored();const p=profileEntry!;current(p.name,p.identity,p.bytes);held(p.fd,p.identity,p.bytes);move(rootfd,p.name,leasefd,'retired-profile');p.identity=rebind(p.fd,p.identity,p.bytes);const fd=open(leasefd,'retired-profile',0);try{if(!same(info(fd),p.identity)||!equal(read(fd),p.bytes))fail('Перемещён foreign profile; bytes сохранены')}finally{close(fd)}p.retired=true},
   async restoredEntry(){await api.checkRestored();return Object.freeze({...info(originalfd)})},
   async retire(backupPath:string){
    await api.checkRestored();if(state!=='restored')fail('Lease уже retired');
    if(typeof backupPath!=='string'||resolve(backupPath)!==backupPath||!/^_generated\/course-spec\/native-runs\/[0-9a-f-]{36}\/owned-export-source-config\.raw$/.test(relative(root,backupPath)))fail('Нет fixed retained source backup');
    let fd=rootfd;for(const part of relative(root,backupPath).split('/').slice(0,-1)){fd=open(fd,part,DIR)}retiredRunfd=fd;
    const raw=open(retiredRunfd,'owned-export-source-config.raw',0);try{if((info(raw).mode&0o7777)!==0o600||!equal(read(raw),sourceBytes))fail('Retained source backup не подтверждён')}finally{close(raw)}
    await privateInventory(leasePath);parentCurrent();
    // Ни один child entry не удаляется: весь lease atomically retires no-replace.
    move(parent,'owned-config-overlay-lease',retiredRunfd,'owned-export-config-quarantine');
    retiredPath=join(backupPath,'../owned-export-config-quarantine');retiredPath=resolve(retiredPath);
    if(!same(info(retiredRunfd,'owned-export-config-quarantine'),leaseIdentity,false))fail('Foreign lease перемещён; всё содержимое сохранено');
    state='lease-retired';
   },
   async verifyRetired(){
    if(state!=='lease-retired'||!retiredPath)fail('Нет retired private lease');await api.checkRestored();
    const result=F.openat(parent,c('owned-config-overlay-lease'),DIR|NOFOLLOW|CLOEXEC,0);if(result>=0){F.close(result);fail('Active lease появился снова')}if(errno()!==2)fail('Не подтверждено отсутствие active lease');
    await privateInventory(retiredPath!);parentCurrent();current(entry,sourceRestoredIdentity,sourceBytes);
   },
  };return api;
 }catch(e){dispose();throw e}
}

/** Read-only anchored observation for independent new-mode readers. No lease/write/repair. */
export async function openConfigEntryView(root:string,entry:'_quarto.yml'|'_quarto.yaml'|'quarantined-source'){
 if(!(entry==='quarantined-source'?root.endsWith('/_generated/course-spec/owned-config-overlay-lease'):['_quarto.yml','_quarto.yaml'].includes(entry))||resolve(root)!==root||await Deno.realPath(root)!==root)fail('Неканонический source config reader');
 const runtime=await readerRuntime(root),environment=await hash(new TextEncoder().encode(stable(Deno.env.toObject())));
 const lib=Deno.dlopen(runtime.library.path,{openat:{parameters:['i32','buffer','i32','u32'],result:'i32'},close:{parameters:['i32'],result:'i32'},statx:{parameters:['i32','buffer','i32','u32','buffer'],result:'i32'},pread:{parameters:['i32','buffer','usize','i64'],result:'isize'}} as const);
 const f=lib.symbols,fds=new Set<number>();let closed=false;
 const close=()=>{if(!closed){for(const fd of fds)f.close(fd);fds.clear();lib.close();closed=true}};
 const open=(fd:number,path:string,flags:number)=>{const next=f.openat(fd,c(path),flags|NOFOLLOW|CLOEXEC,0);if(next<0)fail('Anchored config reader open отказал');fds.add(next);return next};
 const info=(fd:number,path='')=>{const b=new Uint8Array(256);if(f.statx(fd,c(path),path?0x100:0x1000,0x7ff,b)!==0)fail('Anchored reader statx отказал');return decodeIdentity(b)};
 const bytes=(fd:number)=>{const before=info(fd),size=Number(before.size);if(!Number.isSafeInteger(size)||size<0||size>MAX_CONFIG_BYTES)fail('Source config reader size не поддержан');const b=new Uint8Array(size);let off=0;while(off<size){const n=Number(f.pread(fd,b.subarray(off),BigInt(size-off),BigInt(off)));if(n<=0)fail('Anchored source config read отказал');off+=n}if(stable(info(fd))!==stable(before)||Number(f.pread(fd,new Uint8Array(1),1n,BigInt(size)))!==0)fail('Config drift во время independent read');return b};
 try{
  const parent=open(-100,root,DIR),parentIdentity=info(parent),fd=open(parent,entry,0),entryIdentity=info(fd),raw=bytes(fd);
  if((parentIdentity.mode&0o170000)!==0o040000||(entryIdentity.mode&0o170000)!==0o100000||parentIdentity.uid!==Deno.uid()||entryIdentity.uid!==Deno.uid())fail('Source config reader owner/type mismatch');
  const check=async()=>{
   if(closed||!same(info(-100,root),parentIdentity,false)||!same(info(parent,entry),entryIdentity)||!same(info(fd),entryIdentity)||await Deno.realPath(root)!==root)fail('Independent source entry/parent bytes/identity drift');
   const current=bytes(fd);if(current.length!==raw.length||!current.every((b,i)=>b===raw[i]))fail('Independent source config bytes drift');
   for(const old of [runtime.library,runtime.deno]){const s=await Deno.lstat(old.path);if(await Deno.realPath(old.path)!==old.path||!s.isFile||s.isSymlink||stable({dev:s.dev,ino:s.ino,mode:s.mode,size:s.size,mtime:s.mtime?.getTime(),ctime:s.ctime?.getTime()})!==stable(old.identity))fail('Independent overlay runtime identity drift')}
   if(await hash(new TextEncoder().encode(stable(Deno.env.toObject())))!==environment)fail('Independent overlay reader environment drift');
  };
  await check();return {identity:Object.freeze({...entryIdentity}),parent:Object.freeze({...parentIdentity}),bytes:new Uint8Array(raw),runtime,check,close};
 }catch(e){close();throw e}
}

/** ARCH87: bounded, held native identity for one exact source-side JSON slot. */
export async function openNativeJsonOutput(root:string,name:string){
 if(resolve(root)!==root||!name||name.split('/').some(p=>!p||p==='.'||p==='..')||/[\\\0]/.test(name)||await Deno.realPath(root)!==root)fail('Неканонический native JSON slot');
 const runtime=await readerRuntime(root),lib=Deno.dlopen(runtime.library.path,{openat:{parameters:['i32','buffer','i32','u32'],result:'i32'},close:{parameters:['i32'],result:'i32'},statx:{parameters:['i32','buffer','i32','u32','buffer'],result:'i32'},pread:{parameters:['i32','buffer','usize','i64'],result:'isize'}} as const),F=lib.symbols,fds:number[]=[];
 const close=()=>{for(const fd of fds.splice(0))F.close(fd);lib.close()};
 const info=(fd:number,path='')=>{const b=new Uint8Array(256);if(F.statx(fd,c(path),path?0x100:0x1000,0x7ff,b)!==0)fail('Native output statx отказал');return {...decodeIdentity(b),nlink:new DataView(b.buffer).getUint32(16,true)}};
 const open=(fd:number,name:string,flags:number)=>{const n=F.openat(fd,c(name),flags|NOFOLLOW|CLOEXEC,0);if(n<0)fail('Native output anchored open отказал');fds.push(n);return n};
 try{
  const rootfd=open(-100,root,DIR),owner=info(rootfd),parents:{fd:number;parent:number;name:string;identity:ReturnType<typeof info>}[]=[];if(owner.uid!==Deno.uid())fail('Чужой native output owner');
  let parent=rootfd;const parts=name.split('/');for(const component of parts.slice(0,-1)){const fd=open(parent,component,DIR),identity=info(fd);if(identity.uid!==owner.uid||identity.devMajor!==owner.devMajor||identity.devMinor!==owner.devMinor)fail('Чужой native output parent');parents.push({fd,parent,name:component,identity});parent=fd}
  const leaf=parts[parts.length-1],fd=open(parent,leaf,0o4000),identity=info(fd),size=Number(identity.size);
  if((identity.mode&0o170000)!==0o100000||identity.nlink!==1||identity.uid!==owner.uid||identity.gid!==owner.gid||identity.devMajor!==owner.devMajor||identity.devMinor!==owner.devMinor||!Number.isSafeInteger(size)||size<0||size>64*1024*1024)fail('Неподдержанный native JSON entry/size/link/owner');
  const check=async()=>{if(!same(info(-100,root),owner,false)||await Deno.realPath(root)!==root)fail('Native output root replaced');for(const p of parents)if(!same(info(p.fd),p.identity,false)||!same(info(p.parent,p.name),p.identity,false))fail('Native output parent replaced');if(stable(info(fd))!==stable(identity)||stable(info(parent,leaf))!==stable(identity))fail('Native output inode/full identity changed')};
  await check();const bytes=new Uint8Array(size);let offset=0;while(offset<size){const n=Number(F.pread(fd,bytes.subarray(offset),BigInt(size-offset),BigInt(offset)));if(n<=0)fail('Native output bounded read отказал');offset+=n}if(Number(F.pread(fd,new Uint8Array(1),1n,BigInt(size)))!==0)fail('Native output grew during read');await check();
  return {identity,bytes,check,close};
 }catch(e){close();throw e}
}
