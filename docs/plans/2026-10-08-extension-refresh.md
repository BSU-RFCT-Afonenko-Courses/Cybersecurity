# Cybersecurity: новый открытый PR на выпущенной модели

Статус: шаг 16 выполняется после выпусков инструментов и публикации
руководства. Действуют [контракты Core 4.0.1](https://github.com/Afonenko-Course-Tools/quarto-course/blob/v4.0.1/spec/index.md)
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
2. Установить штатно Core `v4.0.1` и QRC `v3.0.0` в корень/theory/task/seminars,
   Publisher `v5.0.0` в корень, Download `v2.0.0` в task. Сверить весь payload
   с выпущенными upstream Git objects. Исправления output.lua/validate.ts
   приходят из Core 4.0.1; ручной overlay не применять. README/команды/pins
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

## Core 4.0.1 — финальные pins и проверки

Выпущенный Core 4.0.1: source
`a9a439bd6e6498806d4d4943efd71232e70170be`, immutable Release 406473961,
[PR #27](https://github.com/Afonenko-Course-Tools/quarto-course/pull/27),
[PR CI SUCCESS](https://github.com/Afonenko-Course-Tools/quarto-course/actions/runs/37734271246) и
[main CI SUCCESS](https://github.com/Afonenko-Course-Tools/quarto-course/actions/runs/37734901545).
Нативная установка тега upstream проверила все 63 пути/bytes bundle.
Новый Core demo `demo-20261008-1`, Release 406475550 на том же source SHA,
проверен как полный native готовый результат; прежние immutable выпуски сохранены.
Авторская модель, схемы и NativeRun/Body API сохраняют контракт Core 4.0.0.

Штатный `bash CI/install-extensions.sh` завершился exit 0 за 48,668 секунды.
Установлены четыре exact Core 4.0.1 bundle по 63 файла, QRC 3.0.0 в каждом
проекте, Publisher 5.0.0 в корне и Download 2.0.0 в task: **618 файлов**.
Корень — 159, theory — 149, task — 161, seminars — 149; каждый path/byte
равен upstream release Git object. Exact receipt:
`/tmp/cybersecurity-core-patch-20261008/installed-exact-byte-proof.json`.
CI/install-extensions.sh закрепляет v4.0.1; overlays не добавляются.

Руководство с Core 4.0.1 опубликовано штатно через `task publish` после
[PR #19 / CI SUCCESS](https://github.com/Afonenko-Course-Tools/quarto-template-course/actions/runs/37737745573):
source main `52316a762da3a9c054b5ac6a7a89620e46c7c150`, native gh-pages
`8dc11b599406f65af420aef39babdb15375df61b`. Native install/fetch/render/check/
fetch regression и publish завершились exit 0. Все 599 опубликованных файлов
равны проверенным bytes; Pages legacy built, 22 HTTP/hash и Root CUA native
Source/search/catalog/Core example PASS. Exact receipts:
`/tmp/template-patch-pages-20261008/verified-pages.json` и
`/tmp/template-patch-pages-20261008/root-browser-proof.json`.
Ранее прочитанные Core 4.0.0 страницы остаются историей первой публикации.

Итоговое дерево курса фиксируется в PR; точный head и required CI отражаются
в GitHub checks и центральном отчёте Core.
NativeRun 48 / project-local CUE 8: `PASS: NativeRun 48 cases (exit 0, 0,995 с), project-local CUE 8 cases (exit 0, 1,213 с)`.
Student → full → student: `PASS: student 107,247 с → full 120,018 с → student 111,065 с, все exit 0`.
Site/source/search/QRC/resources: `PASS: CI/site.py exit 0 за 0,358 с; оба native href ведут в ../data-integrity/backup.html#exr-data-integrity-backup с числовой подписью 11.1 внутри main, unresolved/pending отсутствуют`.
Выбранный backup Body: `PASS: native selected export exit 0 за 40,629 с; root-only cybersecurity, одна open/manual задача с авторской оценкой 90 минут и required/individual назначением; закрытые participant поля отсутствуют, ресурсов 0; все 178 файлов student после экспорта побайтно сохранены`.
Точные commands/exits/durations/файл-SHA maps:
`docs/history/2026-10-08-final-refresh/receipts/verified-final-native.json`. Эти gates выполнены на фактическом Core 4.0.1. Первый Core 4.0.0 student
href отказ сохранён как история диагностики и не заменяет успешный повтор.

Авторские QMD/YAML сохранены: одна реальная backup-задача с собственной
оценкой 90 минут, одна лабораторная required/individual без stage, узкий bank
и root-only id. Checksum/контрольные остаются черновиками; новые решения,
ответы, project/binding/ZIP не создаются. Native warning streams учитываются
вместе с actual exit; Windows/hosted LMS/Cloud исполнение не заявляется.

CI запускается на этом PR; итог указан в GitHub checks. Точный OPEN PR URL
и head сохраняются в центральном отчёте Core после создания PR. Курс
передаётся без merge/deploy; публикационные guards и все ветки/пользовательские
worktrees сохранены.
