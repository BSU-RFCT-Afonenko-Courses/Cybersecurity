local collector=require('./occurrences')
local resources=require('./resources')
local navigation=require('./navigation')
local visibility=require('../visibility')
local answers=require('../body-export/projection')
local reader=require('./reader')
local native_listing=require('./native-listing')
local M={}
local function read(path)
  local f=io.open(path,'r'); if not f then return nil end
  local value=f:read('*a');f:close();return pandoc.json.decode(value)
end
function M.process(doc,project)
  local root=quarto.project.directory
  local meta=doc.meta['course-owner-session']
  local active=root and read(pandoc.path.join({root,'.course-owner/active.json'}))
  if not active and root then
    -- Directory entries retain dangling symlinks; opening the target does not.
    local state_present=false
    for _,entry in ipairs(pandoc.system.list_directory(root)) do
      if entry=='.course-owner' then state_present=true end
    end
    if state_present then
      for _,entry in ipairs(pandoc.system.list_directory(pandoc.path.join({root,'.course-owner'}))) do
        assert(entry~='active.json','SOURCE.INVALID_ATTEMPT: unreadable active locator')
      end
    end
  end
  if not active and not meta then return false end
  assert(active,'SOURCE.ACTIVE_INVOCATION_MISSING')
  assert(meta,'SOURCE.OWNER_METADATA_MISSING')
  local count=0
  for key,value in pairs(active) do
    count=count+1
    local mirrored = meta[key] and pandoc.utils.stringify(meta[key])
    assert((type(value)=='number' and tonumber(mirrored)==value) or mirrored==tostring(value),'SOURCE.OWNER_METADATA_MISMATCH: '..key)
  end
  local count_meta=0;for _ in pairs(meta) do count_meta=count_meta+1 end
  assert(count==count_meta,'SOURCE.OWNER_METADATA_MISMATCH')
  assert(FORMAT=='html','SOURCE.OWNER_FORMAT_UNSUPPORTED')
  assert(active.root==root,'SOURCE.OWNER_ROOT_MISMATCH')
  assert(active.phase=='capture' or active.phase=='render','SOURCE.ATTEMPT_PHASE_INVALID')
  local source=quarto.doc.input_file
  if pandoc.path.is_relative(source) then source=pandoc.path.join({root,source}) end
  source=pandoc.path.make_relative(source,root)
  local session=assert(read(active.sessionPath),'SOURCE.INVALID_ATTEMPT')
  local directory=pandoc.path.join({root,'.course-owner',active.identity and 'identity' or active.phase,active.profile})
  pandoc.system.make_directory(directory,true)
  local path=directory..'/'..pandoc.utils.sha1(source)..'.json'
  assert(not io.open(path,'r'),'SOURCE.DUPLICATE_OBSERVATION')
  local identity,proof
  if active.phase=='capture' and not active.identity and session.identityReplays[active.profile..':'..source] then
    identity,proof=reader.replay(doc,session.identityReaders[active.profile..':'..source])
  end
  local observed=collector.collect(doc,source)
  if session.audit.navigation then observed.navigation=navigation.collect(doc) end
  -- Navigation has no grading declarations; CUE refuses them from raw facts.
  local projection=session.audit.navigation and function(body) return visibility.prepare(body) end or project
  local listing=native_listing.collect(doc,session,active,source,projection)
  observed.resources=resources.collect(doc,{source=source,profile=active.profile,phase=active.phase,effectiveBase=source,
    outputDirectory=quarto.project.output_directory,outputFile=quarto.doc.output_file},projection,listing)
  if proof then
    if proof.input then
      proof.inputPath=assert(session.readerInputs[active.profile..':'..source],'SOURCE.HEADER_IDENTITY_UNSUPPORTED')
      pandoc.system.make_directory(pandoc.path.directory(proof.inputPath),true)
      assert(not io.open(proof.inputPath,'rb'),'SOURCE.DUPLICATE_OBSERVATION')
      local input_file=assert(io.open(proof.inputPath,'wb'))
      input_file:write(proof.input);input_file:close()
    end
    local facts=identity and collector.collect(identity,source) or {}
    facts.readerReplay=proof
    local identity_directory=pandoc.path.join({root,'.course-owner/identity',active.profile})
    pandoc.system.make_directory(identity_directory,true)
    local identity_path=identity_directory..'/'..pandoc.utils.sha1(source)..'.json'
    assert(not io.open(identity_path,'r'),'SOURCE.DUPLICATE_OBSERVATION')
    local identity_file=assert(io.open(identity_path,'w'))
    identity_file:write(pandoc.json.encode(facts));identity_file:close()
  end
  local file=assert(io.open(path,'w'));file:write(pandoc.json.encode(observed));file:close()
  -- Helpers come from owner-local configuration, never document metadata.
  local helper=pandoc.path.join({root,session.extension,'entrypoints/owner-reconcile.ts'})
  local ok,output=pcall(pandoc.pipe,session.quarto,{'run',helper,active.sessionPath,path,active.invocationId,active.profile},'')
  if not ok then io.stderr:write(tostring(output)..'\n');os.exit(1) end
  local result=pandoc.json.decode(output)
  if result.status~='ok' then io.stderr:write(output..'\n');os.exit(1) end
  if result.bodyProjection then
    assert(active.phase=='render' and active.profile=='student','BODY.PROJECTION_IDENTITY')
    local projected=answers.apply(doc,result.bodyProjection,source)
    -- Keep the original exact constructor/RawHTML witnesses. Only the document
    -- used by projected resource traversal changes after answer projection.
    local projected_listing
    if listing then
      projected_listing={}
      for key,value in pairs(listing) do projected_listing[key]=value end
      projected_listing.projectedDoc=projection(projected:clone())
    end
    local after=resources.collect(projected,{source=source,profile=active.profile,phase=active.phase,effectiveBase=source,
      outputDirectory=quarto.project.output_directory,outputFile=quarto.doc.output_file},projection,projected_listing)
    assert(pandoc.json.encode(after.raw)==pandoc.json.encode(observed.resources.raw) and
      pandoc.json.encode(after.projected)==pandoc.json.encode(observed.resources.projected),'BODY.PROJECTION_RESOURCE_DRIFT')
    doc.blocks=projected.blocks
  end
  doc.meta['course-owner-session']=nil
  if active.phase=='capture' then return true end
  return false,result.exercises
end
return M
