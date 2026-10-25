# Основы кибербезопасности

Курс содержит портал, книгу теории `theory`, книгу заданий и работ `task`
и семинарские материалы `seminars`. QRC namespaces `portal`, `theory`,
`tasks`, `practice` задают адресные ссылки; URL подпроектов соответствуют
папкам `theory`, `task`, `seminars`. Устойчивый `course.id: cybersecurity`
объявлен один раз в корневом `_quarto.yml`.

Требуются Quarto **не ниже 1.11.5**, CUE **0.17.1**, Python 3 и Node.js
с поддержкой встроенного модуля `node:test` для проверок.
Установка выполняется штатным `quarto add` через `CI/install-extensions.sh`:

| Инструмент | Выпуск | Проекты |
| --- | --- | --- |
| Core, Presentation, Navigation | `v8.2.8` | Корень, theory, task, seminars |
| Publisher | `v5.1.4` | Корень |
| Reference Catalog | `v3.1.1` | Корень, theory, task, seminars |
| Download | `v3.2.2` | task |

[Опубликованное руководство Template](https://afonenko-course-tools.github.io/quarto-template-course/guide/index.html)
объясняет авторские действия; [точный исходник руководства](https://github.com/Afonenko-Course-Tools/quarto-template-course/blob/d453be9aa4d44f79222323672ebc30a4ef86f0ce/guide/index.qmd)
закреплён на `d453be9aa4d44f79222323672ebc30a4ef86f0ce`.
[Контракты Core 8.2.8](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v8.2.8/spec/index.md)
задают правила банка, работ, видимости и экспорта.
Точные установленные commits и границы пакетов приведены в [UPSTREAM.md](UPSTREAM.md).
Окончательная приёмка Java, Platform source tag 1.0.1 и анонимное получение
OCI-образов из GHCR ещё ожидаются. Публикация руководства сама по себе
не подтверждает завершение этих этапов.

```sh
bash CI/install-extensions.sh
quarto render --profile student
quarto render --profile full
quarto preview --profile student --no-watch-inputs
```

В каждом самостоятельном проекте включён штатный `fail-if-warnings: true`.
Сборка учитывает фактический код завершения Quarto; строка `WARN` в исходном
выводе может сопровождаться exit 0. Publisher сохраняет настройку каждой
части; корневой CLI-флаг не передаётся отдельным процессам Quarto автоматически.
Диагностика содержит код и контекст, исходный вывод Quarto, Pandoc и других
процессов сохраняется в журналах.

## Задача и лабораторная работа

Заполненная задача находится в `task/data-integrity/backup.qmd`:
`exr-data-integrity-backup` предлагает выполнить полный, инкрементальный,
дифференциальный и зеркальный бекапы, изменить исходные файлы и проверить
восстановление. Результат — архив резервных копий и протокол опытов.
У задачи собственные `difficulty="intermediate"` и `time="90"`;
90 минут — авторская оценка этих опытов, а не измеренная длительность.

Банк включён в `task/data-integrity/_metadata.yml` и `task/access-control/_metadata.yml`:

```yaml
exercise-bank: true
default-exercise-target: manual
default-exercise-course-role: independent-study
default-exercise-statement-visibility: open
```

Имя книги `task`, формат book и `course.id` сами банк не включают.
Вне этой области обычные `exr`, `exm`, `sol` сохраняют смысл Quarto.
Defaults наследует Quarto; атрибут задачи может переопределить роль, видимость,
сложность и время. Target должен совпадать с общим значением; смешанная область
отменяет default через `false`. У backup difficulty/time заданы явно и сохраняются.
Решения связываются по одинаковому суффиксу `sol-ID`
либо анонимным `.solution` внутри задачи. Текущая задача решения не объявляет.
Ручная задача не объявляет программный project или project-check и не проверяется
как Java. Declared inventory остаётся пустым; это не отсутствие самой задачи в банке.

`task/seminar/01-introduction.qmd` описывает одну лабораторную:
`assessment.kind: lab`, ID `sec-work-data-integrity-backup`. Единственный
пункт `.task-items` назначает backup; он required/individual по умолчанию,
stage не задан. Страница работы ссылается на условие без его дублирования.
Открытое условие и назначение видны в student и full.

Семинар 4 — `task/seminar/04-access-control.qmd` с ID `sec-work-access-control` —
назначает 13 вопросов банка `task/access-control`: пять required и восемь optional.
Условия доступны в обоих профилях, решения — только в full.

В
`task/data-integrity/checksum.qmd` есть только заголовок; файл сохранён
и исключён из текущей публикации. Full включает два черновика контрольных
`task/exam/paper.qmd` и `technical.qmd` без готовых условий или назначений.
Они не объявляются готовыми работами для экспорта.

## Профили и семинарские материалы

Student предназначен для публикации, full — для отдельной преподавательской
сборки. Общая преподавательская фраза находится в `task/teacher.qmd`, включённом
только в full chapters; авторские student/full audience wrappers не используются.
Книги используют полные списки глав в каждом профиле. Full output,
служебные файлы и teacher-пакеты исключены из student resources.

Презентации семинаров 1–4 публичны в обоих профилях: общие notes, скрытые
details и режим страницы не требуют повторной сборки. Каталог семинаров —
обычный HTML в том же native website; отдельный документ — Reveal.
Штатные уровни `##`/`###`, порядок слайдов и QRC targets сохраняются.

## Экспорт существующей лабораторной

Из корня курса выполните:

```sh
quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/export.ts --book task --work sec-work-data-integrity-backup --output _generated/backup.json
```

Core читает корневой `course.id` и выбранную книгу `task`. Создаются
`_generated/backup.json` для преподавательского потребителя и соседний
`_generated/backup.public.json` для участника. Они содержат назначенное
условие, поля ответа и его разрешённые ресурсы. Внешняя проза страницы работы
не становится условием; ключи, решения и заметки преподавателя отделяются
в teacher-пакет, когда они объявлены. `_generated` исключён из веб-ресурсов.

Полный HTML для [выборочного экспорта исходников](https://github.com/Afonenko-Course-Tools/quarto-template-course/blob/d453be9aa4d44f79222323672ebc30a4ef86f0ce/guide/export.qmd)
не требуется; student/full в его CLI не передаются. Пустые черновики контрольных
не являются допустимой заменой существующей лабораторной. Download установлен,
но курс пока не объявляет shortcode или ресурс для выдачи ZIP.

Для отдельных маршрутов существуют Print, Moodle, PrairieLearn и Cloud.
Курс их не устанавливает и не проверяет; совместимые выпуски выбираются
по контракту потребителя.
Print получает participant-пакет; Moodle — teacher-пакет с нужным ключом;
PrairieLearn использует программный проект, явный нейтральный project-check
и декларативную delivery-конфигурацию; ручные binding/native JSON не создаются.
Cloud задаёт модель
VM/действий. Экспорт, оценивание и доступ настраиваются по контракту выбранного
потребителя, без автоматического создания LMS-теста или запуска инфраструктуры.

## CI и диагностика

CI использует Quarto 1.11.5, CUE 0.17.1 и установленные в репозитории
расширения. `CI/install-extensions.sh` нужен для явного обновления pins.
Первый student-рендер создаёт QRC-каталог курса. Затем `CI/check-model.sh`
запускает выпущенные Core collectors для свежего declared inventory и выбранных
Body и проверяет их через `CI/check-access-control.py body`. После full и
повторного student-рендера проверяются локальные ссылки и отделение решений.
Внутренние owner-тесты в курс не копируются.

Каждая сборка — отдельный шаг. При отказе CI сохраняет полные `ci-logs`,
отладочный вывод Quarto. Локально:

```sh
bash CI/render.sh student
bash CI/check-model.sh /absolute/private/cybersecurity-model
bash CI/render.sh full
bash CI/render.sh student
python3 CI/site.py _site-student _site-full
python3 CI/check-access-control.py site _site-student _site-full
```

Проверка готовых сайтов контролирует страницы, локальные ссылки и отсутствие
служебных/закрытых каталогов. Она не зависит от числа страниц или ID задания.
Предметная проверка семинара 4 дополнительно контролирует 13 решений по текущим
исходникам, student HTML, поиск и ресурсы, пять схем и их печатные представления.
В Body проверяются назначения, teacher/public, условия и разрешённая QRC-ссылка.
Служебные скрипты `CI/` исключены из ресурсов сайта.

Исправления Windows-путей NativeRun и временного JSON CUE входят в upstream
Core 8.2.8; локальные overlay поверх выпуска не применяются. Нативный прогон
курса в Windows здесь не заявляется. Условный случай Quarto `recoverEncode`
разобран в [руководстве по путям](https://afonenko-course-tools.github.io/quarto-template-course/guide/windows.html).

PR workflow выполняет проверки курса. Публикация требует отдельно
разрешённого запуска из `master` с `COURSE_PUBLISH_PAGES`; проверки PR
курс не публикуют.

## Измерение рендера

Установите `quarto-course-perf` по [инструкции упаковки для Arch Linux](https://github.com/Afonenko-Course-Tools/quarto-course-perf-arch). Из корня курса можно измерить штатную сборку:

```sh
quarto-course-perf render --perf-mode summary --perf-output ../cybersecurity-measurements --profile student
quarto-course-perf render --perf-mode cpu --perf-output ../cybersecurity-measurements seminars/04-access-control.qmd --profile student --to revealjs
```

Режимы `off`, `summary` и `cpu` сохраняют разную глубину диагностики одного
нативного рендера. Для сравнения сохраняйте одинаковые cwd, цель, профиль и
формат: времена полного курса и одной презентации напрямую несопоставимы.
Отчёты сохраняйте вне
`.quarto`, публикуемых каталогов и исходников курса. Наличие 18 физических копий
расширений не означает выполнение каждой операции: Download в этом курсе не
запрашивает ZIP. Успешный рендер, `dataValid` и `quality.coverageComplete`
проверяются отдельно; одиночный запуск не доказывает универсальное ускорение.
Подробности — в [руководстве Performance 2.0.0](https://github.com/Afonenko-Course-Tools/quarto-course-performance/blob/v2.0.0/docs/diagnostics.md).
