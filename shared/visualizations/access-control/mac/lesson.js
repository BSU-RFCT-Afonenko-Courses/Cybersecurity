import {macTrace,macQueries} from './model.js';
import {createControls} from '../../common/runtime.js';
import {assets,display,key} from '../display.js';
const source=assets(import.meta.url);
export function macControls(options={}){return createControls(macTrace,macQueries,options);}
export async function macDiagram(selected,notes={}){
 const [model,algorithm]=await source;
 return display(selected,model,algorithm,notes,(svg,{stage,query,index})=>{
  const file={1:'handout',2:'draft',3:'answers'}[query.object],flow=`${query.operation}-lena-${file}`;
  svg.querySelectorAll('.result-flow').forEach(g=>{g.style.display=index>=2&&g.dataset.key===flow?'':'none';});
  const t=key(svg,'mac-note')?.querySelector('text');if(t)t.textContent=`Лена · ${query.operation==='read'?'чтение':'запись'} · ${{1:'Материалы',2:'Черновик',3:'Ответы'}[query.object]}`;
  const scope=key(svg,'mac-scope')?.querySelector('text');if(scope)scope.textContent=stage.result==='deny'?'Поток остановлен на границе уровней.':stage.result==='allow'?'Разрешённый поток данных.':'Чтение: файл → процесс. Запись: процесс → файл.';
 });
}
