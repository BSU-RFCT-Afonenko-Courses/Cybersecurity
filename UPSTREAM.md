# Установленные инструменты

Курс использует полные опубликованные пакеты через `CI/install-extensions.sh`
и штатный `quarto add`. Vendored файлы не исправляются по одному. Native projects:
корень, `theory`, `task`, `seminars`; `course.id: cybersecurity` задан только в корне.

| Поставщик | Тег | Exact source commit | Native scopes |
| --- | --- | --- | --- |
| Core / Presentation / Navigation | `v5.0.2` | `a340d542b821831a6e209e7abfbdaacd569002fd` | Корень, theory, task, seminars |
| Publisher | `v5.0.0` | `215309b5c41669e56a857a1bc3e4f7f2ce782c5f` | Корень |
| Reference Catalog | `v3.0.0` | `559583805a514ae8a244b6ea4cb5124867064024` | Корень, theory, task, seminars |
| Download | `v3.0.0` | `6fb3945020cd74fda40cc4d333389864e06609b5` | task |

Совместимость и нормативные правила читаются по тому же immutable tag:
[Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v5.0.2/spec/index.md),
[Publisher](https://github.com/Afonenko-Course-Tools/quarto-project-publish/blob/v5.0.0/spec/index.md),
[QRC](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/blob/v3.0.0/spec/index.md),
[Download](https://github.com/Afonenko-Course-Tools/quarto-project-download/blob/v3.0.0/spec/index.md).
Минимальная линия: Quarto 1.11.5 и CUE 0.17.1.

Руководство для автора закреплено на проверенном коммите Template
`d453be9aa4d44f79222323672ebc30a4ef86f0ce` после слияния
[PR22](https://github.com/Afonenko-Course-Tools/quarto-template-course/pull/22)
(tree `db4b9df84d29a475759af88ece021696c013c858`).
[Точный исходник руководства](https://github.com/Afonenko-Course-Tools/quarto-template-course/blob/d453be9aa4d44f79222323672ebc30a4ef86f0ce/guide/index.qmd)
и [опубликованный сайт](https://afonenko-course-tools.github.io/quarto-template-course/guide/index.html)
описывают закреплённые пакеты. Штатная публикация в `gh-pages`
`ecf1229ccc0899f84d34640c78a77470fa10352f` и публичные страницы проверены отдельно.
Окончательная приёмка точного Java head, Platform source tag 1.0.1 и анонимное
получение OCI-образов из GHCR ещё ожидаются; публикация документации их не заменяет.

Банк backup — ручное задание без project/project-check; пустой declared inventory
не исключает его из банка или назначений. В курсе нет executable Java, PrairieLearn
delivery или platform image pins. Эти маршруты нельзя считать проверенными по
одному успешному HTML/Body export. Source-check отчёты и закрытые Body packages
сохраняются вне публичного сайта.
