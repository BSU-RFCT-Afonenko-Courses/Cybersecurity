local M = {}
local vocabulary = require("./vocabulary")
local contract = require("./pedagogy/contract")
local views = {}; for _, view in ipairs(vocabulary.views) do views[view] = true end

local function member_count(doc)
  local count = 0
  doc:walk({Div = function(node)
    if node.classes:includes("task-items") then count = count + 1 end
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
  for _,class in ipairs(node.classes) do
    assert(not class:match('^when%-') and not class:match('^unless%-'),
      'Краткие классы when-/unless- не поддерживаются; используйте штатные content-visible/content-hidden и when-profile/unless-profile')
  end
  local when,unless=node.attributes['when-profile'],node.attributes['unless-profile']
  if not when and not unless then return nil end
  local visible=node.classes:includes('content-visible')
  local hidden=node.classes:includes('content-hidden')
  assert(not (visible and hidden), 'Элемент не может одновременно иметь классы content-visible и content-hidden')
  assert(visible or hidden, 'Атрибуты when-profile/unless-profile требуют класса content-visible или content-hidden')
  when=when and profile_name(when)
  unless=unless and profile_name(unless)
  local other=false
  for key, _ in pairs(node.attributes) do
    if (key:match("^when%-") or key:match("^unless%-"))
      and key ~= "when-profile" and key ~= "unless-profile" then other=true end
  end
  return {when = when, unless = unless, invert = hidden, other = other}
end

local function strip(node,test,match)
  node.attributes["when-profile"], node.attributes["unless-profile"] = nil, nil
  -- Native conditions combine with AND. A failed profile makes a hidden
  -- conjunction impossible; otherwise Quarto evaluates its remaining terms.
  if test.other and match then return end
  if test.other and test.invert then
    for key,_ in pairs(node.attributes) do
      if key:match("^when%-") or key:match("^unless%-") then node.attributes[key]=nil end
    end
  end
  node.classes = node.classes:filter(function(class)
    return class ~= "content-visible" and class ~= "content-hidden"
  end)
end

function M.prepare(doc, override)
  local raw = doc.meta.course and doc.meta.course.view
  local view = override or (raw and pandoc.utils.stringify(raw) or nil)
  assert(not view or views[view], "course.view должен принимать значение student или full")
  local active = {}
  for _,name in ipairs(quarto.project.profile or {}) do active[name] = true end
  -- Public projection changes only the audience; native feature profiles survive.
  if override then active.student,active.full=nil,nil;active[override]=true end
  assert(not (active.student and active.full), "Профили student и full нельзя включать одновременно")
  assert(not view or not ((active.student and view ~= "student") or (active.full and view ~= "full")),
    "course.view не соответствует выбранному профилю Quarto")
  if view then active[view] = true end

  if doc.meta["course-export-context"] == true then
    -- Publication audience may gate an entire task/work and its ancestor
    -- containers. Export keeps those identities, while audience predicates
    -- inside each task still project its participant condition normally.
    local marker="data-course-export-identity-scope"
    local function mark(fragment,ancestors,inside)
      return fragment:walk({traverse="topdown",Div=function(div)
        local activity=contract.is_exercise(div)
        if not inside and (activity or div.classes:includes("task-items")) then
          div.attributes[marker]="true"
          for _,ancestor in ipairs(ancestors) do ancestor.attributes[marker]="true" end
        end
        local chain={table.unpack(ancestors)}; chain[#chain+1]=div
        div.content=mark(pandoc.Pandoc(div.content),chain,inside or activity).blocks
        return div,false
      end,Span=function(span)
        local chain={table.unpack(ancestors)}; chain[#chain+1]=span
        span.content=mark(pandoc.Pandoc({pandoc.Plain(span.content)}),chain,inside).blocks[1].content
        return span,false
      end})
    end
    doc=mark(doc,{},false)
    local function identity_scope(node)
      if node.attributes[marker]~="true" then return nil end
      node.attributes[marker]=nil
      condition(node) -- validate native author syntax before bypassing audience
      for _,key in ipairs({"when-profile","unless-profile"}) do
        if node.attributes[key]=="student" or node.attributes[key]=="full" then node.attributes[key]=nil end
      end
      local remaining=false
      for key,_ in pairs(node.attributes) do
        if key:match("^when%-") or key:match("^unless%-") then remaining=true end
      end
      if not remaining then
        node.classes=node.classes:filter(function(class) return class~="content-visible" and class~="content-hidden" end)
      end
      return node
    end
    doc=doc:walk({Div=identity_scope,Span=identity_scope})
  end

  -- Скрытые ветви тоже проверяются: ошибки разметки не зависят от профиля.
  local validate = function(node) condition(node) end
  doc:walk({Div = validate, Span = validate, CodeBlock = validate})
  -- Index the original expanded document before removing any branch. A paired
  -- solution outside its task still inherits the task's closed context.
  local function matches(test)
    return (not test.when or active[test.when] == true)
      and (not test.unless or not active[test.unless])
  end
  local function keep(node)
    local test = condition(node)
    if not test then return true end
    local match=matches(test)
    if test.invert and test.other then return true end
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
        -- Control page inclusion is owned by native project file lists.
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
      if view=='student' then
        if node.classes:includes('grading-notes') then visible=false end
        if not quarto.doc.is_format('revealjs') and (node.identifier:match('^sol%-') or node.classes:includes('solution')) then
          if not task or (not task.example and task.purpose~='demonstration') then visible=false end
        end
      end
    end
    if view=='student' and node.t=='CodeBlock' and node.classes:includes('answer-spec') then visible=false end
    if not visible then return {} end
    if view=='student' and node.t=='Span' and node.classes:includes('correct') then return node.content end
    local test=condition(node)
    if test then strip(node,test,matches(test)) end
    return node
  end
  doc = doc:walk({traverse = "topdown", Div = project, Span = project, CodeBlock = project})
  -- Скрытая контрольная не имеет состава заданий; публичная контрольная PL сохраняется.
  if before > 0 and member_count(doc) == 0 then doc.meta.assessment = nil end
  return doc
end

return M
