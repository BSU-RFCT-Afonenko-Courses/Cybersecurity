// Проверка текущей нативной сборки через публичный API установленного Core.
import assert from 'node:assert/strict';
import { createBodyLinks } from '../task/_extensions/Afonenko-Course-Tools/reference-catalog/public.ts';
import { withCurrentNativeOperation } from '../task/_extensions/Afonenko-Course-Tools/course-core/public.ts';
const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const profile = Deno.args[0] ?? 'student';
assert.ok(['student', 'full'].includes(profile), 'Ожидается student или full');
const view = profile === 'full' ? 'author' : 'student';
const expected = ['request','dac','mac','rbac','combined','grade','session','verification','otp','recovery','categories','delegation','casbin'].map(id => 'exr-access-control-' + id);
const work = await Deno.readTextFile(root + '/task/works/04-access-control.qmd');
// Обычная операция Core не экспортирует slots. Отдельно фиксируем авторскую
// разметку назначений; семантическую корректность всей сборки проверяет validateRelease.
const assignments = [...work.matchAll(/^::: \{\.task-items([^}]*)\}\n([\s\S]*?)^:::\s*$/gm)].flatMap(group => {
  assert.ok(['', ' stage="classroom"'].includes(group[1]), 'Изменены параметры группы заданий');
  return group[2].trim().split('\n').map(line => {
    const item = line.match(/^\d+\. (?:@(exr-[\w-]+)|\[@(exr-[\w-]+)\]\{requirement="optional"\})$/);
    assert.ok(item, 'Ожидалось одиночное фиксированное назначение: ' + line);
    return { id: item[1] ?? item[2], optional: Boolean(item[2]), stage: group[1] ? 'classroom' : undefined };
  });
});
assert.deepEqual(assignments, expected.map((id, i) => ({ id, optional: i >= 5, stage: i >= 1 && i <= 7 ? 'classroom' : undefined })));
const publication = 'https://bsu-rfct-afonenko-courses.github.io/Cybersecurity/';
const links = createBodyLinks({ catalog: JSON.parse(await Deno.readTextFile(root + '/_site-' + profile + '/reference-catalog.json')), baseUrl: publication });
const expectedLink = publication + 'task/bank/access-control.html#exr-access-control-rbac';
assert.equal(links.resolve('tasks:exr-access-control-rbac', 'default', 'bank/access-control.qmd').href, expectedLink);
await withCurrentNativeOperation({ root: root + '/task', profiles: [profile], projection: view, outputDirectory: root + '/task/_output/' + profile }, async operation => {
  const catalog = operation.catalog;
  const proof = await operation.validateRelease({ expectedSources: catalog.documents.map(d => d.source) });
  for (const id of ['sec-work-data-integrity-backup', 'sec-work-access-control']) assert.ok(proof.assessmentIds.includes(id), id);
  assert.ok(catalog.documents.every(d => d.exercises.every(e => !e.project)), 'Ручной курс не объявляет программных проектов');
  const bank = operation.document({ source: 'bank/access-control.qmd' });
  for (const id of expected) {
    assert.ok(proof.exerciseIds.includes(id), id);
    const condition = operation.condition({ source: 'bank/access-control.qmd', exerciseId: id, view });
    assert.ok(condition.body.length > 0, id + ': пустое условие');
    assert.equal(Boolean(bank.hasPublicSolution[id]), false, id + ': закрытый разбор');
    assert.equal(bank.occurrences.filter(o => o.exerciseId === id && o.kind === 'solution').length, profile === 'full' ? 1 : 0, id + ': видимость решения');
  }
  const verification = operation.condition({ source: 'bank/access-control.qmd', exerciseId: 'exr-access-control-verification', view });
  function pandocLinks(value: unknown): any[] {
    if (Array.isArray(value)) return value.flatMap(pandocLinks);
    if (!value || typeof value !== 'object') return [];
    const node = value as Record<string, any>;
    return [...(node.t === 'Link' ? [node] : []), ...Object.values(node).flatMap(pandocLinks)];
  }
  const referenced = pandocLinks(verification.body);
  assert.equal(referenced.length, 1, 'Условие verification должно ссылаться на исходную конфигурацию RBAC');
  const attributes = Object.fromEntries(referenced[0].c[0][2]);
  assert.equal(attributes['data-qrc-ref'], 'tasks:exr-access-control-rbac');
  assert.equal(links.resolve(attributes['data-qrc-ref'], attributes['data-qrc-style'], 'bank/access-control.qmd').href, expectedLink);
  const backup = catalog.documents.find(d => d.source === 'bank/data-integrity.qmd')!;
  assert.ok(backup.exercises.some(e => e.id === 'exr-data-integrity-backup'));
  assert.ok(operation.condition({source: 'bank/data-integrity.qmd', exerciseId: 'exr-data-integrity-backup', view}).body.length > 0);
  console.log(`Проверен ${profile}: текущая нативная сборка, состав работ, 13 условий и разделение решений; 5 обязательных и 8 дополнительных назначений.`);
});
