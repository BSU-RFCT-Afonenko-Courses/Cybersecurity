return {
  ["project-download"] = function(args, kwargs)
    assert(#args == 1, "project-download принимает один идентификатор ресурса")
    local id = pandoc.utils.stringify(args[1])
    assert(id:match("^[a-z0-9][a-z0-9%-]*$"), "Недопустимый идентификатор ресурса project-download")
    for key, _ in pairs(kwargs) do assert(key == "text", "Неизвестный параметр project-download: " .. key) end
    local text = kwargs.text and pandoc.utils.stringify(kwargs.text) or "Скачать материалы"
    return pandoc.Span({pandoc.Str(text)}, pandoc.Attr("", {"project-download-request"}, {resource = id}))
  end
}
