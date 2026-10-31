// Обновляет только схемы доступа. Сборка Quarto не запускается.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const assets = new URL('../shared/access-control/', import.meta.url);
const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const read = name => readFileSync(new URL(name, assets), 'utf8');
const writeOrCheck = (url, text) => {
  if (check) {
    let current;
    try { current = readFileSync(url, 'utf8'); } catch { current = null; }
    if (current !== text) throw new Error(`Результат устарел: ${fileURLToPath(url)}. Выполните node CI/build-access-examples.mjs.`);
  } else {
    mkdirSync(new URL('./', url), {recursive: true});
    writeFileSync(url, text);
  }
};
const source = new URL('example.yml', assets);
let parsed;
try {
  const json = execFileSync('python3', ['-c',
    'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1], encoding="utf-8")), ensure_ascii=False))',
    fileURLToPath(source)], {encoding: 'utf8'});
  parsed = JSON.parse(json);
} catch (error) {
  throw new Error('Не удалось прочитать example.yml. Проверьте отступы YAML и наличие Python 3 с PyYAML. ' + (error.stderr?.toString().trim() || error.code || error.message));
}
const requireValue = (condition, message) => { if (!condition) throw new Error(`example.yml: ${message}`); };
requireValue(parsed && typeof parsed === 'object', 'ожидается описание примера.');
for (const key of ['subjects', 'objects', 'levels', 'roles', 'dac', 'grant', 'copy', 'labels', 'messages', 'widget', 'scenarios']) {
  requireValue(parsed[key] !== undefined, `нет раздела ${key}.`);
}
for (const id of ['lena', 'boris']) requireValue(typeof parsed.subjects[id]?.label === 'string', `нет имени ${id}.`);
for (const id of ['handout', 'draft', 'answers']) {
  const object = parsed.objects[id];
  requireValue(object && typeof object.label === 'string' && typeof object.file === 'string', `проверьте ресурс ${id}.`);
  requireValue([1, 2, 3].includes(object.level), `уровень ресурса ${id} должен быть 1, 2 или 3.`);
}
requireValue(Array.isArray(parsed.levels) && parsed.levels.map(x => x.value).join(',') === '1,2,3', 'сохраните три уровня 1, 2, 3.');
for (const role of Object.values(parsed.roles)) for (const permission of role.permissions) {
  requireValue(parsed.objects[permission.object] && permission.rights.every(r => ['R', 'W'].includes(r)), 'неизвестный объект или право роли.');
}
for (const id of ['handout', 'answers', 'grant', 'copy']) {
  requireValue(parsed.scenarios.filter(s => s.id === id).length === 1, `опыт ${id} должен быть описан ровно один раз.`);
}
const {scenarios, ...example} = parsed;
const serialise = value => JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');
const generated = '// Создано из example.yml. Авторские тексты меняйте в YAML.\n';
writeOrCheck(new URL('data.mjs', assets), `${generated}export const sourceExample = ${serialise(example)};\nexport const sourceScenarios = ${serialise(scenarios)};\n`);

const {renderDiagram} = await import(new URL('diagram.mjs', assets));
const stripModules = text => text
  .replace(/^import [^\n]+ from ['"][^'"\n]+['"];?\r?\n/gm, '')
  .replace(/^export (?=const |function )/gm, '');
const combined = ['data.mjs', 'example.mjs', 'diagram.mjs', 'widget.mjs'].map(name => stripModules(read(name))).join('\n');
if (/^(?:import|export)\b/m.test(combined)) throw new Error('Появилась неизвестная зависимость: обновите сборщик обычного скрипта.');
const bundle = generated + `(() => {\n'use strict';\nif (window.AccessCourseExamples) { window.AccessCourseExamples.init(document); return; }\n` + combined +
  '\nwindow.AccessCourseExamples = {init: initialiseExamples};\n})();\n';
writeOrCheck(new URL('widget.js', assets), bundle);
const xml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
for (const model of ['dac', 'mac', 'rbac']) {
  const state = model === 'mac' ? {subject: 'lena', processLevel: 2, operation: 'read', overview: true} : {overview: true};
  const svg = renderDiagram(model, state, {width: 1000, idPrefix: `access-static-${model}`});
  writeOrCheck(new URL(`static/${model}.svg`, assets), svg + '\n');
}
const title = xml(example.widget.pageTitles.comparison);
writeOrCheck(new URL('index.html', assets), `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n<link rel="stylesheet" href="widget.css">\n<style>body{max-width:1100px;margin:1.2rem auto;padding:0 1rem;font:16px/1.5 "DejaVu Sans",Arial,sans-serif;color:#183247;background:#fff}h1{font-size:1.5rem}</style>\n</head>\n<body>\n<h1 data-access-page-title>${title}</h1>\n<p>${xml(example.widget.intro)}</p>\n<div data-access-model="comparison"><p>${xml(example.widget.fallback)}</p></div>\n<script>\nconst requestedView = new URLSearchParams(location.search).get('view');\nif (['dac','mac','rbac','comparison'].includes(requestedView)) document.querySelector('[data-access-model]').dataset.accessModel = requestedView;\n</script>\n<script src="widget.js"></script>\n</body>\n</html>\n`);
console.log(check ? 'Сохранённые картинки и виджеты соответствуют example.yml.' : 'Обновлены три SVG и браузерный скрипт. Quarto не запускался.');
