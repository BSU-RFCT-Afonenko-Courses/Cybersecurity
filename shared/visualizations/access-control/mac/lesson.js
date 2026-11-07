import {macTrace,macQueries} from './model.js';
import {createControls} from '../../common/runtime.js';
import {assets,display} from '../display.js';
const source=assets(import.meta.url);
export function macControls(options={}){return createControls(macTrace,macQueries,options);}
export async function macDiagram(selected,notes={}){
 const [model,algorithm]=await source;
 return display(selected,model,algorithm,notes,(svg,{query,index})=>{
  const file={1:'handout',2:'draft',3:'answers'}[query.object],flow=`${query.operation}-lena-${file}`;
  svg.querySelectorAll('.result-flow').forEach(g=>{g.style.display=index>=2&&g.dataset.key===flow?'':'none';});
 });
}
