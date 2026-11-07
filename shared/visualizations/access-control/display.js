import {renderStage} from '../common/runtime.js';
export function display(selected,model,algorithm,notes={},decorate=()=>{}) {
  const view=renderStage({selected,model,algorithm,notes});
  const svg=view.querySelector('[data-diagram="model"] svg');
  decorate(svg,selected);
  view.classList.add('course-viz-access-control');
  const p=view.querySelector('[data-explanation]');
  p.textContent=notes[selected.stage.name]||selected.stage.explanation||'';
  return view;
}
export function key(svg,name){return [...svg.querySelectorAll('[data-key]')].find(n=>n.dataset.key===name);}
export const NS='http://www.w3.org/2000/svg';
export function el(svg,tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;}
export async function assets(base){return Promise.all(['model','algorithm'].map(async name=>{const r=await fetch(new URL(`./static/${name}.svg`,base));if(!r.ok)throw Error('Не удалось загрузить схему '+name);return r.text();}));}
