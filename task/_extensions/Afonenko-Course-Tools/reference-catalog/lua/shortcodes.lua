local __metrics=require("../observability/bridge").create_metrics("reference-catalog",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="reference-catalog.lua.shortcodes.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local diagnostics = require("./diagnostics")
local links = require("./links")
return __perfFilters({xref = function(args, kwargs)
  assert(#args >= 2 and #args <= 3, diagnostics.message("QRC.REFERENCE_INVALID", "xref принимает пространство имён, ID цели и необязательный текст", nil, "xref"))
  local style = links.text(kwargs.style)
  return links.link(links.text(args[1]), links.text(args[2]),
    style == "" and "default" or style, links.text(args[3]))
end})
