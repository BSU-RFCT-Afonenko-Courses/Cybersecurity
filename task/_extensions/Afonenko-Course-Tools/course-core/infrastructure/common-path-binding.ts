import {assertSelectedCommonPaths} from './common-path-selected.ts';
/** Внутреннее подтверждение native-путей; авторский metadata/fact API прежний. */
import {basename,dirname,fromFileUrl,join,relative,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {withNativeRawPhase,assertNativeRawBoundary} from './native-raw-metadata.ts';
import {command,quartoExecutable} from './process.ts';
import {readOverlayContext,overlaySourceRefs,overlayOriginalsInPhase,assertOverlayCurrent,withOverlayCurrentCheck,assertOverlayBoundary,validateRestoredOverlayNative,admitOverlayNativeOutputs} from './owned-config-overlay.ts';
import {overlayVersions} from './owned-config-proof.ts';
import type {OwnedConfigOverlay} from './owned-config-proof.ts';
import type {NativeRun,NativeRunPointer} from './native-run.ts';
import {collectMetadataClosure,validateMetadataClosure,closureInputs,configIdentities,commonKey,metadataBytes,type MetadataClosure,type MetadataInputs,nativeExtensionRoots,withFreshOwnerFrame,freshOwnerData} from './metadata-closure.ts';
import {inspectSources,inspectCurrentSources,sourceFile,sourceMetadata,sameSourceMetadata,type SourceIdentities} from './source-identities.ts';
import {captureOwnedProfile,assertProducerProfileCurrent,readOwnedProfileEvidence,assertOwnedProfileCurrent,readOwnedProfileEvidenceInPhase,assertOwnedProfileCurrentInPhase} from './owned-export-profile.ts';
import {checkInspectionStore,inspectionRefs,withInspectionWriter,withInspectionSnapshot,inspectionSnapshotData,originalInspectionsInPhase,type InspectionSnapshot} from './inspection-preimages.ts';
import {completedExportRetirement,prepareRetiredRegularContext,validateCompletedExportScope} from './native-export-retirement.ts';
const fail=(message:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',message,{field:'project-materialization'})};
export const stable=(value:unknown):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function digest(bytes:Uint8Array,algorithm='SHA-256'){return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm,new Uint8Array(bytes).buffer)),x=>x.toString(16).padStart(2,'0')).join('')}
// Stock toInputRelativePaths joins the owner offset to the canonical spelling.
// relative(inputDir, owner/source) instead collapses shared input/source prefixes.
function ownerEffectiveSource(root:string,input:string,source:string){return join(relative(dirname(resolve(root,input)),root),source).replaceAll('\\','/')}
function local(value:unknown):asserts value is string{
 if(typeof value!=='string'||!value||/^[\/\\]/.test(value)||/[\\\0:*?\[\]{}]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git'))fail('Недопустимый canonical путь');
}
const privateParts=new Set(['private','reference','solution','solutions','grading-notes','rubric.md','contract.md','tests']);
const generated=new Set(['.git','.gradle','.mvn','.quarto','_generated','node_modules','build','target','out','__pycache__','_extensions','site_libs','_output','_site','_book']);
const generatedPart=(p:string)=>generated.has(p)||/^_(?:site|output|book)(?:-|$)/.test(p);
const excluded=(p:string)=>/\.(qmd|rmd|ipynb|class|jar)$/i.test(p)||/^(?:_quarto(?:[-.].*)?|_metadata\.ya?ml)$/i.test(p)||p==='check.sh'||p.startsWith('.')&&p!=='.gitignore';
export async function regular(root:string,name:string,optional=false):Promise<Uint8Array|undefined>{
 local(name);let path=root;
 for(const part of name.split('/')){
  path=join(path,part);
  try{const info=await Deno.lstat(path);if(info.isSymlink)fail('Символическая ссылка в proof: '+name)}catch(e){if(e instanceof Deno.errors.NotFound&&optional)return;throw e}
 }
 if(await Deno.realPath(path)!==path||!(await Deno.lstat(path)).isFile)fail('Нужен regular file внутри owner: '+name);
 return await Deno.readFile(path);
}
type Section={projects:Record<string,{'common-files':{source:string;target:string;audience:'student'|'grading'}[];'include-git'?:boolean}>};
export function section(raw:any):Section|null{
 if(raw==null)return null;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).join(',')!=='projects'||!raw.projects||typeof raw.projects!=='object'||Array.isArray(raw.projects))fail('Некорректная canonical materialization section');
 for(const [id,e] of Object.entries(raw.projects) as [string,any][]){
  if(!/^exr-[a-z0-9][a-z0-9-]*$/.test(id)||!e||typeof e!=='object'||Object.keys(e).some(k=>!['common-files','include-git'].includes(k))||!Array.isArray(e['common-files'])||e['include-git']!==undefined&&typeof e['include-git']!=='boolean')fail('Некорректная canonical declaration: '+id);
  const targets=new Set();
  for(const f of e['common-files']){
   if(!f||Object.keys(f).sort().join(',')!=='audience,source,target'||!['student','grading'].includes(f.audience))fail('Некорректный canonical common entry');
   local(f.source);local(f.target);
   if(f.source.split('/').some((p:string)=>privateParts.has(p)||generatedPart(p)||excluded(p)))fail('Закрытый/source/config/generated common source');
   if(f.target.split('/').some((p:string)=>generatedPart(p)))fail('Generated common target');
   if(f.audience==='student'&&(!f.target.startsWith('student/')||f.target.split('/').some((p:string)=>privateParts.has(p)||excluded(p))))fail('Непубличный student target');
   if(f.audience==='grading'&&f.target.startsWith('student/'))fail('Grading target внутри student');
   if(!['student','reference','tests'].includes(f.target.split('/')[0])&&!['rubric.md','contract.md'].includes(f.target))fail('Common target вне partitions');
   if(targets.has(f.target))fail('Повторный common target');targets.add(f.target);
  }
 }
 return raw;
}
function nestedDeclaration(raw:any,top=true):boolean{
 if(!raw||typeof raw!=='object')return false;
 return Object.entries(raw).some(([k,v])=>k==='project-materialization'?!top:nestedDeclaration(v,false));
}
// Это inventory native metadata, не повторное разрешение extension IDs.
async function extensionMetadata(roots:string[]){
 const files:Record<string,string>={};
 async function descriptor(dir:string){
  let found=false;
  for(const name of ['_extension.yml','_extension.yaml']){
   const bytes=await regular(dir,name,true);if(bytes){files[join(dir,name)]=await digest(bytes);found=true}
  }return found;
 }
 for(const root of roots){
  try{if(await Deno.realPath(root)!==root||!(await Deno.lstat(root)).isDirectory)fail('Неподтверждённый extension metadata root')}catch(e){if(e instanceof Deno.errors.NotFound)continue;throw e}
  for await(const entry of Deno.readDir(root)){
   if(entry.isSymlink)fail('Symlink в native extension metadata root');if(!entry.isDirectory)continue;
   const dir=join(root,entry.name);if(await descriptor(dir))continue;
   // Inventory повторяет только поддержанную stock layout: namespace + extension.
   for await(const child of Deno.readDir(dir)){
    if(child.isSymlink)fail('Symlink в extension namespace');if(child.isDirectory)await descriptor(join(dir,child.name));
   }
  }
 }return files;
}
export interface CommonPathWitness {
 schema:'course-common-files-path-binding-v1'|'course-common-files-path-binding-v2';ownedConfigOverlay?:OwnedConfigOverlay;sourceInspectionRefs?:string[];projectRoot:string;runDirectory:string;profiles:string[];outputDirectory:string;renderAll:boolean;
 quartoVersion:string;ownerInspectionHash:string;documentInspectionHashes:Record<string,string>;
 configurationInputs:Record<string,string|false>;inputFiles:string[];sourceHashes:Record<string,string>;commonSourceHashes:Record<string,string>;
 nativeExtensionMetadata:{roots:string[];files:Record<string,string>};metadataClosure:MetadataClosure;sourceIdentities:SourceIdentities;
 canonicalOwnerDeclarations:Section|null;documents:{source:string;format:string;rawDeclarations:Section|null;effectiveDeclarations:Section|null;canonicalDeclarations:Section|null}[];
 temporaryExportProfile?:{profile:string;file:string;sha256:string;sha1:string};forcedWriter?:{kind:'owned-export-json'};
}
async function inventory(root:string,output:string){
 const result:Record<string,string>={};
 async function walk(dir:string){for await(const e of Deno.readDir(dir)){
  const path=join(dir,e.name);if(path===output||generatedPart(e.name))continue;
  if(e.isSymlink){result[relative(root,path).replaceAll('\\','/')]='link:'+await Deno.readLink(path);continue;}
  if(e.isDirectory)await walk(path);else if(e.isFile)result[relative(root,path).replaceAll('\\','/')]=await digest(await Deno.readFile(path));else fail('Специальный файл в owner');
 }}await walk(root);return result;
}
function canonicalFact(value:Section|null){
 if(!value)return undefined;
 return Object.fromEntries(Object.entries(value.projects).map(([id,e])=>[id,{commonFiles:e['common-files'],...(e['include-git']!==undefined?{includeGit:e['include-git']}:{})}]));
}
async function currentInputs(root:string,w:CommonPathWitness,p:NativeRunPointer){
 if(stable(await extensionMetadata(w.nativeExtensionMetadata.roots))!==stable(w.nativeExtensionMetadata.files))fail('Native extension metadata closure изменён');
 for(const [name,hash] of Object.entries({...w.configurationInputs,...w.commonSourceHashes})){
  const retired=p.commonPathRetirement,overlay=p.overlayState==='restored'?await readOverlayContext(p):undefined;
  const expect=overlay&&name===overlay.base.file?overlay.base.hashes.sha256:overlay&&name===overlay.profile.file?false:retired&&name===retired.file?false:hash;
  const bytes=await regular(root,name,true);if((bytes?await digest(bytes):false)!==expect)fail('Proof устарел: '+name);
 }
 for(const [name,hash] of Object.entries(w.sourceHashes)){
  let bytes:Uint8Array|undefined;
  if(w.inputFiles.includes(name)){const live=await sourceFile(root,name),old=w.sourceIdentities.sources.find(x=>x.source===name);if(!old||live.physicalPath!==old.physicalPath||live.linkTarget!==old.linkTarget)fail('Source identity устарела: '+name);bytes=live.bytes}else bytes=await regular(root,name,true);
  if(!bytes||await digest(bytes)!==hash)fail('Source proof устарел: '+name)
 }
 const overlay=p.overlayState==='restored'?await readOverlayContext(p):undefined;
 for(const origin of w.metadataClosure.origins){const expect=overlay&&origin.path===join(root,overlay.base.file)?overlay.base.hashes.sha256:overlay&&origin.path===join(root,overlay.profile.file)?false:p.commonPathRetirement&&origin.path===join(root,p.commonPathRetirement.file)?false:origin.sha256;const bytes=await metadataBytes(origin.path);if((bytes?await digest(bytes):false)!==expect)fail('Metadata origin устарел: '+origin.path)}
}
export async function produceCommonPathBinding(p:NativeRunPointer){
 const overlay=p.schema==='course-native-run-pointer-v3'?await readOverlayContext(p):undefined;
 const produce=async(overlayCheck?:()=>Promise<unknown>)=>await withNativeRawPhase(p.projectRoot,rawPhase=>withInspectionWriter(p.directory,async writer=>{
 const root=p.projectRoot,before=await inventory(root,p.outputDirectory),producerIdentity=stable(p),invocation=await invocationIdentity(root),localInvocation=await invocationIdentity(root,false);
 const args=p.profiles.length?['--profile',p.profiles.join(',')]:[];
 const discovery=JSON.parse(await command(quartoExecutable(),['inspect',root,...args],root));
 const roots=nativeExtensionRoots(root,discovery.extensions??[]),extensionBefore=await extensionMetadata(roots);
 const selected:string[]=(p.initialInputFiles?.length?p.initialInputFiles:discovery.files.input).map((x:string)=>relative(root,resolve(root,x)).replaceAll('\\','/'));
 if(new Set(selected).size!==selected.length)fail('Повторный input');
 for(const source of selected){local(source);if(!before[source]||!discovery.files.input.includes(resolve(root,source)))fail('Input не принадлежит native inventory')}
 const owned=await captureOwnedProfile(p,selected);
 const store=writer.append,check=async()=>{if(stable(p)!==producerIdentity||await invocationIdentity(root,false)!==localInvocation)fail('Producer pointer/tool/environment изменён');};
 const producerBoundary=async()=>{await check();if(await invocationIdentity(root)!==invocation)fail('Producer tool changed');await assertProducerProfileCurrent(p,owned.context);await assertNativeRawBoundary(rawPhase,root);await overlayCheck?.()};
 const sourceProof=await inspectSources(root,selected,p.profiles,undefined,undefined,{before:check,capture:store});
 const sourceIdentities=sourceProof.identities;
 const discoveryDocs:Record<string,any>={},capturedDocumentHashes:Record<string,string>={};
 // Exact-call reuse only inside this producer: executable/full env/cwd/profiles
 // remain fenced by check(); both document roles use this explicit profile env.
 const documentEnvironment={QUARTO_PROFILE:p.profiles.join(',')};
 for(const source of selected){
  local(source);const path=resolve(root,source),identity=sourceIdentities.sources.find(x=>x.source===source)!;
  if(!before[source]||!discovery.files.input.includes(path))fail('Input не принадлежит native inventory');await check();
  if(identity.linkTarget===null&&identity.physicalPath===path&&(!Deno.env.get('COURSE_PERF_MODE')||Deno.env.get('COURSE_PERF_MODE')==='off')){
   discoveryDocs[source]=sourceProof.inspections[source];capturedDocumentHashes[source]=identity.physicalInspectionHash;
  }else{
   const text=await command(quartoExecutable(),['inspect',path,...args],root,documentEnvironment);
   discoveryDocs[source]=JSON.parse(text);capturedDocumentHashes[source]=await store(text);
  }
  await check();
 }
 const closureArguments=(inspection:any,docs:Record<string,any>):MetadataInputs=>({root,profiles:p.profiles,projectMetadata:inspection.config,validateCanonical:section,sourceIdentities,
  nativeConfigFiles:{owner:configIdentities(root,inspection.files.config),documents:Object.fromEntries(selected.map(source=>[source,configIdentities(root,docs[source].project?.files?.config)]))},
  documents:selected.flatMap(source=>(owned.forcedWriter?['json']:Object.keys(docs[source].formats??{})).map(format=>({source,format:['pdf','beamer'].includes(format)?'latex':format}))),
  extensionFiles:Object.keys(extensionBefore),includeMaps:Object.fromEntries(selected.map(source=>[source,inspection.fileInformation[source]?.includeMap??[]]))});
 const closureBefore=await collectMetadataClosure(closureArguments(discovery,discoveryDocs),undefined,undefined,undefined,rawPhase);
 await check();const ownerText=await command(quartoExecutable(),['inspect',root,...args],root),ownerHash=await store(ownerText);await check();
 // Полный свежий snapshot ДО первого cross-role чтения прежних physical blobs.
 const initialOriginals=await writer.snapshot(),owner=initialOriginals[ownerHash];
 if(stable(roots)!==stable(nativeExtensionRoots(root,owner.extensions??[]))||stable(extensionBefore)!==stable(await extensionMetadata(roots)))fail('Extension metadata drift во время authoritative inspect');
 if(owner.dir!==root||!owner.files||!owner.fileInformation)fail('Не установлен native owner');
 const canonical=section(owner.config?.['project-materialization']);
 if(nestedDeclaration(owner.config))fail('Неподдерживаемая вложенная owner declaration');
 for(const extension of owner.extensions??[])if(nestedDeclaration(extension,false))fail('Неподтверждённый extension origin');
 const names=['_quarto.yml','_quarto.yaml',...p.profiles.flatMap(x=>['_quarto-'+x+'.yml','_quarto-'+x+'.yaml'])];
 const config:Record<string,string|false>={};
 const sourceHashes:Record<string,string>={},commons:Record<string,string>={},documents:CommonPathWitness['documents']=[],docHashes:Record<string,string>={};
 const authoritativeDocs:Record<string,any>={};
 const record=(name:string,table:Record<string,string|false>)=>{local(name);table[name]=before[name]??false};
 for(const name of names)record(name,config);
 const collect=async(value:Section|null)=>{for(const e of Object.values(value?.projects??{}))for(const f of e['common-files']){const bytes=await regular(root,f.source);if(!bytes||before[f.source]!==await digest(bytes))fail('Common source drift во время inspect');commons[f.source]=before[f.source]}};
 await collect(canonical);
 for(const source of selected){
  local(source);if(!before[source]||!owner.files.input.includes(resolve(root,source)))fail('Input не принадлежит native inventory: '+source);
  sourceHashes[source]=sourceProof.sourceHashes[source];
  const information=owner.fileInformation[source];if(!information||typeof information.metadata!=='object'||!Array.isArray(information.includeMap))fail('Отсутствует raw native QMD metadata');
  sameSourceMetadata(sourceMetadata(initialOriginals[sourceIdentities.sources.find(x=>x.source===source)!.physicalInspectionHash],sourceIdentities.sources.find(x=>x.source===source)!.physicalPath),information);
  const raw=section(information.metadata['project-materialization']);if(nestedDeclaration(information.metadata))fail('Неизвестный QMD declaration origin');
  const canonicalDocument=canonical||raw?{projects:{...canonical?.projects,...raw?.projects}}:null;
  for(const id of Object.keys(raw?.projects??{}))if(canonical?.projects[id])fail('Неоднозначный owner/QMD origin: '+id);
  await collect(raw);
  let directory=dirname(source);
  while(true){
   for(const file of ['_metadata.yml','_metadata.yaml',...(directory==='.'?[]:['_quarto.yml','_quarto.yaml'])]){
    const name=directory==='.'?file:directory+'/'+file;record(name,config);

   }
   if(directory==='.')break;directory=dirname(directory);
  }
  for(const include of information.includeMap){
   if(!include||typeof include.source!=='string'||typeof include.target!=='string')fail('Неизвестный native include closure');
   const original=resolve(root,include.source),target=resolve(dirname(original),include.target);
   for(const file of [original,target]){const name=relative(root,file).replaceAll('\\','/');local(name);if(name===source)continue;const bytes=await regular(root,name);if(!bytes||before[name]!==await digest(bytes))fail('Неполный include closure');sourceHashes[name]=before[name]}
  }
  await check();const doc=discoveryDocs[source];await check();
  authoritativeDocs[source]=doc;
  docHashes[source]=capturedDocumentHashes[source];
  if(doc.project?.dir!==root||!doc.formats)fail('Чужой native document owner: '+source);
  if(stable(sourceMetadata(doc,resolve(root,source),source).metadata)!==stable(information.metadata))fail('Raw QMD metadata drift');
  const actualFormats=owned.forcedWriter?[['json',null]]:Object.entries(doc.formats);
  for(const [format,details] of actualFormats as [string,any][]){
   if(details&&(nestedDeclaration(details.metadata)||closureBefore.noCommon&&commonKey(details.metadata)))fail('Effective common metadata без подтверждённого raw origin');
   let effective=details?.metadata?.['project-materialization']??null;
   const predicted=canonicalDocument?structuredClone(canonicalDocument):null;
   if(predicted&&canonical)for(const id of Object.keys(canonical.projects))for(const f of predicted.projects[id]['common-files'])f.source=ownerEffectiveSource(root,source,f.source);
   if(owned.forcedWriter)effective=predicted;
   if(stable(predicted)!==stable(effective))fail('Необъяснённая effective materialization секция: '+source+'/'+format);
   documents.push({source,format:['pdf','beamer'].includes(format)?'latex':format,rawDeclarations:raw,effectiveDeclarations:effective,canonicalDeclarations:canonicalDocument});
  }
 }
 const metadataClosure=await collectMetadataClosure(closureArguments(owner,authoritativeDocs),undefined,undefined,undefined,rawPhase);
 if(stable(closureBefore)!==stable(metadataClosure))fail('Metadata closure drift во время authoritative inspect');
 if(commonKey(owner.config)&&metadataClosure.noCommon)fail('Effective owner common без raw origin');
 Object.assign(config,closureInputs(root,metadataClosure));
 const after=await inventory(root,p.outputDirectory);
 if(stable(extensionBefore)!==stable(await extensionMetadata(roots)))fail('Extension metadata drift во время document inspect');
 for(const [name,hash] of Object.entries({...config,...sourceHashes,...commons})){const row=sourceIdentities.sources.find(x=>x.source===name),key=row?relative(root,row.physicalPath).replaceAll('\\','/'):name;if((after[key]??false)!==hash)fail('Input/config/common drift во время inspect: '+name)}
 const witness:CommonPathWitness={schema:overlay?'course-common-files-path-binding-v2':'course-common-files-path-binding-v1',...(overlay?{ownedConfigOverlay:p.ownedConfigOverlay,sourceInspectionRefs:[...overlaySourceRefs(overlay)]}:{}),projectRoot:root,runDirectory:p.directory,profiles:p.profiles,outputDirectory:p.outputDirectory,renderAll:p.renderAll,quartoVersion:owner.quarto?.version,ownerInspectionHash:await digest(new TextEncoder().encode(ownerText)),documentInspectionHashes:docHashes,configurationInputs:config,inputFiles:selected,sourceHashes,commonSourceHashes:commons,canonicalOwnerDeclarations:canonical,documents,nativeExtensionMetadata:{roots,files:extensionBefore},metadataClosure,sourceIdentities,...(owned.forcedWriter?{forcedWriter:owned.forcedWriter,temporaryExportProfile:owned.temporaryExportProfile}:{})};
 const originals=await validateOriginalInspections(witness);if(overlay)await admitOverlayNativeOutputs(p,overlay,originals.lexical);
 // The closing actual owner is the fresh native side. Recheck physical leaf
 // identity and bytes independently; aliases keep both captured original roles.
 for(const source of selected){
  await check();const old=sourceIdentities.sources.find(x=>x.source===source)!,a=await sourceFile(root,source);
  if(a.physicalPath!==old.physicalPath||a.linkTarget!==old.linkTarget||!owner.files.input.includes(resolve(root,source)))fail('Final source identity/membership drift');
  const current=owner.fileInformation[source],physical=sourceMetadata(originals.physical[source],old.physicalPath),lexical=sourceMetadata(originals.lexical[source],resolve(root,source),source);
  sameSourceMetadata(physical,current);sameSourceMetadata(lexical,current);if(stable(lexical.includeMap)!==stable(current.includeMap))fail('Final source include drift');
  const b=await sourceFile(root,source);if(a.physicalPath!==b.physicalPath||a.linkTarget!==b.linkTarget||await digest(a.bytes)!==sourceProof.sourceHashes[source]||await digest(b.bytes)!==sourceProof.sourceHashes[source])fail('Input drift после inspect');await check();
 }
 if(stable(await collectMetadataClosure(closureArguments(owner,authoritativeDocs),undefined,undefined,undefined,rawPhase))!==stable(metadataClosure))fail('Metadata closure drift после final source inspect');
 await currentInputs(root,witness,p);await validateOriginalInspections(witness);await producerBoundary();
 const bytes=new TextEncoder().encode(JSON.stringify(witness));
 await Deno.writeFile(join(p.directory,'common-files-path-binding.json'),bytes,{createNew:true,mode:0o600});
 return {file:'common-files-path-binding.json' as const,sha1:await digest(bytes,'SHA-1'),sha256:await digest(bytes)};
 },overlay?overlaySourceRefs(overlay):undefined));
 return overlay?await withOverlayCurrentCheck(p,overlay,check=>produce(check)):await produce();
}
/** Новая active pointer не публикуется по snapshot, истёкшему после producer. */
export async function assertProducedCommonPathBinding(p:NativeRunPointer){
 const ref=p.commonPathBinding;if(!ref||ref.file!=='common-files-path-binding.json')fail('Нет produced witness');
 const bytes=await regular(p.directory,ref.file);if(!bytes||await digest(bytes)!==ref.sha256||await digest(bytes,'SHA-1')!==ref.sha1)fail('Produced witness изменён перед pointer');
 const w=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as CommonPathWitness;
 if(w.projectRoot!==p.projectRoot||w.runDirectory!==p.directory||w.outputDirectory!==p.outputDirectory||w.renderAll!==p.renderAll||stable(w.profiles)!==stable(p.profiles))fail('Чужой produced run');
 const originals=await validateOriginalInspections(w);if(p.schema==='course-native-run-pointer-v3')await admitOverlayNativeOutputs(p,await readOverlayContext(p),originals.lexical);await currentInputs(p.projectRoot,w,p);await assertOwnedProfileCurrent(p,w);await assertSelectedCommonPaths(p,w);return w;
}
async function validateOriginalInspections(w:CommonPathWitness){
 return await withInspectionSnapshot(w.runDirectory,inspectionRefs(w),w,phase=>validateOriginalInspectionsInPhase(w,phase));
}
async function validateOriginalInspectionsInPhase(w:CommonPathWitness,phase:InspectionSnapshot){
 const original=await originalInspectionsInPhase(w,phase);
 if(stable(section(original.owner.config?.['project-materialization']))!==stable(w.canonicalOwnerDeclarations)||nestedDeclaration(original.owner.config))fail('Original canonical owner mismatch');
 const owned=await readOwnedProfileEvidenceInPhase(w,phase);
 if(owned&&(original.owner.config.course?.id!==owned.value.course.id||original.owner.config.course?.view!=='full'||original.owner.config['course-export-context']!==true))fail('Original owned profile/owner context mismatch');
 if(stable(nativeExtensionRoots(w.projectRoot,original.owner.extensions??[]))!==stable(w.nativeExtensionMetadata.roots))fail('Original native extension roots mismatch');
 for(const row of w.documents){
  const doc=original.lexical[row.source],info=sourceMetadata(doc,resolve(w.projectRoot,row.source));
  const format=Object.entries(doc.formats).find(([f])=>(['pdf','beamer'].includes(f)?'latex':f)===row.format)?.[1] as any;
  if(nestedDeclaration(info.metadata)||stable(section(info.metadata['project-materialization']))!==stable(row.rawDeclarations)||(!owned&&(!format||nestedDeclaration(format.metadata)||stable(format.metadata?.['project-materialization']??null)!==stable(row.effectiveDeclarations))))fail('Original raw/effective declaration mismatch');
 }
 if(w.ownedConfigOverlay)await overlayOriginalsInPhase(w,phase,original.owner,original.lexical);
 return original;
}
// Snapshot только внутри вызова: точный invoked tool/cwd/env, без persisted cache.
export async function invocationIdentity(root:string,content=true){
 const requested=quartoExecutable(),environment=stable(Deno.env.toObject());let path:string|undefined;
 if(requested.includes('/')||requested.includes('\\'))path=resolve(root,requested);
 else for(const dir of (Deno.env.get('PATH')||'').split(Deno.build.os==='windows'?';':':')){const candidate=resolve(root,dir||'.',requested);try{if((await Deno.stat(candidate)).isFile){path=candidate;break}}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}}
 if(!path)fail('Не разрешён stock executable');
 const lexical=await Deno.lstat(path!),physical=await Deno.realPath(path!),info=await Deno.lstat(physical);
 if(!info.isFile||info.isSymlink)fail('Stock executable не regular');
 return stable({requested,path,physical,link:lexical.isSymlink?await Deno.readLink(path!):null,identity:{dev:info.dev,ino:info.ino,mode:info.mode,size:info.size,mtime:info.mtime?.getTime(),ctime:info.ctime?.getTime()},...(content?{hash:await digest(await Deno.readFile(physical))}:{}),environment:await digest(new TextEncoder().encode(environment)),cwd:Deno.cwd(),profiles:Deno.env.get('QUARTO_PROFILE')});
}
type BindingUse<T>=(w:CommonPathWitness,check:()=>Promise<void>,owner:()=>any)=>Promise<T>;
const bindingPhases=new WeakMap<object,InspectionSnapshot>();
export async function readCommonPathBinding(p:NativeRunPointer):Promise<CommonPathWitness>{
 return await withCommonPathBinding(p,async w=>w);
}
/** Одна закрытая A/use/B операция; callback не получает сериализуемого доказательства. */
export async function withCommonPathBinding<T>(p:NativeRunPointer,use:BindingUse<T>,publish?:()=>Promise<void>,beforePublish?:()=>Promise<void>):Promise<T>{
 return await readCommonPathBindingUsing(p,use,publish,beforePublish);
}
async function readCommonPathBindingUsing<T>(p:NativeRunPointer,use:BindingUse<T>,publish:(()=>Promise<void>)|undefined,beforePublish?:()=>Promise<void>):Promise<T>{
 const ref=p.commonPathBinding;if(!ref||Object.keys(ref).sort().join(',')!=='file,sha1,sha256'||ref.file!=='common-files-path-binding.json')fail('Отсутствует private witness ref');
 const bytes=await regular(p.directory,ref.file);if(!bytes||await digest(bytes)!==ref.sha256||await digest(bytes,'SHA-1')!==ref.sha1)fail('Witness bytes/hash изменены');
 const w=JSON.parse(new TextDecoder().decode(bytes)) as CommonPathWitness;
 if(p.schema==='course-native-run-pointer-v3')overlayVersions(p.schema,w.schema,p.ownedConfigOverlay,w.ownedConfigOverlay,p.overlayState,p.ownedConfigRestoration);
 else if(w.schema!=='course-common-files-path-binding-v1'||w.ownedConfigOverlay!==undefined||w.sourceInspectionRefs!==undefined)fail('Legacy witness version/fields mismatch');
 if(w.projectRoot!==p.projectRoot||w.runDirectory!==p.directory||w.outputDirectory!==p.outputDirectory||w.renderAll!==p.renderAll||stable(w.profiles)!==stable(p.profiles))fail('Witness принадлежит другому native run');
 if(p.commonPathRetirement){const r=p.commonPathRetirement;if(!w.temporaryExportProfile||stable(r)!==stable(w.temporaryExportProfile))fail('Чужое retirement record')}

 const required=['schema','projectRoot','runDirectory','profiles','outputDirectory','renderAll','quartoVersion','ownerInspectionHash','documentInspectionHashes','configurationInputs','inputFiles','sourceHashes','commonSourceHashes','canonicalOwnerDeclarations','documents','nativeExtensionMetadata','metadataClosure','sourceIdentities'];
 if(required.some(k=>!Object.hasOwn(w,k))||Object.keys(w).some(k=>![...required,'temporaryExportProfile','forcedWriter',...(p.schema==='course-native-run-pointer-v3'?['ownedConfigOverlay','sourceInspectionRefs']:[])].includes(k))||typeof w.quartoVersion!=='string'||!Array.isArray(w.inputFiles)||!Array.isArray(w.documents)||!w.configurationInputs||!w.sourceHashes||!w.commonSourceHashes||!w.documentInspectionHashes)fail('Некорректная closed witness schema');
 const em=w.nativeExtensionMetadata;if(!em||Object.keys(em).sort().join(',')!=='files,roots'||!Array.isArray(em.roots)||!em.roots.includes(join(p.projectRoot,'_extensions'))||em.roots.some(r=>typeof r!=='string'||basename(r)!=='_extensions')||!em.files||Object.entries(em.files).some(([path,hash])=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||!em.roots.some(root=>{const rel=relative(root,path).replaceAll('\\','/');return !!rel&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('/')&&!/^[A-Za-z]:/.test(rel)})||!['_extension.yml','_extension.yaml'].includes(basename(path))))fail('Неполный native extension metadata inventory');
 const initial=(p.initialInputFiles??[]).map(x=>relative(p.projectRoot,resolve(p.projectRoot,x)).replaceAll('\\','/'));
 if(initial.length&&stable(initial)!==stable(w.inputFiles))fail('Witness input scope изменён');
 for(const name of w.inputFiles){local(name);if(!Object.hasOwn(w.sourceHashes,name)||!w.documents.some(d=>d.source===name)||!Object.hasOwn(w.documentInspectionHashes,name))fail('Неполный source proof')}
 const configNames=['_quarto.yml','_quarto.yaml',...p.profiles.flatMap(x=>['_quarto-'+x+'.yml','_quarto-'+x+'.yaml'])];
 for(const source of w.inputFiles){let dir=dirname(source);while(true){for(const name of ['_metadata.yml','_metadata.yaml',...(dir==='.'?[]:['_quarto.yml','_quarto.yaml'])])configNames.push(dir==='.'?name:dir+'/'+name);if(dir==='.')break;dir=dirname(dir)}}
 return await withNativeRawPhase(p.projectRoot,rawPhase=>withInspectionSnapshot(p.directory,inspectionRefs(w),w,async phase=>{
 const operation=async(overlayCheck?:()=>Promise<unknown>)=>{
 bindingPhases.set(w,phase);try{
 const originals=await validateOriginalInspectionsInPhase(w,phase);
 const pointerPath=join(p.projectRoot,'_generated/course-spec/active-native-run.json'),pointerBytes=await Deno.readTextFile(pointerPath),pointerValue=stable(p);
 if(stable(JSON.parse(pointerBytes))!==pointerValue)fail('Current pointer не совпадает с requested run');
 let liveOwner:any;
 const invocation=await invocationIdentity(p.projectRoot),localInvocation=await invocationIdentity(p.projectRoot,false),retirement=await completedExportRetirement(p,w,phase),check=async()=>{
  if(bindingPhases.get(w)!==phase)fail('Foreign/expired common binding phase');inspectionSnapshotData(phase,p.directory,inspectionRefs(w),w);if(stable(p)!==pointerValue||await Deno.readTextFile(pointerPath)!==pointerBytes)fail('Current pointer/run изменён во время проверки');
  if(await invocationIdentity(p.projectRoot,false)!==localInvocation)fail('Stock tool/environment/cwd/profile изменён во время проверки');
 };
 const boundary=async()=>{
  await check();const current=await regular(p.directory,ref.file);if(!current||await digest(current)!==ref.sha256||await digest(current,'SHA-1')!==ref.sha1)fail('Witness изменён во время проверки');
  if(await invocationIdentity(p.projectRoot)!==invocation)fail('Stock tool/environment/cwd/profile изменён во время проверки');
  if(p.schema==='course-native-run-pointer-v3')await assertOverlayBoundary(p);else await overlayCheck?.();await assertOwnedProfileCurrentInPhase(p,w,phase,retirement);await currentInputs(p.projectRoot,w,p);
 };await check();await currentInputs(p.projectRoot,w,p);
 const active=w.profiles.filter(x=>!p.commonPathRetirement||'_quarto-'+x+'.yml'!==p.commonPathRetirement.file);
 const side=async()=>{
  await currentInputs(p.projectRoot,w,p);await check();
  const result=p.overlayState==='restored'?await validateRestoredOverlayNative(p,w,originals,await readOverlayContext(p),phase,check,rawPhase):await withFreshOwnerFrame(p.projectRoot,active,check,async frame=>{
  const native=freshOwnerData(frame,p.projectRoot,active);liveOwner=native;if(native.quarto?.version!==w.quartoVersion)fail('Quarto source identity изменена');
  const retiredContext=retirement?await prepareRetiredRegularContext(p,w,originals,retirement,check,frame,phase):undefined;
  const sources=await inspectCurrentSources(p.projectRoot,w.inputFiles,active,w.sourceIdentities,frame,retirement,{originals,retiredContext,before:check});
  for(const name of w.inputFiles)if(sources.sourceHashes[name]!==w.sourceHashes[name])fail('Source bytes устарели: '+name);
  const closure=await validateMetadataClosure(p.projectRoot,w.profiles,w.documents,Object.keys(em.files),em.roots,w.metadataClosure,section,w.sourceIdentities,sources,frame,retirement,{check,retiredContext,rawPhase,owner:owner=>{if(stable(section(owner.config?.['project-materialization']))!==stable(w.canonicalOwnerDeclarations))fail('Live canonical owner изменён')}});
  await check();return {sources,closure};
  });
  // Свежие bytes/roles и полная source/absence closure до выхода из A/B.
  await currentInputs(p.projectRoot,w,p);await boundary();return result;
 };
 const {sources,closure}=await side();
 const expectedConfig=closureInputs(p.projectRoot,closure);
 if(stable(expectedConfig)!==stable(w.configurationInputs)||configNames.some(n=>!Object.hasOwn(expectedConfig,n)))fail('Неполный config/absence closure');
 if(closure.noCommon&&(w.canonicalOwnerDeclarations!==null||w.documents.some(d=>d.rawDeclarations!==null||d.canonicalDeclarations!==null||d.effectiveDeclarations!==null)||Object.keys(w.commonSourceHashes).length))fail('No-common proof содержит materialization');
 for(const [name,h] of Object.entries({...w.configurationInputs,...w.sourceHashes,...w.commonSourceHashes})){local(name);if(h!==false&&!/^[a-f0-9]{64}$/.test(h))fail('Некорректный source hash')}
 const owner=section(w.canonicalOwnerDeclarations),commonNames=new Set<string>(),seenDocs=new Set();
 for(const row of w.documents){
  if(Object.keys(row).sort().join(',')!=='canonicalDeclarations,effectiveDeclarations,format,rawDeclarations,source'||!w.inputFiles.includes(row.source)||typeof row.format!=='string'||seenDocs.has(row.source+'\0'+row.format))fail('Некорректный source/format witness');seenDocs.add(row.source+'\0'+row.format);
  const raw=section(row.rawDeclarations);for(const id of Object.keys(raw?.projects??{}))if(owner?.projects[id])fail('Неоднозначный raw origin');
  const expected=owner||raw?{projects:{...owner?.projects,...raw?.projects}}:null;
  if(stable(row.canonicalDeclarations)!==stable(expected))fail('Canonical witness не выводится из raw declarations');
  const effective=expected?structuredClone(expected):null;
  if(effective&&owner)for(const id of Object.keys(owner.projects))for(const file of effective.projects[id]['common-files'])file.source=ownerEffectiveSource(p.projectRoot,row.source,file.source);
  if(stable(effective)!==stable(row.effectiveDeclarations))fail('Effective witness не соответствует raw source binding');
  for(const entry of Object.values(expected?.projects??{}))for(const file of entry['common-files'])commonNames.add(file.source);

 }
 if(commonNames.size!==Object.keys(w.commonSourceHashes).length||[...commonNames].some(n=>!Object.hasOwn(w.commonSourceHashes,n)))fail('Неполный canonical common source inventory');
 if(w.temporaryExportProfile){const t=w.temporaryExportProfile;if(Object.keys(t).sort().join(',')!=='file,profile,sha1,sha256'||!/^course-export-[0-9a-f-]{36}$/.test(t.profile)||t.profile!==p.profiles[0]||t.file!=='_quarto-'+t.profile+'.yml'||t.sha256!==w.configurationInputs[t.file]||!/^[a-f0-9]{40}$/.test(t.sha1))fail('Некорректный generated profile identity')}
 await check();const result=await use(w,check,()=>liveOwner);await boundary();
 const final=await side();if(stable(final.sources.sourceHashes)!==stable(sources.sourceHashes)||stable(final.sources.identities)!==stable(sources.identities))fail('Source drift во время currentness');
 if(stable(final.closure)!==stable(w.metadataClosure))fail('Metadata closure drift после final owner inspect');
 await currentInputs(p.projectRoot,w,p);await validateOriginalInspectionsInPhase(w,phase);await check();if(retirement)await validateCompletedExportScope(p,w,phase,true);
 // Полный immutable original union перечитывается после B, не на каждом nested guard.
 await checkInspectionStore(p.directory,inspectionRefs(w));await assertSelectedCommonPaths(p,w,retirement);await beforePublish?.();await boundary();await assertNativeRawBoundary(rawPhase,p.projectRoot);await publish?.();await check();return result;
 }finally{bindingPhases.delete(w)}
 };return p.schema==='course-native-run-pointer-v3'?await withOverlayCurrentCheck(p,undefined,operation,{w,phase}):await operation();
 }));
}
export function commonBindingPhase(w:CommonPathWitness){return bindingPhases.get(w)}
export async function validateCapturedCommon(run:NativeRun,w:CommonPathWitness){
 const phase=bindingPhases.get(w),owned=phase?await readOwnedProfileEvidenceInPhase(w,phase):await readOwnedProfileEvidence(w);
 if(owned){
  const equalSet=(a:string[],b:string[])=>Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&new Set(b).size===b.length&&stable([...a].sort())===stable([...b].sort());
  if(!w.inputFiles.length||run.projectRoot!==w.projectRoot||run.outputDirectory!==w.outputDirectory||run.renderAll!==w.renderAll||stable(run.profiles)!==stable(w.profiles)||!equalSet(run.inputFiles,w.inputFiles.map(s=>resolve(w.projectRoot,s)))||!equalSet(run.documents.map(d=>d.source),w.inputFiles))fail('Неполный actual owned JSON source scope');
  const outputs:string[]=[];
  for(const d of run.documents){
   if(d.scope!=='document'||d.document.source!==d.source||d.document.format!=='json'||d.document.exportContext!==true||stable(d.document.profiles)!==stable(w.profiles)||d.course.view!=='full'||d.course.id!==owned.value.course.id)fail('Нет actual owned JSON writer event');
   const file=resolve(w.outputDirectory,d.document.output),rel=relative(w.outputDirectory,file);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||!await metadataBytes(file))fail('Нет actual owned JSON output');outputs.push(file);
  }
  if(!equalSet(outputs,run.outputFiles))fail('Owned JSON output inventory изменён');
 }

 for(const d of run.documents){
  const proof=w.documents.filter(x=>x.source===d.source&&x.format===d.document.format);if(proof.length!==1)fail('Неверный source/format capture');
  const expected=canonicalFact(proof[0].canonicalDeclarations);
  if(stable(d.projectMaterializations??null)!==stable(expected??null))fail('Captured section не совпадает с canonical witness');
  for(const fact of d.projects??[])if(stable(fact.materialization??null)!==stable(expected?.[fact.exerciseId]??null))fail('Captured project/common mismatch');
 }
}
