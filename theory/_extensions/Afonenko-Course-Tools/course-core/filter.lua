local owner_preflight = require("./owner-preflight/filter")
local visibility = require("./visibility")
local grading = require("./grading")
local exercises = require("./exercises")
local assessment = require("./assessment")
local output = require("./output")
local pedagogy = require("./pedagogy/collect")

return {{Pandoc = function(doc)
  -- Only the validated capture branch can authorize downstream passivity.
  doc.meta["course-core-capture"] = nil
  local captured,canonical = owner_preflight.process(doc,function(body) return visibility.prepare(grading.prepare(body)) end)
  if captured then
    -- Private capture only: preserve occurrences before projection, no public fragment.
    doc.meta["course-core-processed"] = true
    doc.meta["course-core-capture"] = true
    doc.blocks = pandoc.List()
    return doc
  end
  if not doc.meta.course then return doc end
  output.invalidate()
  assert(doc.meta.course.schema == nil, "Поле course.schema не поддерживается; удалите его из YAML: действует единый текущий контракт")
  if not canonical then
    doc:walk({Div=function(div)
      assert(not div.identifier:match("^exr%-"), "SOURCE.OWNER_PREFLIGHT_REQUIRED: canonical exr requires the existing owner-preflight route")
    end})
  end
  doc = grading.prepare(doc)
  doc = visibility.prepare(doc)
  local current = assessment.collect(doc)
  if current then doc.meta["course-assessment-id"] = pandoc.MetaString(current.id) end
  output.write({
    course = {id = pandoc.utils.stringify(doc.meta.course.id),
              view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil},
    exercises = exercises.collect(doc,canonical),
    pedagogy = pedagogy.collect(doc),
    assessment = current
  })
  -- Фильтр представления использует учебные атрибуты только после сохранения.
  -- Маркер документа позволяет обнаружить неверный порядок фильтров.
  doc.meta["course-core-processed"] = true
  return doc
end}}
