local diagnostics = require("./diagnostics")
local M={}
function M.validate(doc)
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
    local file=matches[1].path..'/validate.lua'
    local validator=assert(loadfile(file))()
    if require("./pedagogy/contract").bank(doc.meta) or doc.meta.assessment then validator.validate(doc) end
  end
end
return M
