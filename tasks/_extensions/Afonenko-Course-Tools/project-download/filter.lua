return {{Pandoc = function(doc)
  local root = assert(quarto.project.directory, "project-download требует проект Quarto")
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  local source = pandoc.path.make_relative(input, root)
  local requests, seen = pandoc.List(), {}
  local config = doc.meta["project-download"]
  local _, depth = source:gsub("[/\\]", "")
  doc = doc:walk({Span = function(span)
    if not span.classes:includes("project-download-request") then return end
    local id = span.attributes.resource
    assert(config, "Для project-download требуется явная конфигурация ресурсов")
    local declared = config.resources and config.resources[id]
    assert(declared or (config["course-model"] == true and id:match("^exr%-")), "Не объявлен ресурс project-download: " .. id)
    if not seen[id] then requests:insert(id); seen[id] = true end
    return pandoc.Link(span.content, string.rep("../", depth) .. "_downloads/" .. id .. ".zip", "", pandoc.Attr("", {"project-download"}, {download = ""}))
  end})
  local directory = root .. "/_generated/project-download/requests"
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(directory .. "/" .. pandoc.utils.sha1(source) .. ".json", "w"))
  file:write(pandoc.json.encode({source=source, resources=requests})); file:close()
  return doc
end}}
