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

local function choice(value, values, name)
  if value ~= nil then assert(values[value], "Недопустимое значение учебного атрибута " .. name .. ": " .. tostring(value)) end
  return value
end

-- Время задаёт оценку трудоёмкости в целых минутах.
function M.metadata(values)
  local time = values.time
  if time ~= nil then
    assert(tostring(time):match("^[1-9][0-9]*$"), "Атрибут time должен задавать положительное целое число минут")
    time = tonumber(time)
    assert(time <= vocabulary.maxMinutes, "Атрибут time не может превышать 1000000 минут")
  end
  return {difficulty=choice(values.difficulty, difficulties, "difficulty"), time=time,
    workMode=choice(values["work-mode"], modes, "work-mode"),
    requirement=choice(values.requirement, requirements, "requirement")}
end

-- Явное включение наследования сохраняет независимые метаданные других проектов.
-- Те же поля верхнего уровня используют штатные списки Quarto.
function M.defaults(meta)
  local config = meta["course-pedagogy"]
  if config == nil then return nil end
  assert(type(config) == "table", "course-pedagogy должен содержать YAML-словарь параметров")
  for key, _ in pairs(config) do
    assert(key == "document-defaults", "Неизвестный параметр course-pedagogy: " .. tostring(key))
  end
  local enabled = config["document-defaults"]
  assert(enabled == nil or type(enabled) == "boolean", "course-pedagogy.document-defaults должен принимать значение true или false")
  if not enabled then return nil end
  local values = {}
  for _, key in ipairs(vocabulary.activityAttributes) do
    if meta[key] ~= nil then values[key] = pandoc.utils.stringify(meta[key]) end
  end
  return M.metadata(values)
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
  if role then assert(M.roles[role], "Неизвестная учебная роль course-role: " .. role) end
  if M.is_activity(div) then
    assert(not role or M.activities[role], "Упражнению exr-* можно назначить только роль деятельности course-role")
    return role or (M.is_example(div) and "demonstration" or "exercise")
  end
  local solution = div.identifier:match("^sol%-") or div.classes:includes("solution")
  -- Визуальный callout может содержать материалы или цели обучения.
  -- Явная авторская роль имеет приоритет над автоматическим определением подсказки.
  local hint = not role and div.classes:includes("callout-tip") and (div.attributes["for"] ~= nil or owner ~= nil)
  assert(not role or not solution, "Для решения нельзя дополнительно задавать course-role")
  return role or (solution and "solution") or (hint and "hint") or nil
end

function M.describe(div, defaults, owner)
  local kind = M.kind(div, owner)
  local educational = M.is_activity(div) or M.activities[kind]
  local values = {}
  for _, key in ipairs(vocabulary.activityAttributes) do
    local value = div.attributes[key]
    assert(value == nil or educational, key .. " допустим только для exr-* или роли деятельности course-role")
    values[key] = value
  end
  values.requirement = div.attributes.requirement
  assert(values.requirement == nil or kind == "reading", "Атрибут requirement допустим только при course-role=reading")
  assert(div.attributes["for"] == nil or (kind and not M.is_activity(div)),
    "Атрибут for связывает учебный блок с упражнением и недопустим у самого упражнения")
  local metadata = M.metadata(values)
  if educational and defaults then
    for key, value in pairs(defaults) do
      if metadata[key] == nil and (not M.is_exercise(div) or key == "workMode") then metadata[key] = value end
    end
  end
  return kind, metadata
end
return M
