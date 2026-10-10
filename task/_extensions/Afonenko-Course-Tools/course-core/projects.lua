-- Platform-neutral project/check declarations. No filesystem execution here.
local diagnostics=require('./diagnostics')
local M={}
local countShape={['at-least']='integer',exactly='integer'}
local expectationShape={['student-compilation']=true,job=true,['required-tests']=true,classification=true,['failed-tests']=countShape,['executed-tests']=countShape,['test-ids']='array',score={['less-than']='number',['at-least']='number',exactly='number'}}
local checkShape={['source-profile']=true,runtime=true,java={release=true,encoding=true,['compiler-options']='array'},limits={['outer-seconds']=true,['compile-seconds']=true,['run-seconds']=true,networking=true,['max-output-bytes']=true},
 scoring={mode=true,groups='array',basis=true,value=true},references='array',tests='array',['verification-tests']='array',['contract-cases']=true,
 ['verification-expectations']={reference=expectationShape,starter=expectationShape},
 discovery={['min-executed']=true,['allow-skipped']=true},variants={correct='array',mutants='array'}}
local function fail(field,detail,id) diagnostics.fail('CORE.PROJECT_CHECK_INVALID',detail,{source=quarto.doc.input_file,id=id,field=field}) end
local function scalar(value)
 if type(value)=='boolean' then return value end
 local text=pandoc.utils.stringify(value)
 return text
end
local function decode(value,shape,path)
 if type(value)~='table' then fail(path,'Требуется словарь '..path) end
 local out={}
 for key,item in pairs(value) do
  if not shape[key] then fail(path..'.'..key,'Неизвестное поле '..path..'.'..key) end
  local rule=shape[key]
  if type(rule)=='table' then out[key]=decode(item,rule,path..'.'..key)
  elseif rule=='array' then
   if item.t~='MetaList' and #item==0 and next(item)~=nil then fail(path..'.'..key,'Требуется список') end
   local list=pandoc.List()
   for _,entry in ipairs(item) do
    if key=='references' then list:insert(decode(entry,{name=true,root=true,optional=true},path..'.references'))
    elseif key=='groups' then list:insert(decode(entry,{id=true,weight=true,tests='array'},path..'.groups'))
    else list:insert(scalar(entry)) end
   end
   out[key]=list
  elseif rule=='integer' or rule=='number' then
   local number=tonumber(scalar(item));if not number or number<0 or rule=='integer' and number%1~=0 then fail(path..'.'..key,'Требуется неотрицательное '..rule) end
   out[key]=number
  else out[key]=scalar(item) end
 end
 return out
end
local function merge(base,overlay,shape)
 shape=shape or checkShape
 local result={};for key,value in pairs(base or {}) do result[key]=value end
 for key,value in pairs(overlay or {}) do
  if type(shape[key])=='table' then result[key]=merge(result[key],value,shape[key])
  else result[key]=value end
 end
 return result
end
local function path(value,field)
 if type(value)~='string' or value=='' or value:match('^[/\\]') or value:match('^[A-Za-z]:') or value:find('\\',1,true) then fail(field,'Требуется безопасный относительный путь') end
 for segment in value:gmatch('[^/]+') do if segment=='..' or segment=='.' then fail(field,'Путь не должен выходить из проекта') end end
end
function M.configuration(meta)
 local raw=meta['project-checks'];if raw==nil then return nil end
 for key,_ in pairs(raw) do if key~='defaults' and key~='source-profiles' and key~='profiles' then fail('project-checks.'..key,'Неизвестный параметр project-checks') end end
 local config={defaults=decode(raw.defaults or {},checkShape,'project-checks.defaults'),sources={},profiles={}}
 for name,entry in pairs(raw['source-profiles'] or {}) do
  local value=decode(entry,{mode=true,root=true,include='array'},'source-profiles.'..name)
  if value.mode~='implementation' and value.mode~='student-tests' then fail('source-profiles.'..name,'Неизвестный mode') end
  path(value.root,'source-profiles.root');if not value.include or #value.include==0 then fail('source-profiles.include','Требуется непустой include') end
  config.sources[name]=value
 end
 for name,entry in pairs(raw.profiles or {}) do config.profiles[name]=decode(entry,checkShape,'profiles.'..name) end
 return config
end
function M.resolve(config,name,id)
 if not config or not config.profiles[name] then fail('project-check','Неизвестный профиль project-check: '..name,id) end
 local result=merge(config.defaults,config.profiles[name]);result.profile=name
 local source=config.sources[result['source-profile']]
 if not source then fail('source-profile','Неизвестный source-profile',id) end
 result.sourceProfile=source
 if not result.runtime or result.runtime=='' then fail('runtime','Профиль требует runtime',id) end
 if not result.tests then fail('tests','Профиль требует явный список tests',id) end
 local scoring=result.scoring
 if not scoring or not ({weighted=true,['all-pass']=true,['contract-groups']=true,threshold=true})[scoring.mode] then fail('scoring','Требуется закрытая scoring policy',id) end
 if scoring.mode=='contract-groups' and (not scoring.groups or #scoring.groups==0) then fail('scoring.groups','Groups требуют веса и stable test IDs',id) end
 if scoring.mode=='threshold' and (not scoring.basis or not tonumber(scoring.value)) then fail('scoring.threshold','Threshold требует basis и числовой threshold',id) end
 if scoring.mode=='threshold' then
  scoring.value=tonumber(scoring.value)
  if scoring.value<0 or scoring.basis~='score' and scoring.basis~='passed-tests' then fail('scoring','Invalid threshold basis/value',id) end
 end
 if scoring.mode=='weighted' or scoring.mode=='all-pass' then if scoring.groups or scoring.basis or scoring.value then fail('scoring','Поля не принадлежат выбранному scoring mode',id) end end
 for _,group in ipairs(scoring.groups or {}) do group.weight=tonumber(group.weight);if not group.id or not group.weight or group.weight<=0 or not group.tests or #group.tests==0 then fail('scoring.groups','Group требует ID, положительный вес и tests',id) end end
 local referenceNames={}
 for _,reference in ipairs(result.references or {}) do
  if not reference.name or reference.name=='' then fail('references.name','Требуется имя reference',id) end
  if referenceNames[reference.name] then fail('references.name','Повторное имя reference',id) end;referenceNames[reference.name]=true
  if reference.optional~=nil and type(reference.optional)~='boolean' then fail('references.optional','Требуется boolean',id) end
  path(reference.root,'references.root');reference.optional=reference.optional==true
 end
 if result.java and result.java.release then result.java.release=tonumber(result.java.release);if not result.java.release or result.java.release%1~=0 or result.java.release<1 then fail('java.release','Требуется положительный integer',id) end end
 if result.limits then
  for _,field in ipairs({'outer-seconds','compile-seconds','run-seconds','max-output-bytes'}) do if result.limits[field] then result.limits[field]=tonumber(result.limits[field]);if not result.limits[field] or result.limits[field]<=0 then fail('limits.'..field,'Требуется положительное число',id) end end end
 end
 if result.limits and result.limits.networking~=nil and result.limits.networking~=false then fail('limits.networking','Network must be false',id) end
 if result.discovery and result.discovery['allow-skipped']~=nil and type(result.discovery['allow-skipped'])~='boolean' then fail('discovery.allow-skipped','Требуется boolean',id) end
 if result.discovery and result.discovery['min-executed'] then result.discovery['min-executed']=tonumber(result.discovery['min-executed']);if not result.discovery['min-executed'] or result.discovery['min-executed']<1 or result.discovery['min-executed']%1~=0 then fail('discovery.min-executed','Требуется положительный integer',id) end end
 return result
end
function M.collect(doc,facts)
 local config=M.configuration(doc.meta)
 local result=pandoc.List()
 for _,fact in pairs(facts) do
  if fact.project then
   local project=fact.project:gsub('^/','');path(project,'project')
   local check=fact.projectCheck and M.resolve(config,fact.projectCheck,fact.id) or nil
   local statement=fact.statementVisibility or 'open'
   local open=statement=='open'
   result:insert({exerciseId=fact.id,source=fact.source,projectRoot=project,bankMember=fact.banked,purpose=fact.purpose,
    statementVisibility=statement,artifactPolicy={student=open and (fact.purpose=='demonstration' and 'full' or 'starter') or nil,full='full',conditions=open},check=check})
  end
 end
 table.sort(result,function(a,b)return a.exerciseId<b.exerciseId end)
 return result
end
return M
