// Только техника отображения. Предметные этапы, правила и пояснения передаёт курс.
export function createControls(traceFor, queries, {initial = 0} = {}) {
  const view = document.createElement('div'); view.className = 'course-viz course-viz-controls';
  const label = document.createElement('label'); label.textContent = 'Запрос ';
  const select = document.createElement('select'); select.dataset.query = '';
  queries.forEach((q,i) => select.add(new Option(q.label, String(i))));
  select.value = String(initial); label.append(select);
  let index = 0;
  const previous = document.createElement('button'), next = document.createElement('button');
  previous.type = next.type = 'button';
  previous.textContent = '← Назад'; next.textContent = 'Далее →';
  previous.dataset.action = 'previous'; next.dataset.action = 'next';
  const status = document.createElement('output'); status.setAttribute('aria-live','polite');
  function update() {
    const query = queries[Number(select.value)], trace = traceFor(query);
    if (!trace.length) throw new Error('Пустая трасса');
    index = Math.max(0, Math.min(index, trace.length - 1));
    const stage = trace[index];
    view.value = {query, trace, index, stage};
    view.dataset.stage = stage.name;
    status.textContent = `${index + 1}/${trace.length}: ${stage.label}`;
    previous.disabled = index === 0; next.disabled = index === trace.length - 1;
    view.dispatchEvent(new Event('input', {bubbles:true}));
  }
  select.addEventListener('change', () => {index = 0; update();});
  previous.addEventListener('click', () => {index--; update();});
  next.addEventListener('click', () => {index++; update();});
  view.append(label,previous,status,next); update(); return view;
}

export function prepareSVG(source, keys = [], result) {
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  if (svg.localName !== 'svg' || svg.querySelector('parsererror')) throw new Error('Некорректный SVG');
  const prefix = 'cv-' + crypto.randomUUID() + '-';
  const ids = new Map();
  for (const node of [svg, ...svg.querySelectorAll('[id]')]) {
    if (!node.id) continue;
    const key = node.id; ids.set(key, prefix + key); node.dataset.key = key; node.id = prefix + key;
    node.classList.toggle('is-active',keys.includes(key));
    if (keys.includes(key) && result) node.classList.add('result-' + result);
  }
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      let value = attr.value.replace(/url\(#([^)]*)\)/g, (match,id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      if ((attr.localName === 'href') && value.startsWith('#') && ids.has(value.slice(1))) value = '#' + ids.get(value.slice(1));
      if (['aria-labelledby','aria-describedby'].includes(attr.name)) value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
      if (value !== attr.value) node.setAttributeNS(attr.namespaceURI,attr.name,value);
    }
  }
  return document.importNode(svg,true);
}

export function serializeSVG(svg) {
  const clone = svg.cloneNode(true); clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const originals = [svg,...svg.querySelectorAll('*')], copies = [clone,...clone.querySelectorAll('*')];
  originals.forEach((node,i) => {
    const css = getComputedStyle(node);
    for (const key of ['fill','stroke','stroke-width','font-family','font-size','font-weight','opacity','display']) copies[i].style.setProperty(key,css.getPropertyValue(key));
  });
  return new XMLSerializer().serializeToString(clone);
}

export function renderStage({selected, model, algorithm, notes = {}}) {
  const {stage} = selected;
  const view = document.createElement('div'); view.className = 'course-viz course-viz-stage';
  view.dataset.stage = stage.name; view.dataset.result = stage.result || 'pending';
  const pair = document.createElement('div'); pair.className = 'course-viz-pair';
  for (const [kind,source,keys,title] of [['model',model,stage.model,'Модель'], ['algorithm',algorithm,stage.algorithm,'Алгоритм']]) {
    const column = document.createElement('div'); column.dataset.diagram = kind; column.dataset.stage = stage.name;
    const svg = prepareSVG(source,keys,stage.result); svg.setAttribute('role','img'); svg.setAttribute('aria-label',`${title}: ${stage.label}`);
    column.append(svg); pair.append(column);
  }
  const explanation = document.createElement('p'); explanation.dataset.explanation = ''; explanation.dataset.stage = stage.name;
  explanation.setAttribute('aria-live','polite'); explanation.textContent = notes[stage.name] || '';
  view.append(pair,explanation); return view;
}
