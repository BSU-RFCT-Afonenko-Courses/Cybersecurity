// Создано из example.yml. Авторские тексты меняйте в YAML.
(() => {
'use strict';
if (window.AccessCourseExamples) { window.AccessCourseExamples.init(document); return; }
// Создано из example.yml. Авторские тексты меняйте в YAML.
const sourceExample = {
  "subjects": {
    "lena": {
      "label": "Лена",
      "processLabel": "Редактор Лены",
      "level": 2
    },
    "boris": {
      "label": "Борис",
      "processLabel": "Редактор Бориса",
      "level": 1
    }
  },
  "objects": {
    "handout": {
      "label": "Памятка",
      "file": "handout.txt",
      "level": 1
    },
    "draft": {
      "label": "Черновик",
      "file": "draft.txt",
      "level": 2
    },
    "answers": {
      "label": "Ответы",
      "file": "answers.txt",
      "level": 3
    }
  },
  "levels": [
    {
      "value": 1,
      "label": "1 — Открытые",
      "name": "Открытые"
    },
    {
      "value": 2,
      "label": "2 — Служебные",
      "name": "Служебные"
    },
    {
      "value": 3,
      "label": "3 — Закрытые",
      "name": "Закрытые"
    }
  ],
  "labels": {
    "matrixSubject": "Кому",
    "people": "Участники",
    "peopleCompact": "Кто",
    "roles": "Роли",
    "permissions": "Разрешения",
    "permissionsCompact": "Права",
    "levels": "Метки данных",
    "levelsCompact": "L",
    "processes": "Процессы",
    "processesCompact": "Процесс",
    "files": "Файлы",
    "owner": "Владелец всех файлов — {subject}",
    "dacHint": "Владелец может менять назначения прав.",
    "dacGranted": "Добавлено: {subject} — R на {file}.",
    "rbacHint": "Разрешения приходят через назначенные роли.",
    "rbacGranted": "{subject}: дополнительно назначена роль «{role}».",
    "processLevel": "текущая метка {level}",
    "processLevelCompact": "метка {level}",
    "fileLevel": "уровень {level}",
    "allowed": "Разрешено",
    "denied": "Отказ",
    "allowedFlow": "Допустимый поток данных",
    "blockedFlow": "Отказ на границе",
    "readFlow": "Чтение: файл → процесс",
    "writeFlow": "Запись без чтения: процесс → файл",
    "editFlow": "Изменение: чтение и запись",
    "copyFlow": "Копирование: ответы → процесс → памятка",
    "dacTitle": "DAC: права пользователей на файлы",
    "rbacTitle": "RBAC: участники, роли и разрешения",
    "macTitle": "MAC: потоки данных между уровнями",
    "dacDescription": "Права на три файла задаются для каждого участника. Владелец может менять назначения.",
    "rbacDescription": "Права приходят через роли. Роль рецензента назначается отдельно; наследования ролей в этом примере нет.",
    "macDescription": "Три горизонтальные полосы показывают уровни данных. Процессы слева, файлы справа. Стрелки показывают направление данных; крест отмечает отказ на границе.",
    "macOverviewDescription": "Процесс Лены имеет текущую метку 2. Он читает памятку уровня 1 и черновик уровня 2. Чтение ответов уровня 3 блокируется на границе."
  },
  "widget": {
    "scenarioLabel": "Ситуация",
    "processLabel": "Независимый опыт",
    "objectLabel": "Файл",
    "operationLabel": "Операция",
    "objectOption": "{label} — {file}",
    "processes": {
      "lena2": "Лена: отдельный процесс L2",
      "lena3": "Лена: отдельный процесс L3",
      "boris1": "Борис: отдельный процесс L1"
    },
    "operations": {
      "read": "Чтение",
      "write": "Запись без чтения назначения",
      "edit": "Редактирование",
      "copy": "Копирование ответов в памятку"
    },
    "modelNames": {
      "dac": "DAC",
      "rbac": "RBAC",
      "mac": "MAC"
    },
    "structures": {
      "dac": "Назначения прав на объекты",
      "rbac": "Разрешения через роли",
      "mac": "Обязательные метки и границы"
    },
    "staticCaptions": {
      "dac": "Права на три файла и полномочие владельца",
      "mac": "Три уровня: процесс Лены с текущей меткой L2",
      "rbac": "Участники, роли и разрешения в одном курсе"
    },
    "pageTitles": {
      "dac": "DAC: назначения прав на файлы",
      "mac": "MAC: три уровня и направление данных",
      "rbac": "RBAC: права через роли",
      "comparison": "Один пример — три модели доступа"
    },
    "allowed": "Допустимо",
    "denied": "Отказ",
    "independentProcesses": "Каждый выбор — независимый опыт: состояние процесса не переносится между вариантами.",
    "legends": {
      "dac": "R — чтение; W — запись данных. Владелец отдельно управляет назначениями.",
      "rbac": "R — чтение; W — запись данных. Связи показывают назначения, а не перенос данных.",
      "comparison": "R — чтение; W — запись данных. DAC/RBAC показывают связи назначений; MAC — потоки данных. MAC здесь — учебная модель Белла — Лападулы."
    },
    "fallback": "Для изменения примера нужен JavaScript. Статическая схема приведена в разделе.",
    "intro": "Лена — преподаватель, Борис — ассистент. Они работают с памяткой, черновиком заданий и ответами к экзамену."
  },
  "messages": {
    "unknownModel": "Неизвестная модель: {model}",
    "copyReadDenied": "Процесс {process} не может читать {source} уровня {sourceLevel}: чтение вверх запрещено.",
    "copyWriteDenied": "Процесс {process} может прочитать {source}, но запись в {target} уровня {targetLevel} запрещена: данные нельзя переносить вниз.",
    "copyAllowed": "Чтение {source} и запись в {target} соответствуют текущей метке процесса {process}.",
    "readAllowed": "Файл {file} уровня {level} передаёт данные процессу {process}: чтение своего уровня и ниже разрешено.",
    "readDenied": "Процесс {process} не может читать {file} уровня {level}: чтение вверх запрещено. Выдача обычного права не меняет метку.",
    "writeAllowed": "Процесс {process} записывает данные в {file} уровня {level} без чтения назначения: запись своего уровня и выше разрешена.",
    "writeDenied": "Запись из процесса {process} в {file} уровня {level} запрещена: данные нельзя передавать вниз.",
    "editAllowed": "Изменение {file} включает чтение и запись; обе операции разрешены при совпадении меток {process}.",
    "editDenied": "Изменение включает чтение и запись, поэтому метка файла {level} должна совпадать с текущей меткой процесса {process}.",
    "permissionAllowed": "{subject}: есть {requested} {basis}.",
    "permissionDenied": "{subject}: не хватает {requested} {basis}.",
    "permissionRequest": "{right} на {file}",
    "permissionJoin": " и ",
    "dacBasis": "в назначениях прав на файлы",
    "rbacBasis": "через назначенные роли",
    "copyPermissionSuffix": " Отдельного запрета переноса данных в этой модели примера нет."
  },
  "roles": {
    "author": {
      "label": "Автор",
      "subjects": [
        "lena"
      ],
      "permissions": [
        {
          "object": "handout",
          "rights": [
            "R",
            "W"
          ]
        },
        {
          "object": "draft",
          "rights": [
            "R",
            "W"
          ]
        },
        {
          "object": "answers",
          "rights": [
            "R",
            "W"
          ]
        }
      ]
    },
    "assistant": {
      "label": "Ассистент",
      "subjects": [
        "boris"
      ],
      "permissions": [
        {
          "object": "handout",
          "rights": [
            "R"
          ]
        }
      ]
    },
    "reviewer": {
      "label": "Рецензент",
      "subjects": [],
      "permissions": [
        {
          "object": "answers",
          "rights": [
            "R"
          ]
        }
      ]
    }
  },
  "dac": {
    "owner": "lena",
    "rights": {
      "lena": {
        "handout": [
          "R",
          "W"
        ],
        "draft": [
          "R",
          "W"
        ],
        "answers": [
          "R",
          "W"
        ]
      },
      "boris": {
        "handout": [
          "R"
        ],
        "draft": [],
        "answers": []
      }
    }
  },
  "grant": {
    "subject": "boris",
    "object": "answers",
    "rights": [
      "R"
    ],
    "role": "reviewer"
  },
  "copy": {
    "source": "answers",
    "target": "handout"
  }
};
const sourceScenarios = [
  {
    "id": "handout",
    "label": "Борис читает памятку",
    "state": {
      "subject": "boris",
      "object": "handout",
      "operation": "read",
      "processLevel": 1,
      "granted": false
    }
  },
  {
    "id": "answers",
    "label": "Борис читает ответы: исходные назначения",
    "state": {
      "subject": "boris",
      "object": "answers",
      "operation": "read",
      "processLevel": 1,
      "granted": false
    }
  },
  {
    "id": "grant",
    "label": "Борис читает ответы: после выдачи доступа",
    "state": {
      "subject": "boris",
      "object": "answers",
      "operation": "read",
      "processLevel": 1,
      "granted": true
    }
  },
  {
    "id": "copy",
    "label": "Лена копирует ответы в памятку",
    "state": {
      "subject": "lena",
      "object": "handout",
      "operation": "copy",
      "processLevel": 3,
      "granted": false
    }
  }
];

// Данные и тексты создаются из example.yml; ниже только проверка доступа.
const example = sourceExample;
const scenarios = sourceScenarios;

const supportedModels = ['dac', 'rbac', 'mac'];
const supportedOperations = ['read', 'write', 'edit', 'copy'];

function normaliseState(model, state = {}) {
  if (!supportedModels.includes(model)) throw new RangeError(message('unknownModel', { model }));
  const input = state && typeof state === 'object' ? state : {};
  const subject = Object.hasOwn(example.subjects, input.subject) ? input.subject : 'boris';
  const object = Object.hasOwn(example.objects, input.object) ? input.object : 'handout';
  const processLevel = Number(input.processLevel ?? example.subjects[subject].level);
  return {
    ...input,
    subject,
    object,
    operation: supportedOperations.includes(input.operation) ? input.operation : 'read',
    processLevel: [1, 2, 3].includes(processLevel) ? processLevel : example.subjects[subject].level,
    granted: input.granted === true,
    overview: input.overview === true,
  };
}

function permissionFor(model, state, object, right) {
  if (model === 'dac') {
    const direct = example.dac.rights[state.subject][object];
    const extra = state.granted && state.subject === example.grant.subject
      && object === example.grant.object && example.grant.rights.includes(right);
    return direct.includes(right) || extra;
  }
  return Object.entries(example.roles).some(([roleId, role]) => {
    const assigned = role.subjects.includes(state.subject)
      || (state.granted && state.subject === example.grant.subject && roleId === example.grant.role);
    return assigned && role.permissions.some(permission => permission.object === object && permission.rights.includes(right));
  });
}

function message(key, values = {}) {
  return example.messages[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

function checkMac(state) {
  const process = state.processLevel;
  const object = example.objects[state.object];
  const values = { process, file: object.file, level: object.level };
  if (state.operation === 'copy') {
    const source = example.objects[example.copy.source];
    const target = example.objects[example.copy.target];
    Object.assign(values, { source: source.file, sourceLevel: source.level, target: target.file, targetLevel: target.level });
    if (source.level > process) return { allowed: false, reason: message('copyReadDenied', values) };
    if (target.level < process) return { allowed: false, reason: message('copyWriteDenied', values) };
    return { allowed: true, reason: message('copyAllowed', values) };
  }
  const allowed = state.operation === 'read' ? object.level <= process
    : state.operation === 'write' ? object.level >= process : object.level === process;
  return { allowed, reason: message(`${state.operation}${allowed ? 'Allowed' : 'Denied'}`, values) };
}

function evaluateAccess(model, state = {}) {
  const current = normaliseState(model, state);
  if (model === 'mac') return checkMac(current);
  const requests = current.operation === 'copy'
    ? [{ object: example.copy.source, right: 'R' }, { object: example.copy.target, right: 'W' }]
    : (current.operation === 'edit' ? ['R', 'W'] : [current.operation === 'read' ? 'R' : 'W'])
      .map(right => ({ object: current.object, right }));
  const allowed = requests.every(request => permissionFor(model, current, request.object, request.right));
  const values = {
    subject: example.subjects[current.subject].label,
    requested: requests.map(request => message('permissionRequest', { right: request.right, file: example.objects[request.object].file })).join(example.messages.permissionJoin),
    basis: example.messages[model === 'dac' ? 'dacBasis' : 'rbacBasis'],
  };
  const suffix = allowed && current.operation === 'copy' ? example.messages.copyPermissionSuffix : '';
  return { allowed, reason: message(allowed ? 'permissionAllowed' : 'permissionDenied', values) + suffix };
}


const diagramColours = {
  ink: '#17324d', muted: '#53697d', grid: '#cfdae3', white: '#ffffff',
  blue: '#2864b4', blueLight: '#edf4ff', teal: '#16776e', tealLight: '#e9f6f2',
  amber: '#a66608', amberLight: '#fff5e3', inactive: '#8b9aaa',
  bands: ['#f3f7fc', '#edf5fa', '#f0f8f6'],
};
let diagramSerial = 0;

function svgEscape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function diagramLabel(key, values = {}) {
  return String(example.labels[key]).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

function svgElement(tag, attributes = {}, content = '') {
  const attrs = Object.entries(attributes).map(([name, value]) => ` ${name}="${svgEscape(value)}"`).join('');
  return `<${tag}${attrs}>${content}</${tag}>`;
}

function diagramContext(width, id) {
  const compact = width <= 400;
  const wide = width >= 700;
  const font = compact ? 14 : wide ? 24 : 18;
  const parts = [];
  const smallFont = compact ? 14 : wide ? 22 : 16;
  const context = { width, id, compact, wide, font, smallFont, parts };
  context.add = (tag, attributes, content) => parts.push(svgElement(tag, attributes, content));
  context.text = (x, y, value, options = {}) => {
    const size = options['font-size'] || font;
    const lines = String(value).split('\n');
    const content = lines.length === 1 ? svgEscape(value) : lines.map((line, index) => svgElement('tspan', {
      x, y: y + (index - (lines.length - 1) / 2) * size * 1.22,
    }, svgEscape(line))).join('');
    context.add('text', {
      x, y, fill: diagramColours.ink, 'font-family': 'Arial, sans-serif',
      'font-size': font, 'text-anchor': 'middle', ...options,
    }, content);
  };
  context.rect = (x, y, w, h, options = {}) => context.add('rect', {
    x, y, width: w, height: h, rx: 5,
    fill: diagramColours.white, stroke: diagramColours.grid, 'stroke-width': 1.5, ...options,
  });
  context.path = (d, options = {}) => context.add('path', {
    d, fill: 'none', stroke: diagramColours.grid, 'stroke-width': 1.5, 'stroke-linecap': 'round', ...options,
  });
  return context;
}

function diagramLines(value, width, font) {
  const maxCharacters = Math.max(8, Math.floor(width / (font * 0.52)));
  return String(value).split('\n').flatMap(paragraph => {
    const lines = [];
    for (const word of paragraph.split(/\s+/)) {
      if (!lines.length || (lines[lines.length - 1] + ' ' + word).length > maxCharacters) lines.push(word);
      else lines[lines.length - 1] += ' ' + word;
    }
    return lines.length ? lines : [''];
  });
}

function svgParagraph(context, x, firstY, value, width, options = {}) {
  const size = options['font-size'] || context.font;
  const lines = diagramLines(value, width, size);
  lines.forEach((line, index) => context.text(x, firstY + index * size * 1.3, line, options));
  return firstY + (lines.length - 1) * size * 1.3;
}

function svgNode(context, x, centreY, width, height, lines, active = false, options = {}) {
  const { font } = context;
  lines = lines.flatMap(line => diagramLines(line, width - 10, font));
  height = Math.max(height, lines.length * font * 1.22 + font * 0.5);
  context.rect(x, centreY - height / 2, width, height, {
    fill: active ? diagramColours.blueLight : diagramColours.white,
    stroke: active ? diagramColours.blue : diagramColours.grid,
    'stroke-width': active ? 2.2 : 1.5, ...options,
  });
  const lineHeight = font * 1.22;
  const firstY = centreY - (lines.length - 1) * lineHeight / 2 + font * 0.34;
  lines.forEach((line, index) => context.text(x + width / 2, firstY + index * lineHeight, line));
}

function svgArrow(context, start, end, active = true, options = {}) {
  context.path(`M${start.x} ${start.y} L${end.x} ${end.y}`, {
    stroke: active ? diagramColours.teal : diagramColours.inactive,
    'stroke-width': active ? 2.8 : 1.6,
    'marker-end': `url(#${context.id}-${active ? 'flow' : 'relation'})`, ...options,
  });
}

function relevantObjects(state) {
  return state.operation === 'copy' ? [example.copy.source, example.copy.target] : [state.object];
}

function renderDac(context, state) {
  const { width, compact, font } = context;
  const margin = compact ? 8 : 20;
  const personWidth = compact ? 68 : width * 0.16;
  const columnWidth = (width - margin * 2 - personWidth) / 3;
  const headerY = compact ? 33 : 48;
  const headerLines = Math.max(...Object.values(example.objects).map(object => diagramLines(object.label, columnWidth - 6, font).length));
  const tableTop = headerY + font * 1.3 * (headerLines + 1) + font * 0.8;
  const rowHeight = compact ? 61 : 91;
  const tableBottom = tableTop + rowHeight * 2;
  const subjects = Object.entries(example.subjects);
  const objects = Object.entries(example.objects);
  const selected = relevantObjects(state);
  context.text(margin + 5, headerY, diagramLabel('matrixSubject'), { 'text-anchor': 'start', 'font-weight': 600 });
  objects.forEach(([objectId, object], column) => {
    const x = margin + personWidth + columnWidth * (column + 0.5);
    const labelBottom = svgParagraph(context, x, headerY, object.label, columnWidth - 6, { 'font-weight': 600 });
    context.text(x, labelBottom + font * 1.4, object.file, { 'font-size': context.smallFont, fill: diagramColours.muted });
    subjects.forEach(([subjectId], row) => {
      const current = { ...state, subject: subjectId, object: objectId };
      const rights = ['read', 'write'].flatMap((operation, index) => evaluateAccess('dac', { ...current, operation }).allowed ? [index === 0 ? 'R' : 'W'] : []);
      const active = !state.overview && subjectId === state.subject && selected.includes(objectId);
      const allowed = evaluateAccess('dac', state).allowed;
      if (active) context.rect(margin + personWidth + columnWidth * column + 3, tableTop + rowHeight * row + 4, columnWidth - 6, rowHeight - 8, {
        stroke: allowed ? diagramColours.teal : diagramColours.amber,
        fill: allowed ? diagramColours.tealLight : diagramColours.amberLight,
      });
      context.text(x, tableTop + rowHeight * (row + 0.5) + font * 0.35, rights.join(', ') || '—', { 'font-weight': active ? 600 : 400 });
    });
  });
  for (let row = 0; row <= 2; row += 1) context.path(`M${margin} ${tableTop + row * rowHeight} H${width - margin}`);
  for (let column = 0; column < 3; column += 1) {
    const x = margin + personWidth + column * columnWidth;
    context.path(`M${x} ${compact ? 12 : 19} V${tableBottom}`);
  }
  subjects.forEach(([subjectId, subject], row) => context.text(margin + 5, tableTop + rowHeight * (row + 0.5) + font * 0.35, subject.label, {
    'text-anchor': 'start', 'font-weight': !state.overview && subjectId === state.subject ? 600 : 400,
  }));
  context.text(width / 2, tableBottom + font * 2, diagramLabel('owner', { subject: example.subjects[example.dac.owner].label }), { 'font-weight': 600 });
  const footerBottom = svgParagraph(context, width / 2, tableBottom + font * 3.8, state.granted
    ? diagramLabel('dacGranted', { subject: example.subjects[example.grant.subject].label, file: example.objects[example.grant.object].file })
    : diagramLabel('dacHint'), width - margin * 2, { 'font-size': context.smallFont, fill: diagramColours.muted });
  return footerBottom + font * 1.3;
}

function renderRbac(context, state) {
  const { width, compact, wide, font } = context;
  const personX = compact ? 6 : 16;
  const personWidth = compact ? width * 0.19 : width * 0.17;
  const roleX = width * (compact ? 0.30 : 0.32);
  const roleWidth = width * (compact ? 0.25 : 0.22);
  const permissionX = width * (compact ? 0.64 : 0.69);
  const permissionWidth = width - permissionX - (compact ? 6 : 16);
  const centres = compact ? [111, 232, 339] : wide ? [146, 328, 470] : [125, 280, 408];
  const personHeight = font * 2.6;
  const roleHeight = font * 2.6;
  const authorHeight = font * 4.5;
  const shortHeight = font * 2.8;
  const headerY = compact ? 30 : 44;
  const authorId = Object.keys(example.roles).find(id => example.roles[id].subjects.includes('lena'));
  const assistantId = Object.keys(example.roles).find(id => example.roles[id].subjects.includes('boris'));
  const roleIds = [authorId, assistantId, example.grant.role];
  const positions = Object.fromEntries(roleIds.map((roleId, index) => [roleId, centres[index]]));
  const subjects = Object.entries(example.subjects);
  context.text(personX + personWidth / 2, headerY, diagramLabel(compact ? 'peopleCompact' : 'people'), { 'font-weight': 600 });
  context.text(roleX + roleWidth / 2, headerY, diagramLabel('roles'), { 'font-weight': 600 });
  context.text(permissionX + permissionWidth / 2, headerY, diagramLabel(compact ? 'permissionsCompact' : 'permissions'), { 'font-weight': 600 });

  // Линии лежат только в промежутках между тремя столбцами.
  subjects.forEach(([subjectId], index) => {
    const personY = centres[index];
    roleIds.forEach(roleId => {
      const role = example.roles[roleId];
      const assigned = role.subjects.includes(subjectId)
        || (state.granted && subjectId === example.grant.subject && roleId === example.grant.role);
      if (!assigned) return;
      const active = !state.overview && subjectId === state.subject;
      const yOffset = personY === positions[roleId] ? 0 : personHeight * 0.28;
      svgArrow(context, { x: personX + personWidth + 5, y: personY + yOffset }, { x: roleX - 7, y: positions[roleId] }, active);
    });
  });
  roleIds.forEach(roleId => {
    const role = example.roles[roleId];
    const y = positions[roleId];
    const assigned = role.subjects.includes(state.subject)
      || (state.granted && state.subject === example.grant.subject && roleId === example.grant.role);
    const relevant = role.permissions.some(permission => relevantObjects(state).includes(permission.object));
    const active = !state.overview && assigned && relevant;
    svgArrow(context, { x: roleX + roleWidth + 6, y }, { x: permissionX - 7, y }, active);
    svgNode(context, roleX, y, roleWidth, roleHeight, [role.label], active);
    const lines = role.permissions.map(permission => `${permission.rights.join(compact ? '' : ', ')} · ${example.objects[permission.object].label}`);
    svgNode(context, permissionX, y, permissionWidth, roleId === authorId ? authorHeight : shortHeight, lines, active);
  });
  subjects.forEach(([subjectId, subject], index) => svgNode(context, personX, centres[index], personWidth, personHeight, [subject.label], !state.overview && subjectId === state.subject, { rx: personHeight / 2 }));
  const footerY = centres[2] + roleHeight / 2 + font * 2.1;
  const footer = state.granted
    ? diagramLabel('rbacGranted', { subject: example.subjects[example.grant.subject].label, role: example.roles[example.grant.role].label })
    : diagramLabel('rbacHint');
  const footerBottom = svgParagraph(context, width / 2, footerY, footer, width - 24, { fill: diagramColours.muted, 'font-size': context.smallFont });
  return footerBottom + font * 1.5;
}

function macGeometry(context) {
  const { width, compact, wide } = context;
  const top = compact ? 48 : 66;
  const rowHeight = compact ? 122 : wide ? 154 : 138;
  const levelWidth = wide ? Math.max(170, width * 0.18) : 27;
  const processX = levelWidth + (compact ? 5 : 9);
  const processWidth = compact ? width * 0.27 : wide ? Math.max(210, width * 0.21) : width * 0.29;
  const fileWidth = compact ? width * 0.32 : wide ? Math.max(220, width * 0.25) : width * 0.32;
  const fileX = width - fileWidth - (compact ? 7 : 18);
  return {
    top, rowHeight, processX, processWidth, fileX, fileWidth,
    nodeHeight: compact ? 44 : wide ? 64 : 54,
    centre: level => top + (3 - level + 0.5) * rowHeight,
    boundaries: [top + rowHeight, top + rowHeight * 2],
  };
}

function macFlow(context, geometry, state, objectId, operation, processY, offset = 0) {
  const object = example.objects[objectId];
  const fileY = geometry.centre(object.level) + offset;
  const portY = processY + offset + Math.sign(fileY - processY) * geometry.nodeHeight * 0.22;
  const processPort = { x: geometry.processX + geometry.processWidth + 7, y: portY };
  const filePort = { x: geometry.fileX - 7, y: fileY };
  const start = operation === 'read' ? filePort : processPort;
  const end = operation === 'read' ? processPort : filePort;
  const result = evaluateAccess('mac', { ...state, object: objectId, operation });
  if (result.allowed) {
    svgArrow(context, start, end);
    return;
  }
  const crossings = geometry.boundaries
    .map(y => ({ y, t: (y - start.y) / (end.y - start.y) }))
    .filter(point => point.t > 0 && point.t < 1)
    .sort((a, b) => a.t - b.t);
  const crossing = crossings[0] || { y: (start.y + end.y) / 2, t: 0.5 };
  const x = start.x + crossing.t * (end.x - start.x);
  const crossSize = context.compact ? 5 : 8;
  context.path(`M${start.x} ${start.y} L${x} ${crossing.y}`, { stroke: diagramColours.amber, 'stroke-width': 2.8, 'stroke-dasharray': '6 5' });
  context.path(`M${x - crossSize} ${crossing.y - crossSize} L${x + crossSize} ${crossing.y + crossSize} M${x + crossSize} ${crossing.y - crossSize} L${x - crossSize} ${crossing.y + crossSize}`, { stroke: diagramColours.amber, 'stroke-width': 3 });
}

function renderMac(context, input) {
  const state = input.overview ? normaliseState('mac', { ...input, subject: 'lena', processLevel: 2, operation: 'read' }) : input;
  const { width, compact, wide, font } = context;
  const geometry = macGeometry(context);
  const { top, rowHeight, centre, processX, processWidth, fileX, fileWidth, nodeHeight } = geometry;
  const bottom = top + rowHeight * 3;
  context.text(wide ? 12 : 14, compact ? 28 : 41, diagramLabel(wide ? 'levels' : 'levelsCompact'), {
    'text-anchor': wide ? 'start' : 'middle', 'font-weight': 600,
    'font-size': font,
  });
  context.text(processX + processWidth / 2, compact ? 28 : 41, diagramLabel(compact ? 'processesCompact' : 'processes'), { 'font-weight': 600 });
  context.text(fileX + fileWidth / 2, compact ? 28 : 41, diagramLabel('files'), { 'font-weight': 600 });
  [...example.levels].reverse().forEach((level, index) => {
    context.rect(0, top + index * rowHeight, width, rowHeight, { rx: 0, fill: diagramColours.bands[index], stroke: 'none' });
    if (index) context.path(`M0 ${top + index * rowHeight} H${width}`, { stroke: '#a9bbc9', 'stroke-dasharray': '5 5' });
    if (wide) {
      context.text(12, centre(level.value) - font * 0.25, `L${level.value}`, { 'text-anchor': 'start', 'font-weight': 600 });
      context.text(12, centre(level.value) + font, level.name, { 'text-anchor': 'start', 'font-size': context.smallFont, fill: diagramColours.muted });
    } else context.text(14, centre(level.value) + font * 0.35, String(level.value), { 'font-weight': 600 });
  });
  const shownSubjects = state.overview ? [[state.subject, example.subjects[state.subject]]] : Object.entries(example.subjects);
  const processLevels = Object.fromEntries(shownSubjects.map(([id, subject]) => [id, id === state.subject ? state.processLevel : subject.level]));
  const processPositions = {};
  shownSubjects.forEach(([id]) => {
    const sameLevel = shownSubjects.filter(([other]) => processLevels[other] === processLevels[id]);
    const position = sameLevel.findIndex(([other]) => other === id);
    processPositions[id] = centre(processLevels[id]) + (sameLevel.length > 1 ? (position === 0 ? -1 : 1) * (nodeHeight / 2 + 5) : 0);
  });
  const processY = processPositions[state.subject];
  if (state.overview) {
    Object.keys(example.objects).forEach(objectId => macFlow(context, geometry, state, objectId, 'read', processY));
  } else if (state.operation === 'copy') {
    macFlow(context, geometry, state, example.copy.source, 'read', processY, -6);
    // После отказа чтения данные не попадают в процесс, запись не начинается.
    if (evaluateAccess('mac', { ...state, operation: 'read', object: example.copy.source }).allowed) {
      macFlow(context, geometry, state, example.copy.target, 'write', processY, 6);
    }
  } else if (state.operation === 'edit') {
    macFlow(context, geometry, state, state.object, 'read', processY, -7);
    macFlow(context, geometry, state, state.object, 'write', processY, 7);
  } else macFlow(context, geometry, state, state.object, state.operation, processY);
  Object.entries(example.objects).forEach(([id, object]) => {
    const selected = state.overview || relevantObjects(state).includes(id);
    svgNode(context, fileX, centre(object.level), fileWidth, nodeHeight + (wide ? 13 : 6), !wide
      ? [object.label, object.file]
      : [object.label, `${object.file} · L${object.level}`], selected);
  });
  shownSubjects.forEach(([id, subject]) => svgNode(context, processX, processPositions[id], processWidth, nodeHeight, [
    subject.processLabel || subject.label, diagramLabel(wide ? 'processLevel' : 'processLevelCompact', { level: processLevels[id] }),
  ], id === state.subject, { rx: nodeHeight / 2 }));
  const legendY = bottom + font * 1.8;
  svgArrow(context, { x: 14, y: legendY - 5 }, { x: 44, y: legendY - 5 });
  context.text(54, legendY, diagramLabel('allowedFlow'), { 'text-anchor': 'start', 'font-size': context.smallFont });
  const secondX = !wide ? 14 : width * 0.57;
  const secondY = !wide ? legendY + font * 1.8 : legendY;
  context.path(`M${secondX} ${secondY - 10} L${secondX + 12} ${secondY + 2} M${secondX + 12} ${secondY - 10} L${secondX} ${secondY + 2}`, { stroke: diagramColours.amber, 'stroke-width': 2.5 });
  context.text(secondX + 25, secondY, diagramLabel('blockedFlow'), { 'text-anchor': 'start', 'font-size': context.smallFont });
  const captionY = secondY + font * 1.9;
  const captionBottom = svgParagraph(context, width / 2, captionY, diagramLabel(`${state.operation}Flow`), width - 24, { 'font-size': context.smallFont, fill: diagramColours.muted });
  return captionBottom + font * 1.2;
}

function renderDiagram(model, state = {}, options = {}) {
  const current = normaliseState(model, state);
  const numericWidth = Number(options.width ?? 1000);
  const width = Number.isFinite(numericWidth) ? Math.max(320, Math.min(2000, numericWidth)) : 1000;
  const prefix = String(options.idPrefix ?? 'access-example').replace(/[^a-zA-Z0-9_-]/g, '-');
  const id = `${prefix}-${model}-${++diagramSerial}`;
  const context = diagramContext(width, id);
  const height = ({ dac: renderDac, rbac: renderRbac, mac: renderMac })[model](context, current);
  const result = evaluateAccess(model, current);
  const title = diagramLabel(`${model}Title`);
  const description = diagramLabel(model === 'mac' && current.overview ? 'macOverviewDescription' : `${model}Description`)
    + (current.overview ? '' : ` ${result.reason}`);
  const markers = [['flow', diagramColours.teal], ['relation', diagramColours.inactive]].map(([name, colour]) => svgElement('marker', {
    id: `${id}-${name}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
    markerWidth: 6, markerHeight: 6, orient: 'auto', markerUnits: 'strokeWidth',
  }, svgElement('path', { d: 'M0 0 L10 5 L0 10 Z', fill: colour, stroke: 'none' }))).join('');
  return svgElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${width} ${height}`,
    width, height, role: 'img', 'aria-labelledby': `${id}-title ${id}-desc`,
    style: 'display:block;max-width:100%;height:auto;background:#ffffff',
  }, svgElement('title', { id: `${id}-title` }, svgEscape(title))
    + svgElement('desc', { id: `${id}-desc` }, svgEscape(description))
    + svgElement('defs', {}, markers)
    + svgElement('rect', { x: 0, y: 0, width, height, fill: diagramColours.white, stroke: 'none' })
    + context.parts.join(''));
}


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

function initialiseExamples(container = document) {
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

window.AccessCourseExamples = {init: initialiseExamples};
})();
