import {lcgSequence} from './model.js';

export function lcgTrainer({compact=false}={}) {
 const view=document.createElement('div');view.className='course-viz';
 const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:.6rem;align-items:end';view.append(controls);
 const inputs={};
 for(const [name,value] of [['a',5],['c',1],['m',16],['x₀',2],['Число шагов',16]]) {
  const label=document.createElement('label'),input=document.createElement('input');label.textContent=name+' ';input.type='number';input.step='1';input.value=value;input.style.width='5rem';label.append(input);controls.append(label);inputs[name]=input;
 }
 const output=document.createElement('output');output.setAttribute('aria-live','polite');output.style.display='block';
 const trace=document.createElement('p'),bits=document.createElement('p'),period=document.createElement('p'),frequency=document.createElement('p');
 bits.style.overflowWrap='anywhere';
 const pairs=document.createElementNS('http://www.w3.org/2000/svg','svg');pairs.setAttribute('viewBox','0 0 340 235');pairs.setAttribute('role','img');pairs.setAttribute('aria-label','Пары соседних состояний: по горизонтали текущее, по вертикали следующее');pairs.style.cssText='width:100%;max-width:440px;height:auto';
 let values=[],params=null;
 function read(){const p=['x₀','a','c','m'].map(name=>{if(!inputs[name].value.trim())throw Error('Заполните все параметры.');return Number(inputs[name].value);});lcgSequence(...p,0);return p;}
 function render(message='') {
  const [seed,a,c,m]=params,state=values.length?values.at(-1):seed;
  output.textContent=message||`Шагов: ${values.length}. Текущее состояние x${values.length} = ${state}. Следующий шаг: (${a} × ${state} + ${c}) mod ${m} = ${(a*state+c)%m}.`;
  trace.textContent=`Выходы (${values.length}): ${values.length?values.join(' → '):'пока нет'}.`;
  const ones=values.reduce((n,x)=>n+(x&1),0);bits.textContent=`Младшие биты: ${values.length?values.map(x=>x&1).join(''):'пока нет'}. Единиц: ${ones}; нулей: ${values.length-ones}.`;
  const counts=new Map();for(const x of values)counts.set(x,(counts.get(x)||0)+1);
  frequency.textContent='Частоты наблюдавшихся значений (значение: число): '+([...counts].sort((x,y)=>x[0]-y[0]).map(([x,n])=>`${x}: ${n}`).join('; ')||'пока нет')+'.';
  const states=[seed,...values],first=new Map();let repeat=null;
  for(let i=0;i<states.length;i++){if(first.has(states[i])){repeat=[first.get(states[i]),i];break;}first.set(states[i],i);}
  period.textContent=repeat?`Повтор состояния ${states[repeat[1]]} на шагах ${repeat[0]} и ${repeat[1]}; длина обнаруженного цикла ${repeat[1]-repeat[0]}.`:'Повтор состояния в показанной трассе пока не найден. Это не доказывает большого периода.';
  pairs.replaceChildren();const ns=pairs.namespaceURI;
  function add(tag,attrs,text){const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;pairs.append(el);}
  add('path',{d:'M35 10 V200 H325',fill:'none',stroke:'currentColor'});add('text',{x:180,y:230,'text-anchor':'middle','font-size':12},'Текущее состояние xₙ');add('text',{x:8,y:105,transform:'rotate(-90 8 105)','text-anchor':'middle','font-size':12},'Следующее xₙ₊₁');
  const scale=Math.max(1,m-1);for(let i=0;i<values.length;i++)add('circle',{cx:35+285*states[i]/scale,cy:200-185*values[i]/scale,r:3,fill:'#2563a6',opacity:.7});
  add('text',{x:35,y:215,'font-size':10},'0');add('text',{x:325,y:215,'text-anchor':'end','font-size':10},String(m-1));
 }
 function reset(){values=[];try{params=read();render();}catch(e){params=null;output.textContent=e.message;trace.textContent=bits.textContent=period.textContent=frequency.textContent='';pairs.replaceChildren();}}
 function advance(count){try{const p=read();if(!Number.isSafeInteger(count)||count<1||count>100)throw Error('Число шагов должно быть целым от 1 до 100.');if(values.length+count>100)throw Error('В трассе допускается не более 100 шагов. Нажмите «Сброс».');params=p;const old=values.length?values.at(-1):p[0];values.push(...lcgSequence(old,p[1],p[2],p[3],count));const prev=values.length>1?values.at(-2):p[0];render(`Шагов: ${values.length}. Последняя подстановка: (${p[1]} × ${prev} + ${p[2]}) mod ${p[3]} = ${values.at(-1)}. Текущее состояние x${values.length} = ${values.at(-1)}.`);}catch(e){output.textContent=e.message;}}
 for(const [label,action]of [['Шаг',()=>advance(1)],['Выполнить N шагов',()=>advance(inputs['Число шагов'].value.trim()?Number(inputs['Число шагов'].value):NaN)],['Сброс',reset]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;controls.append(b);}
 for(const name of ['a','c','m','x₀'])inputs[name].addEventListener('input',reset);
 const note=document.createElement('p');note.textContent='Равномерные частоты не доказывают непредсказуемость. Точки показывают пары (xₙ, xₙ₊₁), включая переход из начального состояния. Для короткого периода попробуйте a = 4, c = 1, m = 16, x₀ = 2 и выполните 16 шагов.';
 if(compact){view.append(output,trace);const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Частоты, цикл и соседние состояния';details.append(summary,bits,frequency,period,pairs,note);view.append(details);}else view.append(output,trace,bits,frequency,period,pairs,note);reset();return view;
}

export function publicHashChain() {
 const view=document.createElement('div');view.className='course-viz';
 const note=document.createElement('p');note.textContent='Начальные байты — UTF-8 строки «2». Затем SHA-256 получает байты предыдущего состояния, а не его hex-запись. Всё состояние опубликовано: следующий блок можно вычислить напрямую.';
 const result=document.createElement('output');result.setAttribute('aria-live','polite');result.style.cssText='display:block;overflow-wrap:anywhere;white-space:pre-wrap';
 let state=new TextEncoder().encode('2'),count=0,ones=0;const history=[];
 const step=document.createElement('button');step.type='button';step.textContent='Вычислить следующий блок';step.onclick=async()=>{step.disabled=true;try{if(!globalThis.crypto?.subtle)throw Error('В этой среде Web Crypto недоступен. Откройте страницу по HTTPS или на localhost.');if(count>=32)throw Error('Показаны 32 блока. Нажмите «Сброс».');state=new Uint8Array(await crypto.subtle.digest('SHA-256',state));count++;for(const b of state)for(let k=0;k<8;k++)ones+=(b>>k)&1;history.push(`${count}: ${Array.from(state,b=>b.toString(16).padStart(2,'0')).join('')}`);result.textContent=history.join('\n')+`\nЕдиниц: ${ones}; нулей: ${count*256-ones}. Открытое состояние позволяет вычислить следующий блок.`;}catch(e){result.textContent=e.message;}finally{step.disabled=false;}};
 const reset=document.createElement('button');reset.type='button';reset.textContent='Сброс';reset.onclick=()=>{if(step.disabled)return;state=new TextEncoder().encode('2');count=ones=0;history.length=0;result.textContent='Начальное состояние: UTF-8 «2» (hex 32).';};
 view.append(note,step,reset,result);reset.click();return view;
}
