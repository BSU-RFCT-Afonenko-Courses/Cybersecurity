local function fail(message, id, field)
  local context = "\nфайл: " .. tostring(quarto.doc.input_file or "")
  if id then context = context .. ", ID: " .. id end
  if field then context = context .. ", поле: " .. field end
  assert(false, "DOWNLOAD.REQUEST_INVALID: " .. message .. context)
end
return {
  ["project-download"] = function(args, kwargs)
    if #args ~= 1 then fail("project-download принимает один идентификатор ресурса", nil, "resource") end
    local id = pandoc.utils.stringify(args[1])
    if not id:match("^[a-z0-9][a-z0-9%-]*$") then fail("Недопустимый идентификатор ресурса project-download", id, "resource") end
    for key, _ in pairs(kwargs) do if key ~= "text" then fail("Неизвестный параметр project-download: " .. key, id, key) end end
    local text = kwargs.text and pandoc.utils.stringify(kwargs.text) or "Скачать материалы"
    return pandoc.Span({pandoc.Str(text)}, pandoc.Attr("", {"project-download-request"}, {resource = id}))
  end
}
