-- Native post-render resolves this request from completed canonical Core facts.
return {['course-exercise-index']=function(args,kwargs,meta)
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
end}
