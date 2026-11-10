# Источники технических семинаров

Карта связывает действующие исходники семинаров 4–7 с самостоятельной
теорией, банками и общими иллюстрациями. Авторский процесс описан
в [организации блока](technical-seminars.md),
предпосылки — в [контексте аудитории](course-context.md).

## Учебные материалы

| Семинар | Слайды | Предметная теория | Банк |
|---|---|---|---|
| **4. Управление доступом** | [04-access-control.qmd](../../seminars/04-access-control.qmd) | [Аутентификация](../../theory/access-control/authentication.qmd), [авторизация](../../theory/access-control/authorization.qmd) | [access-control.qmd](../../task/bank/access-control.qmd) |
| **5. Криптография** | [05-crypto.qmd](../../seminars/05-crypto.qmd) | [Случайность](../../theory/crypto/randomness.qmd), [симметричное шифрование](../../theory/crypto/symmetric-encryption.qmd), [хеш-функции](../../theory/crypto/hash-functions.qmd), [управление ключами](../../theory/crypto/key-management.qmd), [хранение паролей](../../theory/crypto/password-storage.qmd) | [crypto.qmd](../../task/bank/crypto.qmd) |
| **6. Доверие к данным** | [06-data-trust.qmd](../../seminars/06-data-trust.qmd) | [Асимметричная криптография](../../theory/crypto/asymmetric-cryptography.qmd), [проверка целостности](../../theory/data-trust/integrity-verification.qmd), [цифровая подпись](../../theory/crypto/digital-signature.qmd), [сертификаты](../../theory/data-trust/certificates.qmd) | [data-trust.qmd](../../task/bank/data-trust.qmd) |
| **7. Сохранность данных** | [07-data-preservation.qmd](../../seminars/07-data-preservation.qmd) | [Резервное копирование](../../theory/data-preservation/backups.qmd), [дисковые массивы](../../theory/data-preservation/raid.qmd) | [data-preservation.qmd](../../task/bank/data-preservation.qmd) |

[Схема Лэмпорта](../../theory/crypto/lamport-signature.qmd) и соответствующие
задачи дополняют общую подпись. [Нормативные требования](../../theory/legal/standards.qmd)
расположены в `legal/`, [оценка риска](../../theory/risk-assessment.qmd) —
в отдельной главе верхнего уровня.

Полные условия и решения связываются суффиксами `exr-*` и `sol-*`
в одном банковском QMD; допустима вложенная анонимная `.solution`.
Слайды содержат самодостаточные условия без решений. Краткие варианты
имеют собственные ID; неизменённые условия подключаются через
`CI/prepare-bank-fragments.py` в режиме `statement_only`.
[Работа по доступу](../../task/works/04-access-control.qmd) и
[работа по копиям](../../task/works/backup.qmd) являются отдельными назначениями.

## Первоисточники объяснения

Опорный учебник по криптографии — *The Structure of Secure Systems*,
Henry Corrigan-Gibbs, Srini Devadas, Yael Kalai, Nickolai Zeldovich.
Авторство указано на [титульной странице](https://securitybook.eecs.berkeley.edu/).
Используется HTML-версия; номера печатных страниц ей не приписываются.

| Учебный вопрос | Источник |
|---|---|
| Полномочия компилятора | [Stanford CS140, слайды 24–27](https://www.scs.stanford.edu/18wi-cs140/notes/protection-print.pdf#page=5); [Norm Hardy, «The Confused Deputy», с. 1–2](https://www.cs.utexas.edu/~witchel/S25-380L/papers/hardy88confused.pdf) |
| Назначение ролей печати | [DTU, Access Control Scenario](https://www2.imm.dtu.dk/courses/02239/AccessControlLab.html) |
| Передача сообщения без заранее общего секрета | [Глава 10, §§ 10.5–10.6](https://securitybook.eecs.berkeley.edu/chapters/lec10.html) |
| Хеш копии и доверенный эталон | [Глава 3, § 3.1 и Secure File Mirroring](https://securitybook.eecs.berkeley.edu/chapters/lec03.html) |
| Создание и проверка подписи | [Глава 5, §§ 5.1, 5.5](https://securitybook.eecs.berkeley.edu/chapters/lec05.html) |
| Принадлежность открытого ключа | [Глава 7, §§ 7.3–7.4](https://securitybook.eecs.berkeley.edu/chapters/lec07.html) |
| Пара ключей RSA | [RFC 8017, § 3](https://www.rfc-editor.org/rfc/rfc8017.html#section-3) |
| Основание стойкости RSA | [Исходная статья RSA, § IX](https://people.csail.mit.edu/rivest/Rsapaper.pdf) |
| Длина ключа и стойкость | [NIST SP 800-57 Part 1 Rev. 5, таблица 2](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf#page=66) |
| Размещение блоков RAID | [OSTEP, глава 38, §§ 38.4–38.7](https://pages.cs.wisc.edu/~remzi/OSTEP/file-raid.pdf) |

Адаптация сохраняет существенные условия источника. Поведение учебной
модели компилятора не приписывается современному Unix. Выбор набора копий
следует из условия: независимое извлечение целых файлов и последовательное
применение инкрементов требуют разных рассуждений.

Для дополнительных сюжетов установлены следующие границы адаптации:

| Сюжет | Источник | Учебная рамка |
|---|---|---|
| Редактирование шифротекста | [Cryptopals №25](https://cryptopals.com/sets/4/challenges/25) | Готовая операция редактирования и точное правило потока; реализация AES не обязательна |
| Перенос зашифрованной базы | [Руководство Microsoft по TDE](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/move-a-tde-protected-database-to-another-sql-server?view=sql-server-ver17) | Наблюдения о переносе и комплекте ключей; специальный SQL не является обязательным языком задачи |

## Иллюстрации

| Предмет | Общие авторские ресурсы |
|---|---|
| Доступ | [Архитектура проверки](../../shared/visualizations/access-control/static/overview.svg), [DAC](../../shared/visualizations/access-control/dac/static/overview.svg), [уровни и потоки MAC](../../shared/visualizations/access-control/mac/static/overview.svg), [граф RBAC](../../shared/visualizations/access-control/rbac/static/overview.svg); интерактивные разборы [DAC](../../shared/visualizations/_dac-example.qmd), [MAC](../../shared/visualizations/_mac-example.qmd), [RBAC](../../shared/visualizations/_rbac-example.qmd) |
| Криптография | [RANDU](../../shared/visualizations/crypto/static/randu-planes.svg), [длина хеша](../../shared/visualizations/crypto/static/hash-length.svg), [XOR](../../shared/visualizations/fragments/xor-trainer.qmd), [полный опыт с хешем](../../shared/visualizations/fragments/hash-bit-experiment.qmd), [вариант для слайдов](../../shared/visualizations/fragments/hash-bit-seminar.qmd), [парольная запись](../../shared/visualizations/crypto/static/password-record-slide.svg) |
| Доверие | [Шифрование получателю](../../shared/visualizations/data-trust/static/asymmetric-encryption.svg), [подпись для теории](../../shared/visualizations/data-trust/static/signature-flow.svg), [подпись для слайдов](../../shared/visualizations/data-trust/static/signature-flow-slide.svg), [цепочка для теории](../../shared/visualizations/data-trust/static/certificate-chain.svg); отдельные рисунки Лэмпорта в том же каталоге |
| Сохранность | [Виды копий](../../shared/visualizations/data-integrity/static/backup-types.svg), [история версий для задачи](../../shared/visualizations/data-integrity/static/backup-history-exercise.svg), [объёмы копий](../../shared/visualizations/data-integrity/static/copy-scales.svg), [папка проекта](../../shared/visualizations/data-integrity/static/project-storage.svg), [размещение RAID](../../shared/visualizations/data-integrity/static/raid.svg), [XOR-восстановление](../../shared/visualizations/fragments/xor-recovery.qmd) |

Нативная таблица дополняет схему точными данными. В слайдах XOR записан
в столбик, проверка цепочки сертификатов — таблицей. Номер и название
рисунка задаёт Quarto; `_prepared/` содержит производные ресурсы.

Сценарии живого показа: [права файлов Windows](../demonstrations/windows-demo.md)
и [сертификат сайта, издатель программы](../demonstrations/certificate-demo.md).

Подробный [опыт с Butterfly Backup](../demonstrations/backup-lab.qmd)
описывает четыре режима, цели восстановления и проверку полученных файлов.
Это отдельный сценарий преподавателя; назначенные работы задаются в `task/works/`.
