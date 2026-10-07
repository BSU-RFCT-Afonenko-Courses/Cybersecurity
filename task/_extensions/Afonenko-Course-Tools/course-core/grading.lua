local M = {}

local function exercise(node) return node.identifier:match("^ex[rm]%-") or node.attributes.target end
local function notes(node) return node.classes:includes("grading-notes") end

-- Примечания преподавателя относятся к заданию и хранятся отдельно от его условия.
function M.prepare(doc)
  local total, contained = 0, 0
  doc:walk({Div = function(node)
    if notes(node) then total = total + 1 end
    if exercise(node) then
      pandoc.Pandoc(node.content):walk({Div = function(child)
        if notes(child) then contained = contained + 1 end
      end})
    end
    if notes(node) then
      assert(not exercise(node), "Блок grading-notes не может сам быть заданием")
      pandoc.Pandoc(node.content):walk({Div = function(child)
        assert(not notes(child), "Блоки grading-notes нельзя вкладывать друг в друга")
        assert(not exercise(child), "Блок grading-notes не может содержать задание")
        assert(not child.classes:includes("task-items"), "Блок grading-notes не может содержать task-items")
      end})
    end
  end})
  assert(total == contained, "Каждый блок grading-notes должен относиться ровно к одному заданию")
  if total > 0 then
    assert(doc.meta.course.view, "Для grading-notes явно задайте course.view: student или full")
    if pandoc.utils.stringify(doc.meta.course.view) == "student" then
      doc = doc:walk({Div = function(node) if notes(node) then return {} end end})
    end
  end
  return doc
end

function M.split(blocks)
  local collected = pandoc.List()
  local body = pandoc.Pandoc(blocks):walk({Div = function(node)
    if notes(node) then
      collected:insert(pandoc.write(pandoc.Pandoc(node.content), "json"))
      return {}
    end
  end})
  return pandoc.write(body, "json"), collected
end

return M
