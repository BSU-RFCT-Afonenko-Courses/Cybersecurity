import type { NativePublicDocument, NativeCatalog } from "../course-core/public.ts";
import { nativeMetadata } from "../course-core/release/collect.ts";
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export interface ExerciseIndexRequest {role?:"demonstration"|"discussion"|"independent-study"|"control";groupBy?:("semester"|"difficulty")[]}
const text = (v: any): string => Array.isArray(v) ? v.map(text).join("") : v && typeof v === "object" ? v.t === "Str" ? String(v.c) : ["Space","SoftBreak","LineBreak"].includes(v.t) ? " " : text(v.c) : typeof v === "string" ? v : "";
/** Указатель — представление фактически выживших native occurrences, не второй Course. */
export function renderExerciseIndex(documents: readonly NativePublicDocument[], catalog: NativeCatalog, topics: ReadonlyMap<string, Record<string, unknown>>, link:(source:string,anchor:string)=>string,request:ExerciseIndexRequest={}):string{
 if(Object.keys(request).some(k=>!['role','groupBy'].includes(k)) || request.role&&!['demonstration','discussion','independent-study','control'].includes(request.role))throw Error('Unknown course-exercise-index parameter/role');
 const groupBy=request.groupBy??['semester','difficulty'];
 if(!Array.isArray(groupBy)||!groupBy.length||new Set(groupBy).size!==groupBy.length||groupBy.some(g=>g!=='semester'&&g!=='difficulty'))throw Error('Invalid course-exercise-index group-by');
 const rows=documents.flatMap(doc=>{
  const source=doc.context.input, meta=topics.get(source);
  if(!meta)throw Error('Index topic absent for current document: '+source);
  const semester=nativeMetadata(meta.semester), categories=nativeMetadata(meta.categories);
  if(semester!==undefined&&typeof semester!=='string'||categories!==undefined&&(!Array.isArray(categories)||categories.some(x=>typeof x!=='string')))throw Error('Invalid native index topic metadata: '+source);
  const seen=new Set<string>();
  return doc.occurrences.flatMap(occ=>{
   if(occ.kind!=='exercise'||seen.has(occ.exerciseId))return [];
   seen.add(occ.exerciseId);const d=doc.definitions[occ.exerciseId];
   if(!d||request.role&&d['course-role']!==request.role||doc.context.projection==='student'&&d['statement-visibility']!=='open')return [];
   const captured=catalog.documents.find(row=>row.source===source&&row.format===doc.context.format)?.exercises.find(row=>row.occurrence===occ.key);
   if(!captured)throw Error('Index occurrence absent in current catalog');
   const title=text(occ.title)||occ.exerciseId;
   return [{id:occ.exerciseId,source,anchor:captured.anchor,title,difficulty:d.difficulty,time:d.time,semester:semester??'',categories:(categories??[]) as string[]}];
  });
 });
 const grouped=new Map<string,typeof rows>();
 for(const row of rows){const key=groupBy.map(field=>field==='semester'?row.semester:row.difficulty).join(' / ');const list=grouped.get(key)??[];list.push(row);grouped.set(key,list);}
 return '<nav class="course-exercise-index" aria-label="Указатель упражнений">'+[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([group,items])=>'<section><h2>'+esc(group)+'</h2><ul>'+items.sort((a,b)=>a.id.localeCompare(b.id)).map(row=>'<li><code>'+esc(row.id)+'</code> — <a href="'+esc(link(row.source,row.anchor))+'">'+esc(row.title)+'</a> — '+esc(row.categories.join(', '))+' — '+esc(String(row.time??'?'))+' мин</li>').join('')+'</ul></section>').join('')+'</nav>';
}
