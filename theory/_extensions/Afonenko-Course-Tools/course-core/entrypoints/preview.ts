import type { AssessmentComposition, DocumentResult, ExerciseDeclaration } from "../domain/model.ts";
import type { NativeRun } from "../infrastructure/native-run.ts";
import { resolve } from "stdlib/path";
import { projectedResourceUses, cleanHiddenResourceOutputs } from "../infrastructure/resources.ts";
export function assessmentTime(work:AssessmentComposition,facts:Map<string,ExerciseDeclaration>) {
  if(work.slots.some(slot=>slot.candidates.some(id=>facts.get(id)?.time===undefined)))return undefined;
  const required={min:0,max:0},all={min:0,max:0};
  for(const slot of work.slots){const values=slot.candidates.map(id=>facts.get(id)!.time!);const min=Math.min(...values),max=Math.max(...values);all.min+=min;all.max+=max;if(slot.assignment.requirement==="required"){required.min+=min;required.max+=max;}}
  const theory=work.theoryTime??0;
  return {required,all,theory,sessionRequired:{min:required.min+theory,max:required.max+theory},sessionAll:{min:all.min+theory,max:all.max+theory}};
}
function projection(value:any,facts:Map<string,ExerciseDeclaration>):any {
  if(Array.isArray(value))return value.map(v=>projection(v,facts)).filter(v=>v!==undefined);
  if(!value||typeof value!=="object")return value;
  if(value.t==="RawBlock"&&value.c?.[0]==="html"&&(value.c[1]?.startsWith("<!--course-assignment:")||value.c[1]?.startsWith("</template><!--course-assignment:")))return undefined;
  if(value.t==="Div"&&value.c?.[0]?.[1]?.includes("task-items")){
    const copy=structuredClone(value);
    const clean=(node:any):any=>{
      if(Array.isArray(node))return node.map(clean).filter(v=>v!==undefined);
      if(!node||typeof node!=="object")return node;
      if(node.t==="Cite"){
        const kept=node.c[0].filter((c:any)=>facts.get(c.citationId)?.statementVisibility==="open");
        if(!kept.length)return undefined;
        return {...node,c:[kept,kept.flatMap((c:any,index:number)=>[...(index?[{t:"Str",c:";"},{t:"Space"}]:[]),{t:"Str",c:"@"+c.citationId}])]};
      }
      if(node.t==="Link"){
        const id=node.c[2]?.[0]?.split("#")[1];
        if(id?.startsWith("exr-")&&facts.get(id)?.statementVisibility!=="open")return undefined;
      }
      return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,clean(v)]));
    };
    for(const list of copy.c[1]){
      if(!["OrderedList","BulletList"].includes(list.t))continue;
      const items=list.t==="OrderedList"?list.c[1]:list.c;
      const kept=items.filter((item:any)=>{
        const citations:string[]=[],links:string[]=[];
        const walk=(node:any)=>{if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==="object"){if(node.t==="Cite")citations.push(...node.c[0].map((c:any)=>c.citationId));if(node.t==="Link")links.push(node.c[2]?.[0]?.split("#")[1]);Object.values(node).forEach(walk);}};walk(item);
        return (citations.length?citations:links).some(id=>facts.get(id)?.statementVisibility==="open");
      }).map(clean);
      if(list.t==="OrderedList")list.c[1]=kept;else list.c=kept;
    }
    return Object.fromEntries(Object.entries(copy).map(([k,v])=>[k,projection(v,facts)]));
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,projection(v,facts)]));
}
function cleanBodies(doc:DocumentResult,facts:Map<string,ExerciseDeclaration>){
  const body=(value:string)=>JSON.stringify(projection(JSON.parse(value),facts));
  const work=(value:DocumentResult["assessment"])=>{
    if(!value)return value;
    const slots=value.slots.filter(slot=>slot.candidates.every(id=>facts.get(id)?.statementVisibility==="open"));
    if(!slots.length)return null;
    return {...value,slots,memberSizes:slots.map(()=>1),bodyJson:body(value.bodyJson)};
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
    html=html.replace(/<div hidden(?:="")? inert(?:="")?><!--course-assignment-pending:(exr-[a-z0-9-]+):start-->([\s\S]*?)<!--course-assignment-pending:\1:end--><\/div>/g,(_match,id,content)=>{pending.set(id,content);return "";});
    // Relocate exact native markup only for a current open member; no parser,
    // constructed address, inferred caption or stale native document lookup.
    html=html.replace(/<!--course-assignment:(exr-[a-z0-9-]+):start--><template>[\s\S]*?<\/template><!--course-assignment:\1:end-->/g,(_match,id)=>facts.get(id)?.statementVisibility==="open"&&pending.has(id)?pending.get(id)!:'<span class="course-assignment-omitted"></span>');
    if(work){
      const time=assessmentTime(work,facts);
      if(time){
        const range=(value:{min:number,max:number})=>value.min===value.max?String(value.min):`${value.min}–${value.max}`;
        const marker='<!--course-assessment-time-->';
        const text=`<aside class="course-assessment-time" data-course-assessment-time="ready">Задачи: обязательные ${range(time.required)} мин; все ${range(time.all)} мин. Теория: ${time.theory} мин. Занятие: обязательные ${range(time.sessionRequired)} мин; все ${range(time.sessionAll)} мин.</aside>`;
        html=html.replace(marker,text);
      }else html=html.replace('<!--course-assessment-time-->','');
    }
    await Deno.writeTextFile(path,html);
  }
  await cleanHiddenResourceOutputs(run.projectRoot,run.documents.flatMap(doc=>doc.resources?[doc.resources]:[]));
}
