# Общий шаблон курса

Композиция и полные установленные расширения перенесены из
[quarto-template-course](https://github.com/Afonenko-Course-Tools/quarto-template-course)
на commit `a5939b4f06e88e80a63eca61ee7ff71ef841f061`,
Git tree `4ffc076a15cf051cab1b14c3ddf79671e5c4626d`.

Книги используют стандартную тему Cosmo, слайды — стандартную тему Reveal.
Учебные блоки оформляет course-presentation, управление слайдами —
course-navigation. Publisher, Core и QRC управляют общим выпуском и ссылками.
Vendor-код расширений сохранён без изменений; полные payload включают лицензии.

Версии поставщиков и исходные лицензии зафиксированы в
[UPSTREAM.md выбранного шаблона](https://github.com/Afonenko-Course-Tools/quarto-template-course/blob/a5939b4f06e88e80a63eca61ee7ff71ef841f061/UPSTREAM.md).

Обновлять расширения следует целыми пакетами, затем собирать student и full
и запускать проверку публикаций из README.
