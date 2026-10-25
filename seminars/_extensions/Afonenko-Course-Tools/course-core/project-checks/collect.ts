import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-core");
import { expandGlob } from "stdlib/fs";
import { join, relative, resolve } from "stdlib/path";
import { collectNativeModel } from "../body-export/collect.ts";
import type { ProjectFact, ApiPrecheck } from "../domain/model.ts";
import { diagnostic } from "../domain/diagnostics.ts";
export interface SourceSelection {projectRelativePath:string;submissionRelativePath:string;sha256:string}
export interface CheckProject extends ProjectFact {
  qualifiedId:string; sources:SourceSelection[]; trustedTests:SourceSelection[];
  verificationTests:SourceSelection[];
  apiPrecheck?:ApiPrecheck; verificationApiPrecheck?:ApiPrecheck;
  references:{name:string;root:string;optional:boolean;sources:SourceSelection[];available:boolean}[];
  contractCasesHash?:{projectRelativePath:string;sha256:string}; contractFixtures:SourceSelection[];readiness:{ready:boolean;missing:string[]};
}
export interface ChecksManifest {schemaVersion:1;courseId:string;bookRoot:string;sourceSnapshotHash:string;inventoryHash:string;projects:CheckProject[]}
export async function sha256(bytes:Uint8Array|string) {
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",(typeof bytes==="string"?new TextEncoder().encode(bytes):new Uint8Array(bytes)).buffer))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function canonical(value:unknown):string {
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value && typeof value==="object")return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}";
 return JSON.stringify(value);
}
const safe=(p:string)=>p!=="" && !/^(?:[\/\\]|[A-Za-z]:)/.test(p) && !p.split(/[\/\\]/).includes("..");
async function guarded(root:string,path:string) {
 if(!safe(path))throw diagnostic("CHECKS.PATH_INVALID","Недопустимый относительный путь",{source:path});
 const lexical=resolve(root,path), rel=relative(root,lexical);
 if(!safe(rel))throw diagnostic("CHECKS.PATH_INVALID","Путь за пределами project",{source:path});
 let current=root;
 for(const segment of rel.split(/[\/\\]/)){
  current=join(current,segment);
  if((await Deno.lstat(current)).isSymlink)throw diagnostic("CHECKS.SYMLINK_FORBIDDEN","Symlink запрещён",{source:path});
 }
 return lexical;
}
export async function selectSources(root:string,sourceRoot:string,patterns:string[]):Promise<SourceSelection[]> {
 if(!safe(sourceRoot)||patterns.some(p=>!safe(p)))throw diagnostic("CHECKS.PATH_INVALID","Unsafe source root/include",{source:root});
 await guarded(root,sourceRoot);
 const selected=new Map<string,SourceSelection>();
 for(const pattern of patterns)for await(const entry of expandGlob(pattern,{root:resolve(root,sourceRoot),includeDirs:false,followSymlinks:false})){
  const path=relative(root,entry.path).replaceAll("\\","/");
  const submissionRelativePath=relative(resolve(root,sourceRoot),entry.path).replaceAll("\\","/");
  const actual=await guarded(root,path);
  if(selected.has(submissionRelativePath))continue;
  selected.set(submissionRelativePath,{projectRelativePath:path,submissionRelativePath,sha256:await sha256(await Deno.readFile(actual))});
 }
 return [...selected.values()].sort((a,b)=>a.submissionRelativePath.localeCompare(b.submissionRelativePath));
}
/** Explicit opted-in inventory; generation executes native Quarto, never Java. */
export async function collectProjectChecks(root:string,options:{book:string;profiles?:string[]},current?:Awaited<ReturnType<typeof collectNativeModel>>):Promise<ChecksManifest>{
 const collected=current??await collectNativeModel(root,options);
 if(relative(root,collected.projectRoot).replaceAll("\\","/")!==options.book && resolve(root,options.book)!==collected.projectRoot)throw diagnostic("CHECKS.OWNER_MISMATCH","Текущий collected owner не совпадает с выбранным проектом");
 const projects:CheckProject[]=[];
 for(const fact of collected.result.model.projects??[]){
  if(!fact.check)continue;
  const check=fact.check;
  const javaRuntime=check.runtime==='java25-junit-v1'||check.runtime==='java25-gradle-junit-v1';
  const build=check['java-build'];
  if(check.runtime==='java25-gradle-junit-v1'&&build===undefined)throw diagnostic('CHECKS.JAVA_BUILD_INVALID','Native Gradle runtime требует java-build');
  if(build!==undefined&&(!build||typeof build!=='object'||Array.isArray(build)||Object.keys(build).length!==3||Object.keys(build).some(k=>!['kind','main-class','artifact'].includes(k))||check.runtime!=='java25-gradle-junit-v1'||check.sourceProfile.mode!=='implementation'||build.kind!=='gradle-jar-v1'||typeof build['main-class']!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(build['main-class'])||typeof build.artifact!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.jar$/.test(build.artifact)))throw diagnostic('CHECKS.JAVA_BUILD_INVALID','Требуется закрытая Gradle implementation policy');
  const missing:string[]=[];
  let project=resolve(collected.projectRoot,fact.projectRoot);
  try{project=await guarded(collected.projectRoot,fact.projectRoot)}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e;missing.push("projectRoot");}
  const select=async (path:string,patterns:string[])=>{try{return await selectSources(project,path,patterns)}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e;return [];}};
  const sources=await select(check.sourceProfile.root,check.sourceProfile.include);
  if(!sources.length)missing.push("sources");
  const trustedTests=(await select("tests",check.tests.map(p=>p.startsWith("tests/")?p.slice(6):p))).map(s=>({...s,submissionRelativePath:s.submissionRelativePath.replace(/^junit\//,"")}));
  if(!trustedTests.length)missing.push("trustedTests");
  const verificationTests=await select("student",((check["verification-tests"]??[]) as string[]).map(p=>p.startsWith("student/")?p.slice(8):p));
  const apiSubset=async (value:ApiPrecheck|undefined,partition:string,available:SourceSelection[],stripJunit=false):Promise<ApiPrecheck|undefined>=>{
   if(!value)return undefined;
   if(!javaRuntime||check.sourceProfile.mode!=="implementation"||!value.files.length||!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value.entry))throw diagnostic("CHECKS.API_INVALID","API precheck требует Java implementation, files и entry");
   const selected=(await select(partition,value.files.map(p=>p.startsWith(partition+"/")?p.slice(partition.length+1):p))).map(s=>({...s,submissionRelativePath:stripJunit?s.submissionRelativePath.replace(/^junit\//,""):s.submissionRelativePath}));
   if(!selected.length){missing.push(partition+"ApiPrecheck");return {entry:value.entry,files:[]};}
   if(selected.length>=available.length||selected.some(s=>!s.submissionRelativePath.endsWith('.java')||!available.some(a=>a.projectRelativePath===s.projectRelativePath&&a.submissionRelativePath===s.submissionRelativePath)))throw diagnostic("CHECKS.API_SUBSET_INVALID","API precheck должен быть собственным подмножеством выбранных доверенных Java sources");
   return {files:selected.map(s=>s.submissionRelativePath),entry:value.entry};
  };
  const apiPrecheck=await apiSubset(check['api-precheck'],"tests",trustedTests,true);
  const verificationApiPrecheck=await apiSubset(check['verification-api-precheck'],"student",verificationTests);
  if(apiPrecheck&&verificationTests.length&&!verificationApiPrecheck)throw diagnostic("CHECKS.API_PUBLIC_MISSING","Публичная проверка fixed API требует собственной явной API precheck");
  const extras=check['additional-java-sources'];
  if(extras){
   const reserved=[...sources,...trustedTests,...verificationTests].map(x=>x.submissionRelativePath).concat(['grading-job.json','tests/grading-job.json']);
   if(reserved.some(name=>name===extras.archive||name.startsWith(extras.archive+'/')||extras.archive.startsWith(name+'/')))throw diagnostic('CHECKS.ADDITIONAL_JAVA_COLLISION','Имя ZIP конфликтует с основным/доверенным путём');
  }
  const references=[];
  for(const ref of check.references??[]){
   let available=true,files:SourceSelection[]=[];
   files=await select(ref.root,check.sourceProfile.include);available=files.length>0;
   if(!available&&!ref.optional)missing.push("reference:"+ref.name);
   const allowed=new Set(sources.map(s=>s.submissionRelativePath));
   if(sources.length&&!check['additional-java-sources']&&files.some(file=>!allowed.has(file.submissionRelativePath)))throw diagnostic("CHECKS.REFERENCE_MAPPING_INVALID","Reference не соответствует именам выбранных sources",{source:fact.source,id:fact.exerciseId});
   references.push({...ref,sources:files,available});
  }
  let contractCasesHash:CheckProject['contractCasesHash'];const contractFixtures:SourceSelection[]=[];
  if(check['contract-cases']){
   const path=String(check['contract-cases']);
   try{
    const file=await guarded(project,path),bytes=await Deno.readFile(file);
    contractCasesHash={projectRelativePath:path,sha256:await sha256(bytes)};
    const cases=JSON.parse(new TextDecoder().decode(bytes));
    for(const item of cases.cases??[])for(const source of item.sources??[]){
     if(!safe(source.fixture)||!source.fixture.startsWith('tests/fixtures/')||!safe(source.submission))throw diagnostic('CHECKS.CONTRACT_PATH_INVALID','Unsafe fixture/submission');
     try{const actual=await guarded(project,source.fixture);contractFixtures.push({projectRelativePath:source.fixture,submissionRelativePath:source.submission,sha256:await sha256(await Deno.readFile(actual))});}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e;missing.push('contractFixture:'+source.fixture);}
    }
   }catch(e){if(!(e instanceof Deno.errors.NotFound))throw e;missing.push('contract-cases');}
  }
  if(((check['verification-tests']??[]) as string[]).length&&!verificationTests.length)missing.push('verificationTests');
  projects.push({...fact,qualifiedId:collected.courseId+"/"+fact.exerciseId,sources,trustedTests,verificationTests,references,contractFixtures,readiness:{ready:missing.length===0,missing},...(apiPrecheck?{apiPrecheck}:{}),...(verificationApiPrecheck?{verificationApiPrecheck}:{}),...(contractCasesHash?{contractCasesHash}:{})});
 }
 projects.sort((a,b)=>a.qualifiedId.localeCompare(b.qualifiedId));
 const sources=[];
 for(const doc of collected.result.documents)sources.push({source:doc.source,sha256:await sha256(await Deno.readFile(join(collected.projectRoot,doc.source)))});
 sources.sort((a,b)=>a.source.localeCompare(b.source));
 const sourceSnapshotHash=await sha256(canonical({sources,projects}));
 return {schemaVersion:1,courseId:collected.courseId,bookRoot:relative(root,collected.projectRoot).replaceAll("\\","/")||".",sourceSnapshotHash,inventoryHash:await sha256(canonical(projects)),projects};
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
sha256=__metrics.wrapAsync({id:"course-core.project-checks.collect.sha256",kind:"phase"},sha256);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
canonical=__metrics.wrapSync({id:"course-core.project-checks.collect.canonical",kind:"phase"},canonical);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
selectSources=__metrics.wrapAsync({id:"course-core.project-checks.collect.selectSources",kind:"phase"},selectSources);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
collectProjectChecks=__metrics.wrapAsync({id:"course-core.project-checks.collect.collectProjectChecks",kind:"phase"},collectProjectChecks);
