import test from 'node:test';
import assert from 'node:assert/strict';
const {macTrace, macQueries} = await import('../../shared/visualizations/access-control/mac/model.js');

test('MAC: все 18 сочетаний уровней и операций вычисляют заданную политику', () => {
  for (let subject = 1; subject <= 3; subject++) for (let object = 1; object <= 3; object++) {
    for (const operation of ['read', 'write']) {
      const trace = macTrace({subject, object, operation});
      assert.equal(trace.at(-1).result, (operation === 'read' ? subject >= object : subject <= object) ? 'allow' : 'deny');
      assert.deepEqual(trace.map(s => s.name), ['request', 'levels', operation + '-rule', 'result']);
      assert.equal(trace[2].algorithm[0], operation + '-rule');
      assert.ok(trace[2].model.includes('file-' + object));
    }
  }
});
test('MAC: трассы независимы; удаление пояснения не меняет этапы и решение', () => {
  const first = macTrace(macQueries[0]);
  const snapshot = structuredClone(first);
  const second = macTrace(macQueries[1]);
  second[0].model.push('посторонняя-метка');
  assert.deepEqual(first, snapshot);
  const notes = {levels: 'Уровни задаются политикой'};
  delete notes.levels;
  assert.deepEqual(macTrace(macQueries[0]), snapshot);
});
test('MAC: неизвестные уровни и операции отклоняются, а не разрешаются по умолчанию', () => {
  for (const query of [{subject:0,object:1,operation:'read'}, {subject:2,object:4,operation:'read'}, {subject:2,object:1,operation:'edit'}]) {
    assert.throws(() => macTrace(query), /Запрос/);
  }
});
