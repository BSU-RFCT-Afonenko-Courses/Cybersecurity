local __metrics=require("./observability/bridge").create_metrics("course-core",1)

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
-- Только закрытая форма refs; полную capability проверяет штатный TS-мост.
local function exact_keys(value, names)
  if type(value)~='table' then return false end
  local expected={}
  for _,name in ipairs(names) do expected[name]=true;if value[name]==nil then return false end end
  for name,_ in pairs(value) do if not expected[name] then return false end end
  return true
end
local function hex(value, size)
  return type(value)=='string' and #value==size and value:match('^[0-9a-f]+$')~=nil
end
local function overlay_ref(value)
  return exact_keys(value,{'kind','sourceContext'}) and value.kind=='owned-config-overlay-v1' and exact_keys(value.sourceContext,{'sha1','sha256'}) and hex(value.sourceContext.sha1,40) and hex(value.sourceContext.sha256,64)
end
local function file_ref(value, name)
  return exact_keys(value,{'file','sha1','sha256'}) and value.file==name and hex(value.sha1,40) and hex(value.sha256,64)
end
local function string_array(value, nonempty)
  if type(value)~='table' or (nonempty and #value==0) then return false end
  for key,item in pairs(value) do if type(key)~='number' or key%1~=0 or key<1 or key>#value or type(item)~='string' then return false end end
  return true
end
local function overlay_pointer(run)
  local allowed={schema=true,directory=true,projectRoot=true,profiles=true,outputDirectory=true,initialInputFiles=true,renderAll=true,configurationHashes=true,commonPathBinding=true,commonPathDocuments=true,ownedConfigOverlay=true,overlayState=true,ownedConfigRestoration=true}
  for key,_ in pairs(run) do if not allowed[key] then return false end end
  for _,key in ipairs({'schema','directory','projectRoot','profiles','outputDirectory','renderAll','configurationHashes','commonPathBinding','ownedConfigOverlay','overlayState'}) do if run[key]==nil then return false end end
  return overlay_ref(run.ownedConfigOverlay) and (run.overlayState=='active' or run.overlayState=='restored') and string_array(run.profiles,true) and #run.profiles==1 and type(run.outputDirectory)=='string' and type(run.renderAll)=='boolean' and type(run.configurationHashes)=='table' and (run.initialInputFiles==nil or string_array(run.initialInputFiles,false)) and file_ref(run.commonPathBinding,'common-files-path-binding.json')
end
function M.current_run(root)
  local run
  local pointer=io.open(root .. "/_generated/course-spec/active-native-run.json","r")
  if pointer then
    run=pandoc.json.decode(pointer:read("*a"));pointer:close()
    assert((run.schema=="course-native-run-pointer-v2" or run.schema=="course-native-run-pointer-v3") and comparison(run.projectRoot)==comparison(root), diagnostics.format("NATIVE.RUN_POINTER_INVALID", "Указатель текущей сборки не соответствует проекту", {field="native-run"}))
    if run.schema=='course-native-run-pointer-v3' then
      assert(overlay_pointer(run),diagnostics.format('NATIVE.RUN_POINTER_INVALID','Некорректный closed overlay pointer',{field='native-run'}))
    end
    local prefix=root.."/_generated/course-spec/native-runs/"
    local directory=comparison(run.directory);prefix=comparison(prefix)
    assert(type(directory)=="string" and directory:sub(1,#prefix)==prefix and directory:sub(#prefix+1):match('^[%w%-]+$'), diagnostics.format("NATIVE.RUN_DIRECTORY_INVALID", "Каталог запуска должен принадлежать служебной области проекта", {field="native-run"}))
    if run.schema=='course-native-run-pointer-v3' then
      if run.overlayState=='restored' then
        assert(file_ref(run.ownedConfigRestoration,'owned-export-restored-entry.json'),diagnostics.format('NATIVE.RUN_POINTER_INVALID','Нет exact restored ref',{field='native-run'}))
        -- Завершённый restored run не разрешает новую запись. Обе completed
        -- copies, record и currentness независимо связывает TS reader.
        return nil
      end
      assert(run.ownedConfigRestoration==nil,diagnostics.format('NATIVE.RUN_POINTER_INVALID','Active restoration ref запрещён',{field='native-run'}))
      for _,name in ipairs(pandoc.system.list_directory(run.directory)) do
        assert(name~='owned-export-restored-entry.json' and name~='native-run.json',diagnostics.format('NATIVE.RUN_POINTER_INVALID','Active run содержит final slot',{field='native-run'}))
      end
    end
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
-- Каноническую declaration разрешает только совпавшая stock effective metadata.
local module_file=debug.getinfo(1,'S').source:sub(2)
local function plain(value)
  if type(value)~='table' then return value end
  local kind=pandoc.utils.type(value)
  if kind=='Inlines' or kind=='MetaInlines' or kind=='Blocks' or kind=='MetaBlocks' then return pandoc.utils.stringify(value) end
  local result={}
  for key,item in pairs(value) do result[key]=plain(item) end
  return result
end
local function same(a,b)
  if type(a)~=type(b) then return false end
  if type(a)~='table' then return a==b end
  for k,v in pairs(a) do if not same(v,b[k]) then return false end end
  for k,_ in pairs(b) do if a[k]==nil then return false end end
  return true
end
function M.bound_materialization(doc)
  local root=assert(quarto.project.directory,'Требуется native owner')
  local run=M.current_run(root)
  if not run then
    assert(doc.meta['project-materialization']==nil,diagnostics.format('NATIVE.COMMON_PATH_BINDING_INVALID','Common capture требует текущий private witness',{field='project-materialization'}))
    return nil
  end
  local ref=run.commonPathBinding
  assert(type(ref)=='table' and ref.file=='common-files-path-binding.json' and type(ref.sha1)=='string' and type(ref.sha256)=='string',diagnostics.format('NATIVE.COMMON_PATH_BINDING_INVALID','Отсутствует witness ref',{field='native-run'}))
  if run.commonPathDocuments==nil then
  local file=assert(io.open(run.directory..'/'..ref.file,'rb'))
  local bytes=file:read('*a');file:close()
  assert(pandoc.utils.sha1(bytes)==ref.sha1,diagnostics.format('NATIVE.COMMON_PATH_BINDING_INVALID','Witness SHA1 изменён',{field='native-run'}))
  if run.schema=='course-native-run-pointer-v3' then
    local witness=pandoc.json.decode(bytes)
    assert(witness.schema=='course-common-files-path-binding-v2' and overlay_ref(witness.ownedConfigOverlay) and same(witness.ownedConfigOverlay,run.ownedConfigOverlay) and string_array(witness.sourceInspectionRefs,true) and witness.overlayState==nil and witness.ownedConfigRestoration==nil,diagnostics.format('NATIVE.COMMON_PATH_BINDING_INVALID','Нет согласованного overlay witness',{field='native-run'}))
    local context=assert(io.open(run.directory..'/owned-export-source-context.json','rb'))
    local contextBytes=context:read('*a');context:close()
    assert(pandoc.utils.sha1(contextBytes)==run.ownedConfigOverlay.sourceContext.sha1,diagnostics.format('NATIVE.COMMON_PATH_BINDING_INVALID','Source-context SHA1 изменён',{field='native-run'}))
  end
  end
  -- Штатный Quarto/Deno проверяет regular files, symlinks компонентов,
  -- SHA256 и source/config/common hashes, без платформенного readlink.
  local entry=pandoc.path.join({pandoc.path.directory(module_file),'entrypoints/common-path-binding.ts'})
  local args={'run',entry,'--','--root',root,'--source',source(root),'--format',FORMAT}
  if run.schema=='course-native-run-pointer-v3' then
    local writer=PANDOC_STATE.output_file
    assert(type(writer)=='string' and writer~='' and writer~='-',diagnostics.format('NATIVE.RUN_POINTER_INVALID','Нет native writer destination',{field='native-run'}))
    if pandoc.path.is_relative(writer) then writer=pandoc.path.join({pandoc.system.get_working_directory(),writer}) end
    args[#args+1]='--native-output';args[#args+1]=pandoc.path.normalize(writer)
    args[#args+1]='--document-output';args[#args+1]=quarto.doc.output_file
  end
  local raw=pandoc.pipe(os.getenv('QUARTO') or 'quarto',args,'')
  local proof=pandoc.json.decode(raw)
  if proof.effectiveDeclarations==pandoc.json.null then proof.effectiveDeclarations=nil end
  if proof.canonicalDeclarations==pandoc.json.null then proof.canonicalDeclarations=nil end
  assert(proof.source==source(root) and proof.format==FORMAT and same(plain(doc.meta['project-materialization']),proof.effectiveDeclarations),diagnostics.format('NATIVE.COMMON_PATH_BINDING_INVALID','Effective materialization не совпадает с current witness',{field='project-materialization'}))
  return require('./projects').materialization({['project-materialization']=proof.canonicalDeclarations})
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
M.invalidate=__metrics.wrap_sync({id="course-core.output.invalidate",kind='phase'},M.invalidate)
M.current_run=__metrics.wrap_sync({id="course-core.output.current_run",kind='phase'},M.current_run)
M.write=__metrics.wrap_sync({id="course-core.output.write",kind='phase'},M.write)
return M
