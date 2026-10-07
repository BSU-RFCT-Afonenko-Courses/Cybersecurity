local function fail(code, message, id, field)
  local context = "\nфайл: " .. tostring(quarto.doc.input_file or "")
  if id then context = context .. ", ID: " .. id end
  if field then context = context .. ", поле: " .. field end
  assert(false, code .. ": " .. message .. context)
end
return {{Pandoc = function(doc)
  local root = quarto.project.directory
  if not root then fail("DOWNLOAD.CONFIG_INVALID", "project-download требует проект Quarto", nil, "project") end
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  local source = pandoc.path.make_relative(input, root)
  local requests, seen = pandoc.List(), {}
  local config = doc.meta["project-download"]
  local _, depth = source:gsub("[/\\]", "")
  doc = doc:walk({Span = function(span)
    if not span.classes:includes("project-download-request") then return end
    local id = span.attributes.resource
    if not config then fail("DOWNLOAD.CONFIG_INVALID", "Для project-download требуется явная конфигурация ресурсов", id, "project-download") end
    local declared = config.resources and config.resources[id]
    if not (declared or (config["course-model"] == true and id:match("^exr%-"))) then fail("DOWNLOAD.RESOURCE_UNAVAILABLE", "Не объявлен ресурс project-download: " .. id, id, "resources") end
    if not seen[id] then requests:insert(id); seen[id] = true end
    return pandoc.Link(span.content, string.rep("../", depth) .. "_downloads/" .. id .. ".zip", "", pandoc.Attr("", {"project-download"}, {download = ""}))
  end})
  local directory = root .. "/_generated/project-download/requests"
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(directory .. "/" .. pandoc.utils.sha1(source) .. ".json", "w"))
  local request = {source=source, resources=requests}
  if doc.meta["course-core-processed"] == true then request.courseProcessed = true end
  file:write(pandoc.json.encode(request)); file:close()
  return doc
end}}
