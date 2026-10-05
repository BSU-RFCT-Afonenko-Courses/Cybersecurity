-- Mechanical application of the current installed producer/CUE decision.
-- No YAML decoding, answer cardinality decision or independent visibility policy.
local M={}
function M.apply(doc,decision,source)
  assert(decision.schema=='course-answer-projection-v1' and decision.source==source and decision.profile=='student','BODY.PROJECTION_IDENTITY')
  local expected={}
  for _,q in ipairs(decision.questions) do
    assert(not expected[q.id],'BODY.PROJECTION_DUPLICATE')
    expected[q.id]={banks=q.answerSpecCount,correct=q.correctMarkerCount,seen=0}
  end
  local result=doc:walk({traverse='topdown',Div=function(div)
    local count=expected[div.identifier]
    if not count then return end
    count.seen=count.seen+1
    local banks,correct=0,0
    local body=pandoc.Pandoc(div.content):walk({CodeBlock=function(block)
      if block.classes:includes('answer-spec') then banks=banks+1;return {} end
    end,Span=function(span)
      if span.classes:includes('correct') then correct=correct+1;return span.content end
    end})
    assert(banks==count.banks and correct==count.correct,'BODY.PROJECTION_COUNT_MISMATCH')
    div.content=body.blocks
    return div,false
  end})
  for _,count in pairs(expected) do assert(count.seen==1,'BODY.PROJECTION_MISSING') end
  return result
end
return M
