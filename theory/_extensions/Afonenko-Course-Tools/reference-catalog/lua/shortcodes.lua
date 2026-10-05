local links = require("./links")
return {xref = function(args, kwargs)
  assert(#args >= 2 and #args <= 3, "xref принимает пространство имён, ID цели и необязательный текст")
  local style = links.text(kwargs.style)
  return links.link(links.text(args[1]), links.text(args[2]),
    style == "" and "default" or style, links.text(args[3]))
end}
