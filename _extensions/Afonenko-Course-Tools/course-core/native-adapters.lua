local diagnostics = require("./diagnostics")
local M={}
local resolved={}
function M.validate(doc,facts)
  resolved={}
  local selected=doc.meta.course.adapters or {}
  if #selected==0 then return end
  local root=quarto.project.directory
  local installed=root..'/_extensions'
  local packages={}
  local function contract(path)
    local f=io.open(path..'/contract.json','r')
    if f then local ok,value=pcall(pandoc.json.decode,f:read('*a'));f:close();if ok then packages[#packages+1]={path=path,contract=value} end;return true end
  end
  local function directories(path)
    local ok,names=pcall(pandoc.system.list_directory,path)
    return ok and names or {}
  end
  for _,name in ipairs(directories(installed)) do
    local path=pandoc.path.join({installed,name})
    if not contract(path) then
      for _,nested in ipairs(directories(path)) do contract(pandoc.path.join({path,nested})) end
    end
  end
  for _,raw in ipairs(selected) do
    local name=pandoc.utils.stringify(raw)
    local matches={};for _,p in ipairs(packages) do if p.contract.name==name then matches[#matches+1]=p end end
    assert(#matches==1, diagnostics.format("CORE.ADAPTER_INVALID", 'Требуется ровно один установленный пакет адаптера: '..name, {id=name,field="course.adapters"}))
    resolved[#resolved+1]=matches[1].path
    local file=matches[1].path..'/validate.lua'
    local validator=assert(loadfile(file))()
    if require("./pedagogy/contract").bank(doc.meta) or doc.meta.assessment then validator.validate(doc,facts) end
  end
end
function M.read(doc,facts)
  for _,path in ipairs(resolved) do
    local file=io.open(path..'/native.lua','r')
    if file then
      file:close()
      local native=assert(loadfile(path..'/native.lua'))()
      if native.read and native.write then native.write(doc,native.read(doc,facts)) end
    end
  end
  doc.meta['course-adapters-read']=true
end
return M
