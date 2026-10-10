# Установленные инструменты

Курс использует полные опубликованные пакеты через `CI/install-extensions.sh`
и штатный `quarto add`. Vendored файлы не исправляются по одному. Native projects:
корень, `theory`, `task`, `seminars`; `course.id: cybersecurity` задан только в корне.

| Поставщик | Тег | Exact source commit | Native scopes |
| --- | --- | --- | --- |
| Core / Presentation / Navigation | `v5.0.1` | `d9c764823beee6ea45af1d7093933382aafce663` | Корень, theory, task, seminars |
| Publisher | `v5.0.0` | `215309b5c41669e56a857a1bc3e4f7f2ce782c5f` | Корень |
| Reference Catalog | `v3.0.0` | `559583805a514ae8a244b6ea4cb5124867064024` | Корень, theory, task, seminars |
| Download | `v3.0.0` | `6fb3945020cd74fda40cc4d333389864e06609b5` | task |

Совместимость и нормативные правила читаются по тому же immutable tag:
[Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v5.0.1/spec/index.md),
[Publisher](https://github.com/Afonenko-Course-Tools/quarto-project-publish/blob/v5.0.0/spec/index.md),
[QRC](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/blob/v3.0.0/spec/index.md),
[Download](https://github.com/Afonenko-Course-Tools/quarto-project-download/blob/v3.0.0/spec/index.md).
Минимальная линия: Quarto 1.11.5 и CUE 0.17.1.

Authoring guide закреплён на фактическом head
`13fa3da421ddffabdd9281c9e2794e25f7664145` открытого
[Template draft PR21](https://github.com/Afonenko-Course-Tools/quarto-template-course/pull/21)
(tree `5009e92502c96b6b46853732527b0b7806864da2`).
[Исходник руководства](https://github.com/Afonenko-Course-Tools/quarto-template-course/tree/13fa3da421ddffabdd9281c9e2794e25f7664145/guide)
содержит проверенные правила текущих owner packages. Это draft guide source,
а не новый опубликованный сайт или завершённая общая приёмка. Final Java exacthead,
Platform source tag 1.0.1 и публичная доступность OCI images ещё ожидаются;
guide pin обновляется только по фактическому reviewed successor.

Банк backup — ручное задание без project/project-check; пустой declared inventory
не исключает его из банка или назначений. В курсе нет executable Java, PrairieLearn
delivery или platform image pins. Эти маршруты нельзя считать проверенными по
одному успешному HTML/Body export. Source-check отчёты и закрытые Body packages
сохраняются вне публичного сайта.
