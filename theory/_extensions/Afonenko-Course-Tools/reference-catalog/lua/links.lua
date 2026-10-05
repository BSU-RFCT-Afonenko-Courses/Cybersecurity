local M = {}
local constants = require("./constants")
local function text(v) return v and pandoc.utils.stringify(v) or "" end
function M.link(namespace, id, style, label)
  assert(quarto.doc.is_format("html"), "QRC поддерживает публикацию в HTML и Revealjs")
  assert(namespace:match("^[%a][%w_-]*$"), "QRC некорректное пространство имён: " .. namespace)
  assert(id ~= "" and not id:match("[%s:#]"), "QRC некорректный ID цели: " .. id)
  assert(constants.reference_styles[style],
    "QRC некорректный стиль ссылки: " .. style)
  local attrs = { ["data-qrc-ref"] = namespace .. ":" .. id,
    ["data-qrc-style"] = style, ["data-qrc-custom"] = label ~= "" and "true" or "false" }
  return pandoc.Link({pandoc.Str(label ~= "" and label or namespace .. ":" .. id)},
    "#qrc-unresolved", "", pandoc.Attr("", {"qrc-link"}, attrs))
end
M.text = text
return M
