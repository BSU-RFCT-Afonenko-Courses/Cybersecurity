local diagnostics = require("./diagnostics")
local links = require("./links")
return {xref = function(args, kwargs)
  assert(#args >= 2 and #args <= 3, diagnostics.message("QRC.REFERENCE_INVALID", "xref принимает пространство имён, ID цели и необязательный текст", nil, "xref"))
  local style = links.text(kwargs.style)
  return links.link(links.text(args[1]), links.text(args[2]),
    style == "" and "default" or style, links.text(args[3]))
end}
