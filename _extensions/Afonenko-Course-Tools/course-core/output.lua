local diagnostics = require("./diagnostics")
local M = {}
local function comparison(path)
  if pandoc.system.os=="mingw32" and type(path)=="string" then return path:gsub("\\","/") end
  return path
end
local function source(root)
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  return pandoc.path.make_relative(input, root)
end
local function result_path(root,view,source)
  local directory = root .. "/_generated/course-spec/documents/" .. view
  return directory,directory .. "/" .. pandoc.utils.sha1(source.."\0"..FORMAT) .. ".json"
end
function M.invalidate(doc)
  local root = assert(quarto.project.directory, "Требуется проект Quarto")
  os.remove(root .. "/_generated/course-spec/course.json")
  os.remove(root .. "/_generated/course-spec/native-run.json")
  local raw = doc.meta.course.view
  local view = raw and pandoc.utils.stringify(raw) or "default"
  -- Metadata validation follows invalidation: never turn an unchecked view
  -- into a filesystem path. Other audiences/formats remain available locally.
  if view=="student" or view=="full" or view=="default" then
    local _,path=result_path(root,view,source(root))
    os.remove(path)
  end
end
function M.current_run(root)
  local run
  local pointer=io.open(root .. "/_generated/course-spec/active-native-run.json","r")
  if pointer then
    run=pandoc.json.decode(pointer:read("*a"));pointer:close()
    assert(run.schema=="course-native-run-pointer-v1" and comparison(run.projectRoot)==comparison(root), diagnostics.format("NATIVE.RUN_POINTER_INVALID", "Указатель текущей сборки не соответствует проекту", {field="native-run"}))
    local prefix=root.."/_generated/course-spec/native-runs/"
    local directory=comparison(run.directory);prefix=comparison(prefix)
    assert(type(directory)=="string" and directory:sub(1,#prefix)==prefix and directory:sub(#prefix+1):match('^[%w%-]+$'), diagnostics.format("NATIVE.RUN_DIRECTORY_INVALID", "Каталог запуска должен принадлежать служебной области проекта", {field="native-run"}))
    local completed=io.open(run.directory.."/native-run.json","r")
    if completed then completed:close();return nil end
    -- An aborted run must not authorize late projection after native hooks
    -- were removed/changed. These are byte witnesses, not a YAML parser.
    if type(run.profiles)~='table' or type(run.configurationHashes)~='table' then return nil end
    local active=quarto.project.profile or {}
    if #active~=#run.profiles then return nil end
    for index,profile in ipairs(active) do if profile~=run.profiles[index] then return nil end end
    local names={'_quarto.yml','_quarto.yaml'}
    for _,profile in ipairs(run.profiles) do
      if type(profile)~='string' or profile:find('[\\/]') then return nil end
      names[#names+1]='_quarto-'..profile..'.yml';names[#names+1]='_quarto-'..profile..'.yaml'
    end
    local seen={}
    for _,name in ipairs(names) do
      seen[name]=true
      local file=io.open(root..'/'..name,'rb')
      local hash=false
      if file then hash=pandoc.utils.sha1(file:read('*a'));file:close() end
      if run.configurationHashes[name]~=hash then return nil end
    end
    for name,_ in pairs(run.configurationHashes) do if not seen[name] then return nil end end
  end
  return run
end
function M.write(value)
  local root = assert(quarto.project.directory, "Требуется проект Quarto")
  value.source = source(root)
  value.scope = "document"
  local profiles = pandoc.List()
  for _,profile in ipairs(quarto.project.profile or {}) do profiles:insert(profile) end
  local output = quarto.doc.output_file
  if not pandoc.path.is_relative(output) then
    output = pandoc.path.make_relative(output,quarto.project.output_directory or root)
  end
  value.document = {source=value.source,format=FORMAT,output=output,profiles=profiles,exportContext=value.exportContext}
  value.exportContext=nil
  local view = value.course.view or "default"
  local run=M.current_run(root)
  local resourceDirectory=run and run.directory.."/resources" or root.."/_generated/course-spec/document-resources/"..view.."/"..pandoc.utils.sha1(value.source.."\0"..FORMAT)
  for _,resource in ipairs(value.resources and value.resources.capturedFiles or {}) do
    if resource._bytes then
      pandoc.system.make_directory(resourceDirectory,true)
      resource.capture=resourceDirectory.."/"..pandoc.utils.sha1(resource.source).."-"..resource.sha1..".bin"
      local file=assert(io.open(resource.capture,"wb"));assert(file:write(resource._bytes));file:close()
      resource._bytes=nil
    end
  end
  local directory,path=result_path(root,view,value.source)
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(path, "w"))
  local encoded=pandoc.json.encode(value)
  file:write(encoded); file:close()
  if run then
    local current=assert(io.open(run.directory.."/documents/"..pandoc.utils.sha1(value.source.."\0"..FORMAT)..".json","w"))
    current:write(encoded);current:close()
  end
end
return M
