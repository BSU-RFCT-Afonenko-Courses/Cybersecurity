-- Постоянные выходы Reveal используют авторскую конфигурацию native проекта.
local metrics=require('./observability/bridge').create_metrics('course-navigation',1)
local function text(value) return value and pandoc.utils.stringify(value) or nil end
local function fail(field,detail)
 assert(false,'NAVIGATION.CONFIG_INVALID: '..detail..'; источник='..quarto.doc.input_file..'; поле='..field)
end
local function public_url(value,field)
 if not value:match('^https?://[^/]+') then fail(field,'Требуется публичный HTTP(S) URL') end
 return value
end
local function local_path(value,field)
 if value:match('^[\\/]') or value:match('^[%a][%w+.-]*:') or value:find('\\',1,true) then fail(field,'Требуется относительный публичный путь') end
 for part in value:gmatch('[^/]+') do if part=='..' or part=='.' then fail(field,'Путь не должен выходить за корень публикации') end end
 return value
end
return {{Pandoc=metrics.wrap_sync({id='course-navigation.filter.handler.Pandoc',kind='phase'},function(doc)
 if not quarto.format.is_format('revealjs') then return doc end
 local cfg=doc.meta['course-navigation'] or {}
 local input=quarto.doc.input_file
 if not pandoc.path.is_relative(input) then input=pandoc.path.make_relative(input,quarto.project.directory) end
 input=input:gsub('\\','/')
 local dir=pandoc.path.directory(input)
 local offset=''
 if dir~='.' then for _ in dir:gmatch('[^/]+') do offset=offset..'../' end end
 local links=pandoc.List()
 local courseUrl=text(cfg['course-url'])
 if courseUrl then courseUrl=public_url(courseUrl,'course-navigation.course-url'):gsub('/+$','')..'/' end
 for i,link in ipairs(cfg.links or {}) do
  local href,label,scope=text(link.href),text(link.text),text(link.scope) or 'project'
  if not href or not label or label=='' then fail('course-navigation.links','Укажите href и text для каждой ссылки') end
  if scope~='project' and scope~='course' then fail('course-navigation.links.scope','Допустимы project и course') end
  if not href:match('^/[^/]') then fail('course-navigation.links.href','Укажите URL-путь от корня области, например /index.html') end
  href=local_path(href:sub(2),'course-navigation.links.href')
  if scope=='course' and not courseUrl then fail('course-navigation.course-url','Для выхода к курсу укажите адрес самостоятельной публикации') end
  links:insert({text=label,href=scope=='course' and courseUrl..href or offset..href,scope=scope,path=href})
 end
 -- HTML остаётся у штатных repo-actions; эквивалент добавляется только в Reveal.
 local repository=doc.meta.book or doc.meta.website or doc.meta
 local function repo(key) return text(repository[key] or doc.meta[key]) end
 local repoUrl=repo('repo-url')
 local actions=repository['repo-actions'] or doc.meta['repo-actions'] or {}
 if pandoc.utils.type(actions)=='Inlines' then actions={actions} end
 local requested={}
 for _,action in ipairs(actions) do requested[text(action)]=true end
 local issue=repo('issue-url')
 if issue then requested.issue=true end
 if repoUrl then
  repoUrl=public_url(repoUrl,'repo-url'):gsub('/+$','')..'/'
  local subdir=repo('repo-subdir') or ''
  if subdir~='' then subdir=local_path(subdir:gsub('/+$',''),'repo-subdir')..'/' end
  local branch=repo('repo-branch') or 'main'
  local_path(branch,'repo-branch')
  if requested.source then links:insert({text='Исходный код',href=repoUrl..'blob/'..branch..'/'..subdir..input,scope='repository'}) end
  if requested.issue and not issue then issue=repoUrl..'issues/new' end
 end
 if issue and requested.issue then links:insert({text='Сообщить об ошибке',href=public_url(issue,'issue-url'),scope='repository'}) end
 if #links>0 then
  local payload=pandoc.json.encode({links=links}):gsub('<','\\u003c')
  quarto.doc.include_text('in-header','<script id="course-navigation-context" type="application/json">'..payload..'</script>')
 end
 return doc
end)}}
