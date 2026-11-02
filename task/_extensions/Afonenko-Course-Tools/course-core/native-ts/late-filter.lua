-- Post-render: условия и custom nodes уже разрешил сам Quarto.
local dir=pandoc.path.directory(debug.getinfo(1,'S').source:gsub('^@',''))
local occurrences=pandoc.List()
local introductions=pandoc.List()
local function clean(div)
  div.attributes['data-course-core-occurrence']=nil
  div.attributes['data-course-core-native-kind']=nil
  return div
end
return {{
  Div=function(div)
    local key=div.attributes['data-course-core-occurrence']
    local assessment_key=div.attributes['data-course-core-assessment']
    if assessment_key then
      local fragment=pandoc.Pandoc(div.content):walk({Div=function(d)
        if d.attributes['data-course-core-occurrence'] then return {} end
        return clean(d)
      end})
      introductions[#introductions+1]={key=assessment_key,body=pandoc.json.decode(pandoc.write(fragment,'json')).blocks}
    end
    if key then
      local title
      local fragment=pandoc.Pandoc(div.content):walk({Div=clean,Span=function(span)
        local title_key=span.attributes['data-course-core-native-title']
        if title_key then
          assert(title_key==key and not title,'DOCUMENT_BINDING: foreign/duplicate native title')
          title=pandoc.json.decode(pandoc.write(pandoc.Pandoc({pandoc.Plain(span.content)}),'json')).blocks[1].c
          return span.content
        end
      end})
      local body=pandoc.json.decode(pandoc.write(fragment,'json')).blocks
      occurrences[#occurrences+1]={key=key,body=body,title=title,nativeKind=div.attributes['data-course-core-native-kind'] or 'Div',anchor=div.identifier}
    end
  end,
  Pandoc=function(doc)
    if not doc.meta['course-core-ts-binding'] then
      error('OPERATION_INCOMPLETE: отсутствует early binding')
    end
    local request=dofile(pandoc.path.join({dir,'request.lua'}))(doc)
    assert(request,'OPERATION_BINDING: отсутствует late request')
    local binding=doc.meta['course-core-ts-binding']
    local context=pandoc.json.decode(pandoc.utils.stringify(binding))
    local identifier=quarto.format.format_identifier()
    local native_format=identifier['target-format']
    assert((native_format=='html' or native_format=='revealjs') and identifier['base-format']==native_format and FORMAT==native_format and context.format==native_format,'DOCUMENT_BINDING: late native format отличается')
    local expected_profiles=request.context.profiles or (os.getenv('COURSE_CORE_TS_RUN') and pandoc.List())
    assert(context.operation==request.context.operation and context.captureWitness==request.context.captureWitness and context.input==request.context.input and context.projection==request.context.projection and pandoc.json.encode(context.profiles)==pandoc.json.encode(expected_profiles),'DOCUMENT_BINDING: чужой late request')
    local output=request.capture..'.late.json'
    local exists=io.open(output,'rb');if exists then exists:close();error('DOCUMENT_BINDING: late sidecar уже существует') end
    local writer=assert(io.open(output,'wb'));local late={context=context,occurrences=occurrences}
    if request.assignment then
      for _,intro in ipairs(introductions) do
        local matched
        for _,selected in ipairs(request.assignment.assessments) do
          if selected.source==request.assignment.source and intro.key==context.operation..':'..context.captureWitness..':assessment:'..selected.id then matched=selected.id end
        end
        assert(matched,'BODY.ASSESSMENT_OCCURRENCE_MISMATCH: foreign introduction');intro.id=matched
      end
      late.assignment={introductions=introductions}
    else assert(#introductions==0,'BODY.ASSESSMENT_OCCURRENCE_MISMATCH: unexpected introduction') end
    writer:write(pandoc.json.encode(late));writer:close()
    if not os.getenv('COURSE_CORE_TS_RUN') then
      local output=quarto.doc.output_file
      local body=pandoc.json.decode(pandoc.write(doc:walk({Div=clean,Span=function(span) if span.attributes['data-course-core-native-title'] then return span.content end end}),'json')).blocks
      local native=assert(io.open(request.capture..'.native.json','wb'))
      local observedDoc=pandoc.Pandoc(doc.blocks,{course={view=pandoc.MetaString(context.projection=='author' and 'full' or 'student')}})
      local observation=dofile(pandoc.path.join({dir,'../native-resources.lua'})).facts(observedDoc,observedDoc,{})
      local data={output=output,body=body,role=pandoc.utils.stringify(doc.meta['course-core-role'] or 'page'),resources=observation.capturedFiles}
      if request.assignment then
        -- Только фактические data/resource declarations Quarto, не журнал модулей.
        local path=os.getenv('QUARTO_FILTER_DEPENDENCY_FILE')
        assert(path,'BODY.PRODUCER_DEPENDENCY_UNQUALIFIED: missing declaration file')
        local file=assert(io.open(path,'rb'));local text=file:read('*a');file:close()
        assert(#text<=16*1024*1024,'BODY.PRODUCER_DEPENDENCY_UNQUALIFIED: declaration limit')
        data.assignmentDeclarations=pandoc.List()
        for line in text:gmatch('[^\r\n]+') do
          assert(#data.assignmentDeclarations<16384,'BODY.PRODUCER_DEPENDENCY_UNQUALIFIED: declaration count')
          data.assignmentDeclarations:insert(pandoc.json.decode(line))
        end
      end
      native:write(pandoc.json.encode(data));native:close()
    end
    doc.meta['course-core-ts-binding']=nil
    doc.meta['course-core-processed']=nil
    return doc:walk({Div=clean,Span=function(span) if span.attributes['data-course-core-native-title'] then return span.content end end})
  end
}}
