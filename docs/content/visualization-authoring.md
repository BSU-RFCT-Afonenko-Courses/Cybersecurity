# Авторский интерфейс визуализаций

Предметные вычисления, запросы, объяснения, DOT и SVG находятся в
`shared/visualizations/`. Общая обвязка — в авторском расширении
`extensions/course-visualizations/`. Теория и слайды используют одни исходники.

## Подготовка

Перед рендером `theory` и `seminars` автоматически выполняется
`CI/prepare-course-visualizations.py`. Он запускает построение SVG,
копирует публичные модули в проектный `_prepared/visualizations/`
и выбирает запрошенные банковские условия до инвентаризации Core.
Подготовленные копии не редактируют и не коммитят.

Для отдельной подготовки из корня курса:

```sh
python3 CI/build-visualizations.py
python3 CI/prepare-visualizations.py theory seminars
```

Нужны Python 3, Node.js, Graphviz (`dot`), `quarto pandoc`
и зависимости из `CI/requirements-visualizations.txt`.
Браузер получает готовые SVG и JavaScript; эти средства сборки ему не нужны.

## Статический рисунок

Вложенные главы теории обращаются к локальной подготовленной копии:

```markdown
![Три уровня мандатной модели](../_prepared/visualizations/access-control/mac/static/overview.svg){#fig-mac-overview fig-alt="Процесс L2 и файлы трёх уровней"}

См. @fig-mac-overview.
```

Для `seminars/*.qmd` путь начинается с `_prepared/visualizations/`.
Подпись, номер и ссылку задаёт Quarto. Внутри SVG остаются содержательные
подписи узлов, стрелок и частей схемы. Общий заголовок рисунка там не дублируется.

SVG моделей DAC, MAC и RBAC редактируются непосредственно в `static/`;
блок-схемы алгоритмов — в `graphs/*.dot`. Сборщик преобразует сохранённые
DOT в SVG. Согласуйте идентификаторы групп рисунка с ключами подсветки
предметной трассы. [Структура схем доступа](../../shared/visualizations/access-control/README.md).

## Интерактивный рисунок в OJS

Проектный путь `FileAttachment` одинаков во вложенной теории и в слайдах:

````markdown
```{ojs}
//| echo: false
macLesson = await import(await FileAttachment("/_prepared/visualizations/access-control/mac/lesson.js").url())
viewof ownMacRequest = macLesson.macControls()
```

```{ojs}
//| echo: false
//| label: fig-own-mac
//| fig-cap: "Проверка одного запроса мандатной модели"
//| fig-alt: "На схеме выделены запрос, применяемое правило и результат"
macLesson.macDiagram(ownMacRequest, {request: "Один запрос, одна политика"})
```
````

Модуль объявляется один раз на документ; следующие ячейки используют его
функции. Каждый независимый экземпляр получает собственные имена OJS
и `fig-*`. Импорты внутри `.js` разрешаются относительно модуля;
SVG загружаются через `new URL(..., import.meta.url)`.

Общий фрагмент `shared/visualizations/_mac-example.qmd` уже содержит
управление, объяснения этапов и рисунок. Подготовка создаёт
`_prepared/visualizations/mac-example.qmd`; его можно включить один раз
в документ:

```markdown
{{< include ../_prepared/visualizations/mac-example.qmd >}}
```

В слайдах уберите начальное `../`. Фрагмент задаёт имена `macRequest`,
`macNotes` и `fig-mac-decision`; для второго экземпляра используйте прямую
форму с собственными именами.

## Модели и runtime

У DAC, MAC и RBAC отдельные `model.js` и `lesson.js`.
Предметный `*Trace(query)` возвращает последовательность этапов.
`*Controls(options)` создаёт управление с состоянием
`{query, trace, index, stage}`; смена запроса сбрасывает этап.
`*Diagram(selected, notes)` показывает выбранное состояние и пояснение.

Общие функции находятся в `shared/visualizations/common/runtime.js`:

- `createControls(traceFor, queries, options)` управляет запросом и этапом;
- `prepareSVG(source, keys, result)` подготавливает SVG и его подсветку;
- `renderStage({selected, model, algorithm, notes})` соединяет схемы и объяснение.

Этап содержит `name`, `label`, ключи `model` и `algorithm`, а при необходимости —
результат `allow` или `deny`. Пояснения индексируются по `stage.name`.
Удаление пояснения не удаляет этап и не меняет решение модели.
Runtime изолирует DOM-идентификаторы каждого экземпляра и сохраняет
семантические ключи SVG в `data-key`.

| Предметный модуль | Компоненты |
| --- | --- |
| `access-control/{dac,mac,rbac}/lesson.js` | Управление запросом и пошаговая проверка соответствующей политики |
| `authentication/lesson.js` | Сравнение процедур, регистрация passkey, вход с passkey |
| `crypto/lesson.js` | LCG, публичная цепочка хешей, изменение битов, усечённая коллизия, проверка файла, парольные опыты, Цезарь, XOR |
| `data-integrity/lesson.js` | Сумма и хеш, шкалы копирования, RAID, коллизия суммы, изменение байта, замена эталона, восстановление XOR |

Учебные опыты не назначают задачи и не сохраняют оценки.
Условия, решения и педагогические роли задаются штатной разметкой курса.
Закрытые ключи и ответы не размещаются в публичных JS, OJS и SVG.

## Условие банка на слайде

Канонический источник — `task/bank/*.qmd`. Для получения конкретных объектов:

```sh
python3 CI/prepare-bank-fragments.py --source task/bank/fundamentals.qmd --id exr-fundamentals-event-or-incident --output seminars/_prepared/bank-fragments
```

На слайде включается подготовленный фрагмент:

```markdown
## Вопрос для аудитории

{{< include _prepared/bank-fragments/exr-fundamentals-event-or-incident.qmd >}}
```

Подготовка выбирает условие и его парное либо вложенное решение,
сохраняет ID и банковские defaults. Остальные задачи и метаданные страницы
не переносятся. Одноимённый объект не включают дважды в один документ.
Обычная подготовка перед рендером определяет необходимые ID по включениям;
отсутствующий или неоднозначный ID останавливает её.

Документ с банковскими фрагментами явно объявляет:

```yaml
exercise-bank: true
default-exercise-target: manual
default-exercise-course-role: independent-study
default-exercise-statement-visibility: open
course-presentation:
  answers: auto
```

Core определяет видимость условий и решений. Раскрытие Presentation
и стадия назначения не меняют доступ к ключу. Смысловые правила блоков
приведены в [руководстве учебных элементов](../source-structure.md).

## Доставка и проверка

В проектах используются `embed-resources: false` и `html-math-method: mathml`.
Публичные `.js` и SVG из `_prepared/visualizations/` включены в ресурсы явно;
подготовленные QMD и банковские фрагменты исключены.
Quarto доставляет статические SVG как обычные ресурсы из `_prepared/visualizations/`.
Фильтр авторского расширения подключает стили; OJS компилирует сам Quarto.

Runtime установленного авторского расширения копируется в
`_prepared/visualizations/common/course-runtime.js`;
проектный вход `common/runtime.js` ссылается на эту копию.
Весь `_extensions` в публикацию не переносится.

Предметные тесты и браузерные сценарии находятся в `CI/visualizations/`.
Проверяйте модели отдельно от отображения, а готовые страницы — по HTTP,
включая оба профиля, несколько независимых экземпляров и доставку
транзитивных модулей и SVG. Порядок сборки и доступные команды описаны
[в руководстве проверок](../build.md).
