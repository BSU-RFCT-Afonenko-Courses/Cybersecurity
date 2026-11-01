import {caesar,xorBytes} from './model.js';
function element(parent,tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;}
function field(parent,label,value,type='text'){const wrap=element(parent,'label',label+' '),input=element(wrap,'input');input.type=type;input.value=value;wrap.style.display='block';return input;}
function select(parent,label,options){const wrap=element(parent,'label',label+' '),s=element(wrap,'select');s.setAttribute('aria-label',label);for(const [value,text] of options){const option=element(s,'option',text);option.value=value;}wrap.style.display='block';return s;}
function output(parent){const o=element(parent,'output');o.setAttribute('aria-live','polite');o.style.cssText='display:block;white-space:pre-wrap;overflow-wrap:anywhere';return o;}
function button(parent,label,action){const b=element(parent,'button',label);b.type='button';b.onclick=action;return b;}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(' ');}
function parseHex(text,label){const s=text.replace(/\s/g,'');if(s.length>8192)throw Error(`${label}: не более 4096 байт.`);if(!/^(?:[0-9a-fA-F]{2})*$/.test(s))throw Error(`${label}: введите по две hex-цифры на байт, пробелы разрешены.`);return s?Array.from(s.match(/../g),b=>parseInt(b,16)):[];}
export function caesarTrainer(){
 const view=document.createElement('div');view.className='course-viz';
 element(view,'p','Сдвигаются только буквы выбранного алфавита. Регистр, пробелы и пунктуация сохраняются. Это учебная подстановка, непригодная для современной защиты.');
 const text=field(view,'Целая фраза','Ёж, мир!'),alphabet=select(view,'Алфавит',[['ru','Русский: 33 буквы, включая Ё'],['latin','Латинский: 26 букв A–Z']]),shift=field(view,'Сдвиг (целое число)',3,'number'),result=output(view);
 const details=element(view,'details');element(details,'summary','Перебрать все сдвиги шифротекста');const variants=output(details);
 function update(){try{
  if(!/^-?\d+$/.test(shift.value))throw Error('Сдвиг должен быть целым числом.');
  if(text.value.length>4096)throw Error('Для опыта используйте фразу длиной не более 4096 символов.');
  const k=Number(shift.value),n=alphabet.value==='ru'?33:26,cipher=caesar(text.value,k,alphabet.value);
  result.textContent=`Алфавит: ${alphabet.value==='ru'?'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ':'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}\nСдвиг по кругу: ${((k%n)+n)%n} из ${n}\nШифротекст: ${cipher}\nРасшифрование с противоположным сдвигом: ${caesar(cipher,-k,alphabet.value)}`;
  variants.textContent=Array.from({length:n},(_,i)=>`Ключ ${i}: ${caesar(cipher,-i,alphabet.value)}`).join('\n');
 }catch(e){result.textContent=e.message;variants.textContent='';}}
 for(const input of [text,alphabet,shift])input.addEventListener('input',update);update();return view;
}
function applyStream(bytes,stream){if(stream.length!==bytes.length)throw Error('Полный поток должен содержать ровно столько байт, сколько сообщение (или шифротекст при расшифровании).');return bytes.map((b,i)=>b^stream[i]);}
function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));}catch{return 'Не является корректной строкой UTF-8: изменение бита может разрушить кодировку.';}}
export function xorTrainer(){
 const view=document.createElement('div');view.className='course-viz';
 element(view,'p','XOR работает с байтами. Выберите исходный текст UTF-8 или байты hex. Повтор одного учебного байта ключа не является одноразовым блокнотом: для него нужен независимый случайный секретный поток длиной с сообщение, используемый только один раз. XOR сам по себе не проверяет целостность.');
 const mode=select(view,'Вход',[['utf8','Текст UTF-8'],['hex','Байты hex']]),text=field(view,'Исходная текстовая фраза','Я'),sourceHex=field(view,'Исходные байты, hex','d0 af');
 const keyMode=select(view,'Ключ',[['byte','Один повторяемый учебный байт'],['stream','Полный поток байтов']]),key=field(view,'Байт ключа (десятичное число 0–255)',16,'number'),stream=field(view,'Полный поток, hex','10 20');
 const result=output(view),cipher=field(view,'Шифротекст hex: можно изменить бит и расшифровать',''),back=output(view);cipher.style.width='min(100%, 40em)';
 let original=[];
 function keyFor(bytes){if(keyMode.value==='stream')return applyStream(bytes,parseHex(stream.value,'Поток'));if(!/^\d+$/.test(key.value))throw Error('Ключ: целое число от 0 до 255.');return xorBytes(bytes,Number(key.value));}
 function decrypt(){try{const encrypted=parseHex(cipher.value,'Шифротекст'),restored=keyFor(encrypted);
  const changed=original.length===encrypted.length?original.reduce((n,b,i)=>n+((b^encrypted[i]).toString(2).replace(/0/g,'').length),0):null;
  back.textContent=`Восстановленные байты, hex: ${hex(restored)}\nОбратно в UTF-8: ${decode(restored)}\n${changed===null?'Длина шифротекста изменена.':`От исходного шифротекста отличаются ${changed} бит. Столько же бит меняется в восстановленных байтах при том же потоке.`}`;
 }catch(e){back.textContent=e.message;}}
 function encrypt(){try{sourceHex.disabled=mode.value!=='hex';text.disabled=mode.value!=='utf8';key.disabled=keyMode.value!=='byte';stream.disabled=keyMode.value!=='stream';
  const bytes=mode.value==='utf8'?Array.from(new TextEncoder().encode(text.value)):parseHex(sourceHex.value,'Исходные байты');if(bytes.length>4096)throw Error('Для опыта используйте не более 4096 байт.');
  original=keyFor(bytes);cipher.value=hex(original);result.textContent=`Исходные байты${mode.value==='utf8'?' UTF-8':''}, hex: ${hex(bytes)}\nЧисло байт: ${bytes.length}\nШифротекст, hex: ${hex(original)}`;decrypt();
 }catch(e){result.textContent=e.message;cipher.value='';back.textContent='';original=[];}}
 button(view,'Расшифровать отредактированный шифротекст',decrypt);
 button(view,'Изменить младший бит первого байта',()=>{try{const bytes=parseHex(cipher.value,'Шифротекст');if(!bytes.length)throw Error('Для изменения бита нужен непустой шифротекст.');bytes[0]^=1;cipher.value=hex(bytes);decrypt();}catch(e){back.textContent=e.message;}});
 for(const input of [mode,text,sourceHex,keyMode,key,stream])input.addEventListener('input',encrypt);cipher.addEventListener('input',decrypt);
 const repeated=element(view,'div');element(repeated,'p','Повтор одного потока на двух сообщениях: CAT и DOG, K = 10 20 30 (hex).');
 const example=output(repeated),a=Array.from(new TextEncoder().encode('CAT')),b=Array.from(new TextEncoder().encode('DOG')),k=[0x10,0x20,0x30],c1=applyStream(a,k),c2=applyStream(b,k),cross=applyStream(c1,c2),restored=applyStream(cross,a);
 example.textContent=`M₁ = CAT: ${hex(a)}\nM₂ = DOG: ${hex(b)}\nC₁ = M₁ XOR K: ${hex(c1)}\nC₂ = M₂ XOR K: ${hex(c2)}\nC₁ XOR C₂ = M₁ XOR M₂: ${hex(cross)}\nПри известном M₁: (C₁ XOR C₂) XOR M₁ = ${hex(restored)} = ${decode(restored)}. Для восстановления K знать не потребовалось.`;
 encrypt();return view;
}
