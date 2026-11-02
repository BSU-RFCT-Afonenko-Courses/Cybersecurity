// Один небольшой пример готовых outputs; Quarto render и Course Core не запускаются.
import assert from 'node:assert/strict';
import { composeNavigation } from '../../_extensions/Afonenko-Course-Tools/course-navigation/public.ts';
import { parseHtml, elements, attr, content } from '../../_extensions/Afonenko-Course-Tools/course-navigation/html/document.ts';
const stage = await Deno.makeTempDir({prefix:'navigation-composition-'});
const source = (title: string, body = '', reveal = false) => '<!doctype html><html><head><title>' + title + '</title></head><body>' + (reveal ? '<div class="reveal"><div class="slides"></div></div><script>Reveal.initialize({});</script><script id="course-navigation-context" type="application/json">{"links":[{"text":"Старый курс","href":"https://example.org/course/","scope":"course"},{"text":"Исходники","href":"https://github.com/example/course","scope":"repository"}]}</script>' : '<header id="quarto-header"><nav class="navbar"><a class="navbar-brand" href="https://example.org/course/">Старое название</a><ul class="navbar-nav"><li><a href="https://example.org/course/theory/">Старое меню</a></li></ul><div id="quarto-search"></div></nav></header><main id="quarto-document-content"><header id="title-block-header"><h1 class="title">' + title + '</h1></header>') + body + (reveal ? '' : '</main>') + '</body></html>';
const files = {'index.html':source('Портал'), 'theory/index.html':source('Теория'), 'theory/nested/chapter.html':source('Вложенная глава'), 'tasks/index.html':source('Задания — Полное название курса','<section id="sec-tasks" class="level1"><h1><span class="header-section-number">1</span> Задания<a class="anchorjs-link">Anchor</a></h1></section><div class="qrc-probes" data-qrc-namespace="tasks"><span class="qrc-probe" data-qrc-id="sec-tasks" data-qrc-title="Старый заголовок QRC" data-qrc-style="default"><a class="qrc-anchor" href="#sec-tasks">Задания</a></span><span class="qrc-probe" data-qrc-id="sec-tasks" data-qrc-style="number"><a class="qrc-anchor" href="#sec-tasks">1</a></span></div>'), 'slides/index.html':source('Слайды','<a href="lesson.html#/first">Презентация</a>'), 'slides/lesson.html':source('Презентация','',true)};
for (const [name, html] of Object.entries(files)) {await Deno.mkdir(stage+'/'+name.split('/').slice(0,-1).join('/'),{recursive:true});await Deno.writeTextFile(stage+'/'+name,html);}
const context = {stage,outputs:Object.keys(files).map(p=>stage+'/'+p),title:'Общий курс',members:[{id:'portal',mount:'',title:'Портал'},{id:'theory',mount:'theory',title:'Теория'},{id:'tasks',mount:'tasks',title:'Задания'},{id:'practice',mount:'slides',title:'Слайды'}]};
try {
 await composeNavigation(context);
 const chapter=await Deno.readTextFile(stage+'/theory/nested/chapter.html');
 const nodes=elements(parseHtml(chapter));
 const links=nodes.filter(n=>attr(n,'data-course-link'));
 assert.deepEqual(links.map(n=>[content(n),attr(n,'href')]),[['Курс','../../'],['Теория','../'],['Задания','../../tasks/'],['Слайды','../../slides/']]);
 assert.equal(links.filter(n=>attr(n,'aria-current')==='page').map(n=>attr(n,'data-course-link')).join(','),'theory');
 assert.equal(nodes.filter(n=>attr(n,'id')==='quarto-search').length,1);
 assert.ok(!chapter.includes('https://example.org'));
 for (const base of ['http://localhost:8080/','https://example.org/Cybersecurity/','https://example.org/courses/security/']) assert.equal(new URL(attr(links[2],'href')!,base+'theory/nested/chapter.html').href,base+'tasks/');
 const reveal=await Deno.readTextFile(stage+'/slides/lesson.html');
 const payload=JSON.parse(content(elements(parseHtml(reveal)).find(n=>attr(n,'id')==='course-navigation-context')!));
 assert.deepEqual(payload.links.slice(0,4).map((n:any)=>[n.id,n.href]),[['portal','../'],['theory','../theory/'],['tasks','../tasks/'],['practice','./']]);
 assert.equal(payload.links.at(-1).scope,'repository');
 const indexNodes=elements(parseHtml(await Deno.readTextFile(stage+'/slides/index.html')));
 assert.equal(attr(indexNodes.find(n=>attr(n,'href')==='lesson.html#/first')!,'target'),'_blank');
 const before=await Deno.readTextFile(stage+'/index.html');
 await assert.rejects(()=>composeNavigation({...context,members:context.members.concat([{id:'absent',mount:'absent',title:'Нет страницы'}])}),/NAVIGATION.COMPOSITION_INVALID/);
 assert.equal(await Deno.readTextFile(stage+'/index.html'),before);
 await composeNavigation(context);
 assert.equal(await Deno.readTextFile(stage+'/index.html'),before,'Повторный вызов не дублирует меню');
 console.log('Проверено: единое HTML/Reveal меню, относительные ссылки и URL-префиксы, сохранение репозитория/поиска, отсутствующий вход и повторный вызов.');
} finally {await Deno.remove(stage,{recursive:true});}
