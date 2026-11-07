-- Только штатная native identity и транспорт; предметный договор декодирует TS.
local dir=pandoc.path.directory(debug.getinfo(1,'S').source:gsub('^@',''))
return {{Pandoc=function(doc)
  local loader=dofile(pandoc.path.join({dir,'request.lua'}))
  local request,path=loader(doc)
  assert(request,'OPERATION_BINDING: отсутствует native-ts route')
  local context=request.context
  if not os.getenv('COURSE_CORE_TS_RUN') then
    local bank=doc.meta['exercise-bank']
    assert(bank==nil or type(bank)=='boolean','CORE.METADATA_INVALID: exercise-bank требует boolean')
    local role=pandoc.utils.stringify(doc.meta['course-core-role'] or (bank and 'exercise-bank' or 'page'))
    if doc.meta['course-core-role'] and bank~=nil then assert((role=='exercise-bank')==bank,'CORE.METADATA_INVALID: role/exercise-bank conflict') end
    doc.meta['course-core-role']=pandoc.MetaString(role)
    assert(role=='exercise-bank' or role=='page','OPERATION_UNQUALIFIED: native role')
    context.exerciseBank=role=='exercise-bank'
    local course=doc.meta.course or {}
    local native_view=pandoc.utils.stringify(course.view or '')
    local projection=doc.meta['course-core-projection'] and pandoc.utils.stringify(doc.meta['course-core-projection']) or (native_view=='full' and 'author' or native_view=='student' and 'student' or 'student')
    assert(projection==context.projection,'DOCUMENT_BINDING: course.view/native projection отличается')
    if native_view~='' then assert(native_view==(projection=='author' and 'full' or 'student'),'DOCUMENT_BINDING: course.view conflict') end
    doc.meta['course-core-projection']=pandoc.MetaString(projection)
    local fields={target=true,['course-role']=true,['statement-visibility']=true,difficulty=true,time=true,['project-check']=true}
    context.defaults={}
    for key,value in pairs(doc.meta) do
      local field=key:match('^default%-exercise%-(.+)$')
      if field then
        assert(fields[field],'CORE.METADATA_INVALID: неизвестный default '..key)
        if value~=false then
          local kind=pandoc.utils.type(value)
          assert(kind=='string' or kind=='Inlines','CORE.METADATA_INVALID: default требует скаляр или false')
          local text=pandoc.utils.stringify(value)
          context.defaults[field]=field=='time' and tonumber(text) or text
        end
      end
    end
    local defaults=doc.meta['exercise-defaults']
    if defaults then
      for key,value in pairs(defaults) do
        local text=pandoc.utils.stringify(value)
        local actual=key=='time' and tonumber(text) or text
        assert(context.defaults[key]==nil or context.defaults[key]==actual,'CORE.METADATA_INVALID: conflicting default '..key)
        context.defaults[key]=actual
      end
    end
  end
  local input=quarto.doc.input_file
  if pandoc.path.is_relative(input) then input=pandoc.path.join({assert(quarto.project.directory),input}) end
  assert(pandoc.path.normalize(input)==context.input,'DOCUMENT_BINDING: native input отличается')
  local identifier=quarto.format.format_identifier()
  local native_format=identifier['target-format']
  assert((native_format=='html' or native_format=='revealjs') and identifier['base-format']==native_format and FORMAT==native_format,'DOCUMENT_BINDING: native format не квалифицирован')
  if os.getenv('COURSE_CORE_TS_RUN') then
    assert(context.format==native_format,'DOCUMENT_BINDING: native format отличается')
  else context.format=native_format end
  assert(pandoc.utils.stringify(doc.meta['course-core-projection'] or '')==context.projection,'DOCUMENT_BINDING: native projection отличается')
  assert(doc.meta['course-core-ts-context']==nil,'DOCUMENT_BINDING: вход уже имеет служебный context')
  assert(doc.meta['course-core-ts-request']==nil,'DOCUMENT_BINDING: авторский request запрещён')
  doc.meta['course-core-ts-request']=pandoc.MetaString(path)
  doc.meta['course-core-ts-context']=pandoc.MetaString(pandoc.json.encode(context))
  if request.assignment then
    assert(doc.meta['course-core-producer-evidence']==nil,'DOCUMENT_BINDING: авторский producer evidence')
    doc.meta['course-core-producer-evidence']=pandoc.MetaString(pandoc.json.encode({filters=param('quarto-filters'),shortcodes=param('shortcodes',{}),engine=param('execution-engine'),format=native_format}))
  end
  local projected=pandoc.utils.run_json_filter(doc,pandoc.path.join({dir,'early-filter.sh'}),{FORMAT})
  return projected
end}}
