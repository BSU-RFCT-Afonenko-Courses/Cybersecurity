-- Validate answer banks in the actual AST before audience projection.
local M={}
local directory=pandoc.path.directory(debug.getinfo(1,"S").source:sub(2))
local schema=pandoc.path.join({directory,'body-export/answer.cue'})
local function vet(data)
  return pandoc.system.with_temporary_directory('course-answer',function(temp)
    local file=assert(io.open(temp..'/answer.yaml','w'));file:write(data);file:close()
    local ok,err=pcall(pandoc.pipe,os.getenv('CUE') or 'cue',{'vet',schema,temp..'/answer.yaml','-c'},'')
    assert(ok,'ANSWER_INVALID: '..tostring(err))
    return pandoc.json.decode(pandoc.pipe(os.getenv('CUE') or 'cue',{'export',schema,temp..'/answer.yaml','-e','answer','--out','json'},''))
  end)
end
function M.validate(doc)
  local answers={}
  local function walk(fragment,owner,role)
    fragment:walk({traverse='topdown',Div=function(div)
      assert(not div.classes:includes("answer-spec"),"ANSWER_INVALID: bank must be CodeBlock")
      local nextowner=owner
      if div.identifier:match('^ex[rm]%-') then nextowner={id=div.identifier,banks=0,choices=0} end
      local nextrole=role
      if div.classes:includes('solution') or div.identifier:match('^sol%-') then assert(role~='solution','ANSWER_INVALID: nested solution');nextrole='solution' end
      if div.classes:includes('grading-notes') then nextrole='notes' end
      if div.classes:includes('answer') then
        assert(nextowner and not role,'ANSWER_INVALID: answer ownership')
        assert(div.attributes.type=='single-choice' and #div.content==1 and div.content[1].t=='BulletList','ANSWER_INVALID: choice structure')
        nextowner.choices=nextowner.choices+1
        local count,correct=0,-1
        for index,item in ipairs(div.content[1].content) do pandoc.Pandoc(item):walk({Span=function(span)
          if span.classes:includes('correct') then count=count+1;correct=index-1 end
        end}) end
        vet('answer: '..pandoc.json.encode({type='single-choice',count=#div.content[1].content,correct=correct,markedCount=count}))
        local projected=pandoc.Pandoc(div.content):walk({Span=function(span) if span.classes:includes('correct') then return span.content end end})
        answers[nextowner.id]={answerType='single-choice',publicAnswerJson=pandoc.write(projected,'json')}
        nextrole='answer'
      end
      walk(pandoc.Pandoc(div.content),nextowner,nextrole)
      if div.identifier:match('^ex[rm]%-') then assert(nextowner.banks+nextowner.choices<=1,'ANSWER_INVALID: multiple answer banks') end
      return div,false
    end,CodeBlock=function(block)
      assert(not block.classes:includes('answer'),'ANSWER_INVALID: choice must be Div')
      if block.classes:includes('answer-spec') then
        assert(owner and not role,'ANSWER_INVALID: bank ownership')
        owner.banks=owner.banks+1
        local bank=vet('answer:\n  '..block.text:gsub('\n','\n  ')..'\n')
        local function para(text) return pandoc.Para({pandoc.Str(text)}) end
        local function project(a)
          if a.type=='numeric' then return {para('Answer: ____________________')} end
          if a.type=='manual' then return {para('Response: ________________________________________')} end
          local blocks={}
          if a.type=='multipart' then for _,part in ipairs(a.parts) do blocks[#blocks+1]=para(part.label);for _,b in ipairs(project(part)) do blocks[#blocks+1]=b end end
          elseif a.type=='matching' then
            blocks[#blocks+1]=para('Prompts');local prompts={};for _,p in ipairs(a.prompts) do prompts[#prompts+1]={para(p)} end;blocks[#blocks+1]=pandoc.BulletList(prompts)
            blocks[#blocks+1]=para('Options');local options={};for _,p in ipairs(a.options) do options[#options+1]={para(p)} end;blocks[#blocks+1]=pandoc.BulletList(options);blocks[#blocks+1]=para('Matches: ____________________')
          end
          return blocks
        end
        answers[owner.id]={answerType=bank.type,publicAnswerJson=pandoc.write(pandoc.Pandoc(project(bank)),'json')}
      end
    end,Span=function(span)
      if span.classes:includes('correct') then assert(role=='answer','ANSWER_INVALID: orphan correct marker') end
    end})
  end
  walk(doc,nil,nil)
  return answers
end
return M
