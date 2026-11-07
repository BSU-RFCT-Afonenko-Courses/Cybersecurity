import {createLcgSelectionModel} from './lcg-selection-model.js';

const titles = [
  'Возможные параметры',
  'Первый переход: 64 → 4',
  'Второй переход: 4 → 1',
  'Проверка на следующем наблюдении',
  'Наблюдатель фиксирует прогноз',
  'Генератор раскрывает результат'
];
const checks = [
  'Переходов для проверки пока нет.',
  'Проверяем: 2 → 11',
  'Проверяем: 11 → 8',
  'Проверяем: 8 → 9',
  'Выбранное правило: a = 5, c = 1',
  'Выбранное правило: a = 5, c = 1'
];
const details = [
  'Каждая пара (a, c) задаёт своё правило генерации.',
  'Эти четыре пары воспроизвели 2 → 11. Остальные 60 исключены.',
  'Каждая строка уже прошла 2 → 11. Новый переход исключает ещё три пары.',
  'Пара (5, 1) воспроизвела все три перехода: 2 → 11 → 8 → 9.',
  'Прогноз сохранён до продолжения исходного генератора.',
  'Оба результата получены отдельно из последнего наблюдаемого состояния.'
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function comparisonTable(rows) {
  const table = element('table', 'cv-lcg-comparisons');
  const head = element('thead', 'cv-lcg-sr-only');
  const headings = element('tr');
  for (const text of ['Пара параметров', 'Вычисление', 'Проверка']) {
    const th = element('th', '', text);
    th.scope = 'col';
    headings.append(th);
  }
  head.append(headings);
  const body = element('tbody');
  for (const model of rows) {
    const row = element('tr', model ? (model.kept ? 'is-kept' : 'is-out') : '');
    const pair = element('th', 'cv-lcg-pair', model ? `a = ${model.a}, c = ${model.c}` : 'a = —, c = —');
    pair.scope = 'row';
    const equation = model
      ? `(${model.a} × ${model.start} + ${model.c}) mod 16 = ${model.output}`
      : '(— × — + —) mod 16 = —';
    row.append(pair, element('td', 'cv-lcg-equation', equation));
    row.append(element('td', 'cv-lcg-result', model ? (model.kept ? 'Совпало' : `≠ ${model.expected}: отсев`) : '≠ —: отсев'));
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function actor(name, text, detail, number) {
  const row = element('div', 'cv-lcg-actor');
  row.append(element('dt', '', name));
  const content = element('dd');
  content.append(element('span', '', text));
  if (number !== undefined) content.append(element('strong', 'cv-lcg-forecast', number));
  content.append(element('div', 'cv-lcg-actor-detail', detail));
  row.append(content);
  return row;
}

function stepPanel(phase, state) {
  const panel = element('div', 'cv-lcg-step-panel');
  // Невидимые макеты участвуют в раскладке: кнопки не прыгают между шагами.
  // В них нет будущих выходов или прогноза, только заполнители.
  panel.setAttribute('aria-hidden', state ? 'false' : 'true');
  panel.inert = !state;
  panel.append(element('h4', 'cv-lcg-step-title', titles[phase]));
  panel.append(element('p', 'cv-lcg-check', checks[phase]));
  const work = element('div', 'cv-lcg-calculation');
  if (phase === 0) {
    work.append(element('p', '', '8 значений a × 8 значений c = 64 пары'));
    work.append(element('p', '', 'Положение точки задаёт пару: строка — множитель a, столбец — слагаемое c.'));
  } else if (phase <= 3) {
    const rows = state
      ? (phase === 1 ? state.comparisons.filter(row => row.kept) : state.comparisons)
      : Array(phase <= 2 ? 4 : 1).fill(null);
    work.append(comparisonTable(rows));
  } else {
    const forecast = state?.forecast;
    const actors = element('dl', 'cv-lcg-actors');
    actors.append(actor('Наблюдатель', 'Зафиксирован прогноз',
      forecast ? `(${forecast.a} × ${forecast.start} + ${forecast.c}) mod 16 = ${forecast.output}` : '(— × — + —) mod 16 = —',
      forecast ? forecast.output : '—'));
    const actual = state?.actual;
    actors.append(actor('Генератор', actual ? `Следующий выход: ${actual.output}` : 'Следующий выход ещё скрыт',
      actual ? `Прогноз ${forecast.output} и выход ${actual.output} совпали.` : 'Продолжает собственное состояние.'));
    work.append(actors);
  }
  panel.append(work, element('p', 'cv-lcg-detail', details[phase]));
  return panel;
}

function modelGrid() {
  const matrix = element('div', 'cv-lcg-matrix');
  matrix.append(element('div', 'cv-lcg-axis-a', 'Множитель a'));
  const table = element('table', 'cv-lcg-grid');
  table.setAttribute('aria-label', 'Пары параметров: строки — множитель a, столбцы — слагаемое c');
  const head = element('thead');
  const axisRow = element('tr');
  const corner = element('th');
  corner.rowSpan = 2;
  corner.setAttribute('aria-label', 'Значение множителя a');
  const axis = element('th', 'cv-lcg-axis-c', 'Слагаемое c');
  axis.colSpan = 8;
  axis.scope = 'colgroup';
  axisRow.append(corner, axis);
  const columns = element('tr');
  for (let c = 0; c < 8; c++) {
    const th = element('th', '', c);
    th.scope = 'col';
    columns.append(th);
  }
  head.append(axisRow, columns);
  const body = element('tbody');
  const cells = [];
  for (let a = 0; a < 8; a++) {
    const row = element('tr');
    const label = element('th', '', a);
    label.scope = 'row';
    row.append(label);
    for (let c = 0; c < 8; c++) {
      const cell = element('td');
      cell.dataset.a = a;
      cell.dataset.c = c;
      row.append(cell);
      cells.push(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  matrix.append(table);
  return {matrix, cells};
}

export function lcgModelSelection({compact = false} = {}) {
  const model = createLcgSelectionModel();
  const view = element('div', 'course-viz course-viz-lcg-selection');
  view.classList.toggle('course-viz-lcg-selection-compact', compact);
  view.setAttribute('aria-label', 'Пошаговый отбор параметров LCG по полным наблюдаемым состояниям');
  const observations = element('div', 'cv-lcg-observations');
  observations.append(element('p', 'cv-lcg-label', 'Полные наблюдаемые состояния'));
  const sequence = element('div', 'cv-lcg-sequence');
  sequence.setAttribute('role', 'img');
  observations.append(sequence);

  const main = element('div', 'cv-lcg-main');
  const pool = element('div', 'cv-lcg-pool');
  pool.setAttribute('aria-label', 'Сетка возможных параметров');
  const count = element('p', 'cv-lcg-count');
  const {matrix, cells} = modelGrid();
  const legend = element('ul', 'cv-lcg-legend');
  for (const [className, marker, text] of [
    ['is-candidate', '●', 'Подходит'], ['is-eliminated', '×', 'Отсев на этом шаге'], ['is-rejected', '·', 'Исключена раньше']
  ]) {
    const item = element('li');
    const mark = element('span', className, marker);
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, document.createTextNode(text));
    legend.append(item);
  }
  pool.append(count, matrix, legend);
  const work = element('div', 'cv-lcg-work');
  const rule = element('div', 'cv-lcg-rule');
  rule.append(element('p', 'cv-lcg-label', 'Правило отбора'));
  rule.append(element('p', '', 'Оставляем правило, только если оно воспроизводит все уже наблюдавшиеся переходы.'));
  const stage = element('div', 'cv-lcg-step-stage');
  work.append(rule, stage);
  main.append(pool, work);

  const nav = element('nav', 'cv-lcg-nav');
  nav.setAttribute('aria-label', 'Шаги отбора и проверки прогноза');
  const previous = element('button', '', 'Назад');
  previous.type = 'button';
  previous.dataset.action = 'previous';
  const progress = element('span', 'cv-lcg-progress');
  const next = element('button', '', 'Далее');
  next.type = 'button';
  next.dataset.action = 'next';
  nav.append(previous, progress, next);
  const status = element('p', 'cv-lcg-sr-only');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  view.append(observations, main, nav, status);

  function render(state) {
    const {phase, candidates} = state;
    view.dataset.phase = phase;
    count.textContent = `Подходит ${candidates.length} из 64`;
    const remaining = new Set(candidates.map(({a,c}) => `${a},${c}`));
    const eliminated = new Set(phase <= 3 ? state.comparisons.filter(row => !row.kept).map(({a,c}) => `${a},${c}`) : []);
    for (const cell of cells) {
      const pair = `${cell.dataset.a},${cell.dataset.c}`;
      const kept = remaining.has(pair);
      const removed = eliminated.has(pair);
      const stateName = kept ? 'candidate' : removed ? 'eliminated' : 'rejected';
      cell.className = `is-${stateName}`;
      cell.dataset.status = stateName;
      cell.textContent = kept ? '●' : removed ? '×' : '·';
      cell.setAttribute('aria-label', `a = ${cell.dataset.a}, c = ${cell.dataset.c}: ${kept ? 'подходит' : removed ? 'отсев на этом шаге' : 'исключена раньше'}`);
    }
    sequence.replaceChildren();
    const currentPair = phase >= 1 && phase <= 3 ? [phase - 1, phase] : [];
    for (let index = 0; index < 4; index++) {
      if (index) {
        const arrow = element('span', `cv-lcg-arrow${currentPair.includes(index - 1) && currentPair.includes(index) ? ' is-current' : ''}`, '→');
        arrow.setAttribute('aria-hidden', 'true');
        sequence.append(arrow);
      }
      const revealed = index < state.observations.length;
      const cell = element('span', `cv-lcg-state${revealed ? '' : ' is-pending'}${currentPair.includes(index) ? ' is-current' : ''}`, revealed ? state.observations[index] : '—');
      cell.setAttribute('aria-hidden', 'true');
      sequence.append(cell);
    }
    sequence.setAttribute('aria-label', `Наблюдаемые состояния: ${state.observations.join(', ')}.${currentPair.length ? ` Проверяем переход ${state.observations[currentPair[0]]} → ${state.observations[currentPair[1]]}.` : ''}`);
    stage.replaceChildren(...titles.map((_, index) => stepPanel(index, index === phase ? state : null)));
    previous.disabled = phase === 0;
    next.disabled = phase === 5;
    progress.textContent = `${phase + 1} / 6`;
    status.textContent = `Шаг ${phase + 1} из 6. ${titles[phase]}. ${count.textContent}.`;
  }

  previous.addEventListener('click', () => render(model.previous()));
  next.addEventListener('click', () => render(model.next()));
  render(model.snapshot());
  return view;
}
