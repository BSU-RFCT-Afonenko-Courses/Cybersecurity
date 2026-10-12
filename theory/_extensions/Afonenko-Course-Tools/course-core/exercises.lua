local M = {}
local grading = require("./grading")
local pedagogic = require("./pedagogy/contract")
local function canonical(d) return pedagogic.is_exercise(d) or d.attributes.target ~= nil end
local function head(block)
  return {kind = block and block.t or "Missing",
          level = block and block.t == "Header" and block.level or 0,
          title = block and pandoc.utils.stringify(block) or ""}
end
function M.collect(doc,facts,effective)
  effective=effective or require("./exercise-defaults").normalize(doc)
  if not pedagogic.bank(doc.meta) then return pandoc.List() end
  local defaults=pedagogic.defaults(doc.meta)
  local topics,declared={},{}
  for _,fact in ipairs(facts or {}) do topics[fact.id]=fact.sourceTopic;declared[fact.id]=fact end
  local result = pandoc.List()
  doc:walk({Div = function(div)
    if not canonical(div) then return end
    local nested, unknown = 0, pandoc.List()
    for _, child in ipairs(div.content) do
      child:walk({Div = function(d) if canonical(d) then nested = nested + 1 end end})
    end
    for key, _ in pairs(div.attributes) do
      if not pedagogic.adapter_attribute(key,doc.meta) and not pedagogic.exerciseAttributes[key] and not pedagogic.attributes[key] and not pedagogic.nativeExerciseAttributes[key] then unknown:insert(key) end
    end
    local body, notes = grading.split(div.content)
    local final=effective[div.identifier]
    result:insert({id = div.identifier, target = final.target, authoredTarget=final.authoredTarget,
      purpose=final.purpose, difficulty=final.difficulty,
      time=final.time, statementVisibility=final.statementVisibility,hasSolution=declared[div.identifier] and declared[div.identifier].hasSolution or false,hasPublicSolution=declared[div.identifier] and declared[div.identifier].hasPublicSolution or false,
      sourceTopic=topics[div.identifier],
      project = div.attributes.project or "", head = head(div.content[1]),
      bodyJson = body, gradingNotesJson = notes,
      nested = nested, unknownAttributes = unknown})
  end})
  return result
end
return M
