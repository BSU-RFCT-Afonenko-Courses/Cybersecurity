local diagnostics = require("../diagnostics")
local contract = require("./contract")
local grading = require("../grading")
local M = {}

local function title(div)
  if div.attributes.title then return div.attributes.title end
  local first = div.content[1]
  return first and first.t == "Header" and pandoc.utils.stringify(first) or nil
end

-- Содержимое уже отобрано по профилю. Индекс штатных узлов exr включает
-- вопросы без оценивания, сохраняя состав оцениваемых заданий.
local function exercise_index(doc,facts)
  local indexed = {}
  doc:walk({traverse="topdown", Div=function(div)
    if div.classes:includes("grading-notes") then return div, false end
    if contract.is_activity(div) and (contract.bank(doc.meta) or div.attributes["course-role"] or facts[div.identifier] and facts[div.identifier].purpose) then
      assert(div.identifier:match("^ex[rm]%-[a-z0-9][a-z0-9%-]*$"), diagnostics.format("CORE.EXERCISE_INVALID", "Недопустимый идентификатор упражнения: " .. div.identifier, {id=div.identifier,field="id"}))
      assert(not indexed[div.identifier], diagnostics.format("CORE.DUPLICATE_DECLARATION", "Повторный идентификатор упражнения: " .. div.identifier, {id=div.identifier,field="id",related={{id=div.identifier,source=quarto.doc.input_file}}}))
      indexed[div.identifier] = true
    end
  end})
  return indexed
end

function M.collect(doc,facts)
  facts=facts or require("../exercise-defaults").normalize(doc)
  local bank = contract.bank(doc.meta)
  local defaults = contract.defaults(doc.meta)
  local indexed = exercise_index(doc,facts)
  local result, identities = pandoc.List(), {}
  local function walk(document, owner)
    return document:walk({traverse="topdown", Div=function(div)
      if div.classes:includes("grading-notes") then return div, false end
      local fact=facts[div.identifier]
      local eligible=bank or div.attributes["course-role"] or owner or fact and fact.purpose
      local kind, metadata
      if eligible then kind,metadata=contract.describe(div, defaults, owner) else metadata={} end
      local own = contract.is_activity(div) and (bank or div.attributes["course-role"]~=nil or fact and fact.purpose~=nil)
      local related = contract.related(div, indexed, owner)
      if eligible and div.attributes["for"] then
        assert(indexed[related], diagnostics.format("CORE.PEDAGOGY_REFERENCE_INVALID", "Атрибут for должен указывать на видимое упражнение текущего документа: " .. related, {id=div.identifier,field="for",related={{id=related}}}))
        assert(not owner or owner == related, diagnostics.format("CORE.PEDAGOGY_REFERENCE_CONFLICT", "Атрибут for противоречит окружающему упражнению: " .. related, {id=div.identifier,field="for",related={{id=related},{id=owner}}}))
      end
      if fact then kind=fact.purpose or (bank and "exercise" or kind);metadata.difficulty=fact.difficulty;metadata.time=fact.time end
      if kind then
        local id = div.identifier ~= "" and div.identifier or nil
        if id then
          assert(not identities[id], diagnostics.format("CORE.DUPLICATE_DECLARATION", "Повторный идентификатор учебного элемента: " .. id, {id=div.identifier,field="id",related={{id=id,source=quarto.doc.input_file}}}))
          identities[id] = true
        end
        -- grading-notes хранятся в отдельном поле полного представления.
        local body = grading.split(div.content)
        result:insert({kind=kind, id=id, exercise=not own and related or nil,
          title=title(div), metadata=next(metadata) and metadata or nil,
          bodyJson=body, order=#result + 1})
      end
      -- Явная рекурсия сохраняет принадлежность блоков; false предотвращает
      -- повторный обход поддерева и дублирование фактов.
      walk(pandoc.Pandoc(div.content), own and div.identifier or owner)
      return div, false
    end})
  end
  walk(doc, nil)
  if #result == 0 and not defaults then return nil end
  return {elements=result, defaults=defaults and next(defaults) and defaults or nil}
end
return M
