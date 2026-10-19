# Установленные инструменты

Курс использует полные опубликованные пакеты через `CI/install-extensions.sh`
и штатный `quarto add`. Vendored файлы не исправляются по одному. Native projects:
корень, `theory`, `task`, `seminars`; `course.id: cybersecurity` задан только в корне.

| Поставщик | Тег | Точный коммит исходников | Проекты Quarto |
| --- | --- | --- | --- |
| Core / Presentation / Navigation | `v7.3.0` | `e93bc3aa5c5f747e647d42ed6c0f65c127920184` | Корень, theory, task, seminars |
| Publisher | `v5.1.1` | `4a1d7d19f5a232d8ff91ea91a02097e0acf7d9c0` | Корень |
| Reference Catalog | `v3.1.0` | `3df2110e9f525f03f3ecb4926b5d55718e955c4c` | Корень, theory, task, seminars |
| Download | `v3.1.0` | `73797d3807e2433d33751d538746e1e9d82d6d57` | task |

Совместимость и нормативные правила читаются по тому же immutable tag:
[Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v7.3.0/spec/index.md),
[Publisher](https://github.com/Afonenko-Course-Tools/quarto-project-publish/blob/v5.1.1/spec/index.md),
[QRC](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/blob/v3.1.0/spec/index.md),
[Download](https://github.com/Afonenko-Course-Tools/quarto-project-download/blob/v3.1.0/spec/index.md).
Минимальная линия: Quarto 1.11.5 и CUE 0.17.1.

Руководство для автора закреплено на проверенном коммите Template
`d453be9aa4d44f79222323672ebc30a4ef86f0ce` после слияния
[PR22](https://github.com/Afonenko-Course-Tools/quarto-template-course/pull/22)
(tree `db4b9df84d29a475759af88ece021696c013c858`).
[Точный исходник руководства](https://github.com/Afonenko-Course-Tools/quarto-template-course/blob/d453be9aa4d44f79222323672ebc30a4ef86f0ce/guide/index.qmd)
и [опубликованный сайт](https://afonenko-course-tools.github.io/quarto-template-course/guide/index.html)
сохраняют исторический снимок руководства до текущего обновления пакетов;
актуальные контракты читаются по тегам из таблицы выше. Штатная публикация в `gh-pages`
`ecf1229ccc0899f84d34640c78a77470fa10352f` и публичные страницы проверены отдельно.
Окончательная приёмка точного Java head, Platform source tag 1.0.1 и анонимное
получение OCI-образов из GHCR ещё ожидаются; публикация документации их не заменяет.

Банк backup — ручное задание без project/project-check; пустой declared inventory
не исключает его из банка или назначений. В курсе нет executable Java, PrairieLearn
delivery или platform image pins. Эти маршруты нельзя считать проверенными по
одному успешному HTML/Body export. Source-check отчёты и закрытые Body packages
сохраняются вне публичного сайта.
