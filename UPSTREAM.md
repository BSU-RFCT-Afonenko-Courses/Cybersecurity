# Установленные пакеты

Курс содержит четыре проекта Quarto: корень, `theory`, `task`, `seminars`.
Закреплённые внешние пакеты устанавливаются через `CI/install-extensions.sh`
и штатный `quarto add`.

| Пакеты | Выпуск | Коммит исходников выпуска | Проекты |
| --- | --- | --- | --- |
| Core / Presentation / Navigation / Theme | `v9.3.1` | `ecf48a891f5edddce7e512ab9741f88ff50c8501` | Все четыре |
| Publisher / Site | `v6.0.1` | `e8b345cec235c2c8438c479892f6bca2a4ce3ee7` | Корень |
| Reference Catalog | `v3.2.0` | `798f8c0d9f87fd5dcfe9ee85b79df57e647d2f3c` | Все четыре |
| Download | `v3.5.0` | `c81df7364dd1fbbd07a0e54d67714b3d66f9695e` | `task` |

Контракты читаются по этим выпускам:
[Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v9.3.1/spec/index.md),
[Publisher](https://github.com/Afonenko-Course-Tools/quarto-project-publish/blob/v6.0.1/spec/index.md),
[Reference Catalog](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/blob/v3.2.0/spec/index.md),
[Download](https://github.com/Afonenko-Course-Tools/quarto-project-download/blob/v3.5.0/spec/index.md).

## Внешние пакеты

Установленные файлы совпадают с указанными номерными выпусками. Навигация
и режим аудитории входят в опубликованные Navigation и Presentation.
HTML использует Cosmo и `theme.scss` из Course Theme 1.0.0; проектных
каталогов `styles` нет. Стили конкретных интерактивных рисунков остаются
в авторском расширении визуализаций.

## Авторские пакеты

- `_extensions/course-brand`, версия `1.0.0`: единый логотип и декларация бренда.
  Корневой каталог служит источником копий в подпроектах;
  обновление — `bash CI/install-course-brand.sh`.
- `extensions/course-visualizations`, версия `0.3.0`: управление этапами,
  SVG и стили интерактивных рисунков. Устанавливается целиком в `theory` и `seminars`;
  [руководство пакета](extensions/course-visualizations/README.md).

Локальная сборка проверяется системным Quarto 1.11.6.
Минимальная поддерживаемая версия 1.11.5 проверяется отдельной задачей CI.
