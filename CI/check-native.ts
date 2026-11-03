// Проверка текущей нативной сборки через публичный API установленного Core.
import assert from 'node:assert/strict';
import { withCurrentNativeOperation } from '../task/_extensions/Afonenko-Course-Tools/course-core/public.ts';
const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const profile = Deno.args[0] ?? 'student';
assert.ok(['student', 'full'].includes(profile), 'Ожидается student или full');
const view = profile === 'full' ? 'author' : 'student';
await withCurrentNativeOperation({ root: root + '/task', profiles: [profile], projection: view, outputDirectory: root + '/task/_output/' + profile }, async operation => {
  const catalog = operation.catalog;
  // Core проверяет актуальные назначения, их цели и семантику, включая публичные разборы.
  const proof = await operation.validateRelease({ expectedSources: catalog.documents.map(d => d.source) });
  for (const entry of catalog.documents) {
    const document = operation.document({ source: entry.source });
    for (const exercise of entry.exercises) {
      assert.ok(proof.exerciseIds.includes(exercise.id), exercise.id + ': нет декларации');
      const condition = operation.condition({ source: entry.source, exerciseId: exercise.id, view: { view, occurrence: exercise.occurrence } });
      assert.ok(condition.body.length > 0, exercise.id + ': пустое условие');
      assert.equal(condition.anchor, exercise.anchor, exercise.id + ': якорь условия');
      assert.equal(Boolean(document.hasPublicSolution[exercise.id]), exercise.hasPublicSolution, exercise.id + ': публичность решения');
    }
    for (const occurrence of document.occurrences.filter(o => o.kind === 'solution')) {
      assert.ok(view === 'author' || occurrence.publicSolution, occurrence.exerciseId + ': закрытое решение в student');
    }
  }
  console.log(`Проверен ${profile}: текущая нативная сборка, ${proof.exerciseIds.length} условий, ${proof.assessmentIds.length} работ и видимость решений.`);
});
