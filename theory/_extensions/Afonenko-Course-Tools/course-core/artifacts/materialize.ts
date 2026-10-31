import {sourceFile} from '../infrastructure/source-identities.ts';
import {dirname, isAbsolute, join, relative, resolve} from 'stdlib/path';
import {assertCommonPathRun,withNativeRunProof,publishNativeMaterialization,type NativeRun} from '../infrastructure/native-run.ts';
import {diagnostic} from '../domain/diagnostics.ts';
import {bindProjectMaterializations,bindArtifactProjectMaterializations} from '../domain/project-materialization.ts';

export interface MaterializeOptions {
 nativeRun:NativeRun;
 sourceRoot:string;
 outputRoot:string;
 exerciseIds:string[];
 audience:'student'|'grading';
 teacherRoot?:string;
 checkOnly?:boolean;
}
export interface MaterializedFile {
 source:string;
 target:string;
 sha256:string;
 origin:'public'|'teacher'|'common';
}
export interface MaterializationManifest {
 schema:'course-project-materialization-v1';
 sourceRoot:string;
 sourceCommit?:string;
 audience:'student'|'grading';
 exerciseIds:string[];
 files:MaterializedFile[];
 projects:{exerciseId:string;projectRoot:string}[];
 replacementRoots:string[];
 commonSources:Record<string,string>;
 sourceDocuments:Record<string,string>;
 declarationsHash:string;
}
const fail=(text:string):never=>{throw diagnostic('ARTIFACT.MATERIALIZATION_INVALID',text)};
const inside=(parent:string,path:string)=>{
 const r=relative(parent,path);
 return !r || !isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\');
};
const overlaps=(a:string,b:string)=>inside(a,b)||inside(b,a);
const generated=new Set(['.git','.gradle','.mvn','.quarto','_generated','node_modules','build','target','out','__pycache__']);
const privateNames=new Set(['private','reference','solution','solutions','grading-notes','rubric.md','contract.md']);
const publicExcluded=(name:string)=>/\.(?:qmd|rmd|ipynb|class|jar)$/i.test(name)||/^(?:_quarto(?:[-.].*)?|_metadata\.ya?ml)$/i.test(name)||name==='check.sh'||name.startsWith('.')&&name!=='.gitignore';
async function hash(bytes:Uint8Array){
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
async function absent(path:string){
 try{await Deno.lstat(path);return false}catch(error){if(error instanceof Deno.errors.NotFound)return true;throw error}
}
async function real(path:string){
 if(await Deno.realPath(path)!==path)fail('Символическая ссылка в пути: '+path);
 return path;
}
async function safeParent(path:string){
 let parent=path;
 while(await absent(parent)){
  const next=dirname(parent);if(next===parent)fail('Не найден родитель выходного пути');parent=next;
 }
 await real(parent);
 if(!(await Deno.lstat(parent)).isDirectory)fail('Родитель выходного пути не является каталогом');
}
function local(path:string){
 if(typeof path!=='string'||!path||/[\\\0*?\[\]{}:]/.test(path)||isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))fail('Недопустимый относительный путь: '+path);
 return path;
}

type PlanOptions=Omit<MaterializeOptions,'outputRoot'|'checkOnly'>;
async function sourceHead(root:string){
 try{
  const result=await new Deno.Command('git',{args:['rev-parse','--verify','HEAD'],cwd:root,stdout:'piped',stderr:'null'}).output();
  const value=new TextDecoder().decode(result.stdout).trim();
  return result.success&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)?value:undefined;
 }catch(error){if(error instanceof Deno.errors.NotFound)return undefined;throw error}
}
/** One private planner owns file selection and all file guards for both entries. */
async function planProjects(options:PlanOptions,fullOwner:boolean){
 const {nativeRun,audience}=options;
 const source=resolve(options.sourceRoot);
 if(nativeRun?.schema!=='course-native-run-v1'||nativeRun.projectRoot!==source||fullOwner&&!nativeRun.renderAll||!Array.isArray(nativeRun.documents)||!nativeRun.documents.length)fail('Требуется полный NativeRun данного публичного owner');
 const sourceWitness=await assertCommonPathRun(nativeRun);
 if(!['student','grading'].includes(audience))fail('Неизвестная аудитория сборки');
 if(audience==='student'&&options.teacherRoot!==undefined||audience==='grading'&&!options.teacherRoot)fail('teacherRoot обязателен только для grading и запрещён для student');
 if(!Array.isArray(options.exerciseIds)||!options.exerciseIds.length||new Set(options.exerciseIds).size!==options.exerciseIds.length)fail('Требуется непустой список различных задач');
 const teacher=options.teacherRoot===undefined?undefined:resolve(options.teacherRoot);
 await real(source);
 if(teacher&&overlaps(source,teacher))fail('Пути source и teacher пересекаются');
 if(teacher)await real(teacher);
 const sourceCommit=fullOwner?await sourceHead(source):undefined;
 const facts=fullOwner?bindProjectMaterializations(nativeRun.documents):bindArtifactProjectMaterializations(nativeRun);
 const chosen=options.exerciseIds.map(id=>{
  const matches=facts.filter(f=>f.exerciseId===id);
  if(matches.length!==1)fail('Задача должна разрешаться ровно в один проект: '+id);
  if(matches[0].statementVisibility!=='open'&&audience==='student')fail('Закрытая задача недоступна в student');
  local(matches[0].projectRoot);
  return matches[0];
 });
 if(new Set(chosen.map(f=>f.projectRoot)).size!==chosen.length)fail('Разные задачи не могут записывать один project root');
 for(const a of chosen)for(const b of chosen)if(a!==b&&overlaps(resolve(source,a.projectRoot),resolve(source,b.projectRoot)))fail('Project roots пересекаются');
 const planned=new Map<string,{file:MaterializedFile;bytes:Uint8Array}>();
 const commonSources:Record<string,string>={},sourceDocuments:Record<string,string>={};
 const add=async(path:string,target:string,origin:MaterializedFile['origin'])=>{
  local(target);await real(path);
  const info=await Deno.lstat(path);if(!info.isFile)fail('Ожидался обычный файл: '+path);
  if(planned.has(target))fail('Повторная запись целевого файла: '+target);
  const bytes=await Deno.readFile(path);
  planned.set(target,{file:{source:path,target,origin,sha256:await hash(bytes)},bytes});
 };
 const tree=async(base:string,prefix:string,origin:'public'|'teacher',includeGit=false)=>{
  await real(base);
  if(!(await Deno.lstat(base)).isDirectory)fail('Ожидался каталог: '+base);
  const walk=async(path:string,target:string)=>{
   for await(const entry of Deno.readDir(path)){
    const inGit=target.split('/').includes('.git');
    if(entry.isSymlink)fail('Символическая ссылка запрещена: '+join(path,entry.name));
    if(entry.name==='.git'&&includeGit){
     if(!entry.isDirectory)fail('Учебная .git должна быть самостоятельным каталогом');
    }else if(!inGit&&generated.has(entry.name))continue;
    if(inGit&&['commondir','alternates'].includes(entry.name))fail('Учебная история с внешними Git objects запрещена');
    if(!inGit&&origin==='public'&&privateNames.has(entry.name))fail('Закрытый файл в публичном student tree: '+entry.name);
    if(!inGit&&origin==='public'&&!(entry.name==='.git'&&includeGit)&&publicExcluded(entry.name))continue;
    const next=join(path,entry.name),dest=target+'/'+entry.name;
    if(entry.isDirectory)await walk(next,dest);
    else if(entry.isFile){
     if(/\.(?:class|pyc)$/.test(entry.name))continue;
     await add(next,dest,origin);
    }else fail('Специальный файл запрещён: '+next);
   }
  };
  await walk(base,prefix);
 };
 for(const fact of chosen){
  local(fact.source);const admitted=sourceWitness.sourceIdentities.sources.find(x=>x.source===fact.source);if(!admitted)fail('Нет admitted project source');
  const sourceDocument=await sourceFile(source,fact.source);if(sourceDocument.physicalPath!==admitted!.physicalPath||sourceDocument.linkTarget!==admitted!.linkTarget||await hash(sourceDocument.bytes)!==sourceWitness.sourceHashes[fact.source])fail('Project source identity изменилась');
  sourceDocuments[fact.source]=await hash(sourceDocument.bytes);
  const project=join(source,fact.projectRoot);await real(project);
  await tree(join(project,'student'),fact.projectRoot+'/student','public',fact.materialization?.includeGit===true);
  const materialization=fact.materialization;
  if(materialization){
   if(Object.keys(materialization).some(k=>!['commonFiles','includeGit'].includes(k))||!Array.isArray(materialization.commonFiles)||materialization.includeGit!==undefined&&typeof materialization.includeGit!=='boolean')fail('Некорректная декларация materialization');
   const declaredTargets=new Set<string>();
   for(const item of materialization.commonFiles){
    if(Object.keys(item).sort().join(',')!=='audience,source,target'||!['student','grading'].includes(item.audience))fail('Некорректный common file');
    const sourceName=local(item.source),targetName=local(item.target);
    const target=fact.projectRoot+'/'+targetName;
    if(declaredTargets.has(target)||planned.has(target))fail('Common target имеет двух владельцев: '+target);
    declaredTargets.add(target);
    if(sourceName.split('/').includes('.git'))fail('Common не читает служебную Git базу');
    if(sourceName.split('/').some(part=>privateNames.has(part)||part==='tests'))fail('Common source не может читать закрытый project partition');
    if(publicExcluded(sourceName.split('/').at(-1)!))fail('Common source не может читать source/config/generated файл');
    if(item.audience==='student'&&!targetName.startsWith('student/'))fail('Публичный common должен находиться внутри student');
    if(item.audience==='grading'&&targetName.startsWith('student/'))fail('Grading-only common не может находиться в student');
    if(item.audience==='student'&&targetName.split('/').some(part=>privateNames.has(part)))fail('Закрытый common target в student partition');
    if(item.audience==='student'&&targetName.split('/').some(publicExcluded))fail('Source/config/generated common target в student partition');
    if(!['student','reference','tests'].includes(targetName.split('/')[0])&&!['rubric.md','contract.md'].includes(targetName))fail('Common target находится вне project partitions');
    if(targetName.split('/').some(p=>generated.has(p)))fail('Common target находится в служебном каталоге');
    const path=join(source,sourceName);await real(path);
    if(!(await Deno.lstat(path)).isFile)fail('Common source должен быть обычным файлом');
    commonSources[sourceName]=await hash(await Deno.readFile(path));
    if(item.audience==='student'||audience==='grading')await add(path,fact.projectRoot+'/'+targetName,'common');
   }
  }
  if(teacher){
   const overlay=join(teacher,fact.projectRoot);await real(overlay);
   for await(const entry of Deno.readDir(overlay)){
    if(entry.isSymlink)fail('Символическая ссылка в teacher overlay');
    if(!['reference','tests','rubric.md','contract.md'].includes(entry.name))fail('Teacher overlay пытается изменить публичную область: '+entry.name);
    const path=join(overlay,entry.name),target=fact.projectRoot+'/'+entry.name;
    if(entry.isDirectory&&['reference','tests'].includes(entry.name))await tree(path,target,'teacher');
    else if(entry.isFile&&['rubric.md','contract.md'].includes(entry.name))await add(path,target,'teacher');
    else fail('Некорректный раздел teacher overlay: '+entry.name);
   }
  }
 }
 const files=[...planned.values()].map(p=>p.file).sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:0);
 if(!files.length)fail('Выбранная файловая область пуста');
 const projects=chosen.map(({exerciseId,projectRoot})=>({exerciseId,projectRoot}));
 const replacementRoots=chosen.flatMap(f=>(audience==='student'?['student']:['student','reference','tests','rubric.md','contract.md']).map(part=>f.projectRoot+'/'+part));
 const manifest:MaterializationManifest={schema:'course-project-materialization-v1',sourceRoot:source,...(sourceCommit?{sourceCommit}:{}),audience,exerciseIds:[...options.exerciseIds],projects,replacementRoots,files,commonSources,sourceDocuments,declarationsHash:await hash(new TextEncoder().encode(JSON.stringify(chosen)))};
 if(fullOwner&&await sourceHead(source)!==sourceCommit)fail('Source HEAD изменился во время materialization');
 return {manifest,planned};
}

/** Full owner staging never accepts a selected-document capture. */
export async function materializeProjects(options:MaterializeOptions):Promise<MaterializationManifest>{
 return await withNativeRunProof(options.nativeRun,()=>materializeProjectsUsing(options));
}
async function materializeProjectsUsing(options:MaterializeOptions):Promise<MaterializationManifest>{
 const source=resolve(options.sourceRoot),output=resolve(options.outputRoot),teacher=options.teacherRoot===undefined?undefined:resolve(options.teacherRoot);
 if(overlaps(source,output)||teacher&&overlaps(output,teacher))fail('Пути source, output и teacher пересекаются');
 await safeParent(output);
 if(!options.checkOnly&&!await absent(output))fail('Выходной каталог должен быть новым');
 const {manifest,planned}=await planProjects(options,true),files=manifest.files;
 if(options.checkOnly){
  await real(output);
  const stored=JSON.parse(await Deno.readTextFile(join(output,'materialization.json')));
  if(JSON.stringify(stored)!==JSON.stringify(manifest))fail('Receipt не соответствует текущим источникам и декларациям');
  const expected=new Set(['materialization.json',...files.map(f=>f.target)]);
  const inspect=async(path:string,prefix='')=>{
   for await(const entry of Deno.readDir(path)){
    const name=prefix+entry.name;
    if(entry.isSymlink)fail('Символическая ссылка в output');
    if(entry.isDirectory)await inspect(join(path,entry.name),name+'/');
    else if(!entry.isFile||!expected.has(name))fail('Неучтённый файл в output: '+name);
   }
  };
  await inspect(output);
  for(const file of files){
   const target=join(output,file.target);await real(target);
   if(await hash(await Deno.readFile(target))!==file.sha256)fail('Материализованный файл отсутствует или изменён: '+file.target);
  }
  return manifest;
 }
 // Публикация только после B и полного original union.
 await publishNativeMaterialization(options.nativeRun,async()=>{
 await Deno.mkdir(dirname(output),{recursive:true});
 await Deno.mkdir(output);
 try{
  for(const {file,bytes} of planned.values()){
   const target=join(output,file.target);await Deno.mkdir(dirname(target),{recursive:true});
   await Deno.writeFile(target,bytes,{createNew:true});
  }
  await Deno.writeTextFile(join(output,'materialization.json'),JSON.stringify(manifest,null,2)+'\n',{createNew:true});
 }catch(error){await Deno.remove(output,{recursive:true});throw error}
 });
 return manifest;
}

/** Only the current open student partition; no staging capability or receipt. */
export async function materializeStarterArtifact(run:NativeRun,request:{source:string;exerciseId:string}):Promise<{name:string;bytes:Uint8Array}[]>{
 const source=resolve(run.projectRoot),output=resolve(run.outputDirectory);
 if(run.schema!=='course-native-run-v1'||typeof run.renderAll!=='boolean'||run.projectRoot!==source||!Array.isArray(run.profiles)||!Array.isArray(run.documents)||!Array.isArray(run.inputFiles)||!Array.isArray(run.outputFiles))fail('Требуется текущий NativeRun');
 local(request.source);await real(source);await real(output);
 const documents=run.documents.filter(doc=>doc.source===request.source);
 if(documents.length!==1)fail('Требуется ровно один текущий документ');
 const doc=documents[0];
 if(doc.scope!=='document'||!doc.document?.format||doc.document.source!==request.source||JSON.stringify(doc.document.profiles)!==JSON.stringify(run.profiles)||!['student','full'].includes(doc.course.view??''))fail('Document/profile context не соответствует NativeRun');
 const input=resolve(source,request.source),result=resolve(output,local(doc.document.output));
 if(!inside(source,input)||!inside(output,result)||!run.inputFiles.map(p=>resolve(source,p)).includes(input)||!run.outputFiles.map(p=>resolve(output,p)).includes(result))fail('Document input/output отсутствует в текущем capture');
 await real(input);await real(result);
 const facts=bindArtifactProjectMaterializations(run).filter(f=>f.exerciseId===request.exerciseId&&f.source===request.source);
 const exercises=doc.body?.publicExercises?.filter(e=>e.id===request.exerciseId)??[];
 if(facts.length!==1||exercises.length!==1)fail('Student exercise/project отсутствует в текущем source');
 const fact=facts[0];
 if(fact.statementVisibility!=='open'||exercises[0].statementVisibility!=='open'||!['starter','full'].includes(fact.artifactPolicy.student??'')||exercises[0].project.replace(/^\//,'')!==fact.projectRoot)fail('Student project/policy не соответствует публичной проекции');
 const {planned}=await planProjects({nativeRun:run,sourceRoot:source,exerciseIds:[request.exerciseId],audience:'student'},false);
 const prefix=fact.projectRoot+'/student/';
 return [...planned.values()].sort((a,b)=>a.file.target.localeCompare(b.file.target)).map(({file,bytes})=>{
  if(!file.target.startsWith(prefix)||!file.target.slice(prefix.length))fail('Artifact target вне выбранной student partition');
  return {name:file.target.slice(prefix.length),bytes};
 });
}
