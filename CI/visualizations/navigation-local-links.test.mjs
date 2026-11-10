import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const uiPath = '_extensions/Afonenko-Course-Tools/course-navigation/navigation/ui.js';
const source = readFileSync(new URL(uiPath, root), 'utf8');
const helper = source.match(/^  function permanentLinkHref\(item, baseURI\) \{[\s\S]*?^  \}\n(?=  function build\()/m)?.[0];
assert.ok(helper, 'В штатном UI должна присутствовать проверяемая функция выбора ссылки');
const href = vm.runInNewContext(`${helper}\npermanentLinkHref`, { URL });
const local = 'file:///home/reader/course/seminars/04-access-control.html';
const web = 'https://example.org/course/seminars/04-access-control.html';
const link = (href, extra = {}) => ({ href, scope: 'course', id: 'subproject-theory', ...extra });

test('Локальное меню открывает страницы четырёх частей курса, включая вложенные документы', () => {
  const entries = [
    [link('../', { id: 'root' }), 'file:///home/reader/course/index.html'],
    [link('../theory/'), 'file:///home/reader/course/theory/index.html'],
    [link('../task/', { id: 'subproject-task' }), 'file:///home/reader/course/task/index.html'],
    [link('./', { id: 'subproject-seminars', scope: 'project' }), 'file:///home/reader/course/seminars/index.html'],
    [link('../theory/crypto/hash-functions.html#def-crypto-digest'),
      'file:///home/reader/course/theory/crypto/hash-functions.html#def-crypto-digest'],
    [link('../theory/?query=1#sec-theory'), 'file:///home/reader/course/theory/index.html?query=1#sec-theory'],
  ];
  for (const [item, expected] of entries) assert.equal(href(item, local), expected);
  assert.equal(href(link('../../task/'), 'file:///home/reader/course/theory/crypto/hash-functions.html'),
    'file:///home/reader/course/task/index.html');
});

test('Локальные пути сохраняют кодирование и адрес хранилища', () => {
  assert.equal(href(link('../теория/'), local),
    'file:///home/reader/course/%D1%82%D0%B5%D0%BE%D1%80%D0%B8%D1%8F/index.html');
  assert.equal(href(link('../theory/'), 'file://fileserver/course/seminars/04.html'),
    'file://fileserver/course/theory/index.html');
});

test('Опубликованное меню и HTTP(S) ссылки сохраняют прежние href', () => {
  for (const original of ['../', '../theory/', '/course/task/', 'https://example.net/source', 'http://example.net/']) {
    assert.equal(href({ href: original }, web), original);
  }
  assert.equal(href(link('https://github.com/example/course', { scope: 'repository', id: 'source' }), local),
    'https://github.com/example/course');
});

test('Локальный режим допускает только относительные переходы состава курса', () => {
  for (const item of [
    link('file:///etc/passwd'), link('FILE:///etc/passwd'), link('/etc/passwd'),
    link('//other-server/course/'), link('\\\\other-server\\course\\'),
    link('..\\theory\\'), link(' ../theory/'),
    link('../theory/', { id: 'custom' }), link('../theory/', { id: undefined }),
    link('../theory/', { scope: 'repository' }), link('../theory/', { scope: undefined }),
  ]) assert.equal(href(item, local), null, JSON.stringify(item));
});

test('Запрещённые схемы и некорректный URL не обрывают обработку последующих ссылок', () => {
  const entries = ['javascript:alert(1)', 'data:text/html,test', 'mailto:a@example.org', 'http://[', '', null, undefined];
  for (const base of [local, web]) {
    const results = [...entries.map(value => link(value)), link('../theory/')].map(item => href(item, base));
    assert.deepEqual(results.slice(0, -1), entries.map(() => null));
    assert.equal(results.at(-1), base === web ? '../theory/' : 'file:///home/reader/course/theory/index.html');
  }
});

test('Во всех четырёх проектах установлена одна версия штатного UI с поправкой', () => {
  for (const scope of ['', 'theory/', 'task/', 'seminars/']) {
    const path = new URL(scope + uiPath, root);
    assert.equal(readFileSync(path, 'utf8'), source, fileURLToPath(path));
  }
});
