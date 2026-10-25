local __metrics=require("./observability/bridge").create_metrics("course-presentation",1)
local __perfWalk1=__metrics.wrap_walk({id="course-presentation.filter.walk.1",kind='ast_walk',scope="unknown"},function(node,filter)return node:walk(filter)end)
local __perfWalk2=__metrics.wrap_walk({id="course-presentation.filter.walk.2",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then local spec={id="course-presentation.filter.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'}
   if os.getenv('COURSE_PERF_MODE') and os.getenv('COURSE_PERF_MODE')~='off' then
    filters[key]=function(...)
     spec.document_id=quarto and quarto.doc and quarto.doc.input_file or nil
     return __metrics.wrap_sync(spec,value)(...)
    end
   else filters[key]=__metrics.wrap_sync(spec,value) end
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
-- Фильтр выполняется после course-core на этапе pre-ast. Ядро отбирает данные
-- по профилю и проверяет их смысл; этот модуль оформляет их в штатных форматах.
local config = require("./modules/config")
local metadata = require("./modules/metadata")
local answers = require("./modules/answers")

local function transform(blocks, owner, cfg)
  return __perfWalk1(blocks,{traverse = "topdown", Div = function(div)
    local current = div.identifier:match("^exr%-") and div.identifier or owner
    local related=owner or cfg.solutionOwners[div.identifier]
    local kind = answers.kind(div, related)
    div.content = transform(div.content, current, cfg)
    div = metadata.decorate(div, cfg)
    return answers.wrap(div, kind, cfg), false
  end})
end

return __perfFilters({{Pandoc = function(doc)
  assert(not doc.meta.course or doc.meta["course-core-processed"] == true,
    "PRESENTATION.FILTER_ORDER_INVALID: Фильтр course-core должен предшествовать course-presentation при наличии метаданных course; источник="..quarto.doc.input_file.."; поле=filters")
  local cfg = config.read(doc.meta)
  local identities={}
  __perfWalk2(doc,{Div=function(div) identities[div.identifier]=true end})
  cfg.solutionOwners={}
  for id,_ in pairs(identities) do
    if id:match("^sol%-") then
      local suffix=id:sub(5)
      local exercise,example=identities["exr-"..suffix],identities["exm-"..suffix]
      if exercise and not example then cfg.solutionOwners[id]="exr-"..suffix end
      if example and not exercise and not cfg.bank then cfg.solutionOwners[id]="exm-"..suffix end
    end
  end
  doc.blocks = transform(doc.blocks, nil, cfg)
  if cfg.html then
    -- Public producer declaration; these exact attribs witness current native tags.
    local descriptor=assert(io.open(quarto.utils.resolve_path("html-dependency.json"),'r'))
    local dependency=quarto.json.decode(descriptor:read('*a'));descriptor:close()
    quarto.doc.add_html_dependency(dependency)
  end
  return doc
end}})
