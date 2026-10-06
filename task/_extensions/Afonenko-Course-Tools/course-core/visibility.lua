local M = {}
local vocabulary = require("./vocabulary")
local contract = require("./pedagogy/contract")
local views = {}; for _, view in ipairs(vocabulary.views) do views[view] = true end

local function member_count(doc)
  local count = 0
  doc:walk({Div = function(node)
    if node.classes:includes("assessment-items") then count = count + 1 end
  end})
  return count
end

local function profile_name(value)
  assert(type(value) == "string" and value:match("^[a-z][a-z0-9%-]*$"),
    "Условие видимости должно содержать одно имя профиля в нижнем регистре, например full")
  return value
end

-- Отбор по профилю предшествует извлечению модели; форматирование Quarto
-- не должно определять публикацию оцениваемых заданий и закрытых исходников.
local function condition(node)
  local when, unless
  for _, class in ipairs(node.classes) do
    local prefix, name = class:match("^(when)%-(.*)$")
    if not prefix then prefix, name = class:match("^(unless)%-(.*)$") end
    if prefix == "when" then
      assert(not when, "Для одного элемента допустим только один класс .when-<profile>")
      when = profile_name(name)
    elseif prefix == "unless" then
      assert(not unless, "Для одного элемента допустим только один класс .unless-<profile>")
      unless = profile_name(name)
    end
  end
  local visible = node.classes:includes("content-visible")
  local hidden = node.classes:includes("content-hidden")
  local standard_when, standard_unless = node.attributes["when-profile"], node.attributes["unless-profile"]
  if not when and not unless and not standard_when and not standard_unless then return nil end
  assert(not (visible and hidden), "Элемент не может одновременно иметь классы content-visible и content-hidden")
  if when or unless then
    assert(not visible and not hidden and not standard_when and not standard_unless,
      "Нельзя смешивать краткую и стандартную запись условий профиля в одном элементе")
  else
    assert(visible or hidden, "Атрибуты when-profile/unless-profile требуют класса content-visible или content-hidden")
    when = standard_when and profile_name(standard_when)
    unless = standard_unless and profile_name(standard_unless)
  end
  for key, _ in pairs(node.attributes) do
    assert(not ((key:match("^when%-") or key:match("^unless%-"))
      and key ~= "when-profile" and key ~= "unless-profile"),
      "Условия профиля нельзя совмещать с условиями формата или метаданных в одном элементе")
  end
  return {when = when, unless = unless, invert = hidden}
end

local function strip(node)
  node.attributes["when-profile"], node.attributes["unless-profile"] = nil, nil
  node.classes = node.classes:filter(function(class)
    return class ~= "content-visible" and class ~= "content-hidden"
      and not class:match("^when%-") and not class:match("^unless%-")
  end)
end

function M.prepare(doc, override)
  local raw = doc.meta.course and doc.meta.course.view
  local view = override or (raw and pandoc.utils.stringify(raw) or nil)
  assert(not view or views[view], "course.view должен принимать значение student или full")
  local active = {}
  for name in (os.getenv("QUARTO_PROFILE") or ""):gmatch("[^, ]+") do active[name] = true end
  -- Public projection changes only the audience; native feature profiles survive.
  if override then active.student,active.full=nil,nil;active[override]=true end
  assert(not (active.student and active.full), "Профили student и full нельзя включать одновременно")
  assert(not view or not ((active.student and view ~= "student") or (active.full and view ~= "full")),
    "course.view не соответствует выбранному профилю Quarto")
  if view then active[view] = true end

  -- Скрытые ветви тоже проверяются: ошибки разметки не зависят от профиля.
  local validate = function(node) condition(node) end
  doc:walk({Div = validate, Span = validate, CodeBlock = validate})
  -- Index the original expanded document before removing any branch. A paired
  -- solution outside its task still inherits the task's closed context.
  local function keep(node)
    local test = condition(node)
    if not test then return true end
    local match = (not test.when or active[test.when] == true)
      and (not test.unless or not active[test.unless])
    return test.invert and not match or (not test.invert and match)
  end
  local indexed = {}
  local function index(fragment,parent_visible)
    fragment:walk({traverse='topdown',Div=function(div)
      local visible=parent_visible and keep(div)
      if contract.is_activity(div) then
        assert(not contract.is_example(div) or not indexed[div.identifier],
          'CORE.SOLUTION_PAIRING_INVALID: duplicate example '..div.identifier)
        local purpose=div.attributes['course-role']
        visible=visible and (view=='full' or not contract.is_exercise(div) or purpose~='control')
        indexed[div.identifier]={purpose=purpose,visible=visible,example=contract.is_example(div)}
      end
      index(pandoc.Pandoc(div.content),visible)
      return div,false
    end,Span=function(span)
      -- Inline profile containers may own block declarations through a Note.
      -- Walk that native subtree with its inherited condition, just like a Div.
      index(pandoc.Pandoc({pandoc.Plain(span.content)}),parent_visible and keep(span))
      return span,false
    end})
  end
  index(doc,true)
  local solutions={}
  local function index_solutions(fragment,owner)
    fragment:walk({traverse='topdown',Div=function(div)
      if div.identifier:match('^sol%-') then
        assert(not solutions[div.identifier],
          'Повторный идентификатор учебного элемента: '..div.identifier)
        solutions[div.identifier]=contract.related(div,indexed,owner)
      end
      index_solutions(pandoc.Pandoc(div.content),
        contract.is_activity(div) and div.identifier or owner)
      return div,false
    end})
  end
  index_solutions(doc,nil)
  local before = member_count(doc)
  local function project(node)
    local visible=keep(node)
    if node.t=='Div' then
      local own=indexed[node.identifier]
      local related=node.attributes['for']
      if node.identifier:match('^sol%-') then related=solutions[node.identifier] end
      local task=related and indexed[related]
      if own and not own.visible then visible=false end
      if task and not task.visible then visible=false end
      if view~='full' then
        if node.classes:includes('grading-notes') then visible=false end
        if node.identifier:match('^sol%-') or node.classes:includes('solution') then
          if not task or (not task.example and task.purpose~='demonstration') then visible=false end
        end
      end
    end
    if view~='full' and node.t=='CodeBlock' and node.classes:includes('answer-spec') then visible=false end
    if not visible then return {} end
    if view~='full' and node.t=='Span' and node.classes:includes('correct') then return node.content end
    if condition(node) then strip(node) end
    return node
  end
  doc = doc:walk({traverse = "topdown", Div = project, Span = project, CodeBlock = project})
  -- Скрытая контрольная не имеет состава заданий; публичная контрольная PL сохраняется.
  if before > 0 and member_count(doc) == 0 then doc.meta.assessment = nil end
  return doc
end

return M
