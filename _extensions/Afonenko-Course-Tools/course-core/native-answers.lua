local diagnostics = require("./diagnostics")
-- Validate answer banks in the actual AST before audience projection.
local M={}
local directory=pandoc.path.directory(debug.getinfo(1,"S").source:sub(2))
local schema=pandoc.path.join({directory,'body-export/answer.cue'})
local function vet(data, context)
  return pandoc.system.with_temporary_directory('course-answer',function(temp)
    local file=assert(io.open(temp..'/answer.yaml','w'));file:write(data);file:close()
    local ok,result=pcall(pandoc.pipe,os.getenv('CUE') or 'cue',{'export',schema,temp..'/answer.yaml','-e','answer','--out','json'},'')
    assert(ok, diagnostics.format("ANSWER_INVALID", 'Не удалось проверить контракт ответа с помощью CUE: '..tostring(result), context))
    return pandoc.json.decode(result)
  end)
end
function M.validate(doc)
  local answers={}
  if not require("./pedagogy/contract").bank(doc.meta) then return answers end
  local function walk(fragment,owner,role)
    fragment:walk({traverse='topdown',Div=function(div)
      assert(not div.classes:includes("answer-spec"), diagnostics.format("ANSWER_INVALID", "Банк ответов должен быть CodeBlock", {id=owner and owner.id or div.identifier,field="answer"}))
      local nextowner=owner
      if div.identifier:match('^ex[rm]%-') then nextowner={id=div.identifier,banks=0,choices=0} end
      local nextrole=role
      if div.classes:includes('solution') or div.identifier:match('^sol%-') then assert(role~='solution', diagnostics.format("ANSWER_INVALID", 'Решения нельзя вкладывать друг в друга', {id=nextowner and nextowner.id or div.identifier,field="answer"}));nextrole='solution' end
      if div.classes:includes('grading-notes') then nextrole='notes' end
      if div.classes:includes('answer') then
        assert(nextowner and not role, diagnostics.format("ANSWER_INVALID", 'Ответ должен принадлежать упражнению вне закрытых блоков', {id=owner and owner.id,field="answer"}))
        assert(div.attributes.type=='single-choice' and #div.content==1 and div.content[1].t=='BulletList', diagnostics.format("ANSWER_INVALID", 'Ответ single-choice должен содержать один BulletList', {id=nextowner.id,field="answer"}))
        nextowner.choices=nextowner.choices+1
        local count,correct=0,-1
        for index,item in ipairs(div.content[1].content) do pandoc.Pandoc(item):walk({Span=function(span)
          if span.classes:includes('correct') then count=count+1;correct=index-1 end
        end}) end
        vet('answer: '..pandoc.json.encode({type='single-choice',count=#div.content[1].content,correct=correct,markedCount=count}),{id=nextowner.id,field='answer'})
        local projected=pandoc.Pandoc(div.content):walk({Span=function(span) if span.classes:includes('correct') then return span.content end end})
        answers[nextowner.id]={answerType='single-choice',publicAnswerJson=pandoc.write(projected,'json'),closedKey={correct=correct}}
        nextrole='answer'
      end
      walk(pandoc.Pandoc(div.content),nextowner,nextrole)
      if div.identifier:match('^ex[rm]%-') then assert(nextowner.banks+nextowner.choices<=1, diagnostics.format("ANSWER_INVALID", 'У упражнения может быть только один банк ответов', {id=nextowner and nextowner.id,field="answer"})) end
      return div,false
    end,CodeBlock=function(block)
      assert(not block.classes:includes('answer'), diagnostics.format("ANSWER_INVALID", 'Ответ с вариантами должен быть Div', {id=owner and owner.id,field="answer"}))
      if block.classes:includes('answer-spec') then
        assert(owner and not role, diagnostics.format("ANSWER_INVALID", 'Банк ответа должен принадлежать упражнению вне закрытых блоков', {id=owner and owner.id,field="answer"}))
        owner.banks=owner.banks+1
        local bank=vet('answer:\n  '..block.text:gsub('\n','\n  ')..'\n',{id=owner.id,field='answer'})
        local function para(text) return pandoc.Para({pandoc.Str(text)}) end
        local function project(a)
          if a.type=='numeric' then return {para('Ответ: ____________________')} end
          if a.type=='manual' then return {para('Ответ: ________________________________________')} end
          local blocks={}
          if a.type=='multipart' then for _,part in ipairs(a.parts) do blocks[#blocks+1]=para(part.label);for _,b in ipairs(project(part)) do blocks[#blocks+1]=b end end
          elseif a.type=='matching' then
            blocks[#blocks+1]=para('Условия');local prompts={};for _,p in ipairs(a.prompts) do prompts[#prompts+1]={para(p)} end;blocks[#blocks+1]=pandoc.BulletList(prompts)
            blocks[#blocks+1]=para('Варианты');local options={};for _,p in ipairs(a.options) do options[#options+1]={para(p)} end;blocks[#blocks+1]=pandoc.BulletList(options);blocks[#blocks+1]=para('Соответствия: ____________________')
          end
          return blocks
        end
        answers[owner.id]={answerType=bank.type,publicAnswerJson=pandoc.write(pandoc.Pandoc(project(bank)),'json'),closedKey=bank}
      end
    end,Span=function(span)
      if span.classes:includes('correct') then assert(role=='answer', diagnostics.format("ANSWER_INVALID", 'Маркер correct допустим только внутри ответа', {id=owner and owner.id,field="answer"})) end
    end})
  end
  walk(doc,nil,nil)
  return answers
end
return M
