const {chromium}=require('/opt/ai-lab-backstage/app/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const responses=[];
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}responses.push({path:path.relative(root,file),bodyBytes:data.length,gzipBytes:zlib.gzipSync(data).length});res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/plain');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/CI/visualizations/integration.test.mjs`);
 const session=await page.context().newCDPSession(page);await session.send('Runtime.enable');const initialHeap=await session.send('Runtime.getHeapUsage');
 const result=await page.evaluate(async()=>{
 const a=await import('/shared/visualizations/access-control/dac/lesson.js'),b=await import('/shared/visualizations/access-control/rbac/lesson.js');
 const ca=a.dacControls(),cb=a.dacControls(),cr=b.rbacControls();document.body.replaceChildren(ca,cb,cr);
 ca.querySelector('[data-action="next"]').click();
 const independent=ca.value.index===1&&cb.value.index===0&&cr.value.index===0;
 const first=await a.dacDiagram(ca.value,{acl:'Права'}),second=await a.dacDiagram(ca.value,{});document.body.append(first,second,await b.rbacDiagram(cr.value));
 const deletion=first.dataset.stage===second.dataset.stage&&first.querySelector('[data-explanation]').textContent==='Права'&&second.querySelector('[data-explanation]').textContent===ca.value.stage.explanation;
 const selected=first.querySelectorAll('.is-active').length>0;
 const dacModel=await import('/shared/visualizations/access-control/dac/model.js');
 const deniedQuery={subject:'boris',operation:'write'},borisTrace=dacModel.dacTrace(deniedQuery);
 const denied=await a.dacDiagram({query:deniedQuery,trace:borisTrace,index:borisTrace.length-1,stage:borisTrace.at(-1)});document.body.append(denied);
 const deniedFlow=['subject-boris','matrix-boris','acl-boris'].every(key=>denied.querySelector(`[data-key="${key}"]`).classList.contains('is-active'))&&denied.querySelector('[data-diagram="algorithm"] [data-key="deny"]').classList.contains('is-active')&&!denied.querySelector('[data-diagram="algorithm"] [data-key="allow"]').classList.contains('is-active');
 const rb=(await import('/shared/visualizations/access-control/rbac/model.js')).rbacTrace;let roleContext=true;
 for(const [subject,operation,active,inactive,result] of [['boris','grade','teacher','student','allow'],['lena','grade','student','teacher','deny'],['lena','submit','student','teacher','allow']]){
  const query={subject,context:'A',operation},trace=rb(query);
  roleContext=roleContext&&trace.at(-1).result===result;
  for(const name of ['roles','permission']){
   const index=trace.findIndex(s=>s.name===name),stage=trace[index],rendered=await b.rbacDiagram({query,trace,index,stage});document.body.append(rendered);
   roleContext=roleContext&&rendered.querySelector(`[data-key="${active}"]`).classList.contains('is-active')&&!rendered.querySelector(`[data-key="${inactive}"]`).classList.contains('is-active')&&rendered.querySelector(`[data-key="assignment-${subject}-${active}"]`).classList.contains('is-active');
   if(name==='permission'){
    roleContext=roleContext&&rendered.querySelector(`[data-key="permission-${operation}"]`).classList.contains('is-active');
    const edge=rendered.querySelector(`[data-key="grant-${active}-${operation}"]`);
    roleContext=roleContext&&(result==='allow'?edge?.classList.contains('is-active'):!edge?.classList.contains('is-active'));
   }
  }
 }
 ca.querySelector('[data-query]').value='2';ca.querySelector('[data-query]').dispatchEvent(new Event('change'));
 const anna=await a.dacDiagram(ca.value);document.body.append(anna);
 const subject=anna.querySelector('[data-key="subject-anna"]').classList.contains('is-active')&&!anna.querySelector('[data-key="subject-boris"]').classList.contains('is-active')&&ca.value.trace.at(-1).result==='allow';
 const crypto=await import('/shared/visualizations/crypto/lesson.js');const lcg=crypto.lcgTrainer(),lcg2=crypto.lcgTrainer(),caesar=crypto.caesarTrainer(),xor=crypto.xorTrainer();document.body.append(lcg,lcg2,caesar,xor);
 [...lcg.querySelectorAll('button')].find(b=>b.textContent==='Шаг').click();
 const trainer=lcg.querySelector('output').textContent.includes('x1 = 11.')&&lcg2.querySelector('output').textContent.startsWith('Шагов: 0.');
 const caesarInputs=caesar.querySelectorAll('input'),alphabet=caesar.querySelector('select');caesarInputs[0].value='ABC XYZ';caesarInputs[1].value='3';alphabet.value='latin';alphabet.dispatchEvent(new Event('input'));
 const cipher=caesar.querySelector('output').textContent,inverse=cipher.includes('Шифротекст: DEF ABC')&&cipher.includes('Расшифрование с противоположным сдвигом: ABC XYZ')&&xor.querySelectorAll('output')[1].textContent.includes('Обратно в UTF-8: Я');
 const auth=await import('/shared/visualizations/authentication/lesson.js'),integrity=await import('/shared/visualizations/data-integrity/lesson.js');
 for(const name of ['authenticationComparison','passkeyRegistration','passkeyLogin'])document.body.append(await auth[name]());
 for(const name of ['sumHashComparison','copyScales','raidComparison','sumCollision','byteChange','referenceReplacement','xorRecovery'])document.body.append(await integrity[name]());
 const ids=[...document.querySelectorAll('svg [id]')].map(n=>n.id);
 const unique=new Set(ids).size===ids.length;
 const diagrams=[...document.querySelectorAll('.course-viz')].filter(v=>[...v.children].some(n=>n.tagName==='BUTTON'&&n.textContent==='Следующий этап'));
 for(const view of diagrams)[...view.children].find(n=>n.textContent==='Следующий этап').click();
 const stages=diagrams.length===10&&diagrams.every(v=>v.dataset.stage==='n0');
 return {independent,deletion,selected,deniedFlow,roleContext,subject,trainer,inverse,unique,stages,svgCount:document.querySelectorAll('svg').length};
 });
 for(const [name,value] of Object.entries(result))if(name!=='svgCount')assert.equal(value,true,name);
 assert.deepEqual(errors,[]);const finalHeap=await session.send('Runtime.getHeapUsage');
 console.log(JSON.stringify({checks:result,measurement:{scope:'Компонентная проба из авторских ES-модулей; это не HTTP готовых целевых страниц',httpBodyBytes:responses.reduce((a,b)=>a+b.bodyBytes,0),gzipEstimateBytes:responses.reduce((a,b)=>a+b.gzipBytes,0),gzipExplanation:'Локальный расчёт gzip, сервер передавал несжатые тела',initialHeap,finalHeap,responses}},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
