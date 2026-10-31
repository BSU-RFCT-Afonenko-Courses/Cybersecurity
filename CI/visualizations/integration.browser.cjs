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
 const deletion=first.dataset.stage===second.dataset.stage&&second.querySelector('[data-explanation]').textContent==='';
 const selected=first.querySelectorAll('.is-active').length>0;
 const bobTrace=(await import('/shared/visualizations/access-control/dac/model.js')).dacTrace({subject:'bob',operation:'write'});
 const denied=await a.dacDiagram({stage:bobTrace.at(-1)});document.body.append(denied);
 const deniedFlow=!denied.querySelector('[data-key="access-flow"]').classList.contains('is-active')&&denied.querySelector('[data-key="subject-bob"]').classList.contains('is-active')&&denied.querySelector('[data-diagram="algorithm"] [data-key="deny"]').classList.contains('is-active');
 const rb=(await import('/shared/visualizations/access-control/rbac/model.js')).rbacTrace;let roleContext=true;
 for(const [context,active,inactive] of [['A','teacher','student'],['B','student','teacher']]){const trace=rb({subject:'anna',context,operation:'grade'});for(const name of ['roles','permission']){const stage=trace.find(s=>s.name===name);const rendered=await b.rbacDiagram({stage});document.body.append(rendered);roleContext=roleContext&&rendered.querySelector(`[data-key="${active}"]`).classList.contains('is-active')&&!rendered.querySelector(`[data-key="${inactive}"]`).classList.contains('is-active')&&rendered.querySelector(`[data-key="assignment-${context}-${active}"]`).classList.contains('is-active');}}
 ca.querySelector('[data-query]').value='2';ca.querySelector('[data-query]').dispatchEvent(new Event('change'));
 const alice=await a.dacDiagram(ca.value);document.body.append(alice);
 const subject=alice.querySelector('[data-key="subject-alice"]').classList.contains('is-active')&&!alice.querySelector('[data-key="subject-bob"]').classList.contains('is-active')&&ca.value.trace.at(-1).result==='allow';
 const crypto=await import('/shared/visualizations/crypto/lesson.js');const lcg=crypto.lcgTrainer(),lcg2=crypto.lcgTrainer(),cx=crypto.caesarXorTrainer();document.body.append(lcg,lcg2,cx);
 const answer=lcg.querySelectorAll('input')[4];answer.value='0';[...lcg.querySelectorAll('button')].find(b=>b.textContent==='Проверить').click();
 const trainer=lcg.querySelector('output').textContent.startsWith('Верно')&&lcg2.querySelector('output').textContent==='';
 [...cx.querySelectorAll('button')].find(b=>b.textContent==='Обратное преобразование').click();const inverse=cx.querySelectorAll('output')[1].textContent==='Цезарь: ABC; XOR: ABC.';
 const auth=await import('/shared/visualizations/authentication/lesson.js'),integrity=await import('/shared/visualizations/data-integrity/lesson.js');
 for(const name of ['authenticationComparison','passkeyRegistration','passkeyLogin'])document.body.append(await auth[name]());
 for(const name of ['seedDiagram','symmetricDiagram','hashDiagram'])document.body.append(await crypto[name]());
 for(const name of ['sumHashComparison','copyScales','raidComparison','sumCollision','byteChange','referenceReplacement','xorRecovery'])document.body.append(await integrity[name]());
 const ids=[...document.querySelectorAll('svg [id]')].map(n=>n.id);
 const unique=new Set(ids).size===ids.length;
 const diagrams=[...document.querySelectorAll('.course-viz')].filter(v=>[...v.children].some(n=>n.tagName==='BUTTON'&&n.textContent==='Следующий этап'));
 for(const view of diagrams)[...view.children].find(n=>n.textContent==='Следующий этап').click();
 const stages=diagrams.length===13&&diagrams.every(v=>v.dataset.stage==='n0');
 return {independent,deletion,selected,deniedFlow,roleContext,subject,trainer,inverse,unique,stages,svgCount:document.querySelectorAll('svg').length};
 });
 for(const [name,value] of Object.entries(result))if(name!=='svgCount')assert.equal(value,true,name);
 assert.deepEqual(errors,[]);const finalHeap=await session.send('Runtime.getHeapUsage');
 console.log(JSON.stringify({checks:result,measurement:{scope:'Компонентная проба из авторских ES-модулей; это не HTTP готовых целевых страниц',httpBodyBytes:responses.reduce((a,b)=>a+b.bodyBytes,0),gzipEstimateBytes:responses.reduce((a,b)=>a+b.gzipBytes,0),gzipExplanation:'Локальный расчёт gzip, сервер передавал несжатые тела',initialHeap,finalHeap,responses}},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
