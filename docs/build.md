# Сборка, проверки и экспорт

## Зависимости

Для курса нужны Quarto 1.11.6 или новее, CUE 0.17.1, Python 3, Node.js
с `node:test` и Graphviz (`dot`). Python-пакеты устанавливаются из корня:

```sh
python3 -m pip install -r CI/requirements-visualizations.txt
```

Закреплённые расширения и их локальные отличия перечислены в
[UPSTREAM.md](../UPSTREAM.md). `CI/install-extensions.sh` повторно устанавливает
внешние пакеты и логотип. Авторское расширение визуализаций устанавливается
отдельно из `extensions/course-visualizations`; порядок описан в
[его руководстве](../extensions/course-visualizations/README.md).

## Профили и результаты

```sh
bash CI/render.sh student
bash CI/render.sh full
```

`student` предназначен для публичного курса, `full` — для преподавательского
просмотра доступных решений. Оглавления обоих профилей содержат те же темы
и работы. Различия видимости определяет Course Core.

Корневая сборка создаёт `_site-student/` или `_site-full/` и собирает подпроекты.
Их отдельные результаты находятся в `theory/_output/`, `task/_output/`,
`seminars/_output/` под каталогом профиля. Перед рендером теории и слайдов
автоматически выполняется `CI/prepare-course-visualizations.py`:
подготавливаются SVG, модули и запрошенные банковские фрагменты.

В каждом проекте установлен `fail-if-warnings: true`. `CI/render.sh` сохраняет
вывод в `ci-logs/render-*.log`, трассу подпроектов — в `ci-logs/subprojects.jsonl`
и возвращает код завершения Quarto. Исходный вывод нужен для диагностики;
само наличие слова `WARN` не заменяет проверку результата процесса.

## Проверки

Выбирайте проверки по изменённому содержанию. Для готовых общих сайтов:

```sh
python3 CI/site.py _site-student _site-full
python3 CI/check-access-control.py site _site-student _site-full
```

Первая команда проверяет страницы, локальные ссылки и исключение служебных
файлов. Вторая проверяет разделение решений семинара 4 между профилями.
Для уже собранных отдельных экспортов банка доступен ограниченный режим:

```sh
python3 CI/check-access-control.py site task/_output/student task/_output/full --targeted
```

Он не подтверждает состояние остальных частей курса.

Выбранные Body-пакеты и инвентаризация проверяются отдельно:

```sh
bash CI/check-model.sh /absolute/private/cybersecurity-model
```

Для разрешения содержательных ссылок этой проверке нужен актуальный публичный
`_site-student/reference-catalog.json`. Выходной каталог должен быть вне
публичного сайта.

Предметные проверки визуализаций находятся в `CI/visualizations/`:
тесты моделей — `*.test.mjs`, извлечение банковских фрагментов — `*.test.py`,
браузерные проверки — `*.browser.cjs`. Браузерные сценарии используют
Playwright/Chromium и HTTP-доступ к готовым страницам. Они не заменяются
открытием файлов через `file://`.

## Body-экспорт

Пример экспорта существующей лабораторной:

```sh
quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/export.ts -- --book task --work sec-work-data-integrity-backup --output _generated/backup.json
```

Core читает `course.id: cybersecurity`, книгу `task` и назначение работы.
Создаются преподавательский `backup.json` и участнический `backup.public.json`.
В них входят назначенные условия и разрешённые ресурсы; решения и ключи
отделяются по правилам Core. Внешний текст страницы работы не становится
условием задачи. `_generated/` исключён из веб-ресурсов.

Курс содержит ручные задания; наличие банка не означает наличие программного
проекта или `project-check`. Печатные варианты Typst собираются отдельно по
[инструкции бланков](../control-works/fundamentals/README.md).

## Просмотр и публикация

Готовый общий сайт можно открыть обычным Python HTTP-сервером.
`CI/preview-nginx.sh` позволяет обслуживать отдельные экспорты без переноса
в общий каталог. Оба способа описаны в [руководстве просмотра](../CI/README-preview.md).

Workflow `.github/workflows/pages.yml` задаёт проверки PR и `master`.
Публикация student-сайта выполняется только из `master` при
`COURSE_PUBLISH_PAGES=true`. Профиль full и Body-пакеты не публикуются.
Запуск проверок и публикация — отдельные действия; команды в руководстве
не запускают их автоматически.
