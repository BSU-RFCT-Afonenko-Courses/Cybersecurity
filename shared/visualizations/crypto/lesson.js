import {lcgSequence,caesar,xorBytes} from './model.js';
import {diagram} from '../common/diagram.js';
function field(parent,label,value,type='number') {const wrap=document.createElement('label'),input=document.createElement('input');wrap.textContent=label+' ';input.type=type;input.value=value;wrap.append(input);parent.append(wrap);return input;}
function button(parent,label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;parent.append(b);return b;}
export function lcgTrainer(){
 const view=document.createElement('div');view.className='course-viz';
 const formula=document.createElement('p');formula.textContent='xₙ₊₁ = (a × xₙ + c) mod m. Предскажите первый выход после seed.';view.append(formula);
 const seed=field(view,'seed',3),a=field(view,'a',5),c=field(view,'c',1),m=field(view,'m',16),answer=field(view,'Первый выход','');
 const result=document.createElement('output');result.setAttribute('aria-live','polite');
 const values=()=>lcgSequence(Number(seed.value),Number(a.value),Number(c.value),Number(m.value),4);
 const safe=fn=>()=>{try{fn();}catch(e){result.textContent=e.message;}};
 button(view,'Проверить',safe(()=>{result.textContent=answer.value.trim()!==''&&Number(answer.value)===values()[0]?'Верно. Состояние стало первым выходом.':'Пока неверно. Подставьте seed в формулу.';}));
 button(view,'Подсказка',safe(()=>{result.textContent=`Сначала ${a.value} × ${seed.value} + ${c.value}, затем остаток от деления на ${m.value}.`;}));
 button(view,'Показать четыре выхода',safe(()=>{result.textContent=values().join(' → ');}));
 for(const input of [seed,a,c,m])input.addEventListener('input',()=>{result.textContent='';answer.value='';});view.append(result);return view;
}
export function caesarXorTrainer(){
 const view=document.createElement('div');view.className='course-viz';
 const intro=document.createElement('p');intro.textContent='Цезарь: латинские A–Z, остальные символы сохраняются. XOR: байты UTF-8; одинаковый ключ применяется повторно. Учебные преобразования не обеспечивают современную защиту.';view.append(intro);
 const text=field(view,'Текст','ABC','text'),shift=field(view,'Сдвиг Цезаря',3),key=field(view,'Байт XOR',42),answer=field(view,'Расшифруйте результат Цезаря','ABC','text');
 const task=document.createElement('output'),result=document.createElement('output');result.setAttribute('aria-live','polite');
 function update(){try{const encoded=caesar(text.value,Number(shift.value));const bytes=Array.from(new TextEncoder().encode(text.value));const encrypted=xorBytes(bytes,Number(key.value));task.textContent=`Цезарь: ${encoded}; XOR (десятичные байты): ${encrypted.join(', ')}.`;view.value={encoded,encrypted};result.textContent='';}catch(e){task.textContent=e.message;view.value=null;}}
 button(view,'Проверить ответ',()=>{if(view.value)result.textContent=answer.value===caesar(view.value.encoded,-Number(shift.value))?'Верно.':'Пока неверно. Используйте противоположный сдвиг.';});
 button(view,'Подсказка',()=>{result.textContent='Для Цезаря примените −сдвиг. Для XOR повторите XOR с тем же ключом.';});
 button(view,'Обратное преобразование',()=>{if(view.value){const bytes=xorBytes(view.value.encrypted,Number(key.value));result.textContent=`Цезарь: ${caesar(view.value.encoded,-Number(shift.value))}; XOR: ${new TextDecoder().decode(new Uint8Array(bytes))}.`;}});
 for(const input of [text,shift,key])input.addEventListener('input',update);view.append(task,result);update();return view;
}
export function seedDiagram(){return diagram(new URL('./static/seed.svg',import.meta.url));}
export function symmetricDiagram(){return diagram(new URL('./static/symmetric.svg',import.meta.url));}
export function hashDiagram(){return diagram(new URL('./static/hash.svg',import.meta.url));}
