# Версионированные расширения Quarto

Конфигурация курса следует опубликованному
[quarto-template-course v1.0.0](https://github.com/Afonenko-Course-Tools/quarto-template-course/tree/v1.0.0),
commit `37f2cf37bb67b5405bbdb50089a05c3d81b2bda7`.
Портал объединяет пять нативных проектов: theory, tasks, lectures, practice,
handbook. Сохраняются текущие главы, профили, явные ID и ссылки курса.
Книги используют Cosmo; Reveal — стандартную тему и актуальные уровни заголовков.

## Установленные версии

| Репозиторий | Тег | Пакеты | Каталоги установки |
| --- | --- | --- | --- |
| [quarto-course](https://github.com/Afonenko-Course-Tools/quarto-course/pull/21) | `v2.1.1` (подготовлен в PR) | course-core, course-presentation, course-navigation | Корень и все пять частей |
| [quarto-reference-catalog](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/releases/tag/v2.1.0) | `v2.1.0` | reference-catalog | Корень и все пять частей |
| [quarto-project-publish](https://github.com/Afonenko-Course-Tools/quarto-project-publish/releases/tag/v3.0.1) | `v3.0.1` | course-site | Корень |
| [quarto-project-download](https://github.com/Afonenko-Course-Tools/quarto-project-download/releases/tag/v1.0.1) | `v1.0.1` | project-download | tasks |

Точные команды `quarto add organization/repository@version --no-prompt`
находятся в [tools/install-extensions.sh](tools/install-extensions.sh).
Course устанавливается полным bundle; авторский YAML активирует нужные фильтры
и плагины. Установленные каталоги `_extensions`, включая зависимости
и лицензии, хранятся в Git курса. Course v2.1.1 скопирован целиком
из локального checkout поставщика; остальные пакеты установлены из релизных тегов.
Каждый `_extension.yml` содержит семантическую версию расширения.

Course `v2.1.1` подготовлен в
[PR quarto-course #21](https://github.com/Afonenko-Course-Tools/quarto-course/pull/21),
commit [41aa244](https://github.com/Afonenko-Course-Tools/quarto-course/commit/41aa244df3a2814ac80d8bc3d47b4fd02f26c021)
в ветке `codex/course-plan-v2.1.1`.
Тег существует только локально и не опубликован. До его публикации повторная
установка Course из GitHub и соответствующий шаг CI недоступны.

Для обновления выберите опубликованный тег в установщике, выполните его
и рассмотрите изменения в Git. Опубликованные теги не перемещаются:
исправления поставляются новыми версиями. Проверки сборки выполняются отдельно
командами из README; установщик не запускает render или CI.
Собственный реестр commit поставщиков и манифесты хэшей не используются.
Обычные `quarto render` и `quarto preview` читают установленные файлы
и не обновляют расширения.

## Стиль таблицы плана

Общий стиль `.course-plan` основан на
[изменении quarto-course 3cd3dcf](https://github.com/Afonenko-Course-Tools/quarto-course/commit/3cd3dcf099c7f85d0497e81631d53f60562728c0).
Его правила находятся в
[presentation.css](https://github.com/Afonenko-Course-Tools/quarto-course/blob/3cd3dcf099c7f85d0497e81631d53f60562728c0/_extensions/course-presentation/presentation.css),
а исходное описание — в
[руководстве по представлению](https://github.com/Afonenko-Course-Tools/quarto-course/blob/3cd3dcf099c7f85d0497e81631d53f60562728c0/docs/presentation.md).

В локальной версии `v2.1.1` добавлены CSS-селекторы для самой таблицы
с классом `.course-plan` и штатной прокрутки Quarto `.responsive`.
Класс задаётся в нативной подписи таблицы, без авторского `div`.
Фильтр `course-presentation` подключает общий stylesheet расширения;
отдельный CSS страницы удалён. Содержимое, ссылки, подпись, ID и ширины
колонок таблицы сохранены. Правила экрана и печати находятся в пакете.
