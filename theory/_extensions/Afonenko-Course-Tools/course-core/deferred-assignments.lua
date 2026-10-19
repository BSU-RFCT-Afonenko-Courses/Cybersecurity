local __metrics=require("./observability/bridge").create_metrics("course-core",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="course-core.deferred-assignments.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local visibility = require("./visibility")
return __perfFilters({{Pandoc = visibility.defer_native_assignments}})
