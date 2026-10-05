-- Only raw native facts. Navigation subject predicates are owned by CUE.
local M={}
function M.collect(doc)
  local rows=pandoc.List()
  local function capture(el)
    local attrs=pandoc.List();for key,value in pairs(el.attributes) do attrs:insert({key=key,value=value}) end
    local classes=pandoc.List();for _,value in ipairs(el.classes) do classes:insert(value) end
    rows:insert({kind=el.t,id=el.identifier,classes=classes,attributes=attrs})
  end
  doc:walk({Div=capture,Span=capture,Header=capture,CodeBlock=capture})
  return {assessment=doc.meta.assessment~=nil,pedagogy=doc.meta['course-pedagogy']~=nil,rows=rows}
end
return M
