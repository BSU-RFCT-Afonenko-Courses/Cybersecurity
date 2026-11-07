// Измерение готовых страниц без повторного рендера. Аргументы: корень HTTP и пути HTML.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/ai-lab-backstage/app/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(process.argv[2]||'.'),targets=process.argv.slice(3);
if(!targets.length)throw Error('Укажите корень публикации и пути готовых HTML');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.html':'text/html','.css':'text/css','.json':'application/json'})[ext]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const output=[];
 for(const target of targets){
 const page=await browser.newPage();const responses=[],errors=[],pending=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{pending.push((async()=>{if(!response.url().startsWith('http://127.0.0.1:'))return;try{const body=await response.body();responses.push({url:new URL(response.url()).pathname,status:response.status(),bodyBytes:body.length,gzipEstimateBytes:zlib.gzipSync(body).length});}catch{}})());});
 const session=await page.context().newCDPSession(page);await session.send('Runtime.enable');
 const started=Date.now();await page.goto(`http://127.0.0.1:${server.address().port}/${target}`,{waitUntil:'networkidle'});await page.waitForTimeout(1000);const firstOpenMs=Date.now()-started;
 const firstHeap=await session.send('Runtime.getHeapUsage');
 const viewed=await page.evaluate(()=>{let controls=0,diagrams=0;if(window.Reveal){for(let i=0;i<Reveal.getTotalSlides();i++)Reveal.next();}for(const view of document.querySelectorAll('.course-viz-controls')){const select=view.querySelector('[data-query]');for(let i=0;i<select.options.length;i++){select.value=String(i);select.dispatchEvent(new Event('change'));const next=view.querySelector('[data-action="next"]');while(!next.disabled)next.click();}controls++;}for(const view of document.querySelectorAll('.course-viz')){const next=[...view.children].find(n=>n.tagName==='BUTTON'&&n.textContent==='Следующий этап');if(next){for(let i=0;i<8;i++)next.click();diagrams++;}}return {controls,diagrams};});
 await page.waitForTimeout(300);await Promise.all(pending);const finalHeap=await session.send('Runtime.getHeapUsage');
 output.push({target,firstOpenMs,viewed,httpBodyBytes:responses.reduce((a,b)=>a+b.bodyBytes,0),gzipEstimateBytes:responses.reduce((a,b)=>a+b.gzipEstimateBytes,0),firstHeap,finalHeap,errors,responses});await page.close();
 }
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),note:'Сервер передавал несжатые HTTP-тела. gzip — локальная оценка; Runtime.getHeapUsage — память JS/embedder данной вкладки, не размер загрузки и не RSS браузера.',pages:output},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
