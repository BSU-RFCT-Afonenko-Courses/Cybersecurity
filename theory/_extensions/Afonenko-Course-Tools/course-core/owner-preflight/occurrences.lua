-- Raw public Pandoc facts; CUE alone selects/compares educational declarations.
local M = {}
local function attributes(el)
  local result = pandoc.List()
  local keys = {}; for key in pairs(el.attributes) do table.insert(keys,key) end
  table.sort(keys)
  for _,key in ipairs(keys) do result:insert({key=key,value=el.attributes[key]}) end
  return result
end
local function classes(el)
  local result=pandoc.List(); for _,class in ipairs(el.classes) do result:insert(class) end
  return result
end
function M.collect(doc,source)
  local rows=pandoc.List()
  local scopeOrder=0
  local function walk(fragment,parents,topLevelHeader,ancestorOrders)
    local function capture(el)
      local row={firstKind=el.t=="Div" and el.content[1] and el.content[1].t or "",ancestorOrders=ancestorOrders or pandoc.List(),contentJson=el.t=="Div" and pandoc.write(pandoc.Pandoc(el.content),"json") or "",kind=el.t,id=el.identifier,classes=classes(el),attributes=attributes(el),ancestors=parents,order=#rows+1}
      if el.t=='Header' then
        row.topLevel=topLevelHeader or false
        topLevelHeader=false
        row.level=el.level
        row.title=pandoc.utils.stringify(el.content)
        row.titleJson=pandoc.write(pandoc.Pandoc({pandoc.Plain(el.content)}),'json')
      end
      rows:insert(row)
    end
    local function scope()
      scopeOrder=scopeOrder+1
      local lineage=pandoc.List()
      for _,n in ipairs(ancestorOrders or {}) do lineage:insert(n) end
      lineage:insert(scopeOrder)
      return lineage
    end
    local function blocks(content)
      walk(pandoc.Pandoc(content),parents,false,scope())
    end
    local function container(node) blocks(node.content);return node,false end
    local function listItems(node)
      for _,item in ipairs(node.content) do blocks(item) end
      return node,false
    end
    local function rowsInTable(rows)
      for _,row in ipairs(rows) do for _,cell in ipairs(row.cells) do blocks(cell.contents) end end
    end
    fragment:walk({traverse='topdown',Header=capture,Span=capture,Div=function(div)
      capture(div)
      local lineage=scope()
      local ancestors=pandoc.List();for _,parent in ipairs(parents) do ancestors:insert(parent) end
      ancestors:insert({id=div.identifier,classes=classes(div),attributes=attributes(div)})
      walk(pandoc.Pandoc(div.content),ancestors,false,lineage)
      return div,false
    end,BlockQuote=container,Note=container,BulletList=listItems,OrderedList=listItems,
    DefinitionList=function(node)
      for _,item in ipairs(node.content) do
        blocks({pandoc.Plain(item[1])})
        for _,definition in ipairs(item[2]) do blocks(definition) end
      end
      return node,false
    end,Table=function(node)
      blocks(node.caption.long)
      rowsInTable(node.head.rows)
      for _,body in ipairs(node.bodies) do rowsInTable(body.head);rowsInTable(body.body) end
      rowsInTable(node.foot.rows)
      return node,false
    end,Figure=function(node)
      blocks(node.caption.long);blocks(node.content)
      return node,false
    end})
  end
  -- Native topology, never ID or structural equality: the first topdown Header
  -- in a direct Header block is that block. Header children inside Inline Notes
  -- and Headers in every other top-level block remain nested.
  for _,block in ipairs(doc.blocks) do
    walk(pandoc.Pandoc({block}),pandoc.List(),block.t=='Header')
  end
  -- Preserve native facts; do not infer whether an identifier was authored or automatic.
  local headers=pandoc.List()
  for _,block in ipairs(doc.blocks) do
    if block.t=='Header' then headers:insert({id=block.identifier,title=pandoc.utils.stringify(block.content)}) end
  end
  local crossref=doc.meta.crossref
  -- Compare the actual native reader result, not the outer Quarto reader's options.
  -- Only Header identifiers are neutralized; every other body node remains evidence.
  local nativeShape=pandoc.write(pandoc.Pandoc(doc.blocks),'json')
  local shape=doc:walk({Header=function(header) header.identifier='';return header end})
  return {nativeShape=nativeShape,readerShape=pandoc.write(pandoc.Pandoc(shape.blocks),'json'),assessmentFacts={enabled=doc.meta.assessment~=nil,headers=headers,
      chapterId=crossref and crossref['chapter-id'] and pandoc.utils.stringify(crossref['chapter-id']) or '',
      title=doc.meta.title and pandoc.utils.stringify(doc.meta.title) or ''},source=source,owner=pandoc.utils.stringify(doc.meta.course.id),occurrences=rows,
    assessment=pandoc.write(pandoc.Pandoc({}, {assessment=doc.meta.assessment}), 'json')}
end
return M
