# Установленные пакеты

Курс содержит четыре проекта Quarto: корень, `theory`, `task`, `seminars`.
Закреплённые внешние пакеты устанавливаются через `CI/install-extensions.sh`
и штатный `quarto add`.

| Пакеты | Выпуск | Коммит исходников выпуска | Проекты |
| --- | --- | --- | --- |
| Core / Presentation / Navigation | `v8.2.8` | `b0dad2522e69a673c060ba3963f8fb0ba1e0b85d` | Все четыре |
| Publisher / Site | `v5.1.4` | `a0fc543fb461d90b9f467dbe8b6a0b286a39311a` | Корень |
| Reference Catalog | `v3.1.1` | `989448d2afa4df7db882b0874c88808a00ae52c2` | Все четыре |
| Download | `v3.2.2` | `10cb38f2ba5c88e585a0ff6800adf5fc2b77597e` | `task` |

Контракты читаются по этим выпускам:
[Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v8.2.8/spec/index.md),
[Publisher](https://github.com/Afonenko-Course-Tools/quarto-project-publish/blob/v5.1.4/spec/index.md),
[Reference Catalog](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/blob/v3.1.1/spec/index.md),
[Download](https://github.com/Afonenko-Course-Tools/quarto-project-download/blob/v3.2.2/spec/index.md).

## Локальные изменения

Установленные Navigation, Presentation и точка вызова в Course Site содержат
изменения общей навигации: состав меню из текущей композиции курса,
единая HTML-шапка и режим аудитории Reveal. Описание поведения —
[в руководстве навигации](docs/navigation.md).
Указанные теги обозначают основу установки, а не побайтное совпадение всех
установленных файлов с опубликованным выпуском. Повторная установка внешнего
пакета заменяет его файлы; перед обновлением сверяйте и переносите действующие
локальные изменения.

## Авторские пакеты

- `_extensions/course-brand`, версия `1.0.0`: единый логотип и декларация бренда.
  Корневой каталог служит источником копий в подпроектах;
  обновление — `bash CI/install-course-brand.sh`.
- `extensions/course-visualizations`, версия `0.2.0`: управление этапами,
  SVG и стили интерактивных рисунков. Устанавливается целиком в `theory` и `seminars`;
  [руководство пакета](extensions/course-visualizations/README.md).

Для используемого набора требуется Quarto не ниже 1.11.6 и CUE 0.17.1.
