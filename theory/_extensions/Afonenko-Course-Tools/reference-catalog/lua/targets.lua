-- Адаптер использует публичные узлы Pandoc/Quarto, не обращаясь к внутреннему индексу.
local M = {}
local constants = require("./constants")
local types = {}
local ids = {}
local titles = {}
local heading_titles = {}
local function str(v) return v and pandoc.utils.stringify(v) or "" end
function M.init(meta)
  for _, name in ipairs(constants.target_types) do
    types[name] = true
  end
  local crossref = meta.crossref
  if crossref and crossref.custom then
    for _, item in ipairs(crossref.custom) do types[str(item.key)] = true end
  end
end
function M.capture(el)
  local id = el.identifier or (el.attr and el.attr.identifier)
  if not id and el.div then id = el.div.identifier end
  if id and types[id:match("^([^-]+)%-")] then
    ids[id] = true
    if el.t == "Header" then heading_titles[id] = str(el.content) end
    -- К фазе pre-ast заголовки глав первого уровня уже перенесены в metadata.title.
    -- Quarto сохраняет там явный ID и элементы chapter-title.
    if el.t == "Span" and el.classes:includes("quarto-section-identifier") then
      local title = nil
      el:walk({Span = function(span)
        if span.classes:includes("chapter-title") then title = str(span.content) end
      end})
      heading_titles[id] = title or str(el.content)
    end
    if el.t == "Header" and id:match("^sec%-") and
      (el.classes:includes("unnumbered") or not PANDOC_WRITER_OPTIONS.number_sections) then
      titles[id] = el.content
    end
  end
end
function M.equations(block)
  -- К фазе post-ast метки формул остаются обычными строчными аннотациями.
  -- Читаем атрибуты только непосредственно после выключной формулы.
  local pending = false
  for _, el in ipairs(block.content) do
    if el.t == "Math" and el.mathtype == "DisplayMath" then pending = true
    elseif pending and (el.t == "Space" or el.t == "SoftBreak") then
    elseif pending and el.t == "Str" then
      local id = el.text:match("^{#(eq%-[^}%s]+)")
      if id then ids[id] = true end
      pending = false
    else pending = false end
  end
end
function M.sorted()
  local out = {}; for id in pairs(ids) do out[#out + 1] = id end
  table.sort(out); return out
end
function M.title(id) return titles[id] end
-- Название — обычный текст; штатная подпись перекрёстной ссылки хранится отдельно.
-- Для ненумерованных целей M.title предоставляет название вместо номера.
function M.heading_title(id) return heading_titles[id] end
return M
