-- Узел #sol-* или callout и его ID сохраняются. Раскрытием управляет
-- внешний контейнер без ID, поэтому штатные перекрёстные ссылки работают.
local M = {}
function M.kind(div, owner)
  local related = div.attributes["for"] or owner
  if not related then return nil end
  if div.identifier:match("^sol%-") or div.classes:includes("solution") then return "solution" end
  if div.classes:includes("callout-tip") and not div.attributes["course-role"] then return "hint" end
  return nil
end
function M.wrap(div, kind, cfg)
  if not kind then return div end
  local classes = {"course-answer", "course-answer-" .. kind}
  if not cfg.html or cfg.answers == "expanded" then
    return pandoc.Div({div}, pandoc.Attr("", classes))
  end
  local summary = cfg.ru and (kind == "hint" and "Показать подсказку" or "Показать решение")
    or (kind == "hint" and "Show hint" or "Show solution")
  if not cfg.reveal then
    table.insert(classes, "callout-note")
    -- Штатное раскрытие Bootstrap в Quarto управляет переключением и состоянием ARIA.
    return pandoc.Div({pandoc.Header(3, summary), div}, pandoc.Attr("", classes,
      {collapse = "true", icon = "false"}))
  end
  -- Reveal не сворачивает callout. Фильтр создаёт элемент <details>,
  -- сохраняя обычный Markdown Pandoc/Quarto в авторском тексте.
  return pandoc.Div({pandoc.RawBlock("html", "<details><summary>" .. summary .. "</summary>"),
    div, pandoc.RawBlock("html", "</details>")}, pandoc.Attr("", classes))
end
return M
