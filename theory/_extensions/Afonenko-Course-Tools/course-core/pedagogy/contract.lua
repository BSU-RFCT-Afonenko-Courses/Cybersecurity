local diagnostics = require("../diagnostics")
-- Словарь авторской разметки. Отображение выполняет course-presentation.
local M = {}
local vocabulary = require("../vocabulary")
local function set(values)
  local result = {}; for _, value in ipairs(values) do result[value] = true end; return result
end
M.roles = vocabulary.roles
M.activities = {}
for key, value in pairs(vocabulary.roles) do if value.activity then M.activities[key] = true end end
M.attributes = set(vocabulary.pedagogyAttributes)
M.exerciseAttributes = set(vocabulary.exerciseAttributes)
-- Native theorem name and conditional attributes remain owned by Quarto.
M.nativeExerciseAttributes = set({"name", "when-profile", "unless-profile",
  "when-format", "unless-format", "when-meta", "unless-meta"})
local difficulties, modes, requirements = vocabulary.difficulty, vocabulary.workMode, vocabulary.requirement

local function choice(value, values, name, context)
  if value ~= nil then assert(values[value], diagnostics.format("CORE.METADATA_INVALID", "Недопустимое значение учебного атрибута " .. name .. ": " .. tostring(value), {id=context and context.id,field=name})) end
  return value
end

-- Время задаёт оценку трудоёмкости в целых минутах.
function M.metadata(values, context)
  local time = values.time
  if time ~= nil then
    assert(tostring(time):match("^[1-9][0-9]*$"), diagnostics.format("CORE.METADATA_INVALID", "Атрибут time должен задавать положительное целое число минут", {id=context and context.id,field="time"}))
    time = tonumber(time)
    assert(time and time>0 and time<math.huge and time%1==0, diagnostics.format("CORE.METADATA_INVALID", "Атрибут time должен задавать положительное конечное целое число минут", {id=context and context.id,field="time"}))
  end
  return {difficulty=choice(values.difficulty, difficulties, "difficulty", context), time=time,
    workMode=choice(values["work-mode"], modes, "work-mode", context),
    requirement=choice(values.requirement, requirements, "requirement", context)}
end

-- Явное включение наследования сохраняет независимые метаданные других проектов.
-- Те же поля верхнего уровня используют штатные списки Quarto.
function M.defaults(meta)
  local config = meta["course-pedagogy"]
  if config == nil then return nil end
  assert(type(config) == "table", diagnostics.format("CORE.PEDAGOGY_CONFIG_INVALID", "course-pedagogy должен содержать YAML-словарь параметров", {field="course-pedagogy"}))
  for key, _ in pairs(config) do
    assert(key == "document-defaults", diagnostics.format("CORE.PEDAGOGY_CONFIG_INVALID", "Неизвестный параметр course-pedagogy: " .. tostring(key), {field="course-pedagogy"}))
  end
  local enabled = config["document-defaults"]
  assert(enabled == nil or type(enabled) == "boolean", diagnostics.format("CORE.PEDAGOGY_CONFIG_INVALID", "course-pedagogy.document-defaults должен принимать значение true или false", {field="course-pedagogy"}))
  if not enabled then return nil end
  local values = {}
  for _, key in ipairs(vocabulary.activityAttributes) do
    if meta[key] ~= nil then values[key] = pandoc.utils.stringify(meta[key]) end
  end
  return M.metadata(values)
end

function M.adapter_attribute(key,meta)
  for _,name in ipairs(meta.course and meta.course.adapters or {}) do if key:sub(1,#pandoc.utils.stringify(name)+1)==pandoc.utils.stringify(name).."-" then return true end end
  return false
end
function M.bank(meta)
  local value=meta["exercise-bank"]
  assert(value==nil or type(value)=="boolean", diagnostics.format("CORE.METADATA_INVALID", "exercise-bank должен принимать true или false", {field="exercise-bank"}))
  return value==true
end
function M.statement_visibility(div,meta)
  local value=div.attributes["statement-visibility"] or (meta["exercise-statement-visibility"] and pandoc.utils.stringify(meta["exercise-statement-visibility"]))
  assert(value=="open" or value=="restricted", diagnostics.format("CORE.METADATA_INVALID", "Для банковской задачи требуется statement-visibility open или restricted", {id=div.identifier,field="statement-visibility"}))
  return value
end
function M.is_exercise(div) return div.identifier:match("^exr%-") ~= nil end
function M.is_example(div) return div.identifier:match("^exm%-") ~= nil end
function M.is_activity(div) return M.is_exercise(div) or M.is_example(div) end
-- Native solution IDs remain ordinary Quarto identifiers. An explicit link or
-- containing exercise owns the relationship; suffix pairing is only a helpful
-- unambiguous inference for export and visibility, never an authoring gate.
function M.related(div, indexed, owner)
  if div.attributes['for'] or owner then return div.attributes['for'] or owner end
  if not div.identifier:match('^sol%-') then return nil end
  local suffix=div.identifier:sub(5)
  local found
  for _,prefix in ipairs({'exr-', 'exm-'}) do
    if indexed[prefix..suffix] then
      if found then return nil end
      found=prefix..suffix
    end
  end
  return found
end

function M.kind(div, owner)
  local role = div.attributes["course-role"]
  if role then assert(M.roles[role], diagnostics.format("CORE.PEDAGOGY_ROLE_INVALID", "Неизвестная учебная роль course-role: " .. role, {id=div.identifier,field="course-role"})) end
  if M.is_activity(div) then
    assert(not role or M.activities[role], diagnostics.format("CORE.PEDAGOGY_ROLE_INVALID", "Упражнению exr-* можно назначить только роль деятельности course-role", {id=div.identifier,field="course-role"}))
    return role or (not M.is_example(div) and "exercise" or nil)
  end
  local solution = div.identifier:match("^sol%-") or div.classes:includes("solution")
  -- Визуальный callout может содержать материалы или цели обучения.
  -- Явная авторская роль имеет приоритет над автоматическим определением подсказки.
  local hint = not role and div.classes:includes("callout-tip") and (div.attributes["for"] ~= nil or owner ~= nil)
  assert(not role or not solution, diagnostics.format("CORE.PEDAGOGY_ROLE_INVALID", "Для решения нельзя дополнительно задавать course-role", {id=div.identifier,field="course-role"}))
  return role or (solution and "solution") or (hint and "hint") or nil
end

function M.describe(div, defaults, owner)
  local kind = M.kind(div, owner)
  if div.classes:includes("task-items") then
    M.metadata({difficulty=div.attributes.difficulty,time=div.attributes.time},{id=div.identifier})
    return nil,{}
  end
  local educational = M.is_activity(div) or M.activities[kind]
  local values = {}
  for _, key in ipairs(vocabulary.activityAttributes) do
    local value = div.attributes[key]
    assert(value == nil or educational, diagnostics.format("CORE.PEDAGOGY_ATTRIBUTE_INVALID", key .. " допустим только для exr-* или роли деятельности course-role", {id=div.identifier,field=key}))
    values[key] = value
  end
  values.requirement = div.attributes.requirement
  assert(values.requirement == nil or kind == "reading", diagnostics.format("CORE.PEDAGOGY_ATTRIBUTE_INVALID", "Атрибут requirement допустим только при course-role=reading", {id=div.identifier,field="requirement"}))
  assert(div.attributes["for"] == nil or (kind and not M.is_activity(div)), diagnostics.format("CORE.PEDAGOGY_REFERENCE_INVALID", "Атрибут for связывает учебный блок с упражнением и недопустим у самого упражнения", {id=div.identifier,field="for"}))
  local metadata = M.metadata(values, {id=div.identifier})
  if educational and defaults then
    for key, value in pairs(defaults) do
      if metadata[key] == nil and not M.is_exercise(div) then metadata[key] = value end
    end
  end
  return kind, metadata
end
return M
