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
  if not doc.meta.course then return doc end
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
  for _,exercise in ipairs(publicExercises) do selectedAnswers[exercise.id]=publicAnswers[exercise.id] end
  output.write({
    course = {id = pandoc.utils.stringify(doc.meta.course.id),
              view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil},
    exercises = exercises.collect(doc,canonical),
    pedagogy = pedagogy.collect(doc),
    assessment = current,
    body = {publicExercises=publicExercises,publicAssessment=native_document.assessment(public),publicAnswers=selectedAnswers},
    resources = resources.facts(raw,public,canonical)
  })
  -- Фильтр представления использует учебные атрибуты только после сохранения.
  -- Маркер документа позволяет обнаружить неверный порядок фильтров.
  doc.meta["course-core-processed"] = true
  return doc
end}}
