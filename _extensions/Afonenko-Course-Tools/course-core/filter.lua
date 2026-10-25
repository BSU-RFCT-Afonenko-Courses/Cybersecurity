local __metrics=require("./observability/bridge").create_metrics("course-core",1)
local __perfWalk1=__metrics.wrap_walk({id="course-core.filter.walk.1",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk2=__metrics.wrap_walk({id="course-core.filter.walk.2",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk3=__metrics.wrap_walk({id="course-core.filter.walk.3",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk4=__metrics.wrap_walk({id="course-core.filter.walk.4",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk5=__metrics.wrap_walk({id="course-core.filter.walk.5",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk6=__metrics.wrap_walk({id="course-core.filter.walk.6",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk7=__metrics.wrap_walk({id="course-core.filter.walk.7",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then local spec={id="course-core.filter.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'}
   if os.getenv('COURSE_PERF_MODE') and os.getenv('COURSE_PERF_MODE')~='off' then
    filters[key]=function(...)
     spec.document_id=quarto and quarto.doc and quarto.doc.input_file or nil
     return __metrics.wrap_sync(spec,value)(...)
    end
   else filters[key]=__metrics.wrap_sync(spec,value) end
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local diagnostics = require("./diagnostics")
local native_document = require("./native-document")
local answers = require("./native-answers")
local adapters = require("./native-adapters")
local resources = require("./native-resources")
local visibility = require("./visibility")
local grading = require("./grading")
local exercises = require("./exercises")
local output = require("./output")
local pedagogy = require("./pedagogy/collect")

return __perfFilters({{Pandoc = function(doc)
  doc.meta.course = doc.meta.course or {}
  if not quarto.project.directory then
    pedagogy.collect(doc)
    doc.meta["course-core-processed"] = true
    return doc
  end
  output.invalidate(doc)
  assert(doc.meta.course.schema == nil, diagnostics.format("CORE.SCHEMA_INVALID", "Поле course.schema не поддерживается; удалите его из YAML: действует единый текущий контракт", {field="course.schema"}))
  assert(doc.meta["course-export-context"] ~= true or quarto.doc.is_format("json"), diagnostics.format("CORE.VISIBILITY_INVALID", "course-export-context требует native JSON export", {field="course-export-context"}))
  local effective=require("./exercise-defaults").normalize(doc)
  local boundMaterialization=output.bound_materialization(doc)
  local projectFacts=require("./projects").collect(doc,effective,boundMaterialization)
  local canonical,domains,rawAssessment = native_document.validate(doc,effective)
  local publicAnswers=answers.validate(doc)
  if rawAssessment then doc.meta["course-assessment-id"]=pandoc.MetaString(rawAssessment.id) end
  adapters.validate(doc,effective)
  local managed=false
  for _,fact in pairs(effective) do if fact.managed then managed=true end end
  if (require("./pedagogy/contract").bank(doc.meta) or rawAssessment or managed) and pandoc.utils.stringify(doc.meta.course.view or "")=="student" then
    -- Quarto has already appended its native source container before Lua.
    -- Drop that whole generated AST node; metadata alone cannot undo the
    -- writer options resolved earlier by the native HTML pipeline.
    doc=__perfWalk1(doc,{Div=function(div) if div.classes:includes("quarto-embedded-source-code") then return {} end end})
  end
  doc.meta["course-current-native-run"]=output.current_run(quarto.project.directory)~=nil
  local raw=doc:clone()
  local view=doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil
  local public=visibility.prepare(doc:clone(),view=="full" and "student" or nil,effective)
  doc = grading.prepare(doc)
  doc = visibility.prepare(doc,nil,effective)
  adapters.read(doc,effective)
  native_document.references(doc,domains)
  local function projectedAssessment(document)
    if not rawAssessment or not document.meta.assessment then return nil end
    local result={},{};local members={}
    __perfWalk2(document,{Div=function(div) if div.classes:includes('task-items') then __perfWalk3(pandoc.Pandoc(div.content),{Cite=function(cite) for _,c in ipairs(cite.citations) do members[c.id]=true end end}) end end})
    for key,value in pairs(rawAssessment) do result[key]=value end
    result.slots=pandoc.List();result.memberSizes=pandoc.List()
    for _,slot in ipairs(rawAssessment.slots) do
      local present=true;for _,id in ipairs(slot.candidates) do if not members[id] then present=false end end
      if present then result.slots:insert(slot);result.memberSizes:insert(1) end
    end
    if #result.slots==0 then return nil end
    result.bodyJson=grading.split(document.blocks);return result
  end
  local current = projectedAssessment(doc)
  if current then doc.meta["course-assessment-id"] = pandoc.MetaString(current.id) end
  local publicPedagogy=pedagogy.collect(public,effective)
  local publicSolutions={}
  for _,element in ipairs(publicPedagogy and publicPedagogy.elements or {}) do
    if element.kind=="solution" and element.exercise then publicSolutions[element.exercise]=true end
  end
  for _,fact in ipairs(canonical) do fact.hasPublicSolution=publicSolutions[fact.id]==true end
  local publicExercises=exercises.collect(public,canonical,effective)
  local selectedAnswers={}
  for _,exercise in ipairs(publicExercises) do
    local answer=publicAnswers[exercise.id]
    if answer then selectedAnswers[exercise.id]={answerType=answer.answerType,publicAnswerJson=answer.publicAnswerJson} end
  end
  local topicSource=quarto.doc.input_file
  if not pandoc.path.is_relative(topicSource) then topicSource=pandoc.path.make_relative(topicSource,quarto.project.directory) end
  local topic={source=topicSource,categories=pandoc.List()}
  if doc.meta.semester then topic.semester=pandoc.utils.stringify(doc.meta.semester) end
  local categories=doc.meta.categories or (quarto.metadata and quarto.metadata.get("categories"))
  if categories then for _,category in ipairs(categories) do
    -- Quarto preserves category strings as pandoc-native scalar inlines until
    -- its later native resolution phase; decode that transport, not source YAML.
    local value=__perfWalk4(pandoc.Pandoc({pandoc.Plain(category)}),{RawInline=function(raw)
      if raw.format=="pandoc-native" then return pandoc.Str(pandoc.utils.stringify(pandoc.read(raw.text,"native"))) end
    end})
    topic.categories:insert(pandoc.utils.stringify(value))
  end end
  local resourceProjects=pandoc.List()
  for _,fact in pairs(effective) do if fact.project then resourceProjects:insert(fact) end end
  local declarations=pandoc.List()
  for _,fact in ipairs(canonical) do
    declarations:insert({id=fact.id,source=fact.source,difficulty=fact.difficulty,time=fact.time,statementVisibility=fact.statementVisibility,purpose=fact.purpose,hasSolution=fact.hasSolution,hasPublicSolution=fact.hasPublicSolution})
  end
  output.write({
    exportContext=doc.meta["course-export-context"]==true or nil,
    projects=projectFacts, projectMaterializations=boundMaterialization, topic=topic,
    declarations=declarations, rawAssessment=require("./assessment").composition(rawAssessment),
    course = {id = doc.meta.course.id and pandoc.utils.stringify(doc.meta.course.id) or nil,
              view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil},
    exercises = exercises.collect(doc,canonical,effective),
    pedagogy = pedagogy.collect(doc,effective),
    assessment = current,
    body = {publicExercises=publicExercises,publicAssessment=projectedAssessment(public),publicAnswers=selectedAnswers,fullAnswers=view=="full" and publicAnswers or nil},
    resources = resources.facts(raw,public,resourceProjects)
  })
  if rawAssessment and doc.meta.course["assessment-time"]~=false and doc.meta["course-current-native-run"]==true and quarto.doc.is_format("html") then
    doc.blocks:insert(pandoc.RawBlock("html","<!--course-assessment-time-->"))
  end
  if #canonical>0 and doc.meta["course-current-native-run"]==true and quarto.doc.is_format("html") then
    local function probes(blocks,owner)
      local result=pandoc.List()
      for _,block in ipairs(blocks) do
        if block.t=="Div" then
          local related=block.attributes["data-course-solution-owner"] or block.identifier:match("^sol%-(.+)$")
          if related and not related:match("^exr%-") then related="exr-"..related end
          if block.classes:includes("solution") and not related then related=owner end
          local content
          if related then
            for _,fact in ipairs(canonical) do
              if fact.id==related then
                content=pandoc.List({pandoc.RawBlock("html","<!--course-public-solution:"..pandoc.utils.sha1(fact.source.."\0"..fact.id).."-->")})
                break
              end
            end
          else content=probes(block.content,block.identifier:match("^exr%-") and block.identifier or owner) end
          if content and #content>0 then
            local classes=pandoc.List()
            for _,class in ipairs(block.classes) do if class=="content-visible" or class=="content-hidden" then classes:insert(class) end end
            local attrs={}
            for key,value in pairs(block.attributes) do if key:match("^when%-") or key:match("^unless%-") then attrs[key]=value end end
            result:insert(pandoc.Div(content,pandoc.Attr("",classes,attrs)))
          end
        else
          -- Native solutions can live inside quotes, lists, table cells or
          -- Notes. Extract only their probes, retaining conditional ancestors,
          -- without copying the enclosing visual structure or its payload.
          __perfWalk5(pandoc.Pandoc({block}),{traverse="topdown",Div=function(div)
            result:extend(probes({div},owner));return {},false
          end,Span=function(span)
            if not span.classes:includes("content-visible") and not span.classes:includes("content-hidden") then return end
            local content=probes({pandoc.Plain(span.content)},owner)
            if #content>0 then
              local attrs={}
              for key,value in pairs(span.attributes) do if key:match("^when%-") or key:match("^unless%-") then attrs[key]=value end end
              result:insert(pandoc.Div(content,pandoc.Attr("",span.classes:filter(function(class) return class=="content-visible" or class=="content-hidden" end),attrs)))
            end
            return {},false
          end})
        end
      end
      return result
    end
    doc.blocks:insert(pandoc.RawBlock("html","<!--course-public-solution-probe:start-->"))
    doc.blocks:extend(probes(public.blocks,nil))
    doc.blocks:insert(pandoc.RawBlock("html","<!--course-public-solution-probe:end-->"))
  end
  -- Фильтр представления использует учебные атрибуты только после сохранения.
  -- Маркер документа позволяет обнаружить неверный порядок фильтров.
  local artifactContext={}
  for _,project in ipairs(projectFacts) do artifactContext[project.exerciseId]={purpose=project.purpose,statementVisibility=project.statementVisibility} end
  doc.meta["course-artifact-context"]=artifactContext
  doc.meta["course-effective-exercise-facts"]=pandoc.MetaString(pandoc.json.encode(effective))
  doc=require("./exercise-defaults").present(doc,effective)
  local function markDependencies(blocks,owner)
    return __perfWalk6(pandoc.Pandoc(blocks),{traverse="topdown",Div=function(div)
      if div.identifier:match("^sol%-") or div.classes:includes("solution") or div.classes:includes("course-answer-solution") or div.classes:includes("grading-notes") or div.classes:includes("answer-spec") or div.classes:includes("answer") then return div,false end
      local current=div.identifier:match("^exr%-") and div.identifier or owner
      if div.attributes["course-role"]=="prerequisites" then div.attributes["data-course-artifact-dependency"]=div.attributes["for"] or current or "*" end
      div.content=markDependencies(div.content,current)
      return div,false
    end}).blocks
  end
  doc.blocks=markDependencies(doc.blocks,nil)
  public=require("./exercise-defaults").present(public,effective)
  doc.meta["course-core-processed"] = true
  -- Native shortcode resolution runs after pre-ast filters. The source writer
  -- carries both independently projected ASTs through that same native pass.
  -- The collector removes this service wrapper from the full side and reads it
  -- separately for public selected conditions; no second render is needed.
  if doc.meta["course-export-context"] == true then
    -- Work member lists are already captured as semantic facts. They are not
    -- question conditions and need no per-document native crossref rendering.
    local function skeleton(fragment)
      return __perfWalk7(fragment,{traverse="topdown",Div=function(div)
        if div.identifier:match("^exr%-") then return div,false end
        if div.classes:includes("task-items") or div.classes:includes("assessment-preview") then return {} end
      end})
    end
    doc=skeleton(doc)
    public=skeleton(public)
    doc.blocks:insert(pandoc.Div(public.blocks, pandoc.Attr("course-export-public",
      {"course-export-projection"}, {["data-course-export-projection"]="public"})))
  end
  return doc
end}})
