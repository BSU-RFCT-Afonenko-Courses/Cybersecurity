local __metrics=require("../observability/bridge").create_metrics("reference-catalog",1)

local M = {}
local diagnostics = require("./diagnostics")
local attributes = require("./attributes")
local constants = require("./constants")
local function text(v) return v and pandoc.utils.stringify(v) or "" end
function M.link(namespace, id, style, label)
  assert(namespace:match("^[%a][%w_-]*$"), diagnostics.message("QRC.REFERENCE_INVALID", "некорректное пространство имён: " .. namespace, namespace .. ":" .. id, "namespace"))
  assert(id ~= "" and not id:match("[%s:#]"), diagnostics.message("QRC.REFERENCE_INVALID", "некорректный ID цели: " .. id, namespace .. ":" .. id, "id"))
  assert(constants.reference_styles[style],
    diagnostics.message("QRC.REFERENCE_INVALID", "некорректный стиль ссылки: " .. style, namespace .. ":" .. id, "style"))
  local attrs = { ["data-qrc-ref"] = namespace .. ":" .. id,
    ["data-qrc-style"] = style, ["data-qrc-custom"] = label ~= "" and "true" or "false" }
  local content = {pandoc.Str(label ~= "" and label or namespace .. ":" .. id)}
  -- Full source export captures references before assignment selection. A neutral
  -- native marker carries identity; the selected-body producer resolves or rejects it.
  if quarto.metadata.get("course-export-context") == true then
    return pandoc.Span(content, pandoc.Attr("", {"qrc-reference"}, attributes.sorted(attrs)))
  end
  assert(quarto.doc.is_format("html"), diagnostics.message("QRC.REFERENCE_INVALID", "QRC поддерживает публикацию в HTML и Revealjs", namespace .. ":" .. id, "format"))
  return pandoc.Link(content,
    "#qrc-unresolved", "", pandoc.Attr("", {"qrc-link"}, attributes.sorted(attrs)))
end
M.text = text
M.link=__metrics.wrap_sync({id="reference-catalog.lua.links.link",kind='phase'},M.link)
return M
