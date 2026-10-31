# Задача 7 — визуализации и техническая интеграция

## Статус и границы

Технические исходники и подготовка готовы к независимой целевой приёмке.
Базовый снимок поручения: `874fbd0`; SHA технического коммита: `cfa95f44c5ecb7f569c927f68e43e21cdbecec64`.
Учебные главы, банк и слайды двух Terra не редактировались. Полный CI, полный рендер,
публикация и изменение установленных Course-Tools не выполнялись. По координации
единственный целевой Quarto-прогон и измерение готовых HTML делает независимый приёмщик.

## Реализация и файлы

- `shared/visualizations/access-control/{dac,rbac}`: отдельные чистые политики,
  запросы, именованные Controls/Diagram, DOT модели/алгоритма и обзорные SVG.
  Общий выбранный этап управляет обеими схемами и пояснением пилотного runtime.
  DAC имеет отдельные узлы процессов Алисы и Боба; чтение не даёт запись.
  RBAC ограничивает назначения курсом А/Б, без неявного наследования.
- `shared/visualizations/access-control/{graphs,static}/overview.*`: единый обзор
  субъекта, операции, монитора, объекта и политики.
- `shared/visualizations/authentication`: сравнение пароль/OTP/passkey и отдельные
  регистрации/входа passkey; факторов/TOTP в рисунках нет.
- `shared/visualizations/crypto`: два локальных тренажёра LCG и Цезарь/XOR,
  подсказка, проверка ответа и обратное преобразование; схемы seed, симметрии, хеша.
  LCG использует небольшие точные целые, Цезарь — A–Z, XOR — UTF-8.
- `shared/visualizations/data-integrity`: ровно семь композиций (сумма/хеш,
  три временные шкалы копий, RAID0/1/5, коллизия суммы, изменение байта,
  подмена эталона, восстановление XOR). Чистые функции считают суммы, SHA-256,
  XOR и объёмы копий. `examples.js` + `backupCopies` формируют три шкалы из
  одних данных A=2/B=3/C=5, правки A/B/A, без повторно поддерживаемой таблицы.
- `shared/visualizations/common/diagram.js`: просмотр этапов отдельных DOT-схем,
  независимые экземпляры и сохранение текущего SVG; общую архитектуру не заменяет.
- `CI/build-visualizations.py`, `prepare-visualizations.py`,
  `prepare-course-visualizations.py`: DOT → SVG, материализация ресурсов внутри owner,
  автоматический выбор фактических includes банка до инвентаризации Core.
  Канонический ID должен иметь ровно один источник; ошибку подготовка не скрывает.
- Конфигурации theory/seminars, профили student/full и три index: тема4,
  crypto/password-storage, целостность, только заголовки темы7, слайды5–6.
  Публичные namespaces и адреса сохранены. Старая галерея исключена из ресурсов портала,
  нужные старые SVG продолжают доставляться имеющимся адаптером.
- `.github/workflows/pages.yml` и `CI/requirements-visualizations.txt` явно
  подготавливают Graphviz, Node.js и PyYAML. `docs/content/visualization-authoring.md`
  документирует фактические paths/exports и подготовку.
- `CI/check-access-control.py`: общий банковский скан принимает расширенный набор
  ключей, требует сохранения 13 назначенных решений и далее проверяет каждый найденный
  ключ. Сам Body-контракт работы с 13 назначениями не изменён.

## RED/GREEN и выполненные проверки

1. `node --test CI/visualizations/integration.test.mjs`: RED 4/4 до реализации
   отсутствующих политик/вычислений; затем минимальные заглушки также дали RED по
   отсутствующему поведению. После реализации GREEN4/4.
2. Независимая статическая проверка нашла фиксированный «Процесс Боба» при выборе
   Алисы. Новые утверждения `subject-alice` в запросе и финальном решении дали RED;
   после разделения узлов и стрелок GREEN. Браузер проверяет фактическую подсветку
   Алисы при alice/write/allow, Боб остаётся отдельным невыбранным субъектом.
3. При сверке с авторским контекстом заменена неверная ранняя трактовка copy-scales
   как файл/блок/байт: теперь полная/инкрементная/дифференциальная временные шкалы.
   RED на отсутствующей `backupCopies`, GREEN на рядах
   `[10,10,10,10]`, `[10,2,3,2]`, `[10,2,5,5]`; повтор A не дублируется.
4. `python3 CI/visualizations/access-inventory.test.py`: RED до адаптации аудитора,
   GREEN1/1 после; расширенный банк допустим, отсутствие назначенного решения запрещено.
5. Финальный `node --test CI/visualizations/integration.test.mjs CI/visualizations/mac.test.mjs`:
   GREEN7/7; политики, обратимость, известная потеря XOR, запрет двух потерь, хеши,
   повторная правка копии и независимость трасс.
6. `python3 CI/visualizations/bank-fragments.test.py`: GREEN3/3.
7. `node CI/visualizations/integration.browser.cjs`: Chromium, все проверки true:
   независимость Controls и тренажёров, удаление notes без изменения этапа,
   выбор субъекта DAC, обратное преобразование, уникальные SVG id,
   переключение 13 отдельных схем; всего21 SVG в пробе.
8. `node CI/visualizations/runtime.browser.cjs`: все6 проверок true,
   включая ссылки SVG, независимость, reset и экспорт с вычисленными стилями.
9. `python3 CI/build-visualizations.py`; `python3 CI/prepare-visualizations.py theory seminars`:
   exit0. `python3 ../CI/prepare-course-visualizations.py` из seminars:
   exit0, свежие19 банковских includes подготовлены автоматически.
10. `node --check CI/visualizations/measure-pages.browser.cjs`; `git diff --check`:
    exit0. Обзор трёх шкал визуально просмотрен через PNG Graphviz.

## Измерения

Компонентная проба снята заново Chromium после окончательных правок; это исходные
ES-модули/DOT-SVG, а не готовые страницы Quarto. В измерение входит небольшой
начальный тестовый документ. Числа предыдущего пилота не переносились.

- Сумма несжатых HTTP-тел: 105040 байт.
- Локальная оценка gzip каждого тела: 33198 байт; сервер передавал несжатые тела.
- JS heap до просмотра: 1010092 байт; после всех компонентов: 2064836 байт.
- Embedder heap до/после: 1504872 / 8132112 байт.

Память вкладки не равна размеру загрузки и не является RSS процесса браузера.
Полный снимок HTTP-ресурсов и heap сохранён в `task-7-component-measurement.json` рядом.

Для независимого снимка готовых страниц передан `CI/visualizations/measure-pages.browser.cjs`:

```sh
node CI/visualizations/measure-pages.browser.cjs seminars/_output/student 04-access-control.html 05-crypto.html 06-data-integrity.html
node CI/visualizations/measure-pages.browser.cjs theory/_output/student access-control/access-control.html crypto/random.html crypto/cypher.html data-integrity/integrity.html
```

Он не рендерит курс; измеряет первое местное HTTP-открытие, посещает слайды и примеры,
раздельно записывает HTTP-тела, gzip-оценку, heap, ошибки и статусы ответов.
Итоговый page-level результат и native-приватность ожидаются в независимом отчёте.
Все изменения подготовленных `_prepared` не коммитятся; кэш Python этой работы удалён.
Staging и commit выполняются одной операцией под `/tmp/cybersecurity-integration-git.lock`.

После авторского коммита `1b7c88b` проверены реальные включения обязательных
схем входа/passkey, seed/симметрии/хеша и единого обзора запроса в QMD теории и слайдов.
Ресурсы не остались неиспользуемым набором в shared.
