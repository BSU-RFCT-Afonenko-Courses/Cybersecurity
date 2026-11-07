import {prepareSVG} from '../common/runtime.js';

function element(parent, tag, text) { const e=document.createElement(tag); if(text!==undefined)e.textContent=text; parent.append(e); return e; }
function button(parent,label,action) { const b=element(parent,'button',label); b.type='button'; b.onclick=action; return b; }

const passwordResults = {
 correct:'d95ab0d9d4465e11c6bd8a1f1f278edde6ecc462493ffd65681ab8f59d67e3da',
 wrong:'5feb944d20a087b98b0288bbe216ee4016853b2ca979f55b906219e30e608e56'
};
const passwordStages = [
 {name:'derive-registration',label:'Вычисляем V при регистрации',keys:['password','registration','registration-derive']},
 {name:'save-record',label:'Сохраняем S, параметры и V',keys:['registration','record','registration-save']},
 {name:'read-record',label:'Читаем из базы S, параметры и V',keys:['record','read','login','compare']},
 {name:'derive-login',label:'Повторяем PBKDF2 с паролем P′',keys:['candidate','login','login-derive']},
 {name:'compare',label:'Сравниваем все 32 байта V′ и V',keys:['login','compare','compare-values']}
];
let passwordSVGSource;
function loadPasswordSVG() {
 if (!passwordSVGSource) passwordSVGSource=fetch(new URL('./static/password-record.svg',import.meta.url))
  .then(response=>{if(!response.ok)throw Error('SVG недоступен');return response.text();})
  .catch(error=>{passwordSVGSource=undefined;throw error;});
 return passwordSVGSource;
}
export function passwordExperiment() {
 const view=document.createElement('div');view.className='course-viz course-viz-password';
 const controls=element(view,'div');controls.className='pr-controls';
 const label=element(controls,'label','Пароль при входе '),candidate=element(label,'select');
 candidate.setAttribute('aria-label','Пароль при входе');
 for(const [value,text] of [['correct','кот7 — верный'],['wrong','кот8 — неверный']]) {const option=element(candidate,'option',text);option.value=value;}
 const diagram=element(view,'div');diagram.className='pr-diagram';
 const fallback=element(diagram,'p','Загрузка схемы…');fallback.className='pr-fallback';fallback.setAttribute('role','status');
 const navigation=element(view,'div');navigation.className='pr-navigation';
 const back=button(navigation,'← Назад',()=>{if(index>0){index--;render();}});back.dataset.action='previous';
 const status=element(navigation,'output');status.setAttribute('aria-live','polite');
 const next=button(navigation,'Далее →',()=>{if(index<passwordStages.length-1){index++;render();}});next.dataset.action='next';
 let index=0,svg=null;
 function render() {
  const stage=passwordStages[index],correct=candidate.value==='correct';
  view.dataset.stage=stage.name;view.dataset.result=index===4?(correct?'allow':'deny'):'pending';
  view.value={index,stage,candidate:candidate.value};
  status.textContent=`${index+1}/${passwordStages.length} · ${stage.label}`;
  back.disabled=index===0;next.disabled=index===passwordStages.length-1;
  if(!svg)return;
  svg.querySelector('[data-slot="registered-password"]').textContent='Пароль P: кот7';
  svg.querySelector('[data-slot="parameters"]').textContent='1000 учебных итераций';
  svg.querySelector('[data-slot="candidate"]').textContent=correct?'кот7':'кот8';
  const result=passwordResults[candidate.value];
  svg.querySelector('[data-slot="computed"]').textContent=result.slice(0,8)+'…'+result.slice(-8);
  svg.querySelector('[data-slot="verdict"]').textContent=index===4?(correct?'Совпали — вход разрешён':'Различаются — вход отклонён'):'V′ и V: сравнение на шаге 5';
  for(const node of svg.querySelectorAll('[data-key]')) {
   const active=stage.keys.includes(node.dataset.key);
   node.classList.toggle('is-active',active);
   node.classList.toggle('is-completed',!active&&passwordStages.slice(0,index).some(s=>s.keys.includes(node.dataset.key)));
   node.classList.toggle('result-allow',active&&index===4&&correct);
   node.classList.toggle('result-deny',active&&index===4&&!correct);
  }
  svg.removeAttribute('aria-labelledby');
  svg.setAttribute('aria-label',`${stage.label}. Пароль при входе ${correct?'кот7':'кот8'}. ${index===4?(correct?'Вход разрешён.':'Вход отклонён.'):''}`);
 }
 candidate.addEventListener('change',()=>{index=Math.max(3,index);render();});
 render();
 loadPasswordSVG().then(source=>{
  svg=prepareSVG(source);diagram.replaceChildren(svg);render();
 }).catch(()=>{
  fallback.textContent='Не удалось загрузить схему. При регистрации PBKDF2 получает пароль кот7, соль S и учебные 1000 итераций. В базе сохраняются S, параметры и V. При входе та же PBKDF2 использует введённый пароль и сохранённые S и параметры; все 32 байта V′ сравниваются с V.';
  fallback.setAttribute('role','alert');
 });
 return view;
}
