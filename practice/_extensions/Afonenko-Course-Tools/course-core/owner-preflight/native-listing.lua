-- Finite stock Listing input witness. Public Pandoc readers only; the actual
-- incoming document and its Header identities are never changed here.
local M={}
-- Stock Quarto redefines global error() as a logging function. Builtin assert
-- must stop the invocation at the first failed relationship.
local function fail(reason) assert(false,'SOURCE.NATIVE_LISTING_UNSUPPORTED: '..reason) end
local function bytes(path)
  local file=assert(io.open(path,'rb'),'SOURCE.NATIVE_LISTING_INPUT_MISSING: '..path)
  local value=file:read('*all');file:close();return value
end
local function write_new(path,value)
  local directory=pandoc.path.directory(path)
  pandoc.system.make_directory(directory,true)
  -- Directory entries also expose dangling links; opening a target would not.
  for _,entry in ipairs(pandoc.system.list_directory(directory)) do
    assert(entry~=pandoc.path.filename(path),'SOURCE.DUPLICATE_OBSERVATION: '..path)
  end
  local file=assert(io.open(path,'wb'));file:write(value);file:close()
end
local function body(doc) return pandoc.write(pandoc.Pandoc(doc.blocks),'json') end
local function shape(blocks) return body(pandoc.Pandoc(blocks)) end
local function parsed(doc) return pandoc.json.decode(body(doc),false) end
local function array(values)
  local result=pandoc.List();for _,value in ipairs(values or {}) do result:insert(value) end;return result
end
local function map(values)
  local result={};for key,value in pairs(values or {}) do result[key]=value end;return result
end
local function options()
  local value=PANDOC_READER_OPTIONS
  return {abbreviations=map(value.abbreviations),columns=value.columns,
    default_image_extension=value.default_image_extension,extensions=array(value.extensions),
    indented_code_classes=array(value.indented_code_classes),standalone=value.standalone,
    strip_comments=value.strip_comments,tab_stop=value.tab_stop,track_changes=value.track_changes}
end
local function canonical(value)
  if type(value)~='table' then return pandoc.json.encode(value) end
  if value[1]~=nil or next(value)==nil then
    local parts={};for _,item in ipairs(value) do parts[#parts+1]=canonical(item) end
    return '['..table.concat(parts,',')..']'
  end
  local keys={};for key in pairs(value) do keys[#keys+1]=key end;table.sort(keys)
  local parts={};for _,key in ipairs(keys) do parts[#parts+1]=pandoc.json.encode(key)..':'..canonical(value[key]) end
  return '{'..table.concat(parts,',')..'}'
end
local function same(a,b) return canonical(a)==canonical(b) end
local function walk(value,path,visit,ancestors)
  if type(value)~='table' then return end
  ancestors=ancestors or {}
  if value.t then
    visit(value,path,ancestors)
    local parents=ancestors
    if value.t=='Div' then
      parents={};for _,parent in ipairs(ancestors) do parents[#parents+1]=parent end
      parents[#parents+1]={kind='Div',id=value.c[1][1],classes=value.c[1][2],attributes=value.c[1][3]}
    end
    walk(value.c,path..'/c',visit,parents)
  elseif value[1]~=nil then
    for index,item in ipairs(value) do walk(item,path..'/'..(index-1),visit,ancestors) end
  else
    local keys={};for key in pairs(value) do keys[#keys+1]=key end;table.sort(keys)
    for _,key in ipairs(keys) do walk(value[key],path..'/'..key,visit,ancestors) end
  end
end
local function raw_carriers(doc)
  local result={}
  walk(parsed(doc).blocks,'/blocks',function(node,path)
    if (node.t=='RawBlock' or node.t=='RawInline') and node.c[1]=='html' then
      result[#result+1]={path=path,kind=node.t,format=node.c[1],text=node.c[2],ordinal=#result+1}
    end
  end)
  return result
end
local function walk_attributes(value,path,visit)
  if type(value)~='table' then return end
  if #value==3 and type(value[1])=='string' and type(value[2])=='table' and type(value[3])=='table' then
    local is_attr=true
    for _,class in ipairs(value[2]) do if type(class)~='string' then is_attr=false end end
    for _,attribute in ipairs(value[3]) do
      if type(attribute)~='table' or #attribute~=2 or type(attribute[1])~='string' or type(attribute[2])~='string' then is_attr=false end
    end
    if is_attr then visit(value,path) end
  end
  if value[1]~=nil then
    for index,item in ipairs(value) do walk_attributes(item,path..'/'..(index-1),visit) end
  else
    local keys={};for key in pairs(value) do keys[#keys+1]=key end;table.sort(keys)
    for _,key in ipairs(keys) do walk_attributes(value[key],path..'/'..key,visit) end
  end
end
local base64_alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64_decode(value)
  if type(value)~='string' or #value%4~=0 or value:find('[^A-Za-z0-9+/=]') then fail('noncanonical envelope key') end
  local bits,bitcount,result=0,0,{}
  local padding=value:match('(=*)$')
  if #padding>2 or value:sub(1,#value-#padding):find('=') then fail('noncanonical envelope key') end
  for i=1,#value-#padding do
    local number=assert(base64_alphabet:find(value:sub(i,i),1,true))-1
    bits=bits*64+number;bitcount=bitcount+6
    if bitcount>=8 then
      bitcount=bitcount-8;local divisor=2^bitcount
      result[#result+1]=string.char(math.floor(bits/divisor));bits=bits%divisor
    end
  end
  if bits~=0 or (#padding==1 and bitcount~=2) or (#padding==2 and bitcount~=4) or (#padding==0 and bitcount~=0) then
    fail('noncanonical envelope key')
  end
  return table.concat(result)
end
local function attr(node,id,classes,attributes)
  return node and same(node.c[1],{id,classes,attributes or {}})
end
local function envelope_key(block)
  if block.t~='Para' or #block.c~=1 then fail('noncanonical appended inline envelope') end
  local span=block.c[1]
  if span.t~='Span' or span.c[1][1]~='' or not same(span.c[1][2],{'hidden','quarto-markdown-envelope-contents'}) or
    #span.c[1][3]~=1 or span.c[1][3][1][1]~='render-id' then fail('noncanonical appended inline envelope') end
  return base64_decode(span.c[1][3][1][2])
end
local metadata_order={'quarto-metatitle','quarto-twittercardtitle','quarto-ogcardtitle','quarto-metasitename',
  'quarto-twittercarddesc','quarto-ogcardddesc'}
local function appended(doc,prefix_count)
  local blocks=parsed(doc).blocks
  if #blocks~=prefix_count+3 then fail('complete native append cardinality') end
  local ids={'quarto-navigation-envelope','quarto-listing-pipeline','quarto-meta-markdown'}
  local result={}
  for index,id in ipairs(ids) do
    local block=blocks[prefix_count+index]
    if not block or block.t~='Div' or not attr(block,id,{'hidden'}) then fail('complete native append wrapper/order') end
    result[index]=block
  end
  local nav=result[1].c[2]
  if #nav<3 then fail('incomplete navigation envelope') end
  local index=1
  if envelope_key(nav[index])~='quarto-int-sidebar-title' then fail('navigation envelope order') end;index=index+1
  if envelope_key(nav[index])~='quarto-int-navbar-title' then fail('navigation envelope order') end;index=index+1
  for _,key in ipairs({'quarto-int-next','quarto-int-prev'}) do
    if nav[index] and envelope_key(nav[index])==key then index=index+1 end
  end
  local seen={}
  while nav[index] and envelope_key(nav[index]):sub(1,#'quarto-int-sidebar:')=='quarto-int-sidebar:' do
    local key=envelope_key(nav[index]);if seen[key] then fail('duplicate navigation envelope key') end
    seen[key]=true;index=index+1
  end
  if index~=#nav or not envelope_key(nav[index]):match('^quarto%-breadcrumbs%-') then fail('navigation envelope order') end
  local metadata=result[3].c[2]
  local previous=0
  for _,block in ipairs(metadata) do
    local key=envelope_key(block);local found
    for ordinal,expected in ipairs(metadata_order) do if key==expected then found=ordinal end end
    if not found or found<=previous then fail('metadata envelope order') end;previous=found
  end
  return result
end
local function prefix(doc,count)
  local result=pandoc.List();for index=1,count do
    if not doc.blocks[index] then fail('authored prefix truncated') end;result:insert(doc.blocks[index])
  end
  return pandoc.Pandoc(result,doc.meta)
end
local function plain_header(header,subject)
  subject=subject or 'book part Source Header'
  local extra_attributes=false
  if header then for _ in pairs(header.attributes) do extra_attributes=true end end
  if not header or header.t~='Header' or header.level~=1 or extra_attributes or
    (#header.classes~=0 and not (#header.classes==1 and header.classes[1]=='unnumbered')) then
    fail('unsupported '..subject)
  end
  for _,inline in ipairs(header.content) do if inline.t~='Str' and inline.t~='Space' then fail('rich '..subject) end end
  if #header.content==0 then fail('empty '..subject) end
end
local function source_prefix(doc,source_doc,source_bytes,reader,constructor,witness)
  local blocks=source_doc.blocks
  if constructor=='book-part-title-transfer' then
    local header=blocks[1];plain_header(header)
    local noauto=pandoc.read(source_bytes,reader..'-auto_identifiers',PANDOC_READER_OPTIONS)
    local original_noauto=noauto.blocks[1];plain_header(original_noauto)
    if original_noauto.identifier~='' then fail('authored book part Source Header ID') end
    local expected=header:clone();expected.identifier=''
    if shape({expected})~=shape({original_noauto}) then fail('book part Source reader identity') end
    local title=pandoc.json.decode(pandoc.write(pandoc.Pandoc({}, {title=doc.meta.title}), 'json'),false).meta.title
    local header_json=pandoc.json.decode(shape({header}),false).blocks[1]
    if not title or title.t~='MetaInlines' or not same(title.c,header_json.c[3]) then fail('actual book part title transfer') end
    witness.sourceHeaderWitness={ordinaryHeader=shape({header}),noAutoHeader=shape({original_noauto}),
      actualTitle=pandoc.write(pandoc.Pandoc({}, {title=doc.meta.title}), 'json')}
    blocks=pandoc.List();for index=2,#source_doc.blocks do blocks:insert(source_doc.blocks[index]) end
  elseif constructor~='identity' then fail('unproved Source input constructor') end
  local authored=pandoc.Pandoc(blocks,doc.meta)
  if body(prefix(doc,#blocks))~=body(authored) then fail('authored prefix differs') end
  return authored
end
local function destinations(doc,source_doc,declarations)
  local source_nodes,current_nodes={},{}
  local source_ids,current_ids={},{}
  local function count(target)
    return function(at)
      if at[1]~='' then target[at[1]]=(target[at[1]] or 0)+1 end
    end
  end
  local function collect(target)
    return function(node,path,ancestors)
      if node.t=='Div' and node.c[1][1]~='' then
        local id=node.c[1][1];target[id]=target[id] or {}
        target[id][#target[id]+1]={id=id,path=path,ancestry=ancestors,attr=node.c[1],content=node.c[2]}
      end
    end
  end
  walk(parsed(source_doc).blocks,'/blocks',collect(source_nodes))
  walk(parsed(doc).blocks,'/blocks',collect(current_nodes))
  walk_attributes(parsed(source_doc).blocks,'/blocks',count(source_ids))
  walk_attributes(parsed(doc).blocks,'/blocks',count(current_ids))
  local result={}
  for _,declaration in ipairs(declarations) do
    local id=declaration.id
    if not source_nodes[id] or #source_nodes[id]~=1 or not current_nodes[id] or #current_nodes[id]~=1 or source_ids[id]~=1 or current_ids[id]~=1 then
      assert(false,'SOURCE.NATIVE_LISTING_DESTINATION_INVALID: missing/ambiguous '..tostring(id))
    end
    local expected,actual=source_nodes[id][1],current_nodes[id][1]
    if not same(expected.attr,actual.attr) or not same(expected.content,actual.content) or
      not same(expected.ancestry,actual.ancestry) then
      assert(false,'SOURCE.NATIVE_LISTING_DESTINATION_INVALID: replaced/reparented/moved '..id)
    end
    result[id]={id=id,path=actual.path,ancestry=actual.ancestry}
  end
  return result
end
local function projected_ancestry(ancestors)
  local result={}
  for _,ancestor in ipairs(ancestors) do
    local classes,attributes={},{}
    for _,class in ipairs(ancestor.classes) do
      if class~='content-visible' and class~='content-hidden' and not class:match('^when%-') and not class:match('^unless%-') then
        classes[#classes+1]=class
      end
    end
    for _,attribute in ipairs(ancestor.attributes) do
      if attribute[1]~='when-profile' and attribute[1]~='unless-profile' then attributes[#attributes+1]=attribute end
    end
    result[#result+1]={kind=ancestor.kind,id=ancestor.id,classes=classes,attributes=attributes}
  end
  return result
end
-- Wire arrays are typed only after destination equality has been proved.
-- Keep the internal AST/ancestry records unchanged for those comparisons.
local function wire_destination(destination)
  local ancestors=array()
  for _,ancestor in ipairs(destination.ancestry) do
    local attributes=array()
    for _,attribute in ipairs(ancestor.attributes) do attributes:insert(array(attribute)) end
    ancestors:insert({kind=ancestor.kind,id=ancestor.id,
      classes=array(ancestor.classes),attributes=attributes})
  end
  return {id=destination.id,path=destination.path,ancestry=ancestors}
end
local function coverage(doc,matched)
  local by_path={};for _,item in ipairs(matched) do
    if by_path[item.path] then fail('duplicate consumed carrier') end;by_path[item.path]=item
  end
  local result=array();for _,carrier in ipairs(raw_carriers(doc)) do
    local item=by_path[carrier.path]
    if item then
      if carrier.kind~=item.kind or carrier.format~=item.format or carrier.text~=item.text then fail('carrier occurrence mismatch') end
      result[#result+1]=carrier;by_path[carrier.path]=nil
    end
  end
  if next(by_path) then fail('missing consumed carrier') end
  return result
end
local function row_headers(plan,reader,root)
  local result={}
  for _,declaration in ipairs(plan.declarations) do
    for _,row in ipairs(declaration.rows) do
      if not result[row.source] and row.title.kind=='source-header' then
        local source_bytes=bytes(pandoc.path.join({root,row.source}))
        if #source_bytes~=row.sourceBytes or pandoc.utils.sha1(source_bytes)~=row.sourceSha1 then fail('row Source bytes differ') end
        if row.reader~=plan.reader then fail('row public reader configuration differs') end
        local candidate=pandoc.read(source_bytes,reader,PANDOC_READER_OPTIONS)
        local header=candidate.blocks[1]
        plain_header(header,'row title Header')
        result[row.source]={header=pandoc.json.decode(shape({header}),false).blocks[1],plaintext=pandoc.utils.stringify(header.content),
          shape=shape({header}),reader=reader,sourceSha1=row.sourceSha1,sourceBytes=row.sourceBytes}
      end
    end
  end
  return result
end
function M.collect(doc,session,active,source,project)
  local key=active.profile..':'..source
  local plan=session.nativeListingPlans and session.nativeListingPlans[key]
  if not plan then return nil end
  local phase=active.identity and 'identity' or active.phase
  local input_path=assert(session.nativeListingInputs and session.nativeListingInputs[key] and session.nativeListingInputs[key][phase],
    'SOURCE.NATIVE_LISTING_SERVICE_PATH_MISSING')
  local witness_path=assert(session.nativeListingWitnesses and session.nativeListingWitnesses[key] and session.nativeListingWitnesses[key][phase],
    'SOURCE.NATIVE_LISTING_SERVICE_PATH_MISSING')
  local reader=active.identity and session.identityReaders[key] or plan.reader
  local witness={protocol=1,active=active,planKey=key,planHash=plan.planHash,providerHash=plan.providerHash,
    source=source,inputPath=input_path,reader=reader,options=options(),nativeShape=body(doc),
    providerEnvironment={bin=os.getenv('QUARTO_BIN_PATH'),share=os.getenv('QUARTO_SHARE_PATH'),deno=os.getenv('QUARTO_DENO')},
    context={source=source,profile=active.profile,phase=active.phase,effectiveBase=source,
      outputDirectory=quarto.project.output_directory,outputFile=quarto.doc.output_file}}
  local result
  local ok,reason=pcall(function()
    if #PANDOC_STATE.input_files~=1 then fail('native input cardinality') end
    witness.input=bytes(PANDOC_STATE.input_files[1]);write_new(input_path,witness.input)
    if plan.protocol~=1 or plan.key~=key or plan.root~=active.root or plan.profile~=active.profile or plan.source~=source or
      not same(plan.appendOrder,{'quarto-navigation-envelope','quarto-listing-pipeline','quarto-meta-markdown'}) then fail('frozen plan context differs') end
    if reader~=(active.identity and 'markdown-auto_identifiers' or 'markdown') then fail('public reader unsupported') end
    local replay=pandoc.read(witness.input,reader,PANDOC_READER_OPTIONS)
    witness.fullReplayShape=body(replay)
    if witness.nativeShape~=witness.fullReplayShape then fail('full native reader replay differs') end
    local source_bytes=bytes(pandoc.path.join({active.root,source}))
    if #source_bytes~=plan.sourceBytes or pandoc.utils.sha1(source_bytes)~=plan.sourceSha1 then fail('emitting Source bytes differ') end
    local source_doc=pandoc.read(source_bytes,reader,PANDOC_READER_OPTIONS)
    witness.sourceShape=body(source_doc)
    local authored=source_prefix(doc,source_doc,source_bytes,reader,plan.inputConstructor,witness)
    local projected=project(doc:clone())
    local projected_source=project(authored:clone())
    if body(prefix(projected,#projected_source.blocks))~=body(projected_source) then fail('projected authored prefix differs') end
    local raw_append=appended(doc,#authored.blocks)
    local projected_append=appended(projected,#projected_source.blocks)
    if not same(raw_append,projected_append) then fail('native append changed by projection') end
    local raw_destinations=destinations(doc,authored,plan.declarations)
    local projected_destinations=destinations(projected,projected_source,plan.declarations)
    for id,raw_destination in pairs(raw_destinations) do
      if not same(projected_ancestry(raw_destination.ancestry),projected_destinations[id].ancestry) then
        assert(false,'SOURCE.NATIVE_LISTING_DESTINATION_INVALID: reparented/moved '..id)
      end
    end
    -- Duplicate authored transport markers could redirect the stock selector.
    local protected={}
    for _,block in ipairs(raw_append) do protected[block.c[1][1]]=true end
    local native_keys={}
    walk(raw_append,'/append',function(node)
      if node.t=='Div' or node.t=='Span' then for _,attribute in ipairs(node.c[1][3]) do
        if attribute[1]=='render-id' then native_keys[attribute[2]]=true end
      end end
    end)
    walk_attributes(parsed(authored).blocks,'/blocks',function(at)
      if protected[at[1]] then fail('authored native envelope clone') end
      for _,attribute in ipairs(at[3]) do if attribute[1]=='render-id' and native_keys[attribute[2]] then fail('authored native contents clone') end end
    end)
    local constructors=require('./native-listing-constructors')
    witness.rowHeaders=row_headers(plan,reader,active.root)
    local verified=constructors.verify(doc,plan,{listingBlock=raw_append[2],rawBody=parsed(doc),sourceBody=parsed(authored),
      rowHeaders=witness.rowHeaders,options=PANDOC_READER_OPTIONS,reader=reader,identity=active.identity==true,prefixCount=#authored.blocks})
    local raw_matches={}
    local raw_start='/blocks/'..(#authored.blocks+1)
    for _,carrier in ipairs(verified.carrierOccurrences) do
      if carrier.path:sub(1,3)~='/c/' then fail('constructor carrier path unsupported') end
      raw_matches[#raw_matches+1]={path=raw_start..carrier.path,kind=carrier.kind,format=carrier.format,text=carrier.text}
    end
    local projected_matches={}
    local projected_start='/blocks/'..(#projected_source.blocks+1)
    for _,carrier in ipairs(raw_matches) do
      if carrier.path:sub(1,#raw_start+1)~=raw_start..'/' then fail('consumed carrier outside Listing append') end
      projected_matches[#projected_matches+1]={path=projected_start..carrier.path:sub(#raw_start+1),
        kind=carrier.kind,format=carrier.format,text=carrier.text}
    end
    witness.prefix={constructor=plan.inputConstructor,sourceBlockCount=#source_doc.blocks,nativeBlockCount=#authored.blocks,
      shape=body(authored),projectedShape=body(projected_source)}
    witness.suffix={rawShape=canonical(raw_append),projectedShape=canonical(projected_append)}
    witness.carrierTrace={raw=coverage(doc,raw_matches),projected=coverage(projected,projected_matches)}
    witness.addresses=array()
    for _,projection in ipairs({'raw','projected'}) do
      local destination_map=projection=='raw' and raw_destinations or projected_destinations
      for _,edge in ipairs(verified.addresses) do
        witness.addresses[#witness.addresses+1]={source=source,profile=active.profile,phase=active.phase,projection=projection,
          planKey=key,declarationId=edge.declarationId,declarationIndex=edge.declarationIndex,rowIndex=edge.rowIndex,
          targetSource=edge.targetSource,sourceHref=edge.sourceHref,
          destination=wire_destination(assert(destination_map[edge.declarationId]))}
      end
    end
    witness.constructorTrace=verified.trace
    witness.status='ok'
    result={nativeListingWitness={inputPath=input_path,witnessPath=witness_path},nativeListingAddresses=witness.addresses,
      rawCoverage=witness.carrierTrace.raw,projectedCoverage=witness.carrierTrace.projected,projectedDoc=projected}
  end)
  if not ok then witness.status='unsupported';witness.reason=tostring(reason) end
  write_new(witness_path,pandoc.json.encode(witness))
  assert(ok,reason)
  return result
end
return M
