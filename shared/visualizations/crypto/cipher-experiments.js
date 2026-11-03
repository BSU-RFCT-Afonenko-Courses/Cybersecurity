import {caesar,xorBytes} from './model.js';
import {prepareSVG} from '../common/runtime.js';

// Теория и оба опыта используют один SVG; каждый экземпляр получает свои ID.
export const assets = {symmetricKey: new URL('./static/symmetric-key.svg', import.meta.url)};
let template;
function source() {
 if (!template) template = fetch(assets.symmetricKey).then(response => {
  if (!response.ok) throw Error(`SVG: ${response.status}`);
  return response.text();
 }).catch(error => {template = undefined; throw error;});
 return template;
}
function element(parent,tag,text,className) {
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(className)node.className=className;
 parent.append(node);return node;
}
function field(parent,label,value,type='text') {
 const wrap=element(parent,'label',label),input=element(wrap,'input');
 input.type=type;input.value=value;input.setAttribute('aria-label',label);return input;
}
function selector(parent,label,options) {
 const wrap=element(parent,'label',label),select=element(wrap,'select');
 select.setAttribute('aria-label',label);
 for(const [value,text] of options){const option=element(select,'option',text);option.value=value;}
 return select;
}
function base(kind) {
 const view=document.createElement('div');view.className=`course-viz course-viz-cipher course-viz-${kind}`;
 const controls=element(view,'div',undefined,'cv-cipher-controls');
 const error=element(view,'div');error.setAttribute('role','alert');
 return {view,controls,error};
}
function diagram(view) {
 const container=element(view,'div','Загрузка схемы…','cv-cipher-graph');
 container.setAttribute('aria-busy','true');
 let svg,latest;
 function layout(){
  if(!svg)return;
  const wide=container.clientWidth>=1000,medium=!wide&&container.clientWidth>=560;
  svg.classList.toggle('is-wide',wide);svg.classList.toggle('is-medium',medium);
  const width=wide?1454:medium?680:380,height=wide?275:254;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
  if(!latest)return;
  for(const [name,value]of Object.entries(latest.values))for(const node of svg.querySelectorAll(`[data-slot="${name}"]`)){
   node.replaceChildren();
   if(wide||medium||Array.from(value).length<=9){node.textContent=value;continue;}
   const chars=Array.from(value),space=chars.lastIndexOf(' ',8),split=space>0?space+1:Math.ceil(chars.length/2);
   for(const [index,line]of [chars.slice(0,split).join(''),chars.slice(split).join('')].entries()){
    const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x','60');span.setAttribute('y',index?'66':'47');span.textContent=line;node.append(span);
   }
  }
 }
 function paint(){
  if(!latest)return;
  if(!svg){if(container.dataset.failed)container.textContent=`Схема недоступна. ${latest.description}`;return;}
  const keys=['message','encrypt','cipher','decrypt','restored'];
  for(const node of svg.querySelectorAll('.sk-node'))node.classList.toggle('is-current',node.dataset.key===keys[latest.phase]);
  for(const edge of svg.querySelectorAll('[data-edge]'))edge.classList.toggle('is-complete',Number(edge.dataset.edge)<latest.phase);
  svg.dataset.phase=String(latest.phase);svg.setAttribute('aria-label',latest.description);svg.querySelector('desc').textContent=latest.description;layout();
 }
 source().then(text=>{svg=prepareSVG(text);container.replaceChildren(svg);container.setAttribute('aria-busy','false');paint();}).catch(()=>{
  container.dataset.failed='true';container.setAttribute('aria-busy','false');paint();
 });
 new ResizeObserver(layout).observe(container);
 return (values,phase,description)=>{latest={values,phase,description};paint();};
}
function actions(view,total,advance) {
 const description=element(view,'output',undefined,'cv-cipher-operation');description.setAttribute('aria-live','polite');
 const row=element(view,'div',undefined,'cv-cipher-actions');
 const step=element(row,'button','Следующий шаг');step.type='button';step.dataset.action='step';
 const play=element(row,'button','Воспроизвести');play.type='button';play.dataset.action='play';
 const progress=element(row,'output',undefined,'cv-cipher-progress');
 let timer;
 function stop(){clearInterval(timer);timer=undefined;play.textContent='Воспроизвести';}
 step.addEventListener('click',()=>{stop();advance();});
 play.addEventListener('click',()=>{
  if(timer){stop();return;}
  if(Number(view.dataset.step)===total)advance();
  play.textContent='Пауза';
  timer=setInterval(()=>{if(!view.isConnected){stop();return;}advance();if(Number(view.dataset.step)===total)stop();},matchMedia('(prefers-reduced-motion: reduce)').matches?1400:850);
 });
 return {stop,update(index,text,label,valid=true){view.dataset.step=String(index);description.textContent=text;progress.textContent=`${index} / ${total}`;step.textContent=label;step.disabled=play.disabled=!valid;}};
}
export function caesarTrainer() {
 const {view,controls,error}=base('caesar');
 const text=field(controls,'Сообщение','КОТ');text.maxLength=12;
 const alphabet=selector(controls,'Алфавит',[['ru','Русский, включая Ё'],['latin','Латинский A–Z']]);
 const shift=field(controls,'Ключ K · сдвиг',3,'number');shift.step='1';
 const selection=element(view,'div',undefined,'cv-cipher-selection');
 const draw=diagram(view);
 element(view,'p','Сверху — открытый алфавит, снизу — шифралфавит. Выделена выбранная буква.','cv-cipher-tape-label');
 const tape=element(view,'div',undefined,'cv-cipher-tape');tape.setAttribute('role','img');
 let index=0,phase=0;
 const action=actions(view,4,()=>{phase=(phase+1)%5;update();});
 element(view,'p','Сдвиг можно найти перебором всех позиций алфавита. Регистр, пробелы и знаки сохраняются.','cv-cipher-boundary');
 function update(){try{
  const letters=alphabet.value==='ru'?'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ':'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if(!text.value||Array.from(text.value).length>12)throw Error('Введите сообщение от 1 до 12 символов.');
  if(!/^-?\d+$/.test(shift.value)||!Number.isSafeInteger(Number(shift.value)))throw Error('Сдвиг должен быть целым безопасным числом.');
  const chars=Array.from(text.value),k=((Number(shift.value)%letters.length)+letters.length)%letters.length;
  index=Math.min(index,chars.length-1);
  const encrypted=caesar(text.value,k,alphabet.value),restored=caesar(encrypted,-k,alphabet.value),c=chars[index],z=Array.from(encrypted)[index];
  error.textContent='';
  if(selection.dataset.message!==text.value){
   selection.dataset.message=text.value;selection.replaceChildren();element(selection,'span','Символ:');
   chars.forEach((ch,i)=>{const button=element(selection,'button',ch===' '?'␣':ch);button.type='button';button.setAttribute('aria-label',`Символ ${ch}, позиция ${i+1}`);button.addEventListener('click',()=>{action.stop();index=i;phase=0;update();});});
  }
  selection.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  const center=letters.indexOf(c.toUpperCase()),start=(center<0?0:center)-4;
  tape.replaceChildren();
  for(let j=0;j<9;j++){const i=(start+j+letters.length)%letters.length,col=element(tape,'div',undefined,'cv-cipher-tape-column'+(i===center?' is-current':''));element(col,'span',letters[i]);element(col,'span',letters[(i+k)%letters.length]);}
  tape.setAttribute('aria-label',center<0?`Символ ${c} не входит в алфавит и сохраняется.`:`Букве ${c} соответствует ${z}; сдвиг ${k}.`);
  const operation=center<0?`Символ «${c}» сохраняется без изменения.`:[`Выбран символ «${c}».`,`«${c}» + ${k} → «${z}».`,`В шифротексте: «${z}».`,`«${z}» − ${k} → «${c}».`,`Восстановлен тот же символ: «${c}».`][phase];
  draw({message:text.value,encrypt:`${c} → ${z}`,cipher:encrypted,decrypt:`${z} → ${c}`,restored,key:String(k)},phase,`Один ключ K = ${k}. ${text.value} → ${encrypted} → ${restored}. ${operation}`);
  action.update(phase,operation,phase===4?'С начала':'Следующий шаг');
 }catch(e){error.textContent=e.message;action.update(phase,'Исправьте входные данные.','Следующий шаг',false);}}
 for(const input of [text,alphabet,shift])input.addEventListener('input',()=>{action.stop();index=0;phase=0;update();});
 update();return view;
}
const bits=n=>n.toString(2).padStart(8,'0');
const hex=n=>'0x'+n.toString(16).toUpperCase().padStart(2,'0');
export function xorTrainer() {
 const {view,controls,error}=base('xor');
 const text=field(controls,'Символ ASCII','A'),key=field(controls,'Ключ K · символ ASCII','K');text.maxLength=key.maxLength=1;
 const draw=diagram(view),work=element(view,'div',undefined,'cv-cipher-bit-work');work.setAttribute('aria-label','Текущая побитовая операция');
 const rows={};
 for(const name of ['source','key','result']){
  const line=element(work,'div',undefined,'cv-cipher-bit-row');line.dataset.row=name;
  const heading=element(line,'div',undefined,'cv-cipher-bit-label');
  const label=element(heading,'span'),value=element(heading,'code');
  if(name==='key'){const operator=element(line,'span','⊕','cv-cipher-xor-sign');operator.setAttribute('aria-hidden','true');}
  const row=element(line,'div',undefined,'cv-cipher-bits');row.dataset.bits=name;
  rows[name]={label,value,row};
 }
 let phase=0;
 const action=actions(view,16,()=>{phase=(phase+1)%17;update();});
 element(view,'p','Однобайтовый ключ допускает перебор до 256 значений. Повторное применение ключа восстанавливает байт: (M ⊕ K) ⊕ K = M.','cv-cipher-boundary');
 function update(){try{
  if(!/^[\x20-\x7e]$/.test(text.value)||!/^[\x20-\x7e]$/.test(key.value))throw Error('Нужен один печатный символ ASCII в каждом поле.');
  error.textContent='';
  const m=text.value.charCodeAt(0),k=key.value.charCodeAt(0),c=xorBytes([m],k)[0],back=phase>8,done=back?phase-8:phase,source=back?c:m,target=xorBytes([source],k)[0],current=done-1;
  const known=(n,count)=>bits(n).slice(0,count)+'·'.repeat(8-count);
  const values={message:`«${text.value}» · ${hex(m)}`,encrypt:'M ⊕ K',cipher:phase>=8?hex(c):known(c,phase),decrypt:'C ⊕ K',restored:phase===16?`«${String.fromCharCode(target)}»`:phase>8?known(m,done):'········',key:`${key.value} · ${hex(k)}`};
  const currentPhase=phase===0?0:phase<8?1:phase===8?2:phase<16?3:4;
  const operation=done?`${back?'Расшифрование':'Шифрование'} · бит ${done}: ${bits(source)[current]} ⊕ ${bits(k)[current]} = ${bits(target)[current]}`:'Слева направо: по одной паре битов.';
  draw(values,currentPhase,`Один ключ K = ${hex(k)}. Сообщение ${hex(m)}, шифротекст ${hex(c)}. ${operation}`);
  const labels={source:back?'Шифротекст':'Сообщение',key:'Тот же ключ K',result:back?'Восстановленный символ':'Шифротекст'};
  for(const [name,row]of Object.entries(rows)){
   row.label.textContent=labels[name];
   row.value.textContent=name==='source'?hex(source):name==='key'?`«${key.value}» · ${hex(k)}`:done===8?(back?`«${String.fromCharCode(target)}» · ${hex(target)}`:hex(target)):'…';
   const str=name==='source'?bits(source):name==='key'?bits(k):known(target,done);
   row.row.replaceChildren(...Array.from(str,(b,i)=>{const cell=document.createElement('span');cell.className='cv-cipher-bit'+(i===current?' is-current':'')+(b==='·'?' is-pending':'');cell.textContent=b;return cell;}));
  }
  action.update(phase,operation,phase===16?'С начала':phase===8?'Расшифровать бит':'Вычислить бит');
 }catch(e){error.textContent=e.message;action.update(phase,'Исправьте входные данные.','Вычислить бит',false);}}
 for(const input of [text,key])input.addEventListener('input',()=>{action.stop();phase=0;update();});
 update();return view;
}
