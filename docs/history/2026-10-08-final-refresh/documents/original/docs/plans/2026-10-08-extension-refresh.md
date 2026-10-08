# Cybersecurity: новый открытый PR на выпущенной модели

Статус: шаг 16 выполняется после выпусков инструментов и публикации
руководства. Действуют [контракты Core 4.0.0](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v4.0.0/spec/index.md)
и [авторское руководство](https://afonenko-course-tools.github.io/quarto-template-course/guide/index.html).
План внедрения сохранён в Git владельца Core; этот журнал фиксирует фактическую
адаптацию курса и не заменяет нормативные спецификации.

1. Сохранить исходную ветку и намеренные удаления. Preservation commit
   `9853fb3bcdbea2749f667d179d10caa7a099e3f5` содержит прежние Windows patches
   и CI fixtures; merge `6cae422bfb77c5c3fc54b24d039d624f44d6b7d5`
   сохраняет эту историю и свежий `origin/master` `8e8171d…`.
   Удалённые UPSTREAM.md/«Новые семинары» автоматически не восстанавливать.
   [PR #3](https://github.com/BSU-RFCT-Afonenko-Courses/Cybersecurity/pull/3)
   уже MERGED: по прямому указанию пользователя создаётся новый PR, остающийся OPEN.
2. Установить штатно Core `v4.0.0` и QRC `v3.0.0` в корень/theory/task/seminars,
   Publisher `v5.0.0` в корень, Download `v2.0.0` в task. Сверить весь payload
   с выпущенными upstream Git objects. Исправления output.lua/validate.ts
   приходят из Core 4.0.0; ручной overlay не применять. README/команды/pins
   согласовать с установкой. Quarto минимум 1.11.5, CUE 0.17.1.
3. Включить банк узко в `task/data-integrity/_metadata.yml` с default open.
   Единственная заполненная задача — `exr-data-integrity-backup`, четыре вида
   бекапов и восстановление. Сохранить её самостоятельную роль и intermediate;
   собственное time 90 — авторская оценка, не измеренная длительность.
   Теория и остальные области остаются обычным Quarto вне явного банка.
4. Сохранить единственную работу `task/seminar/01-introduction.qmd`:
   kind lab, ID `sec-work-data-integrity-backup`, одно назначение backup,
   defaults required/individual, stage отсутствует. Исправить только вводную
   прозу. Не выдумывать вопросы, решения, ответы, project/binding/ZIP или
   restricted назначения для пустых авторских черновиков. Checksum — пустой
   исходник; две контрольные в full не готовы к экспорту.
5. Сохранить native student/full, root-only `course.id: cybersecurity`,
   namespaces/URL размещения и strict `fail-if-warnings: true` каждого ребёнка.
   CI проверяет Quarto 1.11.5 с CUE 0.17.1, обе существующие NativeRun/CUE
   регрессии, student → full → student и `CI/site.py`.
   Сохранить guards master/не-PR/COURSE_PUBLISH_PAGES; PR не публикует курс.
6. Проверить актуальные student/full outputs, поиск/QRC/ресурсы и отсутствие
   служебных/закрытых outputs в student. Выбранный backup Body экспортировать
   из корня по публичному native API без предварительного full HTML.
   Если ZIP не объявлен, фиксировать отсутствие запроса, не добавлять новый.
   Записать реальные команды, длительность, payload/source hashes и ограничения;
   нативный Windows прогон не заявлять без фактической сессии.
7. После локальных проверок и независимого review создать новый PR по итоговому
   изменению, дождаться required checks и прикрепить его к задаче Codex.
   Оставить OPEN: курс не merge/deploy, guards не ослаблять. Ветки Cybersecurity
   не входят в очистку инструментов и шаблона.

## Авторская документация — 8 октября 2026

Прочитаны фактические файлы курса, current Core 4.0.0 learning-elements/Body
и опубликованные guide/model, guide/export, guide/windows. Скачанные HTML этих
трёх страниц побайтно равны опубликованному gh-pages
`a55b0e399febec10b9dec4a87273adb5b603e732` (source main
`8b050033b594eeae4270ca6f55f12a1d6e8f1243`).

README описывает реальный backup, узкую область банка, оценку 90 минут,
одну лабораторную, root-only course.id и existing selected-export команду.
Неверное утверждение о готовом checksum задании удалено. Неактивные Print
`v0.3.0`, Moodle `v0.3.0`, PrairieLearn/Cloud `v3.0.0` описаны как отдельные
маршруты. Prose работы исправлена без изменения YAML/ID/task-items/атрибутов.
Детальные local runtime/CI результаты дополняются после фактического завершения;
этот раздел не объявляет их уже успешными.

Здесь сохранить финальный head SHA, версии, проверки и URL нового OPEN PR.
