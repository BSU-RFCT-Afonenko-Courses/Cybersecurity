# Основы кибербезопасности

Материалы перенесены в структуру
[quarto-template-course](https://github.com/Afonenko-Course-Tools/quarto-template-course):
общий портал и пять частей курса.

| Каталог | Содержание |
| --- | --- |
| `theory/` | Исходные главы по криптографии |
| `tasks/` | Лабораторные, порядок работ и черновики контрольных заданий |
| `lectures/` | Презентации лекций |
| `practice/` | Восемь семинаров и преподавательские заметки |
| `handbook/` | Навигация по материалам и библиография |

Лабораторные редактируются в `tasks/lab/`. Условия хранятся один раз,
остальные части курса ссылаются на них. Пустые семинары и контрольные работы
сохранены как заготовки; новые условия не добавлены. Преподавательские черновики
и заметки доступны только в профиле `full`.

## Сборка

Нужны Quarto **1.10.18** или **1.11.5** и CUE **0.17.1**.
Сценарии TypeScript запускаются встроенным в Quarto Deno. Расширения включены
в репозиторий; их происхождение указано в [UPSTREAM.md](UPSTREAM.md).

Выполните команды из корня репозитория:

```bash
quarto run _extensions/Afonenko-Course-Tools/project-publish/entrypoints/render.ts --profile full
quarto run _extensions/Afonenko-Course-Tools/project-publish/entrypoints/render.ts --profile student
```

Результаты находятся в `_site-full/index.html` и `_site-student/index.html`.
По умолчанию выбран профиль `student`. Сборка выполняет штатные проверки
Core, QRC и Publisher из общего шаблона.
