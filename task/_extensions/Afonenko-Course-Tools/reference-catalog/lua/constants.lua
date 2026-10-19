local __metrics=require("../observability/bridge").create_metrics("reference-catalog",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="reference-catalog.lua.constants.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
-- Словарь публичных элементов разметки Quarto и представлений ссылок.
return __perfFilters({
  target_types = {"fig", "tbl", "lst", "eq", "sec", "thm", "lem", "cor", "prp", "cnj", "def", "exm", "exr", "sol", "rem", "alg", "nte", "tip", "wrn", "imp", "cau"},
  probe_styles = {"default", "number"},
  reference_styles = require("./generated/reference-styles"),
})
