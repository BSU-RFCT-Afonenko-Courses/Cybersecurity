# Основы кибербезопасности

Курс содержит портал, книгу теории `theory`, книгу заданий и работ `task`
и семинарские материалы `seminars`. QRC namespaces `portal`, `theory`,
`tasks`, `practice` задают адресные ссылки; URL подпроектов соответствуют
папкам `theory`, `task`, `seminars`. Устойчивый `course.id: cybersecurity`
объявлен один раз в корневом `_quarto.yml`.

Требуются Quarto **не ниже 1.11.5**, CUE **0.17.1** и Python 3 для проверок.
Установка выполняется штатным `quarto add` через `CI/install-extensions.sh`:

| Инструмент | Выпуск | Проекты |
| --- | --- | --- |
| Core, Presentation, Navigation | `v4.0.0` | Корень, theory, task, seminars |
| Publisher | `v5.0.0` | Корень |
| Reference Catalog | `v3.0.0` | Корень, theory, task, seminars |
| Download | `v2.0.0` | task |

[Опубликованное руководство](https://afonenko-course-tools.github.io/quarto-template-course/guide/index.html)
объясняет авторские действия; [контракты Core 4.0.0](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v4.0.0/spec/index.md)
задают правила банка, работ, видимости и экспорта.

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

Банк включён только в `task/data-integrity/_metadata.yml`:

```yaml
exercise-bank: true
exercise-statement-visibility: open
```

Имя книги `task`, формат book и `course.id` сами банк не включают.
Вне этой области обычные `exr`, `exm`, `sol` сохраняют смысл Quarto.
Для новой банковской задачи нужны собственные difficulty/time и эффективная
политика условия; решения связываются по одинаковому суффиксу `sol-ID`
либо анонимным `.solution` внутри задачи. Текущая задача решения не объявляет.

`task/seminar/01-introduction.qmd` описывает одну лабораторную:
`assessment.kind: lab`, ID `sec-work-data-integrity-backup`. Единственный
пункт `.task-items` назначает backup; он required/individual по умолчанию,
stage не задан. Страница работы ссылается на условие без его дублирования.
Открытое условие и назначение видны в student и full.

Остальные тематические страницы пока содержат заготовки. В
`task/data-integrity/checksum.qmd` есть только заголовок; файл сохранён
и исключён из текущей публикации. Full включает два черновика контрольных
`task/exam/paper.qmd` и `technical.qmd` без готовых условий или назначений.
Они не объявляются готовыми работами для экспорта.

## Профили и семинарские материалы

Student предназначен для публикации, full — для отдельной преподавательской
сборки. Книги используют полные списки глав в каждом профиле. Full output,
служебные файлы и teacher-пакеты исключены из student resources.

Одна презентация семинара публична в обоих профилях: общие notes, скрытые
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

Полный HTML для [selected source export](https://afonenko-course-tools.github.io/quarto-template-course/guide/export.html)
не требуется; student/full в его CLI не передаются. Пустые черновики контрольных
не являются допустимой заменой существующей лабораторной. Download установлен,
но курс пока не объявляет shortcode или ресурс для выдачи ZIP.

Для отдельного маршрута можно установить Print `v0.3.0`, Moodle `v0.3.0`,
PrairieLearn `v3.0.0` или Cloud `v3.0.0`. Курс их не активирует.
Print получает participant-пакет; Moodle — teacher-пакет с нужным ключом;
PrairieLearn требует программный проект и binding, Cloud задаёт модель
VM/действий. Экспорт, оценивание и доступ настраиваются по контракту выбранного
потребителя, без автоматического создания LMS-теста или запуска инфраструктуры.

## CI и диагностика

CI использует Quarto 1.11.5, CUE 0.17.1 и установленные в репозитории
расширения. `CI/install-extensions.sh` нужен для явного обновления pins.
Проверки NativeRun и project-local CUE inputs сохранены в `CI/native-run.lua`
и `CI/cue-validation.ts`. Затем идут student → full → student и
`python3 CI/site.py _site-student _site-full`.

Каждая сборка — отдельный шаг. При отказе CI сохраняет полные `ci-logs`,
отладочный вывод Quarto и трассу подпроектов. Локально:

```sh
bash CI/render.sh student
bash CI/render.sh full
bash CI/render.sh student
python3 CI/site.py _site-student _site-full
```

Проверка готовых сайтов контролирует страницы, локальные ссылки и отсутствие
служебных/закрытых каталогов. Она не зависит от числа страниц или ID задания.
Служебные скрипты `CI/` исключены из ресурсов сайта.

Исправления Windows-путей NativeRun и временного JSON CUE входят в upstream
Core 4.0.0; локальные overlay поверх выпуска не применяются. Нативный прогон
курса в Windows здесь не заявляется. Условный случай Quarto `recoverEncode`
разобран в [руководстве по путям](https://afonenko-course-tools.github.io/quarto-template-course/guide/windows.html).

[PR #3](https://github.com/BSU-RFCT-Afonenko-Courses/Cybersecurity/pull/3) уже
слит. Эта миграция оформляется новым PR, который остаётся OPEN после проверок.
Курс в этом этапе не сливается и не публикуется; PR workflow сохраняет отдельные
guards публикации для `master` и `COURSE_PUBLISH_PAGES`.
