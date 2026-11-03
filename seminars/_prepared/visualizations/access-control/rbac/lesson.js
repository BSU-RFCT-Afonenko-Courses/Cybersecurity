import {rbacTrace,rbacQueries,people,permissions,assignments} from './model.js';
import {createControls} from '../../common/runtime.js';
import {assets,display,key,el} from '../display.js';
const source=assets(import.meta.url);
export function rbacControls(options={}){return createControls(rbacTrace,rbacQueries,options);}
export async function rbacDiagram(selected,notes={}){const [model,algorithm]=await source;return display(selected,model,algorithm,notes,(svg,{stage,query,index})=>{
 const py={lena:160,ilya:320,boris:480},ry={student:230,teacher:450},ty={view:160,submit:320,grade:480};
 const roles=query.roles||assignments[query.subject];
 function line(x1,y1,x2,y2,color,arrow=false,dash){const p=el(svg,'path',{d:`M${x1},${y1}L${x2},${y2}`,fill:'none',stroke:color,'stroke-width':arrow?3.5:2,...(dash?{'stroke-dasharray':dash}:{})});if(arrow){const a=Math.atan2(y2-y1,x2-x1),l=10;el(svg,'path',{d:`M${x2-l*Math.cos(a-.45)},${y2-l*Math.sin(a-.45)}L${x2},${y2}L${x2-l*Math.cos(a+.45)},${y2-l*Math.sin(a+.45)}`,fill:'none',stroke:color,'stroke-width':3});}return p;}
 if(index>=1)for(const role of roles)line(169,py[query.subject],311,ry[role],stage.result==='allow'?'#147d76':'#2864b4',true);
 if(stage.result){
  const color=stage.result==='allow'?'#147d76':'#a45d16';
  if(stage.through)line(549,ry[stage.through],654,ty[query.operation],color,true);
  else{const y=ry[roles[0]],sx=549+(654-549)*.58,sy=y+(ty[query.operation]-y)*.58;line(549,y,sx,sy,color,false,'7 6');line(sx-9,sy-9,sx+9,sy+9,color);line(sx+9,sy-9,sx-9,sy+9,color);}
  svg.setAttribute('viewBox','0 0 1000 750');svg.setAttribute('height','750');
  el(svg,'rect',{x:30,y:596,width:940,height:128,rx:12,fill:stage.result==='allow'?'#edf8f4':'#fff4e7',stroke:color,'stroke-width':1.5});
  el(svg,'text',{x:55,y:630,'text-anchor':'start','font-size':27,'font-weight':600,fill:color},stage.result==='allow'?'РАЗРЕШЕНО':'ОТКАЗ');
  el(svg,'text',{x:55,y:670,'text-anchor':'start','font-size':24,fill:'#19364b'},stage.explanation);
  el(svg,'text',{x:55,y:708,'text-anchor':'start','font-size':22,fill:'#5b6f80'},`${people[query.subject]} · ${permissions[query.operation].toLowerCase()} · курс А`);
 }
});}
