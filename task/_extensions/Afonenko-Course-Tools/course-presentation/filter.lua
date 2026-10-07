-- Фильтр выполняется после course-core на этапе pre-ast. Ядро отбирает данные
-- по профилю и проверяет их смысл; этот модуль оформляет их в штатных форматах.
local config = require("./modules/config")
local metadata = require("./modules/metadata")
local answers = require("./modules/answers")

local function transform(blocks, owner, cfg)
  return blocks:walk({traverse = "topdown", Div = function(div)
    local current = div.identifier:match("^exr%-") and div.identifier or owner
    local kind = answers.kind(div, owner)
    div.content = transform(div.content, current, cfg)
    div = metadata.decorate(div, cfg)
    return answers.wrap(div, kind, cfg), false
  end})
end

return {{Pandoc = function(doc)
  assert(not doc.meta.course or doc.meta["course-core-processed"] == true,
    "PRESENTATION.FILTER_ORDER_INVALID: Фильтр course-core должен предшествовать course-presentation при наличии метаданных course; источник="..quarto.doc.input_file.."; поле=filters")
  local cfg = config.read(doc.meta)
  doc.blocks = transform(doc.blocks, nil, cfg)
  if cfg.html then
    -- Public producer declaration; these exact attribs witness current native tags.
    local descriptor=assert(io.open(quarto.utils.resolve_path("html-dependency.json"),'r'))
    local dependency=quarto.json.decode(descriptor:read('*a'));descriptor:close()
    quarto.doc.add_html_dependency(dependency)
  end
  return doc
end}}
