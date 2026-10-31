local __metrics=require("./observability/bridge").create_metrics("course-core",1)
local __perfWalk1=__metrics.wrap_walk({id="course-core.assessment.walk.1",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk2=__metrics.wrap_walk({id="course-core.assessment.walk.2",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk3=__metrics.wrap_walk({id="course-core.assessment.walk.3",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk4=__metrics.wrap_walk({id="course-core.assessment.walk.4",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk5=__metrics.wrap_walk({id="course-core.assessment.walk.5",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk6=__metrics.wrap_walk({id="course-core.assessment.walk.6",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk7=__metrics.wrap_walk({id="course-core.assessment.walk.7",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local diagnostics = require("./diagnostics")
local vocabulary = require("./vocabulary")
local grading = require("./grading")
local M = {}
local visibilityFields={ ["when-profile"]=true,["unless-profile"]=true,["when-format"]=true,["unless-format"]=true,["when-meta"]=true,["unless-meta"]=true }
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
  __perfWalk1(doc,{Div=function(div) if div.classes:includes('task-items') then count=count+1 end end})
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
  if not config.id and not (crossref and crossref['chapter-id']) then
    __perfWalk2(doc,{Header=function(header) if header.identifier:match('^sec%-') and not id:match('^sec%-') then id=header.identifier end end})
  end
  local kind=config.kind and pandoc.utils.stringify(config.kind) or ''
  local theoryTime=config['theory-time'] and tonumber(pandoc.utils.stringify(config['theory-time'])) or nil
  check(config['theory-time']==nil or theoryTime and theoryTime>0 and theoryTime<math.huge,'theory-time должен задавать положительное число минут',id,'assessment.theory-time')
  local slots,sizes,kinds=pandoc.List(),pandoc.List(),pandoc.List()
  local used,slotIds={},{}
  __perfWalk3(doc,{Div=function(div)
    if not div.classes:includes('task-items') then return end
    for key,_ in pairs(div.attributes) do check(key=='stage' or key=='requirement' or key=='work-mode' or visibilityFields[key],'Неизвестный атрибут task-items: '..key,id,key) end
    local stage=div.attributes.stage
    local defaultRequirement=div.attributes.requirement or "required"
    local defaultMode=div.attributes["work-mode"] or "individual"
    check(vocabulary.requirement[defaultRequirement],"Недопустимый requirement списка",id,"requirement")
    check(vocabulary.workMode[defaultMode],"Недопустимый work-mode списка",id,"work-mode")
    check(stage==nil or contains(vocabulary.stages,stage),'stage должен принимать demonstration, classroom или homework',id,'stage')
    check(#div.content==1,'task-items требует один непустой список',id,'task-items')
    for _,block in ipairs(div.content) do
      kinds:insert(block.t)
      check(block.t=='BulletList' or block.t=='OrderedList','task-items требует BulletList или OrderedList',id,'task-items')
      for _,item in ipairs(block.content) do
        check(#item==1 and (item[1].t=='Plain' or item[1].t=='Para'),'Позиция требует один абзац без вложенных списков',id,'slots')
        local refs,group,requirement,workMode=pandoc.List(),nil,nil,nil
        __perfWalk4(pandoc.Pandoc(item),{Span=function(span)
          check(span.attributes.stage==nil,'stage принадлежит task-items, не Span',id,'stage')
          local alternatives=span.classes:includes('task-alternatives')
          if alternatives then
            check(not group,'Вложенные или повторные task-alternatives не поддерживаются',id,'slots')
            __perfWalk5(pandoc.Pandoc({pandoc.Plain(span.content)}),{Span=function(candidate)
              check(candidate.attributes.requirement==nil and candidate.attributes['work-mode']==nil,'Атрибуты назначения принадлежат внешней позиции, не кандидату группы',id,'slots')
            end})
            group=span
            check(span.identifier:match('^alt%-[a-z0-9][a-z0-9%-]*$') and (span.attributes.selection=='random' or span.attributes.selection=='choice'),'Группа требует явные alt-* и selection=random|choice',id,'slots')
          end
          for key,_ in pairs(span.attributes) do
            check(key=='requirement' or key=='work-mode' or alternatives and key=='selection' or visibilityFields[key],'Неизвестный атрибут позиции: '..key,id,key)
          end
          if span.attributes.requirement or span.attributes['work-mode'] then
            local n=0;__perfWalk6(pandoc.Pandoc({pandoc.Plain(span.content)}),{Cite=function(cite) n=n+#cite.citations end})
            check(alternatives or n==1,'Атрибут назначения требует Span позиции',id,'slots')
            if span.attributes.requirement then
              check(not requirement and vocabulary.requirement[span.attributes.requirement],'Недопустимый или повторный requirement',id,'requirement');requirement=span.attributes.requirement
            end
            if span.attributes['work-mode'] then
              check(not workMode and vocabulary.workMode[span.attributes['work-mode']],'Недопустимый или повторный work-mode',id,'work-mode');workMode=span.attributes['work-mode']
            end
          end
        end,Cite=function(cite)
          for _,c in ipairs(cite.citations) do
            check(c.id:match('^exr%-[a-z0-9][a-z0-9%-]*$'),'Назначение требует местную ссылку exr-*',id,'slots')
            check(not used[c.id],'Повторный участник работы: '..c.id,id,'slots');used[c.id]=true;refs:insert(c.id)
          end
        end})
        if group then
          local n=0;__perfWalk7(pandoc.Pandoc({pandoc.Plain(group.content)}),{Cite=function(cite) n=n+#cite.citations end})
          check(n==#refs and n>=2,'Группа требует минимум две различные ссылки и охватывает всю позицию',id,'slots')
        else check(#refs==1,'Каждый пункт требует одну ссылку или task-alternatives',id,'slots') end
        local slotId=group and group.identifier or refs[1]
        check(not slotIds[slotId],'Повторный ID позиции: '..slotId,id,'slots');slotIds[slotId]=true
        if group and group.attributes.selection=='choice' then check((requirement or defaultRequirement)=='required','Самостоятельный выбор требует required',id,'requirement') end
        sizes:insert(1)
        slots:insert({id=slotId,selection=group and group.attributes.selection or 'fixed',candidates=refs,assignment={stage=stage,requirement=requirement or defaultRequirement,workMode=workMode or defaultMode}})
      end
    end
  end})
  local body=grading.split(doc.blocks)
  return {id=id,title=title,bodyJson=body,kind=kind,slots=slots,theoryTime=theoryTime,
    relatedExercise=config['related-exercise'] and pandoc.utils.stringify(config['related-exercise']) or nil,memberContainers=count,memberKinds=kinds,memberSizes=sizes}
end
function M.composition(work)
  if not work then return nil end
  local result={}
  for key,value in pairs(work) do if key~='bodyJson' then result[key]=value end end
  return result
end
M.collect=__metrics.wrap_sync({id="course-core.assessment.collect",kind='phase'},M.collect)
M.composition=__metrics.wrap_sync({id="course-core.assessment.composition",kind='phase'},M.composition)
return M
