local __metrics=require("./observability/bridge").create_metrics("project-download",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="project-download.shortcodes.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local function fail(message, id, field)
  local context = "\nфайл: " .. tostring(quarto.doc.input_file or "")
  if id then context = context .. ", ID: " .. id end
  if field then context = context .. ", поле: " .. field end
  assert(false, "DOWNLOAD.REQUEST_INVALID: " .. message .. context)
end
return __perfFilters({
  ["project-download"] = function(args, kwargs)
    if #args ~= 1 then fail("project-download принимает один идентификатор ресурса", nil, "resource") end
    local id = pandoc.utils.stringify(args[1])
    if not id:match("^[a-z0-9][a-z0-9%-]*$") then fail("Недопустимый идентификатор ресурса project-download", id, "resource") end
    local hasKind = false
    for key, _ in pairs(kwargs) do
      if key == "kind" then hasKind = true end
      if key ~= "text" and key ~= "kind" then fail("Неизвестный параметр project-download: " .. key, id, key) end
    end
    local text = kwargs.text and pandoc.utils.stringify(kwargs.text) or ""
    local attributes = {resource = id}
    if hasKind then
      attributes.kind = pandoc.utils.stringify(kwargs.kind)
      if attributes.kind ~= "starter" and attributes.kind ~= "full" and attributes.kind ~= "conditions" then fail("Неизвестный вид комплекта", id, "kind") end
    end
    return pandoc.Span({pandoc.Str(text)}, pandoc.Attr("", {"project-download-request"}, attributes))
  end
})
