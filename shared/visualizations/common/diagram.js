import {prepareSVG,serializeSVG} from './runtime.js';
export async function diagram(url) {
 const response=await fetch(url);if(!response.ok)throw Error('Не удалось загрузить схему');const source=await response.text();
 const view=document.createElement('div');view.className='course-viz';let index=-1;let svg;
 const canvas=document.createElement('div'),next=document.createElement('button'),reset=document.createElement('button'),save=document.createElement('button');
 next.type=reset.type=save.type='button';next.textContent='Следующий этап';reset.textContent='Общий вид';save.textContent='Сохранить SVG';
 const keys=Array.from(source.matchAll(/id="(n\d+)"/g),m=>m[1]);
 function draw(){svg=prepareSVG(source,index<0?[]:[keys[index]]);svg.setAttribute('role','img');svg.setAttribute('aria-label','Схема процесса');canvas.replaceChildren(svg);view.dataset.stage=index<0?'overview':keys[index];}
 next.onclick=()=>{index=(index+1)%keys.length;draw();};reset.onclick=()=>{index=-1;draw();};
 save.onclick=()=>{const url=URL.createObjectURL(new Blob([serializeSVG(svg)],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='diagram.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!keys.length)next.disabled=true;view.append(canvas,reset,next,save);draw();return view;
}
