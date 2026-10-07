-- Domain validation of the current native AST, before audience projection.
local contract = require('./pedagogy/contract')
local pedagogy = require('./pedagogy/collect')
local assessment = require('./assessment')
local vocabulary = require('./vocabulary')
local diagnostics = require('./diagnostics')
local M = {}
local function valid(value, pattern) return type(value)=='string' and value:match(pattern) ~= nil end
local function check(value, code, detail, context) if not value then diagnostics.fail(code, detail or 'Некорректное объявление', context) end end
local function prefix(value, kind) return value:match('^'..kind..'%-') ~= nil end
local function contains(values, value)
  for _,item in ipairs(values) do if item==value then return true end end
  return false
end
local function lineage(parent, child)
  if #parent > #child then return false end
  for index,value in ipairs(parent) do if value~=child[index] then return false end end
  return true
end
local function source_path()
  local root = assert(quarto.project.directory, 'Требуется проект Quarto')
  local source = quarto.doc.input_file
  if pandoc.path.is_relative(source) then source=pandoc.path.join({root,source}) end
  return pandoc.path.make_relative(source,root)
end

-- Each native container has its own scope even when its attributes/content
-- equal a sibling's. An exercise's own heading never supplies its topic.
local function occurrences(doc)
  local rows,scope = {},0
  local function child_scope(parents)
    scope=scope+1
    local result={};for _,value in ipairs(parents) do result[#result+1]=value end
    result[#result+1]=scope
    return result
  end
  local function walk(fragment, ancestors, containers)
    local function blocks(content) walk(pandoc.Pandoc(content),ancestors,child_scope(containers)) end
    local function container(node) blocks(node.content);return node,false end
    local function list_items(node)
      for _,item in ipairs(node.content) do blocks(item) end
      return node,false
    end
    local function table_rows(values)
      for _,row in ipairs(values) do for _,cell in ipairs(row.cells) do blocks(cell.contents) end end
    end
    fragment:walk({traverse='topdown',Header=function(header)
      rows[#rows+1]={node=header,kind='Header',order=#rows+1,ancestors=ancestors,containers=containers}
    end,Div=function(div)
      rows[#rows+1]={node=div,kind='Div',order=#rows+1,ancestors=ancestors,containers=containers}
      local parents={};for _,parent in ipairs(ancestors) do parents[#parents+1]=parent end
      parents[#parents+1]=div
      walk(pandoc.Pandoc(div.content),parents,child_scope(containers))
      return div,false
    end,BlockQuote=container,Note=container,BulletList=list_items,OrderedList=list_items,
    DefinitionList=function(node)
      for _,item in ipairs(node.content) do
        blocks({pandoc.Plain(item[1])})
        for _,definition in ipairs(item[2]) do blocks(definition) end
      end
      return node,false
    end,Table=function(node)
      blocks(node.caption.long);table_rows(node.head.rows)
      for _,body in ipairs(node.bodies) do table_rows(body.head);table_rows(body.body) end
      table_rows(node.foot.rows);return node,false
    end,Figure=function(node)
      blocks(node.caption.long);blocks(node.content);return node,false
    end})
  end
  walk(doc,{},{})
  return rows
end

function M.validate(doc)
  local owner = pandoc.utils.stringify(doc.meta.course.id or '')
  check(owner=='' or valid(owner,'^[a-z][a-z0-9%-]*$'),'CORE.COURSE_INVALID','Идентификатор курса должен состоять из строчных латинских букв, цифр и дефисов', {id=owner,field='course.id',hint='Используйте имя вроде course-demo'})
  local source,rows = source_path(),occurrences(doc)
  local defaults=contract.defaults(doc.meta)
  local identities, facts, domains,activities = {},pandoc.List(),{},{}
  for _,row in ipairs(rows) do
    if row.kind=='Div' and contract.is_activity(row.node) then activities[row.node.identifier]=true end
  end
  for _,row in ipairs(rows) do
    local node,id=row.node,row.node.identifier
    local domain = row.kind=='Header' and prefix(id,'sec') or row.kind=='Div' and
      (contract.is_activity(node) or prefix(id,'sol') or node.classes:includes('solution') or node.attributes['course-role']~=nil or node.attributes.target~=nil)
    if domain and id~='' then
      check(not identities[id],'CORE.DUPLICATE_DECLARATION','Повторный идентификатор учебного элемента: '..id, {id=id,field='id',related={{source=source,id=id}},hint='Назначьте уникальный идентификатор'})
      identities[id]=true;domains[id]=true
    end
    if row.kind=='Header' and prefix(id,'sec') then
      check(valid(id,'^sec%-[a-z0-9][a-z0-9%-]*$'),'CORE.TOPIC_INVALID','Некорректный идентификатор темы: '..id, {id=id,field='id'})
    elseif row.kind=='Div' then
      if contract.is_activity(node) or prefix(id,'sol') then
        check(valid(id,'^ex[rm]%-[a-z0-9][a-z0-9%-]*$') or valid(id,'^sol%-[a-z0-9][a-z0-9%-]*$'),'CORE.EXERCISE_INVALID','Некорректный идентификатор упражнения: '..id, {id=id,field='id'})
      end
      if contract.is_exercise(node) or node.attributes.target~=nil then
        check(contract.is_exercise(node),'CORE.EXERCISE_INVALID','target допустим только у exr-*', {id=id,field='target'})
        for key,_ in pairs(node.attributes) do
          -- Visibility syntax is evaluated by the common native projection.
          check(contract.exerciseAttributes[key] or contract.attributes[key] and key~='for' and key~='requirement'
            or contract.nativeExerciseAttributes[key], 'CORE.EXERCISE_INVALID','Неизвестный атрибут упражнения: '..key, {id=id,field=key})
        end
        check(node.attributes.target==nil or node.attributes.target~='', 'CORE.EXERCISE_INVALID','target не может быть пустым', {id=id,field='target'})
        check(node.attributes.target==nil or node.content[1] and node.content[1].t=='Header', 'CORE.EXERCISE_INVALID','Упражнение с target требует непустой заголовок уровня 1–6', {id=id,field='head'})
        if node.attributes.target~=nil then
          local header=node.content[1]
          check(header.level>=1 and header.level<=6 and pandoc.utils.stringify(header.content)~='', 'CORE.EXERCISE_INVALID','Упражнение с target требует непустой заголовок уровня 1–6', {id=id,field='head'})
        end
        for _,parent in ipairs(row.ancestors) do
          check(not contract.is_exercise(parent) and parent.attributes.target==nil,'CORE.EXERCISE_INVALID','Упражнения нельзя вкладывать друг в друга', {id=id,field='nested'})
        end
        -- Native book processing moves the chapter heading to public metadata.
        local chapter=doc.meta.crossref and doc.meta.crossref['chapter-id']
        local nearest=chapter and pandoc.utils.stringify(chapter) or nil
        for _,header in ipairs(rows) do
          if header.kind=='Header' and header.order<row.order and lineage(header.containers,row.containers) then
            local outside=true
            for _,parent in ipairs(header.ancestors) do if contract.is_activity(parent) then outside=false end end
            if outside then nearest=header.node.identifier end
          end
        end
        facts:insert({id=id,project=node.attributes.project,sourceTopic=nearest and {id=nearest,owner=owner~='' and owner or nil,rootQmd=source} or nil})
      end
      -- Closed grading notes are excluded from public pedagogy extraction,
      -- but their actual Course declarations still require valid metadata
      -- and local pairing before those notes are stripped.
      local activity
      for _,parent in ipairs(row.ancestors) do if contract.is_activity(parent) then activity=parent.identifier end end
      contract.describe(node,defaults,activity)
      local related=contract.related(node,activities,activity)
      if node.attributes['for'] then
        check(activities[related], 'CORE.PEDAGOGY_REFERENCE_INVALID','Атрибут for должен указывать на видимое упражнение текущего документа: '..related, {id=id,field='for',related={{id=related}}})
        check(not activity or activity==related, 'CORE.PEDAGOGY_REFERENCE_CONFLICT','Атрибут for противоречит окружающему упражнению: '..related, {id=id,field='for',related={{id=related},{id=activity}}})
      end
    end
  end
  -- This checks all current pedagogy/solution declarations, including hidden
  -- ones. Visibility still owns profile conditions and closed-context policy.
  pedagogy.collect(doc)
  local rawAssessment = M.assessment(doc)
  return facts,domains,rawAssessment
end

function M.assessment(doc)
  local work=assessment.collect(doc)
  if work then
    check(valid(work.id,'^[a-z][a-z0-9%-]*$') and work.title~='' and contains(vocabulary.assessmentKinds,work.kind)
      and work.memberContainers==1 and #work.memberKinds==1 and contains(vocabulary.memberKinds,work.memberKinds[1]) and #work.items>0,
      'CORE.ASSESSMENT_INVALID','Работа требует корректный ID, название, вид и один непустой список участников', {id=work.id,field='assessment/task-items'})
    local members={}
    for _,size in ipairs(work.memberSizes) do check(size==1,'CORE.ASSESSMENT_INVALID','Каждый пункт работы должен содержать одну ссылку на упражнение', {id=work.id,field='items'}) end
    for _,id in ipairs(work.items) do
      check(not members[id],'CORE.ASSESSMENT_INVALID','Повторный участник работы: '..id, {id=work.id,field='items',related={{id=id}}});members[id]=true
    end
  end
  return work
end

function M.references(doc, original)
  local visible={}
  doc:walk({Header=function(node) visible[node.identifier]=true end,Div=function(node) visible[node.identifier]=true end})
  local root=quarto.project.directory
  local function absolute(path,base)
    if pandoc.path.is_relative(path) then path=pandoc.path.join({base,path}) end
    return pandoc.path.normalize(path)
  end
  local input=absolute(quarto.doc.input_file,root)
  local output=absolute(quarto.doc.output_file,root)
  local output_root=absolute(quarto.project.output_directory or root,root)
  local function current_document(path)
    if path:match('^[%a][%w+.-]*:') or path:match('^//') then return false end
    path=path:gsub('%?.*$','')
    if path=='' then return true end
    if path:sub(1,1)=='/' then
      return absolute(path:sub(2),root)==input or absolute(path:sub(2),output_root)==output
    end
    return absolute(path,pandoc.path.directory(input))==input or
      absolute(path,pandoc.path.directory(output))==output
  end
  local function target(id,explicit)
    local namespace=id:match('^ex[rm]%-') or prefix(id,'sol') or prefix(id,'sec')
    if original[id] or explicit and namespace then check(visible[id],'CORE.PROFILE_REFERENCE_INTEGRITY','Ссылка указывает на отсутствующий в текущем представлении элемент', {id=id,field='reference',hint='Проверьте профиль и условия видимости ссылки и цели'}) end
  end
  doc:walk({Link=function(link)
    local path,id=link.target:match('^([^#]*)#(.+)$')
    if id and current_document(path) then target(id,true) end
  end,Cite=function(cite)
    for _,ref in ipairs(cite.citations) do target(ref.id) end
  end})
end
return M
