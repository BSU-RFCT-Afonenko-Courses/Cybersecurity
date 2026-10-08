import type { AssessmentComposition, DocumentResult, ExerciseDeclaration } from "../domain/model.ts";
import type { NativeRun } from "../infrastructure/native-run.ts";
import { resolve } from "stdlib/path";
import { projectedResourceUses, cleanHiddenResourceOutputs } from "../infrastructure/resources.ts";
export function assessmentTime(work:AssessmentComposition,facts:Map<string,ExerciseDeclaration>) {
  if(work.items.some(id=>!facts.has(id)))return undefined;
  let required=0,all=0;
  for(const id of work.items){const time=facts.get(id)!.time;all+=time;if(work.assignments[id].requirement==="required")required+=time;}
  const theory=work.theoryTime??0;
  return {required,all,theory,sessionRequired:required+theory,sessionAll:all+theory};
}
function projection(value:any,facts:Map<string,ExerciseDeclaration>):any {
  if(Array.isArray(value))return value.map(v=>projection(v,facts)).filter(v=>v!==undefined);
  if(!value||typeof value!=="object")return value;
  if(value.t==="RawBlock"&&value.c?.[0]==="html"&&(value.c[1]?.startsWith("<!--course-assignment:")||value.c[1]?.startsWith("</template><!--course-assignment:")))return undefined;
  if(value.t==="Div"&&value.c?.[0]?.[1]?.includes("task-items")){
    const copy=structuredClone(value);
    for(const list of copy.c[1]){
      if(!["OrderedList","BulletList"].includes(list.t))continue;
      const index=list.t==="OrderedList"?1:0,items=list.t==="OrderedList"?list.c[1]:list.c;
      const kept=items.filter((item:any)=>{
        let member:string|undefined;
        const walk=(node:any)=>{
          if(Array.isArray(node))node.forEach(walk);
          else if(node&&typeof node==="object"){
            if(node.t==="Cite")member=node.c[0]?.[0]?.citationId;
            if(node.t==="Link"&&!member){
              const id=node.c[2]?.[0]?.split("#")[1];
              if(id?.startsWith("exr-"))member=id;
            }
            Object.values(node).forEach(walk);
          }
        };walk(item);
        return member&&facts.get(member)?.statementVisibility==="open";
      });
      if(index)list.c[index]=kept;else list.c=kept;
    }
    return Object.fromEntries(Object.entries(copy).map(([k,v])=>[k,projection(v,facts)]));
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,projection(v,facts)]));
}
function cleanBodies(doc:DocumentResult,facts:Map<string,ExerciseDeclaration>){
  const body=(value:string)=>JSON.stringify(projection(JSON.parse(value),facts));
  const work=(value:DocumentResult["assessment"])=>{
    if(!value)return value;
    const items=value.items.filter(id=>facts.get(id)?.statementVisibility==="open");
    if(!items.length)return null;
    return {...value,items,memberSizes:items.map(()=>1),assignments:Object.fromEntries(items.map(id=>[id,value.assignments[id]])),bodyJson:body(value.bodyJson)};
  };
  const publicBody=doc.body?.publicAssessment?.bodyJson??doc.assessment?.bodyJson;
  if(publicBody&&doc.resources)doc.resources.projectedUses=projectedResourceUses(JSON.parse(body(publicBody)));
  doc.assessment=work(doc.assessment);
  if(doc.body)doc.body.publicAssessment=work(doc.body.publicAssessment);
  for(const e of [...doc.exercises,...doc.body?.publicExercises??[]])e.bodyJson=body(e.bodyJson);
  for(const element of doc.pedagogy?.elements??[])element.bodyJson=body(element.bodyJson);
}
export async function finalizePublicSolutionWitness(run:NativeRun){
  for(const doc of run.documents){
    if(!/\.html?$/i.test(doc.document.output))continue;
    const path=resolve(run.outputDirectory,doc.document.output);
    let html=await Deno.readTextFile(path);
    const probe=html.match(/<!--course-public-solution-probe:start-->([\s\S]*?)<!--course-public-solution-probe:end-->/)?.[1]??"";
    for(const fact of doc.declarations??[]){
      const digest=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(fact.source+"\0"+fact.id));
      const token=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,"0")).join("");
      fact.hasPublicSolution=probe.includes("<!--course-public-solution:"+token+"-->");
      for(const exercise of [...doc.exercises,...doc.body?.publicExercises??[]])if(exercise.id===fact.id)exercise.hasPublicSolution=fact.hasPublicSolution;
    }
    html=html.replace(/<!--course-public-solution-probe:start-->[\s\S]*?<!--course-public-solution-probe:end-->/g,"");
    await Deno.writeTextFile(path,html);
  }
}
export async function finalizeAssessmentPreview(run:NativeRun){
  const facts=new Map(run.documents.flatMap(doc=>(doc.declarations??[]).map(fact=>[fact.id,fact] as const)));
  for(const doc of run.documents){
    const work=doc.rawAssessment;
    if(doc.course.view==="student")cleanBodies(doc,facts);
    if(!/\.html?$/i.test(doc.document.output))continue;
    const path=resolve(run.outputDirectory,doc.document.output);
    let html=await Deno.readTextFile(path);
    // The public post-quarto filter put already-native HTML outside main.
    // Native book crossrefs resolve there before search and configured hooks.
    const pending=new Map<string,string>();
    html=html.replace(/<!--course-assignment-pending:(exr-[a-z0-9-]+):start--><div hidden(?:="")? inert(?:="")?>([\s\S]*?)<\/div><!--course-assignment-pending:\1:end-->/g,(_match,id,content)=>{pending.set(id,content);return "";});
    // Relocate exact native markup only for a current open member; no parser,
    // constructed address, inferred caption or stale native document lookup.
    html=html.replace(/<!--course-assignment:(exr-[a-z0-9-]+):start--><template>[\s\S]*?<\/template><!--course-assignment:\1:end-->/g,(_match,id)=>facts.get(id)?.statementVisibility==="open"&&pending.has(id)?pending.get(id)!:'<span class="course-assignment-omitted"></span>');
    if(work){
      const time=assessmentTime(work,facts);
      if(time){
        const marker='<!--course-assessment-time-->';
        const text=`<aside class="course-assessment-time" data-course-assessment-time="ready">Задачи: обязательные ${time.required} мин; все ${time.all} мин. Теория: ${time.theory} мин. Занятие: обязательные ${time.sessionRequired} мин; все ${time.sessionAll} мин.</aside>`;
        html=html.replace(marker,text);
      }else html=html.replace('<!--course-assessment-time-->','');
    }
    await Deno.writeTextFile(path,html);
  }
  await cleanHiddenResourceOutputs(run.projectRoot,run.documents.flatMap(doc=>doc.resources?[doc.resources]:[]));
}
