# Общий шаблон курса

Конфигурация пяти частей и полные используемые пакеты обновлены по
[quarto-template-course](https://github.com/Afonenko-Course-Tools/quarto-template-course)
на commit `d3c92b96090658b9ab15a66f46a3fab83faa54e2`,
Git tree `2540db27e7449348d9a20cb20276158984f926a3`.

Сайт использует нативные `quarto render` и `quarto preview`. Course Site
координирует сборку частей; Core обрабатывает учебную разметку, Presentation
оформляет блоки, Navigation управляет слайдами, Reference Catalog объединяет
явно экспортируемые ссылки и поиск. В части tasks установлен Project Download.
Книги используют Cosmo, слайды — стандартную тему Reveal.

| Поставщик | Зафиксированный commit |
| --- | --- |
| [quarto-course](https://github.com/Afonenko-Course-Tools/quarto-course) | `6e44e39630a4487f6182f808b3e2baded2a0e627` |
| [quarto-project-publish](https://github.com/Afonenko-Course-Tools/quarto-project-publish) — пакет course-site | `be92f189f267a8bbc986c40254c685b4f33f9f0b` |
| [quarto-reference-catalog](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog) | `84f653c8d4e3e74fdb1a62249af28250846721a4` |
| [quarto-project-download](https://github.com/Afonenko-Course-Tools/quarto-project-download) | `f25475af13f42c1a32c3bbacb0d1feb205920df8` |

[providers.json](providers.json) фиксирует репозитории, версии, имена пакетов
и каталоги установки. [installed-packages.json](installed-packages.json)
содержит Git tree поставщика, полный список файлов, SHA256, размеры и права
каждого пакета. Манифесты адаптированы к шести фактическим каталогам курса;
демонстрационные разделы и необязательные интеграции шаблона не установлены.

Пакеты перенесены целиком, включая vendor-файлы и лицензии, без локальных
изменений кода. Тексты учебных материалов и списки экспортируемых ID сохранены;
уровни заголовков слайдов приведены к актуальной разметке шаблона.
Обновлять расширения следует целыми пакетами из выбранного шаблона, затем
сверять манифесты и проверять сборки `student → full → student`.
