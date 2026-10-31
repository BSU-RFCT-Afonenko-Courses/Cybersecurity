import {example, scenarios, normaliseState, evaluateAccess} from './example.mjs';
import {renderDiagram} from './diagram.mjs';

// Разметка и события остаются служебными; все видимые строки берутся из example.yml.
const mounted = new WeakSet();
let widgetCount = 0;
const element = (name, attrs = {}, text = '') => {
  const node = document.createElement(name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
};
const fill = (template, values = {}) => String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);

export function initialiseExamples(container = document) {
  for (const root of container.querySelectorAll('[data-access-model]')) {
    if (mounted.has(root)) continue;
    mounted.add(root);
    mountExample(root);
  }
}

function mountExample(root) {
  const kind = root.dataset.accessModel;
  if (!['dac', 'mac', 'rbac', 'comparison'].includes(kind)) return;
  const ui = example.widget;
  const comparison = kind === 'comparison';
  const prefix = `access-example-${++widgetCount}`;
  const models = comparison ? ['dac', 'rbac', 'mac'] : [kind];
  const controls = element('div', {class: 'acx-controls'});
  const plots = element('div', {class: comparison ? 'acx-models' : 'acx-single'});
  const selectors = {};
  const panes = {};
  let scenarioId = 'answers';
  let direct = normaliseState('mac', {subject: 'lena', processLevel: 2, object: 'answers', operation: 'read', granted: false});
  root.replaceChildren(controls, plots);
  root.classList.add('acx-widget');

  function selector(key, label, entries, selected) {
    const wrapper = element('label', {class: 'acx-field'});
    wrapper.append(element('span', {}, label));
    const select = element('select', {'aria-label': label});
    for (const [value, caption] of entries) {
      const option = element('option', {value}, caption);
      option.selected = value === selected;
      select.append(option);
    }
    wrapper.append(select);
    controls.append(wrapper);
    selectors[key] = select;
    return select;
  }

  if (kind === 'mac') {
    selector('process', ui.processLabel, [
      ['lena2', ui.processes.lena2], ['lena3', ui.processes.lena3], ['boris1', ui.processes.boris1],
    ], 'lena2');
    selector('object', ui.objectLabel,
      Object.entries(example.objects).map(([id, object]) => [id, fill(ui.objectOption, object)]), 'answers');
    selector('operation', ui.operationLabel, Object.entries(ui.operations), 'read');
  } else {
    selector('scenario', ui.scenarioLabel, scenarios.map(s => [s.id, s.label]), scenarioId);
  }

  for (const model of models) {
    const panel = element('div', {'data-access-panel': model});
    if (comparison) {
      panel.append(element('h3', {}, ui.modelNames[model]));
      panel.append(element('div', {class: 'acx-structure'}, ui.structures[model]));
    }
    const graphic = element('div', {class: 'acx-graphic'});
    const result = element('div', {class: 'acx-result', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'});
    panel.append(graphic, result);
    plots.append(panel);
    panes[model] = {graphic, result};
  }
  const note = element('div', {class: 'acx-note'}, kind === 'mac' ? ui.independentProcesses : ui.legends[kind]);
  root.append(note);
  root.addEventListener('keydown', event => {
    if (event.target.matches('select,button,input')) event.stopPropagation();
  });

  function state() {
    if (kind === 'mac') return direct;
    return scenarios.find(s => s.id === scenarioId).state;
  }
  function render() {
    plots.classList.toggle('acx-wide', comparison && root.clientWidth >= 960);
    if (kind === 'mac') selectors.object.disabled = direct.operation === 'copy';
    for (const model of models) {
      const {graphic, result} = panes[model];
      const current = normaliseState(model, state());
      const width = Math.max(320, graphic.getBoundingClientRect().width || 900);
      graphic.innerHTML = renderDiagram(model, current, {width, idPrefix: `${prefix}-${model}`});
      const decision = evaluateAccess(model, current);
      const verdict = element('strong', {}, decision.allowed ? ui.allowed : ui.denied);
      result.replaceChildren(verdict, element('span', {}, decision.reason));
      result.dataset.allowed = String(decision.allowed);
    }
  }
  for (const select of Object.values(selectors)) select.addEventListener('change', () => {
    if (kind === 'mac') {
      const selected = selectors.process.value;
      direct = {...direct, subject: selected === 'boris1' ? 'boris' : 'lena',
        processLevel: selected === 'boris1' ? 1 : selected === 'lena3' ? 3 : 2,
        object: selectors.object.value, operation: selectors.operation.value};
    } else scenarioId = selectors.scenario.value;
    render();
  });
  new ResizeObserver(render).observe(root);
  render();
  const title = document.querySelector('[data-access-page-title]');
  if (title) {
    title.textContent = ui.pageTitles[kind];
    document.title = title.textContent;
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initialiseExamples());
  else initialiseExamples();
}
