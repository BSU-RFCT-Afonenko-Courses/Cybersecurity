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

return {{Pandoc = function(doc)
  doc.meta.course = doc.meta.course or {}
  if not quarto.project.directory then
    pedagogy.collect(doc)
    doc.meta["course-core-processed"] = true
    return doc
  end
  output.invalidate(doc)
  assert(doc.meta.course.schema == nil, diagnostics.format("CORE.SCHEMA_INVALID", "Поле course.schema не поддерживается; удалите его из YAML: действует единый текущий контракт", {field="course.schema"}))
  assert(doc.meta["course-export-context"] ~= true or quarto.doc.is_format("json"), diagnostics.format("CORE.VISIBILITY_INVALID", "course-export-context требует native JSON export", {field="course-export-context"}))
  local canonical,domains,rawAssessment = native_document.validate(doc)
  local publicAnswers=answers.validate(doc)
  if rawAssessment then doc.meta["course-assessment-id"]=pandoc.MetaString(rawAssessment.id) end
  adapters.validate(doc)
  if (require("./pedagogy/contract").bank(doc.meta) or rawAssessment) and pandoc.utils.stringify(doc.meta.course.view or "")=="student" then
    -- Quarto has already appended its native source container before Lua.
    -- Drop that whole generated AST node; metadata alone cannot undo the
    -- writer options resolved earlier by the native HTML pipeline.
    doc=doc:walk({Div=function(div) if div.classes:includes("quarto-embedded-source-code") then return {} end end})
  end
  doc.meta["course-current-native-run"]=output.current_run(quarto.project.directory)~=nil
  local raw=doc:clone()
  local view=doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil
  local public=visibility.prepare(doc:clone(),view=="full" and "student" or nil)
  doc = grading.prepare(doc)
  doc = visibility.prepare(doc)
  native_document.references(doc,domains)
  local current = require("./assessment").collect(doc)
  if current and #current.items==0 then current=nil end
  if current then doc.meta["course-assessment-id"] = pandoc.MetaString(current.id) end
  local publicPedagogy=pedagogy.collect(public)
  local publicSolutions={}
  for _,element in ipairs(publicPedagogy and publicPedagogy.elements or {}) do
    if element.kind=="solution" and element.exercise then publicSolutions[element.exercise]=true end
  end
  for _,fact in ipairs(canonical) do fact.hasPublicSolution=publicSolutions[fact.id]==true end
  local publicExercises=exercises.collect(public,canonical)
  local selectedAnswers={}
  for _,exercise in ipairs(publicExercises) do
    local answer=publicAnswers[exercise.id]
    if answer then selectedAnswers[exercise.id]={answerType=answer.answerType,publicAnswerJson=answer.publicAnswerJson} end
  end
  local declarations=pandoc.List()
  for _,fact in ipairs(canonical) do
    declarations:insert({id=fact.id,source=fact.source,difficulty=fact.difficulty,time=fact.time,statementVisibility=fact.statementVisibility,purpose=fact.purpose,hasSolution=fact.hasSolution,hasPublicSolution=fact.hasPublicSolution})
  end
  output.write({
    exportContext=doc.meta["course-export-context"]==true or nil,
    declarations=declarations, rawAssessment=require("./assessment").composition(rawAssessment),
    course = {id = doc.meta.course.id and pandoc.utils.stringify(doc.meta.course.id) or nil,
              view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil},
    exercises = exercises.collect(doc,canonical),
    pedagogy = pedagogy.collect(doc),
    assessment = current,
    body = {publicExercises=publicExercises,publicAssessment=require("./assessment").collect(public),publicAnswers=selectedAnswers,fullAnswers=view=="full" and publicAnswers or nil},
    resources = resources.facts(raw,public,canonical)
  })
  if rawAssessment and doc.meta["course-current-native-run"]==true and quarto.doc.is_format("html") then
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
          pandoc.Pandoc({block}):walk({traverse="topdown",Div=function(div)
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
  doc.meta["course-core-processed"] = true
  -- Native shortcode resolution runs after pre-ast filters. The source writer
  -- carries both independently projected ASTs through that same native pass.
  -- The collector removes this service wrapper from the full side and reads it
  -- separately for public selected conditions; no second render is needed.
  if doc.meta["course-export-context"] == true then
    -- Work member lists are already captured as semantic facts. They are not
    -- question conditions and need no per-document native crossref rendering.
    local function skeleton(fragment)
      return fragment:walk({traverse="topdown",Div=function(div)
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
end}}
