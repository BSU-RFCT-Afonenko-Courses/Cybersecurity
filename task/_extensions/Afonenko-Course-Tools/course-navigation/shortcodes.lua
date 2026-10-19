local __metrics=require("./observability/bridge").create_metrics("course-navigation",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="course-navigation.shortcodes.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
-- Native post-render resolves this request from completed canonical Core facts.
return __perfFilters({['course-exercise-index']=function(args,kwargs,meta)
 if #args>0 then error('course-exercise-index requires named parameters') end
 for key,_ in pairs(kwargs) do if key~='role' and key~='group-by' then error('Unknown course-exercise-index parameter: '..key) end end
 local request={groupBy=pandoc.List({'semester','difficulty'})}
 if kwargs.role then
  request.role=pandoc.utils.stringify(kwargs.role)
  if not ({demonstration=true,discussion=true,['independent-study']=true,control=true})[request.role] then error('Unknown course-exercise-index role') end
 end
 if kwargs['group-by'] then
  local raw=pandoc.utils.stringify(kwargs['group-by']);local seen={};request.groupBy=pandoc.List()
  for item in (raw..','):gmatch('(.-),') do
   item=item:match('^%s*(.-)%s*$')
   if (item~='semester' and item~='difficulty') or seen[item] then error('Invalid course-exercise-index group-by') end
   seen[item]=true;request.groupBy:insert(item)
  end
 end
 return pandoc.RawBlock('html','<!--course-exercise-index:'..pandoc.json.encode(request)..'-->')
end})
