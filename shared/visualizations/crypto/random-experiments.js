import {lcgSequence} from './model.js';

export function lcgTrainer({Plot,compact=false}={}) {
 const view=document.createElement('div');view.className='course-viz course-viz-lcg';view.classList.toggle('course-viz-lcg-compact',compact);
 const formula=document.createElement('p');formula.className='course-viz-lcg-formula';formula.textContent='xₙ₊₁ = (a × xₙ + c) mod m';
 const controls=document.createElement('div');controls.className='course-viz-lcg-controls';
 const inputs={};
 for(const [name,value] of [['a',5],['c',1],['m',16],['x₀',2],['Число шагов',16]]) {
  const label=document.createElement('label'),input=document.createElement('input');label.textContent=name+' ';input.type='number';input.step='1';input.value=value;label.append(input);controls.append(label);inputs[name]=input;
 }
 const output=document.createElement('output');output.setAttribute('aria-live','polite');
 const chart=document.createElement('div');chart.className='course-viz-lcg-chart';
 let values=[],params=null;
 function read(){const p=['x₀','a','c','m'].map(name=>{if(!inputs[name].value.trim())throw Error('Заполните все параметры.');return Number(inputs[name].value);});lcgSequence(...p,0);return p;}
 function render() {
  const [seed,a,c,m]=params,state=values.length?values.at(-1):seed,previous=values.length>1?values.at(-2):seed;
  output.textContent=values.length?`Шагов: ${values.length}. x${values.length} = ${state}. (${a} × ${previous} + ${c}) mod ${m} = ${state}.`:`Шагов: 0. x₀ = ${seed}. Следующий шаг: (${a} × ${seed} + ${c}) mod ${m} = ${(a*seed+c)%m}.`;
  const frequencies=new Map();for(const value of values)frequencies.set(value,(frequencies.get(value)||0)+1);
  const counts=[...frequencies].sort((a,b)=>a[0]-b[0]).map(([value,count])=>({value,count}));
  view.value={count:values.length,state,counts};chart.replaceChildren();
  if(Plot)chart.append(Plot.plot({
   width:640,height:compact?180:230,marginLeft:44,marginBottom:38,
   ariaLabel:'Частоты состояний линейного конгруэнтного генератора',
   x:{label:'Состояние x',domain:[-.5,m-.5],ticks:m<=16?m:6,tickFormat:x=>Number.isInteger(x)?x:''},
   y:{label:'Частота',domain:[0,Math.max(1,...counts.map(d=>d.count))],grid:true,ticks:4,tickFormat:y=>Number.isInteger(y)?y:''},
   marks:[Plot.rectY(counts,{x1:d=>d.value-.5,x2:d=>d.value+.5,y:'count',insetLeft:.5,insetRight:.5,fill:'#2563a6',title:d=>`${d.value}: ${d.count}`}),Plot.ruleY([0])]
  }));
 }
 function reset(){values=[];try{params=read();render();}catch(e){params=null;view.value=null;output.textContent=e.message;chart.replaceChildren();}}
 function advance(count){try{const p=read();if(!Number.isSafeInteger(count)||count<1||count>100)throw Error('Число шагов должно быть целым от 1 до 100.');if(values.length+count>100)throw Error('Допускается не более 100 шагов. Нажмите «Сброс».');params=p;const old=values.length?values.at(-1):p[0];values.push(...lcgSequence(old,p[1],p[2],p[3],count));render();}catch(e){output.textContent=e.message;}}
 for(const [label,action]of [['Шаг',()=>advance(1)],['Выполнить N шагов',()=>advance(inputs['Число шагов'].value.trim()?Number(inputs['Число шагов'].value):NaN)],['Сброс',reset]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;controls.append(b);}
 for(const name of ['a','c','m','x₀'])inputs[name].addEventListener('input',reset);
 view.append(formula,controls,output,chart);reset();return view;
}
