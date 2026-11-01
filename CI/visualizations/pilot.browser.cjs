const {chromium}=require('/opt/ai-lab-backstage/app/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),view=process.argv[2]||'student';
const imageDir=process.env.COURSE_VIZ_SCREENSHOTS||'/tmp/task4-screenshots';
fs.mkdirSync(imageDir,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const missing=[],server=http.createServer((req,res)=>{
  const url=decodeURIComponent(req.url.split('?')[0]);
  const match=url.match(/^\/(theory|seminars)\/(.*)$/);
  if(url==='/favicon.ico'){res.writeHead(204).end();return;}
  if(!match){res.writeHead(404).end();return;}
  const base=path.join(root,match[1],'_output',view),file=path.resolve(base,match[2].replace(/^\/+/,''));
  if(!file.startsWith(base+'/')){res.writeHead(403).end();return;}
  fs.readFile(file,(error,data)=>{if(error){missing.push(url);res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  for(const [project,file] of [['theory','access-control/visualization-pilot.html'],['seminars','visualization-pilot.html']]){
   const page=await browser.newPage({viewport:{width:1440,height:1080},acceptDownloads:true});const errors=[],bodies=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('response',async response=>{if(response.url().startsWith('http://127.0.0.1:')){try{bodies.push(await response.text());}catch{}}});
   page.on('console',msg=>{if(msg.type()==='error')console.error(project,msg.text());});
   await page.goto(`http://127.0.0.1:${server.address().port}/${project}/${file}`,{waitUntil:'networkidle'});
   try {await page.waitForSelector('.course-viz-stage',{state:'attached',timeout:10000});} catch(error){console.error('Ошибки OJS:',await page.locator('.observablehq--error').allTextContents(),'Сеть:',missing,'JS:',errors);await page.screenshot({path:path.join(imageDir,'failure.png')});throw error;}
   await page.waitForFunction(()=>document.querySelectorAll('.course-viz-stage').length===2);
   assert.equal(await page.locator('.observablehq--error').count(),0);
   const state=async()=>page.locator('.course-viz-stage').evaluateAll(nodes=>nodes.map(n=>n.dataset.stage));
   assert.deepEqual(await state(),['request','request']);
   if(project==='seminars')await page.evaluate(()=>Reveal.slide(1));
   const controls=page.locator('.course-viz-controls');
   await controls.nth(0).locator('[data-action="next"]').click();
   await page.waitForFunction(()=>document.querySelector('.course-viz-stage').dataset.stage==='levels');
   assert.deepEqual(await state(),['levels','request']);
   const same=await page.locator('.course-viz-stage').nth(0).evaluate(node=>[...node.querySelectorAll('[data-stage]')].every(n=>n.dataset.stage===node.dataset.stage));
   assert.ok(same,'обе схемы и пояснение используют один этап');
   const caption=await page.locator('#fig-mac-decision figcaption').textContent();
   assert.match(caption,/Применение мандатной политики/);
   await page.screenshot({path:path.join(imageDir,`${project}-${view}-levels.png`),fullPage:project==='theory'});
   // Отдельно доводим второй экземпляр до этапа, пояснение которого удалено.
   if(project==='seminars')await page.evaluate(()=>Reveal.slide(2));
   await controls.nth(1).locator('[data-action="next"]').click();
   await page.waitForFunction(()=>document.querySelectorAll('.course-viz-stage')[1].dataset.stage==='levels');
   assert.equal(await page.locator('.course-viz-stage').nth(1).locator('[data-explanation]').textContent(),'');
   assert.ok(await page.locator('.course-viz-stage').nth(1).locator('[data-diagram="algorithm"] [data-key="levels"].is-active').count());
   await page.screenshot({path:path.join(imageDir,`${project}-${view}-without-note.png`),fullPage:project==='theory'});
   for(let i=0;i<2;i++){
    await controls.nth(1).locator('[data-action="next"]').click();
    await page.waitForFunction(index=>document.querySelectorAll('.course-viz-stage')[1].dataset.stage===(index===0?'read-rule':'result'),i);
   }
   assert.equal(await page.locator('.course-viz-stage').nth(1).getAttribute('data-result'),'deny');
   const ids=await page.locator('.course-viz svg [id]').evaluateAll(nodes=>nodes.map(n=>n.id));
   assert.equal(new Set(ids).size,ids.length);
   assert.equal(await page.getByRole('button',{name:/Сохранить SVG/}).count(),0);
   assert.equal(await page.locator('#fig-mac-decision figcaption').textContent(),caption,'подпись Quarto сохраняется');
   assert.equal(await page.locator('.quarto-unresolved-ref').count(),0);
   const overview=page.locator('#fig-mac-overview img, img#fig-mac-overview');
   assert.equal(await overview.evaluate(img=>img.complete&&img.naturalWidth>0),true);
   if(project==='seminars'){
    assert.equal(await page.locator('#exr-fundamentals-event-or-incident').count(),1);
    assert.equal(await page.locator('#sol-fundamentals-event-or-incident').count(),view==='student'?0:1);
    assert.equal(await page.locator('#sol-fundamentals-cia-cases').count(),1);
    if(view==='student'){
     assert.ok(!bodies.join('\n').includes('Главная ловушка'),'закрытый ключ отсутствует во всех доставленных ресурсах');
     assert.ok(!fs.existsSync(path.join(root,project,'_output',view,'_prepared/bank-fragments')),'банковские QMD не публикуются');
    } else assert.ok(bodies.join('\n').includes('Главная ловушка'),'full содержит обычный ключ');
    await page.evaluate(()=>Reveal.slide(3));
    const exercise=page.locator('#exr-fundamentals-event-or-incident');
    assert.equal(await exercise.isVisible(),true);
    const bounds=await exercise.boundingBox();
    const stageBounds=await page.locator('.reveal').boundingBox();
    assert.ok(bounds.y>=stageBounds.y && bounds.y+bounds.height<=stageBounds.y+stageBounds.height,'условие целиком помещается над нижней панелью');
    await page.screenshot({path:path.join(imageDir,`reveal-${view}-question.png`)});
    await page.evaluate(()=>Reveal.slide(4));
    await page.screenshot({path:path.join(imageDir,`reveal-${view}-demonstration.png`)});
   }
   assert.deepEqual(errors,[]);await page.close();console.log(`${project}/${view}: OJS, два экземпляра, этапы, подписи, SVG и экспорт — успешно`);
  }
  assert.deepEqual(missing,[],'все локальные ресурсы доставлены в output');
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
