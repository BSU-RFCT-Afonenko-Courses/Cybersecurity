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
  assert(doc.meta.course.schema == nil, "Поле course.schema не поддерживается; удалите его из YAML: действует единый текущий контракт")
  local canonical,domains = native_document.validate(doc)
  local publicAnswers=answers.validate(doc)
  local rawAssessment=native_document.assessment(doc)
  if rawAssessment then doc.meta["course-assessment-id"]=pandoc.MetaString(rawAssessment.id) end
  adapters.validate(doc)
  local raw=doc:clone()
  local view=doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil
  local public=visibility.prepare(doc:clone(),view=="full" and "student" or nil)
  doc = grading.prepare(doc)
  doc = visibility.prepare(doc)
  native_document.references(doc,domains)
  local current = native_document.assessment(doc)
  if current then doc.meta["course-assessment-id"] = pandoc.MetaString(current.id) end
  local publicExercises=exercises.collect(public,canonical)
  local selectedAnswers={}
  for _,exercise in ipairs(publicExercises) do
    local answer=publicAnswers[exercise.id]
    if answer then selectedAnswers[exercise.id]={answerType=answer.answerType,publicAnswerJson=answer.publicAnswerJson} end
  end
  output.write({
    course = {id = doc.meta.course.id and pandoc.utils.stringify(doc.meta.course.id) or nil,
              view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil},
    exercises = exercises.collect(doc,canonical),
    pedagogy = pedagogy.collect(doc),
    assessment = current,
    body = {publicExercises=publicExercises,publicAssessment=native_document.assessment(public),publicAnswers=selectedAnswers,fullAnswers=view=="full" and publicAnswers or nil},
    resources = resources.facts(raw,public,canonical)
  })
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
        if div.classes:includes("task-items") then return {} end
      end})
    end
    doc=skeleton(doc)
    public=skeleton(public)
    doc.blocks:insert(pandoc.Div(public.blocks, pandoc.Attr("course-export-public",
      {"course-export-projection"}, {["data-course-export-projection"]="public"})))
  end
  return doc
end}}
