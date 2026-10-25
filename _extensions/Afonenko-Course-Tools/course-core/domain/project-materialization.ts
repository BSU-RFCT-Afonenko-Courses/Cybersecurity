import type {Fragment,ProjectFact,ProjectMaterialization} from './model.ts';
import type {NativeRun} from '../infrastructure/native-run.ts';
import {diagnostic} from './diagnostics.ts';
type Captured=Pick<Fragment,'source'|'projects'|'projectMaterializations'>&Partial<Pick<Fragment,'exercises'|'declarations'>>;
const fail=(message:string):never=>{throw diagnostic('CORE.PROJECT_MATERIALIZATION_INVALID',message)};
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
function declaration(value:ProjectMaterialization):ProjectMaterialization{
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['commonFiles','includeGit'].includes(k))||!Array.isArray(value.commonFiles)||value.includeGit!==undefined&&typeof value.includeGit!=='boolean')fail('Некорректная captured materialization');
 const safe=(p:unknown)=>typeof p==='string'&&!!p&&!/^[\/\\]/.test(p)&&!/[\\\0:*?\[\]{}]/.test(p)&&!p.split('/').some(part=>!part||part==='.'||part==='..'||part==='.git');
 const targets=new Set();
 for(const file of value.commonFiles){
  if(!file||Object.keys(file).sort().join(',')!=='audience,source,target'||!safe(file.source)||!safe(file.target)||!['student','grading'].includes(file.audience)||targets.has(file.target))fail('Некорректный captured common file');
  if(file.audience==='student'&&!file.target.startsWith('student/')||file.audience==='grading'&&file.target.startsWith('student/'))fail('Captured common audience/target mismatch');
  if(!['student','reference','tests'].includes(file.target.split('/')[0])&&!['rubric.md','contract.md'].includes(file.target))fail('Captured common target вне project partitions');
  const privateNames=['private','reference','solution','solutions','grading-notes','rubric.md','contract.md'];
  if(file.source.split('/').some(part=>privateNames.includes(part)||part==='tests')||file.audience==='student'&&file.target.split('/').some(part=>privateNames.includes(part)))fail('Закрытый captured common path');
  targets.add(file.target);
 }
 return {commonFiles:value.commonFiles,includeGit:value.includeGit??false};
}
function bind(documents:Captured[],complete:boolean):ProjectFact[]{
 const declarations=new Map<string,ProjectMaterialization>(),known=new Set<string>(),facts:ProjectFact[]=[];
 for(const document of documents){
  for(const exercise of [...document.exercises??[],...document.declarations??[]])known.add(exercise.id);
  for(const fact of document.projects??[]){
   if(fact.source!==document.source||facts.some(f=>f.exerciseId===fact.exerciseId))fail('Неоднозначная captured project/source: '+fact.exerciseId);
   known.add(fact.exerciseId);facts.push({...fact,...(fact.materialization?{materialization:declaration(fact.materialization)}:{})});
  }
  for(const [id,raw] of Object.entries(document.projectMaterializations??{})){
   if(!/^exr-[a-z0-9][a-z0-9-]*$/.test(id))fail('Некорректный materialization ID');
   const value=declaration(raw);
   if(declarations.has(id)&&stable(declarations.get(id))!==stable(value))fail('Несогласованные materialization declarations: '+id);
   declarations.set(id,value);
  }
 }
 for(const [id,value] of declarations){
  const matches=facts.filter(f=>f.exerciseId===id);
  if(matches.length!==1){if(!complete&&!known.has(id))continue;fail('Materialization требует ровно один действующий project: '+id)}
  const fact=matches[0];
  if(fact.materialization&&stable(fact.materialization)!==stable(value))fail('Project fact расходится с captured declaration: '+id);
  fact.materialization=value;
 }
 return facts;
}
/** Complete owner binding: no unknown declaration is accepted. */
export function bindProjectMaterializations(documents:Captured[]):ProjectFact[]{return bind(documents,true)}
/** Completeness comes only from the successful current native capture. */
export function bindArtifactProjectMaterializations(run:NativeRun):ProjectFact[]{return bind(run.documents,run.renderAll)}
