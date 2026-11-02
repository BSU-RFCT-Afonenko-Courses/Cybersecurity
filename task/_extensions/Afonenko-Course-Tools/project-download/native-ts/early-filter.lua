-- Технический preflight один раз; TS запускается лишь для actual literal lowering.
local dir=pandoc.path.directory(debug.getinfo(1,'S').source:gsub('^@',''))
local metrics=dofile(pandoc.path.join({pandoc.path.directory(dir),'observability/bridge.lua'})).create_metrics('project-download',1)
local walk=metrics.wrap_walk({id='project-download.early.walk',kind='ast_walk',scope='full-document'},function(node,filter)return node:walk(filter)end)
local transport=dofile(pandoc.path.join({pandoc.path.directory(dir),'request-transport.lua'}))
local reserved={['project-download-request']=true,['project-download-raw-request']=true}
local fields={['project-download-native-source']=true,['project-download-native-batch']=true,['project-download-native-result']=true,['data-project-download-ordinal']=true}
local function fail()assert(false,'DOWNLOAD.DELIVERY_PHASE_UNSUPPORTED: Авторский reserved Download transport')end
return {{Pandoc=function(doc)
 local context=transport.context();transport.begin(context.key)
 local restrictive=transport.restrictive();local literal=false
 local function metadata(value)
  if type(value)~='table' then return end
  for key,child in pairs(value) do if fields[key] then fail() end;metadata(child) end
 end
 metadata(doc.meta)
 local function attribute(node)
  if node.classes then for _,c in ipairs(node.classes) do if reserved[c] then fail() end end end
  if node.attributes then for key in pairs(node.attributes) do if fields[key] then fail() end end end
 end
 local function span(node)
  attribute(node)
  if restrictive and node.classes:includes('quarto-shortcode__') then
   for _,p in ipairs(node.content) do
    if p.t~='Space' and p.t~='SoftBreak' then
     if p.t=='Span' and p.attributes['data-value']=='project-download' then literal=true end
     break
    end
   end
  end
 end
 local filters={Span=span}
 for _,name in ipairs({'Div','Code','CodeBlock','Header','Link','Image','Figure','Table','TableHead','TableBody','TableFoot','Row','Cell'}) do filters[name]=attribute end
 walk(doc,filters)
 -- Ни callbacks, ни model/default policy здесь не исполняются.
 if not literal then return doc end
 doc.meta['project-download-native-source']=pandoc.MetaString(context.source)
 local ok,result=pcall(pandoc.utils.run_json_filter,doc,pandoc.path.join({dir,'early-filter.sh'}),{FORMAT})
 if not ok then transport.abort(context.key);assert(false,result) end
 return result
end}}
