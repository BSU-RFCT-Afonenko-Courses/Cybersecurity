local diagnostics = require("./diagnostics")
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

local function profile_name(value, node, field)
  assert(type(value) == "string" and value:match("^[a-z][a-z0-9%-]*$"), diagnostics.format("CORE.VISIBILITY_INVALID", "Условие видимости должно содержать одно имя профиля в нижнем регистре, например full", {id=node.identifier,field=field}))
  return value
end

-- Отбор по профилю предшествует извлечению модели; форматирование Quarto
-- не должно определять публикацию оцениваемых заданий и закрытых исходников.
local function condition(node)
  for _,class in ipairs(node.classes) do
    assert(not class:match('^when%-') and not class:match('^unless%-'), diagnostics.format("CORE.VISIBILITY_INVALID", 'Краткие классы when-/unless- не поддерживаются; используйте штатные content-visible/content-hidden и when-profile/unless-profile', {id=node.identifier,field="visibility"}))
  end
  local when,unless=node.attributes['when-profile'],node.attributes['unless-profile']
  if not when and not unless then return nil end
  local visible=node.classes:includes('content-visible')
  local hidden=node.classes:includes('content-hidden')
  assert(not (visible and hidden), diagnostics.format("CORE.VISIBILITY_INVALID", 'Элемент не может одновременно иметь классы content-visible и content-hidden', {id=node.identifier,field="visibility"}))
  assert(visible or hidden, diagnostics.format("CORE.VISIBILITY_INVALID", 'Атрибуты when-profile/unless-profile требуют класса content-visible или content-hidden', {id=node.identifier,field="visibility"}))
  when=when and profile_name(when, node, "when-profile")
  unless=unless and profile_name(unless, node, "unless-profile")
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
  local bank=contract.bank(doc.meta)
  local export=doc.meta["course-export-context"]==true
  local raw = doc.meta.course and doc.meta.course.view
  local view = override or (raw and pandoc.utils.stringify(raw) or nil)
  assert(not view or views[view], diagnostics.format("CORE.VIEW_INVALID", "course.view должен принимать значение student или full", {field="course.view"}))
  local active = {}
  for _,name in ipairs(quarto.project.profile or {}) do active[name] = true end
  -- Public projection changes only the audience; native feature profiles survive.
  if override then active.student,active.full=nil,nil;active[override]=true end
  assert(not (active.student and active.full), diagnostics.format("CORE.PROFILES_INVALID", "Профили student и full нельзя включать одновременно", {field="profiles"}))
  assert(not view or not ((active.student and view ~= "student") or (active.full and view ~= "full")), diagnostics.format("CORE.VIEW_INVALID", "course.view не соответствует выбранному профилю Quarto", {field="course.view"}))
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
        assert(not bank or not contract.is_example(div) or not indexed[div.identifier], diagnostics.format("CORE.SOLUTION_PAIRING_INVALID", 'Повторный идентификатор примера '..div.identifier, {id=div.identifier,field="id"}))
        local purpose=div.attributes['course-role']
        -- Control page inclusion is owned by native project file lists.
        local statement=bank and contract.is_exercise(div) and contract.statement_visibility(div,doc.meta) or nil
        if view=='student' and statement=='restricted' and not export then visible=false end
        indexed[div.identifier]={purpose=purpose,visible=visible,example=contract.is_example(div),statementVisibility=statement}
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
    return fragment:walk({traverse='topdown',Div=function(div)
      if div.identifier:match('^sol%-') or div.classes:includes('solution') then
        assert(not bank or div.identifier=='' or not solutions[div.identifier], diagnostics.format("CORE.DUPLICATE_DECLARATION", 'Повторный идентификатор учебного элемента: '..div.identifier, {id=div.identifier,field="id"}))
        local related=contract.related(div,indexed,owner)
        if div.identifier~='' then solutions[div.identifier]=related end
        if related then div.attributes['data-course-solution-owner']=related end
      end
      div.content=index_solutions(pandoc.Pandoc(div.content),
        contract.is_activity(div) and div.identifier or owner).blocks
      return div,false
    end})
  end
  doc=index_solutions(doc,nil)
  -- Only a currently active native run can defer unknown cross-document
  -- membership to post-render facts. Filters-only/partial local output fails
  -- closed without consulting historical sidecars or constructing URLs.
  local defer=doc.meta["course-current-native-run"]==true and quarto.doc.is_format('html')
  if view=='student' and not export then
    doc=doc:walk({Div=function(div)
      if not div.classes:includes('task-items') then return end
      for _,list in ipairs(div.content) do
        if list.t=='OrderedList' or list.t=='BulletList' then
          local kept=pandoc.List()
          for _,item in ipairs(list.content) do
            local member
            pandoc.Pandoc(item):walk({Cite=function(cite) if #cite.citations==1 then member=cite.citations[1].id end end})
            local fact=member and indexed[member]
            if member and (fact and fact.visible or not fact and defer) then
              if defer then
                local blocks=pandoc.List({pandoc.RawBlock('html','<!--course-assignment:'..member..':start--><template>')})
                blocks:extend(item)
                blocks:insert(pandoc.RawBlock('html','</template><!--course-assignment:'..member..':end-->'))
                kept:insert(blocks)
              else kept:insert(item) end
            end
          end
          list.content=kept
        end
      end
      return div
    end})
    if defer then
      local headers=doc.meta['header-includes'] or pandoc.MetaList({})
      if headers.t~='MetaList' then headers=pandoc.MetaList({headers}) end
      headers:insert(pandoc.MetaBlocks({pandoc.RawBlock('html','<style>.task-items li:has(.course-assignment-omitted){display:none}</style>')}))
      doc.meta['header-includes']=headers
    end
  end
  local before = member_count(doc)
  local function project(node)
    local visible=keep(node)
    if node.t=='Div' then
      local own=indexed[node.identifier]
      local related=node.attributes['for']
      if node.identifier:match('^sol%-') then related=solutions[node.identifier] end
      if node.classes:includes('solution') then related=node.attributes['data-course-solution-owner'] or related end
      node.attributes['data-course-solution-owner']=nil
      local task=related and indexed[related]
      if own and not own.visible then visible=false end
      if task and not task.visible and (bank or task.purpose~=nil or node.attributes['course-role']~=nil) then visible=false end
      if view=='student' then
        if node.classes:includes('grading-notes') then visible=false end
        if bank and (node.identifier:match('^sol%-') or node.classes:includes('solution')) then
          if not task or task.statementVisibility~='open' or task.example or task.purpose~='demonstration' then visible=false end
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

-- Native crossref AST is ready only after Quarto's normal filters. Keep its
-- exact HTML outside main while the native book resolver and search run.
function M.defer_native_assignments(doc)
  if not quarto.doc.is_format('html') then return doc end
  return doc:walk({Div=function(div)
    if not div.classes:includes('task-items') then return end
    for _,list in ipairs(div.content) do
      if list.t=='OrderedList' or list.t=='BulletList' then
        for index,item in ipairs(list.content) do
          local first,last=item[1],item[#item]
          local member=first and first.t=='RawBlock' and first.text:match('^<!%-%-course%-assignment:(exr%-[a-z0-9%-]+):start%-%-><template>')
          if member and last and last.t=='RawBlock' and last.text=='</template><!--course-assignment:'..member..':end-->' then
            local native=pandoc.List()
            for i=2,#item-1 do native:insert(item[i]) end
            quarto.doc.include_text('after-body','<!--course-assignment-pending:'..member..':start--><div hidden inert>'..pandoc.write(pandoc.Pandoc(native),'html')..'</div><!--course-assignment-pending:'..member..':end-->')
            list.content[index]=pandoc.List({pandoc.RawBlock('html','<!--course-assignment:'..member..':start--><template></template><!--course-assignment:'..member..':end-->')})
          end
        end
      end
    end
    return div
  end})
end
return M
