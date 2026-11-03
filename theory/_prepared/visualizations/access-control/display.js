import {renderStage} from '../common/runtime.js';
export function display(selected,model,algorithm,notes={},decorate=()=>{}) {
  const view=renderStage({selected,model,algorithm,notes});
  const svg=view.querySelector('[data-diagram="model"] svg');
  decorate(svg,selected);
  const pair=view.querySelector('.course-viz-pair');
  pair.style.gridTemplateColumns='minmax(0,1.5fr) minmax(240px,1fr)';
  const style=document.createElement('style');
  style.textContent=`.course-viz [data-diagram="model"] .edge{opacity:1}.course-viz [data-diagram="model"] svg{width:100%;height:auto;max-height:none}.course-viz .is-active>rect,.course-viz .is-active>circle{stroke:var(--cv-accent,#2864b4);stroke-width:3}.course-viz .is-active>rect,.course-viz .is-active>circle,.course-viz .is-active>ellipse{fill:#edf4ff}.course-viz .result-deny{--cv-accent:#a45d16}.course-viz .result-allow{--cv-accent:#147d76}@media(max-width:640px){.course-viz .course-viz-pair{grid-template-columns:1fr!important}}`;
  view.prepend(style);
  const p=view.querySelector('[data-explanation]');
  p.textContent=notes[selected.stage.name]||selected.stage.explanation||'';
  return view;
}
export function key(svg,name){return [...svg.querySelectorAll('[data-key]')].find(n=>n.dataset.key===name);}
export const NS='http://www.w3.org/2000/svg';
export function el(svg,tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;}
export async function assets(base){return Promise.all(['model','algorithm'].map(async name=>{const r=await fetch(new URL(`./static/${name}.svg`,base));if(!r.ok)throw Error('Не удалось загрузить схему '+name);return r.text();}));}
