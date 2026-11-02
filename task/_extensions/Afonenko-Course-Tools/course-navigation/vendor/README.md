# Поставляемые зависимости HTML-парсера

Пакет работает без загрузки зависимостей во время сборки и без установки QRC.

| Пакет | Версия | Лицензия | Исходник |
| --- | --- | --- | --- |
| parse5 | 7.3.0 | MIT | https://registry.npmjs.org/parse5/-/parse5-7.3.0.tgz |
| entities | 6.0.1 | BSD-2-Clause | https://registry.npmjs.org/entities/-/entities-6.0.1.tgz |

Включены ES-модули, метаданные и лицензии. CommonJS и карты исходников исключены.
Импорты `entities/decode` и `entities/escape` в parse5 заменены относительными
путями; остальной код библиотек не менялся. Адаптер находится в `html/document.ts`.
