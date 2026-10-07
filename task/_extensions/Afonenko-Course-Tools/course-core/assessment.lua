local diagnostics = require("./diagnostics")
local M = {}
local grading = require("./grading")
function M.collect(doc)
  local config=doc.meta.assessment
  local count=0
  doc:walk({Div=function(div) if div.classes:includes('task-items') then count=count+1 end end})
  if not config and count==0 then return nil end
  config=config or {}
  local id = config.id and pandoc.utils.stringify(config.id) or ''
  local title = doc.meta.title and pandoc.utils.stringify(doc.meta.title) or ''
  local crossref = doc.meta.crossref
  if crossref and crossref['chapter-id'] then id=id~='' and id or pandoc.utils.stringify(crossref['chapter-id']) end
  for _,block in ipairs(doc.blocks) do
    if block.t=='Header' then
      if id=='' then id=block.identifier end
      if title=='' then title=pandoc.utils.stringify(block.content) end
      break
    end
  end
  local kind=config.kind and pandoc.utils.stringify(config.kind) or 'handout'
  local items,sizes,kinds=pandoc.List(),pandoc.List(),pandoc.List()
  local requirements={}
  doc:walk({Div=function(div)
    if not div.classes:includes('task-items') then return end
    for _,block in ipairs(div.content) do
      kinds:insert(block.t)
      if block.t=='BulletList' or block.t=='OrderedList' then
        for _,item in ipairs(block.content) do
          local size,requirement=0,nil
          pandoc.Pandoc(item):walk({Span=function(span)
            local value=span.attributes.requirement
            if value then
              assert(value=='required' or value=='optional', diagnostics.format("CORE.ASSESSMENT_INVALID", 'requirement должен принимать значение required или optional', {id=id,field="requirement"}))
              assert(not requirement, diagnostics.format("CORE.ASSESSMENT_INVALID", 'Повторный атрибут requirement', {id=id,field="requirement"}))
              requirement=value
            end
          end,Cite=function(cite)
            for _,c in ipairs(cite.citations) do items:insert(c.id);size=size+1 end
          end})
          sizes:insert(size)
          if size==1 and (requirement or kind~='handout') then requirements[items[#items]]=requirement or 'required' end
        end
      end
    end
  end})
  local body=grading.split(doc.blocks)
  return {id=id,title=title,bodyJson=body,kind=kind,items=items,
    requirements=next(requirements) and requirements or nil,
    memberContainers=count,memberKinds=kinds,memberSizes=sizes}
end
return M
