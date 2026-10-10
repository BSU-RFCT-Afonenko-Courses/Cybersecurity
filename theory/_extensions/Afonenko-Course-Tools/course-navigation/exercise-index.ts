import type {Course,ExercisePurpose} from '../course-core/domain/model.ts';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export interface ExerciseIndexRequest {role?:ExercisePurpose;groupBy?:('semester'|'difficulty')[]}
export function renderExerciseIndex(model:Course,link:(source:string,id:string)=>string,request:ExerciseIndexRequest={}):string{
 if(request.role&&!['demonstration','discussion','independent-study','control'].includes(request.role))throw Error('Unknown course-exercise-index role');
 const groupBy=request.groupBy??['semester','difficulty'];
 if(!groupBy.length||new Set(groupBy).size!==groupBy.length||groupBy.some(g=>g!=='semester'&&g!=='difficulty'))throw Error('Invalid course-exercise-index group-by');
 const topics=new Map((model.topics??[]).map(topic=>[topic.source,topic]));
 const grouped=new Map<string,{exercise:Course['exercises'][number];categories:string[]}[]>();
 for(const exercise of model.exercises){
  if(request.role&&exercise.purpose!==request.role||model.course.view==='student'&&exercise.statementVisibility!=='open')continue;
  const topic=topics.get(exercise.source);
  if(!topic)throw Error('Index topic absent for canonical exercise: '+exercise.source);
  const key=groupBy.map(field=>field==='semester'?topic.semester??'':exercise.difficulty??'').join(' / ');
  const list=grouped.get(key)??[];list.push({exercise,categories:topic.categories});grouped.set(key,list);
 }
 return '<nav class="course-exercise-index" aria-label="Указатель упражнений">'+[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([group,items])=>'<section><h2>'+esc(group)+'</h2><ul>'+items.sort((a,b)=>a.exercise.id.localeCompare(b.exercise.id)).map(({categories,exercise})=>'<li><code>'+esc(exercise.id)+'</code> — <a href="'+esc(link(exercise.source,exercise.id))+'">'+esc(exercise.head.title)+'</a> — '+esc(categories.join(', '))+' — '+esc(String(exercise.time??'?'))+' мин</li>').join('')+'</ul></section>').join('')+'</nav>';
}
