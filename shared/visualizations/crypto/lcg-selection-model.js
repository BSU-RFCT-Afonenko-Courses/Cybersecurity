const MODULUS = 16;

export function lcgSelectionOutput({a, c}, state) {
  return (a * state + c) % MODULUS;
}

function possibleModels() {
  const models = [];
  for (let a = 0; a < 8; a++) {
    for (let c = 0; c < 8; c++) models.push(Object.freeze({a, c}));
  }
  return models;
}

class Generator {
  #a;
  #c;
  #state;

  constructor(a, c, state) {
    this.#a = a;
    this.#c = c;
    this.#state = state;
  }

  next() {
    this.#state = lcgSelectionOutput({a:this.#a, c:this.#c}, this.#state);
    return this.#state;
  }
}

class Observer {
  #models = possibleModels();
  #observations;
  #comparisons = [];

  constructor(initialOutput) {
    this.#observations = [initialOutput];
  }

  observe(output) {
    const start = this.#observations.at(-1);
    this.#comparisons = this.#models.map(model => Object.freeze({
      ...model, start, output:lcgSelectionOutput(model, start),
      expected:output, kept:lcgSelectionOutput(model, start) === output
    }));
    this.#models = this.#models.filter(model => lcgSelectionOutput(model, start) === output);
    this.#observations.push(output);
  }

  snapshot() {
    return {
      observations:Object.freeze([...this.#observations]),
      candidates:Object.freeze([...this.#models]),
      comparisons:Object.freeze([...this.#comparisons])
    };
  }

  predict() {
    if (this.#models.length !== 1) throw new Error('Для прогноза нужна одна выбранная модель.');
    const model = this.#models[0];
    const start = this.#observations.at(-1);
    return Object.freeze({...model, start, output:lcgSelectionOutput(model, start)});
  }
}

export function createLcgSelectionModel() {
  // Наблюдатель получает только выходы, без ссылки на генератор или его параметры.
  const generator = new Generator(5, 1, 2);
  const observer = new Observer(2);
  const snapshots = [Object.freeze({phase:0, ...observer.snapshot()})];
  let phase = 0;

  function snapshot() {
    return snapshots[phase];
  }

  function next() {
    if (phase === 5) return snapshot();
    phase++;
    if (!snapshots[phase]) {
      if (phase <= 3) observer.observe(generator.next());
      const state = {phase, ...observer.snapshot()};
      if (phase >= 4) state.forecast = phase === 4 ? observer.predict() : snapshots[4].forecast;
      if (phase === 5) {
        // Отдельный вызов генератора выполняется после сохранения прогноза.
        state.actual = Object.freeze({start:state.observations.at(-1), output:generator.next()});
      }
      snapshots[phase] = Object.freeze(state);
    }
    return snapshot();
  }

  function previous() {
    phase = Math.max(0, phase - 1);
    return snapshot();
  }

  return Object.freeze({snapshot, next, previous});
}
