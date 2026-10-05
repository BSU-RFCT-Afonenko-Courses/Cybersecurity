# Общий шаблон курса

Конфигурация пяти частей и полные используемые пакеты обновлены по
[quarto-template-course](https://github.com/Afonenko-Course-Tools/quarto-template-course)
на commit `e2cad0930ab4315228388f0b43b3ec6088ed418f`,
Git tree `650efe41d9113b422e666320a4f68f7596716c76`.

Сайт использует нативные `quarto render` и `quarto preview`. Course Site
координирует сборку частей; Core обрабатывает учебную разметку, Presentation
оформляет блоки, Navigation управляет слайдами, Reference Catalog объединяет
явно экспортируемые ссылки и поиск. В части tasks установлен Project Download.
Книги используют Cosmo, слайды — стандартную тему Reveal.

| Поставщик | Зафиксированный commit |
| --- | --- |
| [quarto-course](https://github.com/Afonenko-Course-Tools/quarto-course) | `27d7c437d386f5489c8a0a4c09ed1afeb07c7967` |
| [quarto-project-publish](https://github.com/Afonenko-Course-Tools/quarto-project-publish) — пакет course-site | `be92f189f267a8bbc986c40254c685b4f33f9f0b` |
| [quarto-reference-catalog](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog) | `84f653c8d4e3e74fdb1a62249af28250846721a4` |
| [quarto-project-download](https://github.com/Afonenko-Course-Tools/quarto-project-download) | `f25475af13f42c1a32c3bbacb0d1feb205920df8` |

[providers.json](providers.json) фиксирует репозитории, версии, имена пакетов
и каталоги установки. [installed-packages.json](installed-packages.json)
содержит Git tree поставщика, полный список файлов, SHA256, размеры и права
каждого пакета. Манифесты адаптированы к шести фактическим каталогам курса;
демонстрационные разделы и необязательные интеграции шаблона не установлены.

Пакеты перенесены целиком, включая vendor-файлы и лицензии, без локальных
изменений кода. Учебные исходники и списки экспортируемых ID сохранены.
Обновлять расширения следует целыми пакетами из выбранного шаблона, затем
сверять манифесты и проверять сборки `student → full → student`.
