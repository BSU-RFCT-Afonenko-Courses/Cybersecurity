const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bits=bytes=>Array.from(bytes,b=>b.toString(2).padStart(8,'0')).join('');
async function digest(text){if(!globalThis.crypto?.subtle)throw Error('В этой среде Web Crypto недоступен. Для вычисления SHA-256 откройте страницу по HTTPS или на localhost.');return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));}

export function hashBitExperiment({compact=false}={}) {
 const view=document.createElement('div');
 view.className=`course-viz course-viz-hash-bits${compact?' course-viz-hash-bits-compact':''}`;
 const element=(tag,text,className)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
 };
 const controls=element('div',undefined,'course-viz-hash-bits-controls');
 const presetLabel=element('label','Пример '),preset=element('select');
 for(const [value,label]of [['change','Один входной бит: abc → abb'],['collision','Коллизия Java: Aa и BB'],['custom','Свой текст']]){
  const option=element('option',label);option.value=value;preset.append(option);
 }
 presetLabel.append(preset);controls.append(presetLabel);
 const fields=element('div',undefined,'course-viz-hash-bits-inputs');
 const inputs=[];
 for(const [name,value]of [['До','abc'],['После','abb']]){
  const label=element('label',name),input=element('input');
  input.type='text';input.value=value;input.spellcheck=false;
  label.append(input);fields.append(label);inputs.push(input);
 }
 const legend=element('div',undefined,'course-viz-hash-bits-legend');
 for(const [className,label]of [['zero','0'],['one','1'],['changed','Изменившийся бит']]){
  const item=element('span'),mark=element('i',undefined,`course-viz-hash-bits-mark ${className}`);
  mark.setAttribute('aria-hidden','true');item.append(mark,document.createTextNode(label));legend.append(item);
 }
 const status=element('output',undefined,'course-viz-hash-bits-status');
 status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const results=element('div',undefined,'course-viz-hash-bits-results');
 function javaHash(text){
  let hash=0;
  // Java String.hashCode обрабатывает 16-битные элементы UTF-16, включая обе половины суррогатной пары.
  for(let i=0;i<text.length;i++)hash=(Math.imul(31,hash)+text.charCodeAt(i))|0;
  return new Uint8Array([hash>>>24,(hash>>>16)&255,(hash>>>8)&255,hash&255]);
 }
 function algorithm(name,values){
  const rows=values.map(bits),count=Array.from(rows[0]).reduce((sum,bit,i)=>sum+Number(bit!==rows[1][i]),0);
  const group=element('section',undefined,'course-viz-hash-bits-algorithm');
  const heading=element('div',undefined,'course-viz-hash-bits-heading');
  heading.append(element('h3',name),element('span',`Изменилось ${count} из ${rows[0].length} битов`,'course-viz-hash-bits-count'));
  group.append(heading);
  for(const [rowIndex,label]of ['До','После'].entries()){
   const row=element('div',undefined,'course-viz-hash-bits-row');
   row.append(element('div',label,'course-viz-hash-bits-row-label'));
   const grid=element('div',undefined,'course-viz-hash-bits-grid');
   grid.setAttribute('role','img');
   grid.setAttribute('aria-label',`${name}, ${label.toLowerCase()}: ${rows[rowIndex].length} битов.${rowIndex===1?` Изменилось ${count}.`:''} Полное значение доступно в числовом представлении.`);
   for(let i=0;i<rows[rowIndex].length;i++){
    const bit=rows[rowIndex][i],changed=rowIndex===1&&bit!==rows[0][i];
    const cell=element('span',undefined,`course-viz-hash-bits-bit${bit==='1'?' one':''}${changed?' changed':''}`);
    cell.title=changed?`Бит ${i+1}: ${rows[0][i]} → ${bit}`:`Бит ${i+1}: ${bit}`;
    cell.setAttribute('aria-hidden','true');grid.append(cell);
   }
   row.append(grid);group.append(row);
  }
  const details=element('details');
  details.append(element('summary','Числовое представление (hex)'),element('pre',`До:    ${hex(values[0])}\nПосле: ${hex(values[1])}`));
  group.append(details);
  return {group,count,total:rows[0].length};
 }
 let revision=0;
 async function update(){
  const token=++revision,text=inputs.map(input=>input.value);
  results.replaceChildren();results.setAttribute('aria-busy','true');
  results.textContent='Вычисление SHA-256…';status.textContent='Вычисление SHA-256…';
  try{
   const hashes=await Promise.all(text.map(digest));
   if(token!==revision)return;
   const sha=algorithm('SHA-256 · 256 битов',hashes);
   if(compact){
    results.replaceChildren(sha.group);
    status.textContent=`Изменившихся битов SHA-256: ${sha.count} из ${sha.total}.`;
   }else{
    const java=algorithm('Java String.hashCode · 32 бита',text.map(javaHash));
    results.replaceChildren(java.group,sha.group);
    status.textContent=`Изменившихся битов: Java — ${java.count} из ${java.total}; SHA-256 — ${sha.count} из ${sha.total}.`;
   }
  }catch(error){
   if(token!==revision)return;
   results.textContent=error.message;status.textContent=error.message;
  }finally{
   if(token===revision)results.setAttribute('aria-busy','false');
  }
 }
 preset.addEventListener('change',()=>{
  const values={change:['abc','abb'],collision:['Aa','BB']}[preset.value];
  if(!values)return;
  inputs.forEach((input,i)=>{input.value=values[i];});update();
 });
 for(const input of inputs)input.addEventListener('input',()=>{preset.value='custom';update();});
 if(!compact)view.append(controls);
 view.append(fields,legend,status,results);
 update();return view;
}
