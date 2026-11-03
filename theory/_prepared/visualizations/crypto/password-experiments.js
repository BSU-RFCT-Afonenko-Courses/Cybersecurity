function element(parent, tag, text) { const e=document.createElement(tag); if(text!==undefined)e.textContent=text; parent.append(e); return e; }
function field(parent,label,value,type='text') { const wrap=element(parent,'label',label+' '), input=element(wrap,'input'); input.type=type; input.value=value; wrap.style.display='block'; return input; }
function button(parent,label,action) { const b=element(parent,'button',label); b.type='button'; b.onclick=action; return b; }
function output(parent) {const o=element(parent,'output');o.setAttribute('aria-live','polite');o.style.cssText='display:block;white-space:pre-wrap;overflow-wrap:anywhere';return o;}
function hex(bytes) {return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function saltBytes(text) {const s=text.replace(/\s/g,'');if(!/^(?:[0-9a-fA-F]{2}){1,64}$/.test(s))throw Error('Соль: от 1 до 64 байт, по две hex-цифры на байт.');return Uint8Array.from(s.match(/../g),b=>parseInt(b,16));}
async function derive(password,salt,iterations) {
 if(!globalThis.crypto?.subtle)throw Error('Web Crypto недоступен. Откройте страницу через HTTPS или локальный сервер.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
export function passwordExperiment() {
 const view=document.createElement('div'); view.className='course-viz';
 element(view,'p','Введите только учебный пароль. Вычисление выполняется в этом браузере; запись живёт лишь на этой странице. Параметры демонстрации не являются универсальными настройками сервера.');
 const password=field(view,'Учебный пароль при регистрации','123456');
 const salt=field(view,'Соль, hex','000102030405060708090a0b0c0d0e0f');salt.style.width='min(100%, 36em)';
 const iterations=field(view,'Число итераций (1–1 000 000)',1000,'number');iterations.min='1';iterations.max='1000000';iterations.step='1';
 const buttons=element(view,'div'),recordView=output(view);
 const candidate=field(view,'Кандидат при входе','123456'); const loginButtons=element(view,'div'),status=output(view),comparison=output(view);
 let record=null,busy=false;
 function params(){const n=Number(iterations.value);if(!/^\d+$/.test(iterations.value)||!Number.isSafeInteger(n)||n<1||n>1000000)throw Error('Укажите целое число итераций от 1 до 1 000 000.');return {salt:saltBytes(salt.value),iterations:n};}
 async function run(action){if(busy)return;busy=true;for(const b of view.querySelectorAll('button'))b.disabled=true;status.textContent='Вычисление…';try{await action();}catch(e){status.textContent='Ошибка: '+e.message;}finally{busy=false;for(const b of view.querySelectorAll('button'))b.disabled=false;}}
 button(buttons,'Случайная соль',()=>{try{if(!globalThis.crypto?.getRandomValues)throw Error('Системный генератор браузера недоступен.');salt.value=hex(crypto.getRandomValues(new Uint8Array(16)));status.textContent='Новая соль готова. Сохранённая запись не изменена: для её замены нажмите «Зарегистрировать».';}catch(e){status.textContent=e.message;}});
 button(buttons,'Зарегистрировать',()=>run(async()=>{
  const p=params(),start=performance.now(),value=await derive(password.value,p.salt,p.iterations),elapsed=performance.now()-start;
  record={...p,value};
  recordView.textContent=`Сохранённая запись\nАлгоритм: PBKDF2-HMAC-SHA-256\nПараметры: ${p.iterations} итераций; результат 256 бит (32 байта)\nСоль, hex: ${hex(p.salt)}\nПроверочное значение, hex: ${hex(value)}\nВремя регистрации в этом браузере: ${elapsed.toFixed(2)} мс`;
  status.textContent='Запись сохранена. Изменение полей регистрации не меняет её до новой регистрации.';
 }));
 button(loginButtons,'Проверить вход',()=>run(async()=>{
  if(!record)throw Error('Сначала зарегистрируйте учебную запись.');
  const start=performance.now(),value=await derive(candidate.value,record.salt,record.iterations),elapsed=performance.now()-start;
  let difference=0;for(let i=0;i<value.length;i++)difference|=value[i]^record.value[i];
  status.textContent=`${difference===0?'Верно: кандидат совпал с сохранённой записью.':'Неверно: кандидат не совпал с сохранённой записью.'}\nИспользованы сохранённые соль и ${record.iterations} итераций; время в этом браузере: ${elapsed.toFixed(2)} мс.`;
 }));
 button(buttons,'Сравнить один пароль с двумя солями',()=>run(async()=>{
  const p=params(),other=p.salt.slice();other[other.length-1]^=1;const entered=password.value,start=performance.now();
  const first=await derive(entered,p.salt,p.iterations),second=await derive(entered,other,p.iterations);
  comparison.textContent=`Одинаковый учебный пароль, ${p.iterations} итераций, результат 256 бит\nСоль 1: ${hex(p.salt)}\nРезультат 1: ${hex(first)}\nСоль 2 (изменён один бит): ${hex(other)}\nРезультат 2: ${hex(second)}\nСравнение результатов: ${hex(first)===hex(second)?'совпадают':'различаются'}. Сохранённая запись не изменена.\nВремя двух вычислений в этом браузере: ${(performance.now()-start).toFixed(2)} мс.`;
  status.textContent='Сравнение готово. Разные соли разделяют вычисления для записей; сами по себе они не делают слабый пароль случайным.';
 }));
 recordView.textContent='Сохранённой записи ещё нет. Нажмите «Зарегистрировать».';
 return view;
}
function positiveInteger(text,label,maxDigits=100) {if(!/^\d+$/.test(text)||text.length>maxDigits||BigInt(text)<1n)throw Error(`${label}: положительное целое число, не более ${maxDigits} цифр.`);return BigInt(text);}
function ratio(n,d) {const q=n/d,r=n%d;if(r===0n)return q.toString();if(r*1000000n<d)return `${q} + ${r}/${d}`;const decimals=((r*1000000n)/d).toString().padStart(6,'0').replace(/0+$/,'');return `${q},${decimals}${(r*1000000n)%d?'…':''}`;}
export function passwordSearchCalculator() {
 const view=document.createElement('div');view.className='course-viz';
 element(view,'p','Модель: ровно L символов, каждый выбран независимо и равновероятно из A символов; повторения разрешены. Перебор без повторных проверок, постоянная заданная скорость. Человеческий пароль автоматически этой модели не соответствует.');
 const a=field(view,'Размер алфавита A',10),l=field(view,'Длина L (1–1000)',4),rate=field(view,'Условная скорость, проверок/с',100),result=output(view);
 function update(){try{
  const alphabet=positiveInteger(a.value,'A',7),length=positiveInteger(l.value,'L',4),speed=positiveInteger(rate.value,'Скорость');
  if(alphabet>1000000n||length>1000n)throw Error('Границы опыта: A ≤ 1 000 000, L ≤ 1000.');
  const n=alphabet**length,average=(n+1n)%2n===0n?((n+1n)/2n).toString():`${(n+1n)/2n},5`;
  result.textContent=`N = A^L = ${n}\nСреднее число проверок (N + 1)/2 = ${average}\nСреднее время: ${ratio(n+1n,2n*speed)} с\nВремя полного перебора: ${ratio(n,speed)} с\nСреднее время в годах по 365,25 суток: ${ratio(n+1n,2n*speed*31557600n)}.\nЧисло вариантов и среднее число проверок точные. Многоточие в записи времени означает усечение после 6 знаков; дробь сохраняет точность очень малых значений. Реальную скорость атакующего эта модель не измеряет.`;
 }catch(e){result.textContent=e.message;}}
 for(const input of [a,l,rate])input.addEventListener('input',update);update();return view;
}
