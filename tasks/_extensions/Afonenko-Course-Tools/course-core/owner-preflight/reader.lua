-- Public Pandoc API only. Replay exact native engine input, never source QMD.
local M={}
local function body(doc)
  return pandoc.write(pandoc.Pandoc(doc.blocks),'json')
end
local function list(values)
  local result=pandoc.List()
  for _,value in ipairs(values or {}) do result:insert(value) end
  return result
end
local function set(values)
  local result={}
  for key,value in pairs(values or {}) do result[key]=value end
  return result
end
function M.replay(doc,reader)
  local proof={status='unsupported',reader=reader,reason='native input unavailable'}
  local ok,identity=pcall(function()
    if #PANDOC_STATE.input_files~=1 then
      proof.reason='multiple native reader inputs';return nil
    end
    local file=io.open(PANDOC_STATE.input_files[1],'rb')
    if not file then return nil end
    proof.input=file:read('*all');file:close()
    proof.ordinaryReader=reader:sub(1,#reader-#'-auto_identifiers')
    -- ReaderOptions is userdata. Persist the public fields used in this replay.
    local options=PANDOC_READER_OPTIONS
    proof.options={abbreviations=set(options.abbreviations),columns=options.columns,
      default_image_extension=options.default_image_extension,
      extensions=list(options.extensions),indented_code_classes=list(options.indented_code_classes),
      standalone=options.standalone,strip_comments=options.strip_comments,
      tab_stop=options.tab_stop,track_changes=options.track_changes}
    proof.nativeShape=body(doc)
    local ordinary=pandoc.read(proof.input,proof.ordinaryReader,options)
    proof.ordinaryShape=body(ordinary)
    if proof.nativeShape~=proof.ordinaryShape then
      proof.reason='ordinary native reader replay differs';return nil
    end
    local result=pandoc.read(proof.input,reader,options)
    -- Course/assessment metadata remains owned by the actual native invocation.
    result.meta=doc.meta
    proof.status='ok';proof.reason=nil
    return result
  end)
  if not ok then proof.reason='native reader replay failed: '..tostring(identity);identity=nil end
  return identity,proof
end
return M
