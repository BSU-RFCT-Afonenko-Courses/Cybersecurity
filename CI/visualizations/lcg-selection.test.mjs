import test from 'node:test';
import assert from 'node:assert/strict';
import {createLcgSelectionModel, lcgSelectionOutput} from '../../shared/visualizations/crypto/lcg-selection-model.js';

test('LCG: правило вычисляет переходы и различает четыре оставшиеся пары', () => {
  assert.deepEqual([2, 11, 8, 9].map(state => lcgSelectionOutput({a:5,c:1}, state)), [11, 8, 9, 14]);
  assert.deepEqual([{a:2,c:7}, {a:3,c:5}, {a:4,c:3}, {a:5,c:1}].map(model => lcgSelectionOutput(model, 11)), [13, 6, 15, 8]);
});

test('LCG: наблюдения сокращают 64 пары до четырёх и одной', () => {
  const model = createLcgSelectionModel();
  const initial = model.snapshot();
  assert.equal(initial.phase, 0);
  assert.deepEqual(initial.observations, [2]);
  assert.equal(initial.candidates.length, 64);
  assert.equal(new Set(initial.candidates.map(({a,c}) => `${a},${c}`)).size, 64);
  for (const {a,c} of initial.candidates) assert.ok(a >= 0 && a <= 7 && c >= 0 && c <= 7);
  const first = model.next();
  assert.deepEqual(first.observations, [2, 11]);
  assert.deepEqual(first.candidates, [{a:2,c:7}, {a:3,c:5}, {a:4,c:3}, {a:5,c:1}]);
  const second = model.next();
  assert.deepEqual(second.observations, [2, 11, 8]);
  assert.deepEqual(second.candidates, [{a:5,c:1}]);
  assert.deepEqual(second.comparisons.map(({output,kept}) => [output, kept]), [[13,false], [6,false], [15,false], [8,true]]);
  const third = model.next();
  assert.deepEqual(third.observations, [2, 11, 8, 9]);
  assert.deepEqual(third.candidates, [{a:5,c:1}]);
  assert.deepEqual(third.comparisons.map(({start,output,kept}) => [start,output,kept]), [[8,9,true]]);
});

test('LCG: прогноз фиксируется до раскрытия отдельного выхода генератора', () => {
  const model = createLcgSelectionModel();
  for (let phase = 0; phase <= 4; phase++) {
    const state = phase === 0 ? model.snapshot() : model.next();
    assert.equal(Object.hasOwn(state, 'actual'), false);
    assert.equal(Object.hasOwn(state, 'generator'), false);
    if (phase < 4) assert.equal(Object.hasOwn(state, 'forecast'), false);
  }
  const forecast = model.snapshot().forecast;
  assert.deepEqual(forecast, {a:5,c:1,start:9,output:14});
  const revealed = model.next();
  assert.deepEqual(revealed.actual, {start:9,output:14});
  assert.notEqual(revealed.forecast, revealed.actual);
  assert.deepEqual(revealed.forecast, forecast);
  assert.equal(Object.isFrozen(forecast), true);
});

test('LCG: возвращение и повторный проход не продолжают генератор повторно', () => {
  const model = createLcgSelectionModel();
  const states = [model.snapshot()];
  for (let phase = 1; phase <= 5; phase++) states.push(model.next());
  assert.deepEqual(model.next(), states[5]);
  for (let phase = 4; phase >= 0; phase--) assert.deepEqual(model.previous(), states[phase]);
  assert.deepEqual(model.previous(), states[0]);
  for (let phase = 1; phase <= 5; phase++) assert.deepEqual(model.next(), states[phase]);
  assert.deepEqual(createLcgSelectionModel().snapshot(), states[0]);
  assert.equal(states[0].candidates.length, 64);
});
