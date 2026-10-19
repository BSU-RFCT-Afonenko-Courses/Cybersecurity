local __metrics=require("../observability/bridge").create_metrics("reference-catalog",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="reference-catalog.lua.requests.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local diagnostics = require("./diagnostics")
local links = require("./links")
return __perfFilters({{Meta = function(meta)
  -- Конфигурацию сборки обрабатывают проектные скрипты; она не задаёт ресурсы документа.
  local config = meta["reference-catalog"]
  if config then meta["reference-catalog"] = {namespace=config.namespace} end
  return meta
end}, {Cite = function(el)
  local refs = {}
  for _, c in ipairs(el.citations) do
    local ns, id = c.id:match("^([%a][%w_-]*):([%a][^:]*%-[^:]+)$")
    if ns then refs[#refs + 1] = {ns=ns, id=id, cite=c} end
  end
  if #refs == 0 then return nil end
  assert(#refs == #el.citations, diagnostics.message("QRC.REFERENCE_INVALID", "библиографические ссылки и ссылки каталога следует записывать отдельно", nil, "citations"))
  local out = pandoc.Inlines({})
  for i, r in ipairs(refs) do
    if i > 1 then out:insert(pandoc.Str(";")); out:insert(pandoc.Space()) end
    out:extend(r.cite.prefix)
    if #r.cite.prefix > 0 then out:insert(pandoc.Space()) end
    out:insert(links.link(r.ns, r.id,
      r.cite.mode == "SuppressAuthor" and "number" or "default", ""))
    if #r.cite.suffix > 0 then out:insert(pandoc.Space()); out:extend(r.cite.suffix) end
  end
  return out
end}})
