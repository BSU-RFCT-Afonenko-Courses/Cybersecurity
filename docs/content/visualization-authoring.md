# Авторский интерфейс визуализаций

Пилот проверяет MAC в HTML теории и Reveal с установленными Core/Presentation 8.2.8
и Quarto 1.11.6. Обычная навигация пилот не включает. Предметные правила,
пояснения и DOT остаются в `shared/visualizations`; автор редактирует только их.

## Подготовка и проверочный запуск

Из корня курса:

```sh
python3 CI/build-visualizations.py
python3 CI/prepare-visualizations.py theory seminars
python3 CI/prepare-bank-fragments.py --source task/bank/fundamentals.qmd --id exr-fundamentals-event-or-incident --id exr-fundamentals-cia-cases --output seminars/_prepared/bank-fragments
quarto render theory/access-control/visualization-pilot.qmd --profile student,pilot --no-clean
quarto render seminars/visualization-pilot.qmd --profile student,pilot --no-clean
```

`pilot` — отдельный профиль подключения; его не добавляют к обычной сборке курса.
Для преподавательской пробы замените `student,pilot` на `full,pilot`.
Подготовка создаёт локальные копии из единственного авторского источника;
`_prepared` не редактируют и не коммитят. После правки общего исходника повторяют
подготовку. `_generated` для включений не подходит: Core 8.2.8 исключает его из
проверяемого состава источников. Прямой include из соседнего проекта также запрещён.

## Подключение в QMD

Вложенная глава `theory/access-control/*.qmd`:

```markdown
![Три уровня мандатной модели](../_prepared/visualizations/access-control/mac/static/overview.svg){#fig-mac-overview fig-alt="Процесс L2 и файлы трёх уровней"}

См. @fig-mac-overview и @fig-mac-decision.

{{< include ../_prepared/visualizations/mac-example.qmd >}}
```

Слайды `seminars/*.qmd` используют тот же исходник:

```markdown
![Три уровня мандатной модели](_prepared/visualizations/access-control/mac/static/overview.svg){#fig-mac-overview fig-alt="Процесс L2 и файлы трёх уровней"}

{{< include _prepared/visualizations/mac-example.qmd >}}

См. @fig-mac-decision.
```

У включаемого фрагмента фиксированы `macRequest` и `fig-mac-decision`:
включать его следует один раз на документ. Второй независимый экземпляр задаётся
двумя короткими OJS-ячейками с собственными именами и подписью:

````markdown
```{ojs}
//| echo: false
viewof macSecond = macControls({initial:1})
```

```{ojs}
//| echo: false
//| label: fig-mac-second
//| fig-cap: "Второй запрос мандатной модели"
macDiagram(macSecond, macNotes)
```
````

Полная форма без QMD-включения — обычные OJS-ячейки:

````markdown
```{ojs}
//| echo: false
import {macControls, macDiagram} from "/_prepared/visualizations/access-control/mac/lesson.js"
viewof ownMacRequest = macControls()
```

```{ojs}
//| echo: false
//| label: fig-own-mac
//| fig-cap: "Проверка одного запроса"
macDiagram(ownMacRequest, {request:"Один запрос, одна политика"})
```
````

Проектные пути `/...` одинаковы во вложенной теории и корневых слайдах.
Входной модуль — обычный ES-модуль `.js`. Его imports разрешаются относительно
файла, а SVG загружаются через `new URL(..., import.meta.url)`. Не заменяйте его
на root-relative `.ojs`: в Quarto 1.11.6 такой импорт ломается у корневого документа
подсайта при пустом `docToRoot`. Пояснения остаются в OJS общего QMD-фрагмента.

## Две авторские правки

1. Для переименования узла исправьте `label` в
   `shared/visualizations/access-control/mac/graphs/model.dot`, например
   `label="Процесс Лены · L2"` → `label="Процесс преподавателя · L2"`.
   Семантический `id="process"` сохраните. Повторите подготовку SVG и включений.
2. Для удаления пояснения уровня удалите свойство `levels` из `macNotes` в
   `shared/visualizations/_mac-example.qmd`. Этап `levels` остаётся
   в `macTrace`: его подсветка, последовательность проверок и решение не меняются.
   Пилотный второй экземпляр уже показывает этот случай через неполный объект notes.

Обычные объяснения и подписи — Markdown/QMD. Короткие метки и связи — DOT.
Предметное вычисление — JS. Пояснения именованных этапов — небольшой объект OJS.
Не переносите условие упражнения или закрытый ключ в OJS/JS.

## Проверенный интерфейс

- `macTrace(query)` возвращает новую трассу этапов; `query` содержит `subject`,
  `object` (1–3), `operation` (`read` или `write`). Пилотные запросы используют процесс L2.
  `write` означает добавление без чтения назначения. Для обычного редактирования
  потребовались бы обе проверки; категории и исключения здесь не моделируются.
- `macQueries` — именованный экспорт отдельного файла MAC. Новые DAC и RBAC
  получают свои файлы и экспорты, без переключателя моделей.
- `macControls({initial:0})` создаёт независимое управление. `viewof` возвращает
  `{query, trace, index, stage}`. Смена запроса сбрасывает выбранный этап.
- `macDiagram(selected, notes={})` возвращает две схемы и пояснение одного
  `selected.stage`. Перерисовка не заменяет внешнюю подпись Quarto.
- Технический `createControls(traceFor, queries, {initial})` не знает политики;
  запросы имеют поле `label`. Этап имеет `name`, `label`, массивы семантических
  ключей `model` и `algorithm`, необязательный `result` (`allow`/`deny`).
- Технический `renderStage({selected, model, algorithm, notes})` получает SVG-строки,
  переносит исходные SVG id в `data-key`, создаёт уникальные DOM id и подсвечивает
  ключи выбранного этапа. `notes` индексируются по `stage.name`, их отсутствие допустимо.
- `prepareSVG(source, keys, result)` и `serializeSVG(svg)` доступны отдельно.
  Экспорт сохраняет текущую подсветку и вычисленные стили. Общий заголовок и номер
  отсутствуют в SVG: ими управляют `fig-cap`, `#fig-*` и `@fig-*` Quarto.

Обзорный SVG всегда подключается обычным Markdown и пригоден без JavaScript.
Для печати автор сохраняет выбранную схему кнопкой «Сохранить SVG» и включает её
обычным изображением с подписью Quarto. Автоматический PDF-рендер интерактивного
состояния этим интерфейсом не обещается.

## Условие банка на слайде из одного источника

Core 8.2.8 не объявляет импорт произвольного `#exr-*`, QRC разрешает ссылки,
а native `{{< include файл.qmd >}}` вставляет весь файл. Дополнительный аргумент
`#exr-*` не отбирает блок. Не включайте банковскую главу целиком.

Выберите ID командой подготовки выше, затем включайте созданный локальный файл:

```markdown
## Вопрос для аудитории {.smaller}

{{< include _prepared/bank-fragments/exr-fundamentals-event-or-incident.qmd >}}
```

Команду запускают после каждого изменения канонического `task/bank/*.qmd`, до рендера.
Она механически выбирает условие и `#sol-*` с тем же суффиксом (или уже вложенное
решение), сохраняет их ID и переносит только банковские defaults в атрибуты условия.
Метаданные страницы, aliases и другие упражнения не попадают во включение.
Фрагмент можно использовать в обеих проекциях; собственной политики ключей у
подготовки нет. Документ, включающий банковские вопросы, явно объявляет:

```yaml
exercise-bank: true
default-exercise-target: manual
default-exercise-course-role: independent-study
default-exercise-statement-visibility: open
course-presentation:
  answers: auto
```

Core удаляет закрытый разбор из student. `answers: expanded`, стадия назначения
или класс раскрытия не открывают ключ. Открытая демонстрация требует одновременно
`statement-visibility="open"` и `course-role="demonstration"` у канонического
условия; связанный разбор виден student и full. Раскрытие доступного разбора
оформляет Presentation, а не собственная карточка или OJS.
Подборка источников использует `course-role="reading"`.

`_prepared/bank-fragments/**` и подготовленные `.qmd` явно исключены из resources.
Публичные SVG доставляются отдельно; в выходной каталог также попадают необходимые
публичные `.ojs`/`.js`, поэтому секреты в них хранить нельзя.
Канонический банк тем 1–3 пилот не переписывает.

## Разметка и следующие модели

Выбраны порты и `splines=polyline`: они сохраняют направления потоков при изменении
меток. Автоматические сплайны дали менее предсказуемое сближение встречных стрелок;
сохранённые `pos` и пути воспроизводимы, но требуют пересчёта после изменения текста.
Сравнение воспроизводится `python3 CI/visualizations/graphviz-routing.py`.
Геометрию рассчитывает Graphviz при подготовке; браузер не содержит Graphviz.

Для переноса Solmedium создаёт отдельные каталоги `access-control/dac`,
`access-control/rbac`, `crypto/lcg`, `crypto/caesar`, `crypto/xor`, `data-integrity/...`.
У каждого примера свои предметные JS/DOT/пояснения и именованные экспорты;
общая обвязка принимает готовые трассы и SVG. Граф не описывается второй раз в рендере.
Большой YAML и универсальный DSL не требуются.
