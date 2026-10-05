local M = {}
local grading = require("./grading")
function M.collect(doc)
  if not doc.meta.assessment then return nil end
  local id, title = "", ""
  local crossref = doc.meta.crossref
  if crossref and crossref["chapter-id"] then
    id = pandoc.utils.stringify(crossref["chapter-id"])
    title = pandoc.utils.stringify(doc.meta.title)
  else
    for _, block in ipairs(doc.blocks) do
      if block.t == "Header" then
        id, title = block.identifier, pandoc.utils.stringify(block.content); break
      end
    end
  end
  local items, sizes = pandoc.List(), pandoc.List()
  local count, kinds = 0, pandoc.List()
  doc:walk({Div = function(div)
    if div.classes:includes("assessment-items") then
      count = count + 1
      for _, block in ipairs(div.content) do
        kinds:insert(block.t)
        if block.t == "BulletList" or block.t == "OrderedList" then
          for _, item in ipairs(block.content) do
            local size = 0
            pandoc.Pandoc(item):walk({Cite = function(cite)
              for _, c in ipairs(cite.citations) do
                items:insert(c.id); size = size + 1
              end
            end})
            sizes:insert(size)
          end
        end
      end
    end
  end})
  local body = grading.split(doc.blocks)
  return {id = id, title = title,
    bodyJson = body,
    kind = pandoc.utils.stringify(doc.meta.assessment.kind), items = items,
    memberContainers = count, memberKinds = kinds, memberSizes = sizes}
end
return M
