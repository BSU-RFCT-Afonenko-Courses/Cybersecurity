// Обычный скрипт для схем: работает и по HTTP, и при открытии через file://.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const assets = new URL('../docs/drafts/access-control/legacy/', import.meta.url);
const read = name => readFileSync(new URL(name, assets), 'utf8');
const model = read('model.mjs').replace(/^export (?=function |const )/gm, '');
const view = read('view.mjs').replace(/^import \{[^\n]+\} from '\.\/model\.mjs';\r?\n/, '');
if (/^(import|export)\b/m.test(model + view)) throw new Error('Неизвестная зависимость схем: обновите сборку.');
const output = '// Создано командой node CI/build-access-control.mjs. Редактируйте model.mjs и view.mjs.\n(() => {\n\'use strict\';\n' + model + '\n' + view + '\n})();\n';
const target = new URL('view.js', assets);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Скрипт схем устарел: выполните node CI/build-access-control.mjs.');
  for (const name of ['architecture', 'dac', 'mac', 'rbac', 'session']) {
    const html = read(name + '.html');
    if (!html.includes('<script src="view.js"></script>') || /<script\b[^>]*type="module"/.test(html)) {
      throw new Error(`Схема ${name} должна подключать обычный скрипт view.js для file://.`);
    }
  }
} else {
  writeFileSync(fileURLToPath(target), output);
}
