# Авторский интерфейс визуализаций

Визуализации DAC, MAC и RBAC включены в HTML теории и слайды Reveal
с установленными Core/Presentation 8.2.8 и Quarto 1.11.6. Предметные правила,
пояснения и рисунки находятся в `shared/visualizations`. Происхождение
восстановленных композиций описано в [руководстве схем доступа](../../shared/visualizations/access-control/README.md).

## Подготовка и проверочный запуск

Расширение установлено целиком в theory и seminars; filters уже подключены.
При изменении исходника общей обвязки повторите штатную установку из корня курса:

```sh
(cd theory && quarto add ../extensions/course-visualizations --no-prompt)
(cd seminars && quarto add ../extensions/course-visualizations --no-prompt)
```

Подготовка содержания и целевые пробы из корня курса:

```sh
python3 CI/build-visualizations.py
python3 CI/prepare-visualizations.py theory seminars
python3 CI/prepare-bank-fragments.py --source task/bank/fundamentals.qmd --id exr-fundamentals-event-or-incident --id exr-fundamentals-cia-cases --output seminars/_prepared/bank-fragments
quarto render theory/access-control/access-control.qmd --profile student --no-clean
quarto render seminars/04-access-control.qmd --profile student --no-clean
```

Для преподавательской пробы замените `student` на `full`. Пилоты используют только
для изолированной диагностики с отдельным кэшем и сохранением/восстановлением
обычного состояния сборки; их не запускают поверх обычной сборки курса.
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
viewof macSecond = macLesson.macControls({initial:1})
```

```{ojs}
//| echo: false
//| label: fig-mac-second
//| fig-cap: "Второй запрос мандатной модели"
macLesson.macDiagram(macSecond, macNotes)
```
````

Полная форма без QMD-включения — обычные OJS-ячейки:

````markdown
```{ojs}
//| echo: false
macLesson = await import(await FileAttachment("/_prepared/visualizations/access-control/mac/lesson.js").url())
viewof ownMacRequest = macLesson.macControls()
```

```{ojs}
//| echo: false
//| label: fig-own-mac
//| fig-cap: "Проверка одного запроса"
macLesson.macDiagram(ownMacRequest, {request:"Один запрос, одна политика"})
```
````

Проектные пути `FileAttachment("/...")` одинаковы во вложенной теории и корневых слайдах.
Входной модуль — обычный ES-модуль `.js`. Его imports разрешаются относительно
файла, а SVG загружаются через `new URL(..., import.meta.url)`. Не заменяйте его
на root-relative `.ojs`: в Quarto 1.11.6 такой импорт ломается у корневого документа
подсайта при пустом `docToRoot`. Пояснения остаются в OJS общего QMD-фрагмента.

## Две авторские правки

1. Для изменения подписи процесса в восстановленной схеме откройте
   `shared/visualizations/access-control/mac/static/model.svg`: видимый текст
   `Лена` находится в группе `person-lena`. Сохраните идентификаторы групп.
   Такой же текст статического обзора находится в соседнем `overview.svg`.
   Подписи запросов и пояснения этапов редактируются отдельно в `model.js`
   и общем QMD-фрагменте. После правки повторите подготовку включений.
2. Для удаления пояснения уровня удалите свойство `levels` из `macNotes` в
   `shared/visualizations/_mac-example.qmd`. Этап `levels` остаётся
   в `macTrace`: его подсветка, последовательность проверок и решение не меняются.
   Пилотный второй экземпляр уже показывает этот случай через неполный объект notes.

Обычные объяснения и внешние подписи — Markdown/QMD. Восстановленные композиции
моделей — авторские SVG; блок-схемы алгоритмов — DOT. Предметное вычисление — JS.
Пояснения именованных этапов — небольшой объект OJS.
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
- `prepareSVG(source, keys, result)` доступен отдельно. Общий заголовок и номер
  отсутствуют в SVG: ими управляют `fig-cap`, `#fig-*` и `@fig-*` Quarto.

Обзорный SVG всегда подключается обычным Markdown и пригоден без JavaScript.
Для печати используется подготовленный статический SVG с подписью Quarto.
Автоматический PDF-рендер интерактивного состояния этим интерфейсом не обещается.

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
Graphviz рассчитывает геометрию схем, для которых сохранён DOT-исходник;
браузер получает готовый SVG. Восстановленные модели доступа сохраняют
утверждённую композицию непосредственно в SVG. Старые упрощённые `model.dot`
удалены: их повторная компиляция подменяла выбранные рисунки.

Для переноса Solmedium создаёт отдельные каталоги `access-control/dac`,
`access-control/rbac`, `crypto/lcg`, `crypto/caesar`, `crypto/xor`, `data-integrity/...`.
У каждого примера свои предметные JS, SVG или DOT, пояснения и именованные экспорты;
общая обвязка принимает готовые трассы и SVG. Граф не описывается второй раз в рендере.
Большой YAML и универсальный DSL не требуются.

## Граница расширения и сопровождение

Устойчивый runtime, оформление и фильтр находятся в
`extensions/course-visualizations/_extensions/course-visualizations/`.
Это готовый локальный дистрибутив для `quarto add`, а не изменение Course-Tools.
Совместимый вход `shared/visualizations/common/runtime.js` только переэкспортирует
технические функции. Подготовка побайтно копирует runtime установленного авторского
расширения в `_prepared/visualizations/common/course-runtime.js` и направляет адаптер
на эту публичную копию. Полный `_extensions` в публикацию не включается.
Предметные файлы, SVG, DOT и тексты не входят в пакет. Фильтр доставляет CSS и статические
SVG, OJS компилируется штатно до Lua.

Владелец исходника и будущего отдельного выпуска — Афоненко Анатолий, сопровождающий
курс. Отдельный публичный репозиторий или выпуск не создавался. Автор курса отвечает
за предметные модели и данные; владелец обвязки — за API этапа, управление, доступность,
SVG id/ссылки, экспорт и доставку ресурсов. При несовместимом изменении меняют версию
пакета, руководство и проверяют оба формата; установленные копии вручную не правят.

Terra может сразу редактировать Markdown/QMD и notes общего фрагмента, используя
приведённые включения. Solmedium переносит остальные самостоятельные виджеты в
предметные каталоги и добавляет их подготовку в `CI/prepare-visualizations.py`;
публичные SVG включаются в resources явно, банковские QMD остаются исключёнными.
Один и тот же #exr не включают дважды в один документ: native ID должны быть уникальны.

Quarto 1.11.6 предупреждает `OJS block count mismatch` для include с OJS: это ограничение
отображения номеров строк диагностики, а не отказ выполнения. Если автору нужны точные
номера строк, используйте короткую прямую форму OJS выше. Реальные браузерные пробы
проверяют готовый результат. В пилотном Reveal длинное каноническое условие помещено
во внешний Div с `style="font-size:0.8em"`: условие не сокращается, штатная семантика
Core/Presentation сохраняется. Для основного показа предпочтительны короткие вопросы.


## Включённые компоненты тем 4–6

Перед обычным рендером theory и seminars автоматически запускается
`CI/prepare-course-visualizations.py`: DOT преобразуются в SVG, публичные модули
копируются в `_prepared`, фактически включённые `exr-*` заново выбираются из
канонического банка до инвентаризации Core. Отсутствующий или неоднозначный ID
останавливает подготовку. Ручные команды выше остаются полезны для проверки.
Для подготовки нужны Python 3, Node.js, `quarto pandoc`, Graphviz (`dot`) и
`python3 -m pip install -r CI/requirements-visualizations.txt`.
В CI Node.js, Graphviz и PyYAML устанавливаются явно. Браузеру эти зависимости не нужны.

Все пути импорта начинаются с `/_prepared/visualizations/`:

| Модуль | Именованные экспорты |
| --- | --- |
| `access-control/dac/lesson.js` | `dacControls(options)`, `dacDiagram(selected, notes)` |
| `access-control/rbac/lesson.js` | `rbacControls(options)`, `rbacDiagram(selected, notes)` |
| `authentication/lesson.js` | `authenticationComparison()`, `passkeyRegistration()`, `passkeyLogin()` |
| `crypto/lesson.js` | `lcgTrainer()`, `caesarXorTrainer()`, `seedDiagram()`, `symmetricDiagram()`, `hashDiagram()` |
| `data-integrity/lesson.js` | `sumHashComparison()`, `copyScales()`, `raidComparison()`, `sumCollision()`, `byteChange()`, `referenceReplacement()`, `xorRecovery()` |

DAC и RBAC подключаются так же, как MAC: отдельный `viewof` Controls,
затем Diagram в ячейке с подписью Quarto. Остальные функции возвращают готовый
учебный компонент; асинхронный результат OJS отображает штатно. Тренажёры
не отправляют ответы, не сохраняют оценок и не заменяют банковские упражнения.
LCG ограничен небольшими точными целыми; Цезарь преобразует A–Z, XOR — байты UTF-8.

Обзор DAC/RBAC находится в `access-control/{dac,rbac}/static/overview.svg`;
общая схема запроса — `access-control/static/overview.svg`. Вход использует
`authentication/static/{comparison,registration,login}.svg`; криптография —
`crypto/static/{lcg,caesar-xor,seed,symmetric,hash}.svg`; целостность —
`data-integrity/static/{sum-hash,copy-scales,raid,sum-collision,byte-change,reference-replacement,xor-recovery}.svg`.
Обычные SVG и интерактивный просмотр читают один и тот же подготовленный DOT-рисунок.
Проверяемая предметная логика экспортирована из соответствующих `model.js`.

Точечные проверки: `node --test CI/visualizations/integration.test.mjs CI/visualizations/mac.test.mjs`,
`python3 CI/visualizations/access-inventory.test.py`, браузерные
`CI/visualizations/integration.browser.cjs` и `runtime.browser.cjs`.
Для локальных браузерных проб используется установленный Playwright и Chromium;
путь `PLAYWRIGHT_MODULE`/`CHROMIUM_PATH` можно передать измерителю готовых страниц.
После целевого рендера измеритель запускается без новой сборки:
`node CI/visualizations/measure-pages.browser.cjs seminars/_output/student 04-access-control.html 05-crypto.html 06-data-integrity.html`.
Он отдельно записывает тела HTTP, локальную оценку gzip и память вкладки;
время относится к местному HTTP-серверу, внешние MathJax/шрифты учитываются отдельно.


## Автономная доставка OJS и математики

В Quarto 1.11.6 статическое OJS `import {name} from "..."` создаёт скрытый
Markdown-блок импорта. Его стандартная библиотека пытается загрузить `marked`
с CDN даже при `echo: false`. Поэтому авторская форма выше использует обычное
выражение JavaScript `await import(await FileAttachment("/...").url())` и затем
обращение к функции через объект модуля. Это штатные OJS/JS и FileAttachment;
runtime Quarto и установленные пакеты не модифицируются. Объект модуля объявляют
один раз на документ; последующие ячейки вызывают его функции.

`embed-resources: false` сохраняет настоящий URL ES-модуля для относительных
импортов и `new URL(..., import.meta.url)`. Все публичные `.js` и статические SVG
из `_prepared/visualizations` явно перечислены масками project resources.
QMD, DOT и банковские фрагменты по-прежнему не публикуются. Проверка
`node CI/visualizations/prepared.browser.cjs` разрешает серверу отдавать только
материализованные публичные компоненты; доступ к `shared` и `_extensions` исключён.
Копия runtime должна побайтно совпадать с установленным авторским расширением.

Для HTML и Reveal выбран штатный `html-math-method: mathml`: формулы выводит
браузер без MathJax CDN. Это поддержанный [параметр Quarto](https://quarto.org/docs/reference/formats/html.html).
Автономность проверяется через HTTP готового output с запретом внешних запросов,
а не открытием `file://` или доступом к исходникам. Изолированная native-проба
четырёх композиций целостности и формулы MathML прошла; финальная приёмка проверяет
настоящие страницы и чистую доставку всех транзитивных ресурсов.
