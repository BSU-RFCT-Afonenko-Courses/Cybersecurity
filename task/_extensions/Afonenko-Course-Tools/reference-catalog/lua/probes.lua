local __metrics=require("../observability/bridge").create_metrics("reference-catalog",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then
   filters[key]=function(...)
    local input=quarto and quarto.doc and quarto.doc.input_file
    return __metrics.wrap_sync({id="reference-catalog.lua.probes.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function',document_id=type(input)=='string' and input~='' and input or nil},value)(...)
   end
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local diagnostics = require("./diagnostics")
local attributes = require("./attributes")
local targets = require("./targets")
local constants = require("./constants")
local function finish(doc)
  if not quarto.doc.is_format("html") then return doc end
  local config = doc.meta["reference-catalog"]
  local ns = os.getenv("QRC_NAMESPACE") or (config and pandoc.utils.stringify(config.namespace))
  assert(ns and ns ~= "", diagnostics.message("QRC.CONFIG_INVALID", "задайте reference-catalog.namespace в конфигурации native проекта", nil, "reference-catalog.namespace"))
  local rows = pandoc.Blocks({})
  for _, id in ipairs(targets.sorted()) do
    for _, style in ipairs(constants.probe_styles) do
      local mode = style == "number" and "SuppressAuthor" or "NormalCitation"
      local ref = pandoc.Cite({pandoc.Str("@" .. id)}, {pandoc.Citation(id, mode)})
      if targets.title(id) then
        ref = style == "number" and pandoc.Span({}, pandoc.Attr("", {"qrc-unavailable"}))
          or pandoc.Link(targets.title(id), "#" .. id, "", pandoc.Attr("", {"qrc-anchor"}))
      end
      local attrs = {["data-qrc-id"]=id, ["data-qrc-style"]=style}
      local title = targets.heading_title(id)
      if style == "default" and title and title ~= "" then attrs["data-qrc-title"] = title end
      rows:insert(pandoc.Div({pandoc.Para({ref})}, pandoc.Attr("", {"qrc-probe"}, attributes.sorted(attrs))))
    end
  end
  doc.blocks:insert(pandoc.Div(rows, pandoc.Attr("", {"qrc-probes"},
    attributes.sorted({["hidden"]="", ["aria-hidden"]="true", ["data-qrc-namespace"]=ns,
     ["data-qrc-source"]=quarto.doc.input_file}))))
  return doc
end
return __perfFilters({
  {Meta=targets.init},
  {Header=targets.capture, Div=targets.capture, Span=targets.capture,
   Figure=targets.capture, Table=targets.capture, Image=targets.capture,
   CodeBlock=targets.capture, FloatRefTarget=targets.capture,
   Callout=targets.capture, Theorem=targets.capture, Proof=targets.capture,
   Para=targets.equations, Plain=targets.equations},
  {Pandoc=finish}
})
