# Техническая приёмка тем 4–6

31 октября 2026 года; учебный снимок `0c485b1`, финальный проверочный снимок `8c84be2`.
Статус: техническая приёмка выбранного набора пройдена. Выборочная приёмка, не весь курс
и не полная матрица CI. [Безопасные результаты и измерения](technical-integration-evidence/results.json).
Преподавательские HTML, Body-пакеты, закрытые строки и полные журналы оставлены
в непубличном `/tmp`; одноразовые сценарии не добавлены в инструментарий проекта.

## Основание

Quarto 1.11.6; Core/Presentation/Navigation 8.2.8; Reference Catalog 3.1.1;
Publisher 5.1.4; Download 3.2.2. Ранее принятая проверка совместимости подтвердила
790 файлов опубликованных пакетов; установленные расширения вручную не менялись.
Успешные прежние проверки не повторялись без нового сомнения.

Основные коммиты: структура `5e39c5c`, совместимость `cfe40de`, карта `6ee72c1`,
пилот `255eea1`/`7f4592f`, теория `116b9e0`, слайды `ffc23f0`, визуализации `cfa95f4`.
Исправления интеграции: подключения `1b7c88b`, passkey `08ffd1d`,
заголовки/difficulty `fb35954`/`ac62b36`/`332fc2a`, автономность `3b5f8c8`/`8aa4881`,
правовая раскладка `d09fcd5`, legacy SVG `7116ae7`, шрифты `9159fc4`, якорь `0c485b1`.
См. [инструкцию автора](visualization-authoring.md) и [карту переноса](technical-source-map.yml).

## Подтверждённые результаты

- Относительно `874fbd0` сохранены 120 ID банка/работ, 32 прежних ID учебных страниц,
  35 ссылок назначений, карта алиасов. Девять файлов условий тем 1–3 и работ
  неизменны; четыре банка дополнены после прежнего текста, повторных ID нет.
- Независимо проверены 18 сочетаний MAC, изменённые ACL/роли, LCG, Цезарь, XOR,
  сумма mod 256, SHA-256 через hashlib и восстановление каждого из трёх блоков.
  Для A=2, B=3, C=5 и изменений A/B/A копии дают 10/2/5.
  Все 221 смысловая ссылка 44 этапов найдены в фактических SVG.
- Native exit 0: 40 обычных HTML student/full, четыре изолированных пилота,
  две изолированные входные страницы. Обычный набор: seminars index и 01–06;
  theory index, access-control, integrity и шесть crypto; task index и три банка.
- Браузер проверял готовый HTTP-output при запрещённой внешней сети: выбранные
  итоговые страницы теории, портала и слайдов без внешних загрузок, ошибок OJS
  и пропущенных ресурсов. Проверены смена запроса/сброс, синхронность двух схем,
  уникальность SVG ID, экспорт и неизменность подписи Quarto. Пилоты подтвердили
  независимость двух экземпляров и сохранение вычисления без пояснения.
- Оба якоря факторов существуют ровно по одному; старый `fig-access-factors`
  не стал рисунком. Три прежних SVG загружаются, `fig-mac-decision` ведёт внутри
  обычной главы. `seminars/control-demo.html` доставляется в чистый output.
- Слайды 1–6 показывают материал и данные вопросов без notes. При 1440×1080
  правовые условия заканчиваются на 927,60/948,31 px, подвал начинается на 1004 px;
  student/full помещаются. Скриншоты: [первое условие](technical-integration-evidence/legal-sharing.png),
  [второе](technical-integration-evidence/legal-measures.png), [RBAC](technical-integration-evidence/rbac-controls.png).
  Тема 7 содержит только четыре заголовка.
- Все 32 закрытых решения трёх банков есть в full и отсутствуют в student;
  3392 частные сигнатуры в 276 публичных текстовых ресурсах, включая JS/поиск,
  не выявили утечек. Demonstration есть в обеих проекциях, обычный ключ только full.
- Свежие Body teacher/public: backup — один вопрос; access-control — 13 slots,
  пять required и восемь optional. Сохранены порядок, stage, workMode, равенство
  условий и verification → RBAC canonicalLink. Все 13 teacher solutions есть;
  в public нет closedKey/solution/gradingNotes. Inventory, оба export и штатный
  `CI/check-access-control.py body` завершились exit 0.

Последняя проверка `python3 CI/check-access-control.py site task/_output/student task/_output/full --targeted`
завершилась exit 0 на `8c84be2` без повторной HTML-сборки. Исправление scanner
устранило ложное срабатывание из-за двойного текста MathML/TeX annotation,
сохранив проверки ID и частных текстовых фрагментов.

## Команды, изоляция и границы

Quarto сериализовался через `flock /tmp/cybersecurity-integration-render.lock`.
Обычные вызовы: `quarto render <файл.qmd> --profile student --no-clean` и full.
Batch seminars допустим после сверки render: ровно index и 01–06.
Batch `quarto render theory/crypto --profile student --no-clean` и full предварительно
проверен по CLI-фильтру префикса и списку `[1/6]`: random, hash, password-storage,
key-gen, cypher, public-key-outline. Остальные theory/task собраны адресно.
Профиль project.render не ограничил book inputs при inspect и не рендерился;
Julia в configResource не означает исполнения.

Пилоты требуют отдельного xref cache: одинаковый figure ID иначе оставляет чужой
маршрут. Для пробы отложены `.quarto`, `_generated`, `_output` theory/seminars,
после неё обычное состояние восстановлено. Локальные каталоги обновлены штатным
QRC API из 20 обычных страниц каждой проекции; search/catalog без pilot URL.
Без `COURSE_SITE_COLLECTION` штатный collect.ts не пишет внешний collection-stage.

Один ранний ошибочный вызов root-hook остановлен: успел начаться дочерний
теоретический student-набор 16 HTML; полная композиция не завершалась.
Своя processgroup завершена, побочные outputs/stages отложены до чистой приёмки.
Итоговый root проверен отдельно с тем же index/навигацией/темой и обычной копией
расширений, прямыми Core/QRC hooks, без Course Site/subprojects. Это входной HTML,
а не проверка корневой публикации. Символическая ссылка на расширения штатным
Core native path binding не принимается.

Body: `quarto run task/_extensions/Afonenko-Course-Tools/course-core/entrypoints/project-checks.ts -- --book task --output /tmp/body/checks.json`;
`quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/export.ts --book task --work <ID> --output /tmp/body/<имя>.json`,
где ID — `sec-work-data-integrity-backup` и `sec-work-access-control`;
затем `python3 CI/check-access-control.py body /tmp/body`.
Перед экспортом штатный QRC publish подготовил минимальный локальный каталог
из свежего student-банка доступа; он не представляет полный сайт.

Существующий `CI/visualizations/measure-pages.browser.cjs` измерил seminars04–06
и theory access-control/random/cypher/integrity: HTTP-тела 1,80–2,28 МБ,
локальная gzip-оценка 0,61–0,73 МБ; JS heap сначала 3,32–4,62 МБ, после действий
3,47–4,78 МБ. Embedder heap приведён отдельно в JSON. Сервер передавал несжатые
тела; gzip не фактический трафик. Heap вкладки не RSS/размер загрузки, два снимка
не доказывают отсутствие утечки памяти.

В адресном task/index остаются девять отложенных ссылок на старые страницы вне
выбранного набора; исходные ID и canonical адреса ранее проверены в полном
контексте metadata этапом совместимости. Полная навигация курса не заявляется.
Полная CI-проверка, публикация, push, merge и изменения PR не выполнялись.
