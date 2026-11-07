-- Только transport текущего Core producer; условия и metadata разрешает Quarto.
return function(doc)
  local manual=os.getenv('COURSE_CORE_TS_RUN')
  if manual then
    local f=assert(io.open(manual,'rb'));local request=pandoc.json.decode(f:read('*a'));f:close()
    return request,manual
  end
  local route=pandoc.utils.stringify(doc.meta['course-core-runtime'] or 'native-ts')
  assert(route=='native-ts','CORE.METADATA_INVALID: неизвестный Core runtime')
  local root=assert(quarto.project.directory,'OPERATION_BINDING: нет project owner')
  local function read(path)
    local f=assert(io.open(path,'rb'),'OPERATION_INCOMPLETE: отсутствует '..path)
    local value=pandoc.json.decode(f:read('*a'));f:close();return value
  end
  local base=pandoc.path.join({root,'_generated/course-spec/native-ts'})
  local active=read(pandoc.path.join({base,'active.json'}))
  assert(type(active.operation)=='string' and active.operation:match('^[a-f0-9%-]+$') and active.directory==pandoc.path.join({base,active.operation}),'OPERATION_BINDING: чужой native pointer')
  local state=read(pandoc.path.join({active.directory,'state.json'}))
  assert(state.operation==active.operation and state.root==root and state.directory==active.directory,'OPERATION_BINDING: чужой bound state')
  local reservation_file=io.open(pandoc.path.join({active.directory,'reservation.json'}),'rb')
  local child
  if reservation_file then
    local reservation=pandoc.json.decode(reservation_file:read('*a'));reservation_file:close()
    child=reservation.children[#reservation.children]
    assert(reservation.status=='bound' and reservation.operation==state.operation and child and child.used and not child.posted and child.token==os.getenv('COURSE_CORE_CAPTURE_TOKEN'),'OPERATION_BINDING: чужой/завершённый child capture')
  end
  local input=quarto.doc.input_file
  if pandoc.path.is_relative(input) then input=pandoc.path.join({root,input}) end
  input=pandoc.path.normalize(input)
  for index,source in ipairs(state.inputs) do
    if pandoc.path.normalize(pandoc.path.join({root,source}))==input then
      if child then local found=false;for _,requested in ipairs(child.inputs) do if requested==source then found=true end end;assert(found,'OPERATION_BINDING: source вне active child') end
      local path=pandoc.path.join({active.directory,tostring(index-1)..'.request.json'})
      return read(path),path
    end
  end
  error('OPERATION_BINDING: input отсутствует в текущей операции')
end
