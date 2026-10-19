local __metrics=require("./observability/bridge").create_metrics("project-download",1)
local __perfWalk1=__metrics.wrap_walk({id="project-download.filter.walk.1",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk2=__metrics.wrap_walk({id="project-download.filter.walk.2",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="project-download.filter.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local function fail(code, message, id, field)
  local context = "\nфайл: " .. tostring(quarto.doc.input_file or "")
  if id then context = context .. ", ID: " .. id end
  if field then context = context .. ", поле: " .. field end
  assert(false, code .. ": " .. message .. context)
end
return __perfFilters({{Pandoc = function(doc)
  local root = quarto.project.directory
  if not root then fail("DOWNLOAD.CONFIG_INVALID", "project-download требует проект Quarto", nil, "project") end
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  local source = pandoc.path.make_relative(input, root)
  local requests, artifacts, seen = pandoc.List(), pandoc.List(), {}
  local config = doc.meta["project-download"]
  local _, depth = source:gsub("[/\\]", "")
  local exercises = {}
  __perfWalk1(doc,{Div = function(div)
    if div.identifier:match("^exr%-") then exercises[div.identifier] = div.attributes end
  end})
  local view = doc.meta.course and doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or "student"
  local captions = {starter="Скачать заготовку", full="Скачать полный проект", conditions="Скачать условие"}
  doc = __perfWalk2(doc,{Span = function(span)
    if not span.classes:includes("project-download-request") then return end
    local id = span.attributes.resource
    if not config then fail("DOWNLOAD.CONFIG_INVALID", "Для project-download требуется явная конфигурация ресурсов", id, "project-download") end
    local declared = config.resources and config.resources[id]
    local context = doc.meta["course-artifact-context"] and doc.meta["course-artifact-context"][id]
    local model = config["course-model"] == true and id:match("^exr%-") and (context or exercises[id])
    if not (declared or (config["course-model"] == true and id:match("^exr%-"))) then fail("DOWNLOAD.RESOURCE_UNAVAILABLE", "Не объявлен ресурс project-download: " .. id, id, "resources") end
    local kind, name
    if declared and not model then
      if span.attributes.kind then fail("DOWNLOAD.REQUEST_INVALID", "kind доступен только модельному упражнению", id, "kind") end
      name = id
    else
      local exercise = exercises[id]
      if context then
        exercise = {["course-role"]=(context.purpose and pandoc.utils.stringify(context.purpose) or ""), ["statement-visibility"]=(context.statementVisibility and pandoc.utils.stringify(context.statementVisibility) or "")}
      end
      if not exercise then fail("DOWNLOAD.RESOURCE_UNAVAILABLE", "Нет видимого упражнения в текущем документе", id, "exerciseId") end
      kind = span.attributes.kind
      if not kind then
        local demo = exercise["course-role"] == "demonstration" and exercise["statement-visibility"] == "open"
        kind = (view == "full" or demo) and "full" or "starter"
      end
      name = id .. "-" .. kind
    end
    local identity = kind and ("artifact:" .. id .. ":" .. kind) or ("resource:" .. id)
    if not seen[identity] then
      if kind then artifacts:insert({exerciseId=id,kind=kind}) else requests:insert(id) end
      seen[identity] = true
    end
    local content = span.content
    if pandoc.utils.stringify(content):match("^%s*$") then content = {pandoc.Str(kind and captions[kind] or "Скачать материалы")} end
    return pandoc.Link(content, string.rep("../", depth) .. "_downloads/" .. name .. ".zip", "", pandoc.Attr("", {"project-download"}, {download = ""}))
  end})
  local directory = root .. "/_generated/project-download/requests"
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(directory .. "/" .. pandoc.utils.sha1(source) .. ".json", "w"))
  local request = {source=source, resources=requests}
  if #artifacts > 0 then request.artifacts = artifacts end
  if doc.meta["course-core-processed"] == true then request.courseProcessed = true end
  file:write(pandoc.json.encode(request)); file:close()
  return doc
end}})
