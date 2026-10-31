#let sum-points(points) = points.fold(0, (total, point) => total + point)

#let points-label(points) = {
  let last-two = calc.rem(points, 100)
  let last = calc.rem(points, 10)
  let word = if last-two >= 11 and last-two <= 14 {
    "баллов"
  } else if last == 1 {
    "балл"
  } else if last >= 2 and last <= 4 {
    "балла"
  } else {
    "баллов"
  }
  [#points #word]
}

#let header-field(label) = grid(
  columns: (auto, 1fr),
  column-gutter: 4pt,
  label,
  align(bottom, line(length: 100%, stroke: 0.45pt + luma(150))),
)

#let header(variant, scores) = {
  let maxima = scores.map(sum-points)
  let total = sum-points(maxima)
  grid(
    columns: (1fr, auto),
    align: (left, right),
    text(size: 14pt, weight: "bold")[Основы кибербезопасности.],
    text(size: 12pt, weight: "bold")[Вариант #variant],
  )
  v(3pt)
  text(size: 12pt, weight: "bold")[Контрольная работа: Основные понятия, правовые требования]
  v(4pt)
  grid(
    columns: (0.65fr, 1fr, 1fr),
    column-gutter: 9pt,
    [Курс: *3*],
    header-field([Дата:]),
    header-field([Группа:]),
  )
  v(3pt)
  header-field([ФИО:])
  v(3pt)
  text(size: 10pt, weight: "bold")[Для проверяющего]
  v(2pt)
  table(
    columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr),
    inset: (x: 4pt, y: 4pt),
    stroke: 0.45pt + luma(155),
    align: (left, center, center, center, center, center),
    [*Баллы*], [*Задание 1*], [*Задание 2*], [*Задание 3*], [*Итого*], [*Оценка*],
    [Получено], [#h(7mm) / #maxima.at(0)], [#h(7mm) / #maxima.at(1)], [#h(7mm) / #maxima.at(2)], [#h(7mm) / #total], [],
  )
}

#let task(title) = block(above: 10pt, below: 6pt)[#text(size: 12pt, weight: "bold")[#title]]

#let question(body, score) = block(below: 6pt, grid(
  columns: (1fr, auto),
  column-gutter: 5pt,
  align: (left, right),
  body,
  box(inset: (x: 3pt, y: 1pt), radius: 2pt, stroke: 0.35pt + luma(195),
    text(size: 10pt, fill: luma(70))[#points-label(score)]),
))

#let fields(labels, columns: 3) = block(above: 3mm, below: 2.5mm, grid(
  columns: columns,
  column-gutter: 7pt,
  row-gutter: 6mm,
  ..labels.map(label => grid(
    columns: (auto, 1fr),
    column-gutter: 3pt,
    label,
    align(bottom, line(length: 100%, stroke: 0.45pt + luma(150))),
  )),
))

#let listed-fields(labels, columns: 2) = block(above: 3mm, below: 2.5mm, grid(
  columns: columns,
  column-gutter: 7pt,
  row-gutter: 6mm,
  ..labels.map(label => list(
    grid(
      columns: (auto, 1fr),
      column-gutter: 3pt,
      label,
      align(bottom, line(length: 100%, stroke: 0.45pt + luma(150))),
    ),
  )),
))

#let ruled(count) = {
  for i in range(count) {
    block(height: 9mm, width: 100%, align(bottom, line(length: 100%, stroke: 0.45pt + luma(155))))
  }
}

#let response-notes() = {
  task[Дополнительные записи]
  for i in range(6) {
    block(above: 4pt, below: 3pt, grid(
      columns: (auto, 7mm, auto, 7mm, 1fr),
      column-gutter: 5pt,
      align(horizon)[Задание:],
      box(width: 7mm, height: 7mm, stroke: 0.5pt + luma(130)),
      align(horizon)[Пункт:],
      box(width: 7mm, height: 7mm, stroke: 0.5pt + luma(130)),
      align(bottom, line(length: 100%, stroke: 0.45pt + luma(150))),
    ))
  }
}
