-- Локальное раскрытие сохраняет оформление перенесённых решений и подсказок.
-- Фильтр работает после course-presentation и не меняет видимость в course-core.
return {{Div = function(div)
  if not div.classes:includes("course-answer") then return nil end
  local solution = div.content[#div.content]
  if not solution or solution.t ~= "Div" or
      not solution.classes:includes("answers-expanded") then return nil end
  return pandoc.Div({solution}, pandoc.Attr("",
    {"course-answer", "course-answer-solution"}))
end}}
