const {chromium} = require('/opt/ai-lab-backstage/app/node_modules/playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root+'/')) {res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;} res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/plain');res.end(data);});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/CI/visualizations/mac.test.mjs`);
    const result=await page.evaluate(async()=>{
      const C=await import('/shared/visualizations/common/runtime.js');
      const M=await import('/shared/visualizations/access-control/mac/model.js');
      const a=C.createControls(M.macTrace,M.macQueries),b=C.createControls(M.macTrace,M.macQueries);
      document.body.replaceChildren(a,b);
      a.querySelector('[data-action="next"]').click();
      const independent=a.value.index===1 && b.value.index===0;
      const svg='<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow"/></defs><g id="request"><path marker-end="url(#arrow)"/></g><g id="levels"/><g id="read-rule"/><g id="allow"/></svg>';
      const selected=a.value;
      const first=C.renderStage({selected,model:svg,algorithm:svg,notes:{levels:'ПОЯСНЕНИЕ'}});
      const second=C.renderStage({selected,model:svg,algorithm:svg,notes:{}});
      document.body.append(first,second);
      const ids=[...document.querySelectorAll('svg [id]')].map(n=>n.id);
      const refs=[...document.querySelectorAll('[marker-end]')].map(n=>n.getAttribute('marker-end').slice(5,-1));
      const highlight=first.querySelector('[data-diagram="algorithm"] [data-key="levels"]').classList.contains('is-active');
      const deletion=first.dataset.stage===second.dataset.stage && second.querySelector('[data-explanation]').textContent==='' && highlight;
      a.querySelector('[data-query]').value='1';a.querySelector('[data-query]').dispatchEvent(new Event('change'));
      const reset=a.value.index===0 && b.value.index===0;
      const exportText=C.serializeSVG(first.querySelector('svg'));
      return {independent,unique:new Set(ids).size===ids.length,refs:refs.every(id=>document.getElementById(id)),deletion,reset,export:exportText.includes('xmlns=') && exportText.includes('stroke')};
    });
    for(const [name,value] of Object.entries(result)) assert.equal(value,true,name);
    console.log('Пройдены проверки runtime:',result);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
