-- Quarto owns metadata inheritance. This pass reads its final metadata once,
-- before adapters and audience projection, and never mutates the authored AST.
local contract=require('./pedagogy/contract')
local diagnostics=require('./diagnostics')
local M={}
local fields={'target','course-role','statement-visibility','difficulty','time','project-check'}
local allowed={};for _,field in ipairs(fields) do allowed['default-exercise-'..field]=true end
local function text(value) return value~=nil and pandoc.utils.stringify(value) or nil end
local function invalid(field,id,detail)
 diagnostics.fail('CORE.METADATA_INVALID',detail,{source=quarto.doc.input_file,id=id,field=field})
end
function M.normalize(doc)
 require("./visibility").validate_conditions(doc)
 local defaults={}
 for key,_ in pairs(doc.meta) do
  if key:match('^default%-exercise%-') and not allowed[key] then invalid(key,nil,'Неизвестный default упражнения: '..key) end
 end
 for _,field in ipairs(fields) do
  local raw=doc.meta['default-exercise-'..field]
  if raw~=nil and raw~=false then
   local kind=pandoc.utils.type(raw)
   if kind~='string' and kind~='Inlines' then invalid(field,nil,'Default требует скалярное значение или false') end
   local value=text(raw)
   if value=='' or value=='null' then invalid(field,nil,'Пустой default запрещён; используйте false') end
   defaults[field]=value
  end
 end
 local legacy=doc.meta['exercise-statement-visibility']
 if legacy~=nil then
  local value=text(legacy)
  local new=doc.meta['default-exercise-statement-visibility']
  if new~=nil and (new==false or defaults['statement-visibility']~=value) then invalid('statement-visibility',nil,'Старое и новое имя default visibility противоречат друг другу') end
  if new==nil then defaults['statement-visibility']=value end
 end
 local function validate(values,id)
  contract.metadata(values,{id=id})
  if values['course-role'] and not contract.activities[values['course-role']] then invalid('course-role',id,'Неизвестная учебная роль course-role: '..values['course-role']) end
  if values['statement-visibility'] and values['statement-visibility']~='open' and values['statement-visibility']~='restricted' then invalid('statement-visibility',id,'Visibility требует open или restricted') end
  for _,field in ipairs({'target','project-check'}) do
   if values[field] and not values[field]:match('^[a-z][a-z0-9%-]*$') then invalid(field,id,'Недопустимое имя '..field) end
  end
 end
 validate(defaults,nil)
 local function audience(node)
  for key,value in pairs(node.attributes) do
   if (key:match('^when%-') or key:match('^unless%-')) and (value=='student' or value=='full') then
    diagnostics.fail('CORE.AUDIENCE_WRAPPER_FORBIDDEN','Audience определяется моделью; удалите авторский audience wrapper',{source=quarto.doc.input_file,id=node.identifier,field=key})
   end
  end
  for _,class in ipairs(node.classes) do
   if class=='when-student' or class=='when-full' or class=='unless-student' or class=='unless-full' then diagnostics.fail('CORE.AUDIENCE_WRAPPER_FORBIDDEN','Audience wrapper запрещён',{id=node.identifier,field='visibility'}) end
  end
 end
 doc:walk({Div=audience,Span=audience,CodeBlock=audience})
 local result={}
 doc:walk({Div=function(div)
  if not contract.is_exercise(div) then return end
  local id=div.identifier
  if result[id] then diagnostics.fail('CORE.DUPLICATE_DECLARATION','Повторный ID упражнения',{source=quarto.doc.input_file,id=id,field='id',related={{source=quarto.doc.input_file,id=id}}}) end
  local values={}
  for _,field in ipairs(fields) do values[field]=div.attributes[field] or defaults[field] end
  if defaults.target and div.attributes.target and defaults.target~=div.attributes.target then
   diagnostics.fail('CORE.EXERCISE_DEFAULT_CONFLICT','Конфликт target: default='..defaults.target..', explicit='..div.attributes.target,{source=quarto.doc.input_file,id=id,field='target'})
  end
  local managed=contract.bank(doc.meta) or next(defaults)~=nil or div.attributes.project~=nil or div.attributes["course-role"]~=nil
  if managed then validate(values,id) end
  local metadata=managed and contract.metadata(values,{id=id}) or {}
  if values['project-check'] and not div.attributes.project then invalid('project-check',id,'Упражнение с project-check требует project') end
  local source=quarto.doc.input_file
  if quarto.project.directory and not pandoc.path.is_relative(source) then source=pandoc.path.make_relative(source,quarto.project.directory) end
  result[id]={id=id,source=source,banked=contract.bank(doc.meta),managed=contract.bank(doc.meta) or div.attributes.project~=nil or values["course-role"]~=nil,target=values.target,authoredTarget=div.attributes.target,
   purpose=values['course-role'],difficulty=metadata.difficulty,time=metadata.time,statementVisibility=values['statement-visibility'] or (managed and not contract.bank(doc.meta) and 'open' or nil),
   project=div.attributes.project,projectCheck=values['project-check']}
 end})
 return result
end
function M.present(doc,facts)
 return doc:walk({Div=function(div)
  local f=facts[div.identifier];if not f then return end
  local values={target=f.target,['course-role']=f.purpose,difficulty=f.difficulty,time=f.time,['statement-visibility']=f.statementVisibility,['project-check']=f.projectCheck}
  for key,value in pairs(values) do div.attributes[key]=tostring(value) end
  return div
 end})
end
return M
