-- Только ограниченный native transport; request semantics принадлежат TS.
local owner=debug.getinfo(1,'S').source:gsub('^@','')
local key='project-download/native-buffer:'..pandoc.path.normalize(owner)
local shared=package.loaded[key]
if type(shared)~='table' then shared={};package.loaded[key]=shared end
local M={}
local function fail(message) assert(false,'DOWNLOAD.DELIVERY_PHASE_UNSUPPORTED: '..message) end
function M.context()
 local root=assert(quarto.project.directory,'DOWNLOAD.CONFIG_INVALID: project-download требует проект Quarto')
 local input=quarto.doc.input_file
 if pandoc.path.is_relative(input) then input=pandoc.path.join({root,input}) end
 input=pandoc.path.normalize(input)
 local format=quarto.format.format_identifier()['target-format']
 return {source=pandoc.path.make_relative(input,root),key=root..'\0'..input..'\0'..format}
end
function M.restrictive()
 local mode=os.getenv('PROJECT_DOWNLOAD_LITERAL_ONLY')
 if mode~=nil and mode~='1' then assert(false,'DOWNLOAD.CONFIG_INVALID: Неверный restrictive Download mode') end
 return mode=='1'
end
function M.begin(source) shared.active={source=source,calls={},bytes=0} end
function M.abort(source) if shared.active and shared.active.source==source then shared.active.failed=true end end
function M.record(value)
 if M.restrictive() then fail('Runtime Download callback запрещён в literal-only capture') end
 local context=M.context();local active=shared.active
 if not active or active.source~=context.key or active.failed then fail('Нет действующей ранней owner фазы') end
 value.ordinal=#active.calls;value.inline=false
 local bytes=#pandoc.json.encode(value)
 if #active.calls>=16384 or active.bytes+bytes>16*1024*1024 then fail('Превышен ограниченный document-local buffer') end
 active.calls[#active.calls+1]=value;active.bytes=active.bytes+bytes
 return value.ordinal
end
function M.drain(source)
 local active=shared.active;shared.active=nil
 if not active or active.source~=source or active.failed then fail('Чужой или незавершённый native Download batch') end
 return active.calls
end
return M
