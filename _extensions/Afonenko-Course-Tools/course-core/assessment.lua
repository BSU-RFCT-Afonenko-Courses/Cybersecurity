local diagnostics = require("./diagnostics")
local vocabulary = require("./vocabulary")
local grading = require("./grading")
local M = {}
local function check(value,message,id,field)
  assert(value,diagnostics.format("CORE.ASSESSMENT_INVALID",message,{id=id,field=field}))
end
local function contains(values,value)
  for _,item in ipairs(values) do if item==value then return true end end
  return false
end
function M.collect(doc)
  local config=doc.meta.assessment
  local count=0
  doc:walk({Div=function(div) if div.classes:includes('task-items') then count=count+1 end end})
  if not config and count==0 then return nil end
  check(config and type(config)=='table','Работа требует assessment с явным kind',nil,'assessment.kind')
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
  local kind=config.kind and pandoc.utils.stringify(config.kind) or ''
  local theoryTime=config['theory-time'] and tonumber(pandoc.utils.stringify(config['theory-time'])) or nil
  check(config['theory-time']==nil or theoryTime and theoryTime>0 and theoryTime<math.huge,'theory-time должен задавать положительное число минут',id,'assessment.theory-time')
  local items,sizes,kinds=pandoc.List(),pandoc.List(),pandoc.List()
  local assignments={}
  doc:walk({Div=function(div)
    if not div.classes:includes('task-items') then return end
    local stage=div.attributes.stage
    check(stage==nil or contains(vocabulary.stages,stage),'stage должен принимать demonstration, classroom или homework',id,'stage')
    check(#div.content==1,'task-items требует один непустой список',id,'task-items')
    for _,block in ipairs(div.content) do
      kinds:insert(block.t)
      if block.t=='BulletList' or block.t=='OrderedList' then
        for _,item in ipairs(block.content) do
          local size,member,requirement,workMode=0,nil,nil,nil
          pandoc.Pandoc(item):walk({Span=function(span)
            for _,field in ipairs({'requirement','work-mode'}) do
              local value=span.attributes[field]
              if value then
                local refs=0
                pandoc.Pandoc({pandoc.Plain(span.content)}):walk({Cite=function(cite) refs=refs+#cite.citations end})
                check(refs==1,'Атрибут назначения должен принадлежать Span с одной ссылкой на задачу',id,field)
                if field=='requirement' then
                  check(value=='required' or value=='optional','requirement должен принимать required или optional',id,field)
                  check(not requirement,'Повторный атрибут requirement',id,field);requirement=value
                else
                  check(vocabulary.workMode[value],'work-mode должен принимать individual, pair или group',id,field)
                  check(not workMode,'Повторный атрибут work-mode',id,field);workMode=value
                end
              end
            end
          end,Cite=function(cite)
            for _,c in ipairs(cite.citations) do
              check(c.id:match('^exr%-[a-z0-9][a-z0-9%-]*$'),'Назначение требует местную ссылку exr-*',id,'items')
              member=c.id;size=size+1
            end
          end})
          sizes:insert(size)
          if size==1 then
            check(not assignments[member],'Повторный участник работы: '..member,id,'items')
            items:insert(member)
            assignments[member]={stage=stage,requirement=requirement or 'required',workMode=workMode or 'individual'}
          end
        end
      end
    end
  end})
  local body=grading.split(doc.blocks)
  return {id=id,title=title,bodyJson=body,kind=kind,items=items,assignments=assignments,theoryTime=theoryTime,
    memberContainers=count,memberKinds=kinds,memberSizes=sizes}
end
function M.composition(work)
  if not work then return nil end
  local result={}
  for key,value in pairs(work) do if key~='bodyJson' then result[key]=value end end
  return result
end
return M
