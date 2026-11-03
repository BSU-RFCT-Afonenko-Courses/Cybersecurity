# Обвязка учебных визуализаций

Авторское расширение Quarto версии `0.3.5` содержит управление выбранным этапом,
изоляцию идентификаторов SVG, подсветку, стили и доставку статических SVG
штатными ресурсами Quarto из `_prepared/visualizations`. Требуется Quarto не ниже 1.11.5; локальная сборка курса использует 1.11.6.

Из корня курса установите пакет целиком в оба проекта:

```sh
(cd theory && quarto add ../extensions/course-visualizations --no-prompt)
(cd seminars && quarto add ../extensions/course-visualizations --no-prompt)
```

Фильтр `course-visualizations` уже подключён в `theory/_quarto.yml`
и `seminars/_quarto.yml`. После изменения исходника пакета повторите установку;
установленные копии отдельно не редактируются.

Предметные вычисления, данные, DOT, SVG и пояснения находятся в
`shared/visualizations/` и в пакет не входят. Runtime получает готовые трассы
и SVG. OJS компилирует Quarto; учебные условия и видимость решений определяет
Course Core.

ES-модуль пакета — `_extensions/course-visualizations/browser/runtime.js`.
Вход курса `shared/visualizations/common/runtime.js` переэкспортирует его
технические функции. Подготовка копирует runtime установленного расширения
в `_prepared/visualizations/common/course-runtime.js` и направляет локальный
вход на эту публичную копию. Весь `_extensions` в публикацию не переносится.

Интерфейс, примеры QMD и подготовка ресурсов описаны в
[руководстве визуализаций](../../docs/content/visualization-authoring.md).
При изменении интерфейса обновляйте версию пакета, авторское руководство
и связанные проверки.
