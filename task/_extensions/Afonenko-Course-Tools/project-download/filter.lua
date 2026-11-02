-- Extended native AST остаётся в Lua. В TS передаётся только один малый batch.
local dir=pandoc.path.directory(debug.getinfo(1,'S').source:gsub('^@',''))
local transport=dofile(pandoc.path.join({dir,'request-transport.lua'}))
local metrics=require('./observability/bridge').create_metrics('project-download',1)
local walk=metrics.wrap_walk({id='project-download.filter.walk',kind='ast_walk',scope='full-document'},function(node,filter)return node:walk(filter)end)
local function fail(message)assert(false,'DOWNLOAD.REQUEST_INVALID: '..message..'\nфайл: '..tostring(quarto.doc.input_file or ''))end
local function plain(value)
 if type(value)=='boolean' or type(value)=='number' or type(value)=='string' then return value end
 local kind=pandoc.utils.type(value)
 if kind=='Inlines' or kind=='MetaInlines' or kind=='Blocks' or kind=='MetaBlocks' then return pandoc.utils.stringify(value) end
 local result={};for key,child in pairs(value or {}) do result[key]=plain(child) end;return result
end
return {{Pandoc=function(doc)
 local context=transport.context();local calls=transport.drain(context.key)
 local root=quarto.project.directory
 local exercises,visible,seen={},{},{}
 local nextOrdinal=#calls
 doc=walk(doc,{Div=function(div)if div.identifier~='' then exercises[div.identifier]=plain(div.attributes) end end,
 Span=function(span)
  if span.classes:includes('project-download-raw-request') then
   local raw=span.attributes['data-project-download-ordinal'];local ordinal=tonumber(raw)
   if not ordinal or ordinal%1~=0 or ordinal<0 or tostring(ordinal)~=raw or not calls[ordinal+1] or seen[ordinal] then fail('Чужой или повторный native ordinal') end
   seen[ordinal]=true;local call=calls[ordinal+1];call.inline=true;visible[#visible+1]=call
  elseif span.classes:includes('project-download-request') then
   local positional,named=pandoc.List({span.attributes.resource}),pandoc.List()
   for key,value in pairs(span.attributes) do
    if key=='kind' then named:insert({key=key,value=value}) elseif key~='resource' then fail('Чужой literal request attribute') end
   end
   named:insert({key='text',value=pandoc.utils.stringify(span.content)})
   local call={ordinal=nextOrdinal,positional=positional,named=named,inline=true};nextOrdinal=nextOrdinal+1
   span.attributes['data-project-download-ordinal']=tostring(call.ordinal);visible[#visible+1]=call;return span
  end
 end})
 local requests=pandoc.List();for _,call in ipairs(visible) do requests:insert(call) end
 for _,call in ipairs(calls) do if not call.inline then requests:insert(call) end end
 local native=pandoc.utils.stringify(doc.meta['course-core-runtime'] or '')=='native-ts'
 local processed=doc.meta['course-core-processed']==true
 local request={source=context.source,resources=pandoc.List(),configuration=plain(doc.meta['project-download']),native=native}
 if processed then request.courseProcessed=true end
 local decisions={}
 if #requests>0 then
  local batch={source=context.source,native=native,courseProcessed=processed,configuration=plain(doc.meta['project-download']),exercises=exercises,artifactContext=plain(doc.meta['course-artifact-context']),requests=requests}
  if doc.meta['project-download']==nil then batch.configuration=nil end
  if doc.meta.course and doc.meta.course.view then batch.view=pandoc.utils.stringify(doc.meta.course.view) end
  local carrier=pandoc.Pandoc({}, {['project-download-native-batch']=pandoc.MetaString(pandoc.json.encode(batch))})
  local result=pandoc.utils.run_json_filter(carrier,pandoc.path.join({dir,'native-ts/late-filter.sh'}),{FORMAT})
  local encoded=result.meta['project-download-native-result']
  if not encoded then fail('Отсутствует native Download result') end
  local resolved=pandoc.json.decode(pandoc.utils.stringify(encoded))
  if resolved.source~=context.source or type(resolved.links)~='table' or type(resolved.request)~='table' or resolved.request.source~=context.source or #resolved.links~=#visible then fail('Чужой или неполный Download result') end
  for _,link in ipairs(resolved.links) do
   if type(link.ordinal)~='number' or decisions[link.ordinal] or type(link.href)~='string' or type(link.text)~='string' then fail('Повреждённый Download result ordinal') end
   decisions[link.ordinal]=link
  end
  for _,call in ipairs(visible) do if not decisions[call.ordinal] then fail('Пропущен Download result ordinal') end end
  request=resolved.request
  doc=walk(doc,{Span=function(span)
   if not (span.classes:includes('project-download-request') or span.classes:includes('project-download-raw-request')) then return end
   local ordinal=tonumber(span.attributes['data-project-download-ordinal']);local link=decisions[ordinal]
   if not link then fail('Нет решения для native request') end
   decisions[ordinal]=nil
   return pandoc.Link({pandoc.Str(link.text)},link.href,'',pandoc.Attr('',{'project-download'},{download=''}))
  end})
  for _ in pairs(decisions) do fail('Неиспользованный Download result') end
 end
 local directory=root..'/_generated/project-download/requests';pandoc.system.make_directory(directory,true)
 local file=assert(io.open(directory..'/'..pandoc.utils.sha1(context.source)..'.json','w'));file:write(pandoc.json.encode(request));file:close()
 return doc
end}}
