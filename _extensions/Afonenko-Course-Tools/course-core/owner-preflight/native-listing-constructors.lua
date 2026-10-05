-- Pure closed stock table-emitter equivalence. No document mutation or marker/SHA grant.
-- Whole input/prefix/destination/suffix proof belongs to native-listing.lua.
local M={}
-- Quarto replaces global error() with a non-throwing logger. builtin assert is fatal.
local function fail(code,cause) assert(false,code..': '..tostring(cause)) end
local function mismatch(cause) fail('SOURCE.NATIVE_LISTING_CONSTRUCTOR_MISMATCH',cause) end
local function plain(value)
  if type(value)~='string' or value=='' or value:match('^%s') or value:match('%s$') then mismatch('non-plain field') end
  for _,cp in utf8.codes(value) do
    local allowed=cp>=65 and cp<=90 or cp>=97 and cp<=122 or cp>=48 and cp<=57 or cp>=0x00c0 and cp<=0x02af or cp>=0x0400 and cp<=0x052f or (' ,.-'):find(utf8.char(cp),1,true)
    if not allowed then mismatch('non-plain field codepoint') end
  end
  return value
end
local alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64(value)
  local out={}
  for i=1,#value,3 do
    local a,b,c=value:byte(i,i+2);local n=a*65536+(b or 0)*256+(c or 0)
    out[#out+1]=alphabet:sub(math.floor(n/262144)%64+1,math.floor(n/262144)%64+1)
    out[#out+1]=alphabet:sub(math.floor(n/4096)%64+1,math.floor(n/4096)%64+1)
    out[#out+1]=b and alphabet:sub(math.floor(n/64)%64+1,math.floor(n/64)%64+1) or '='
    out[#out+1]=c and alphabet:sub(n%64+1,n%64+1) or '='
  end
  return table.concat(out)
end
local function uri_component(value)
  return (value:gsub('.',function(c) if c:match('[A-Za-z0-9_.!~*\'()-]') then return c end;return string.format('%%%02X',c:byte()) end))
end
local function raw_block(value)
  return '\n\n```{=html}\n'..value..'\n```\n\n'
end
local function ast(block)
  if type(block)=='table' and block.t and block.c then return block end
  return pandoc.json.decode(pandoc.write(pandoc.Pandoc({block}),'json'),false).blocks[1]
end
local function equal(a,b)
  if type(a)~=type(b) then return false end
  if type(a)~='table' then return a==b end
  for k,v in pairs(a) do if not equal(v,b[k]) then return false end end
  for k in pairs(b) do if a[k]==nil then return false end end
  return true
end
local function carriers(value,path,result)
  if type(value)~='table' then return end
  if value.t=='RawBlock' or value.t=='RawInline' then result[#result+1]={path=path,kind=value.t,format=value.c[1],text=value.c[2]} end
  if #value>0 then for i,child in ipairs(value) do carriers(child,path..'/'..(i-1),result) end
  else for _,key in ipairs({'t','c'}) do if value[key]~=nil then carriers(value[key],path..'/'..key,result) end end end
end
local function title(row,context)
  if row.title.kind=='metadata' then return plain(row.title.value) end
  if row.title.kind~='source-header' then mismatch('unknown title constructor') end
  local candidate=context.rowHeaders and context.rowHeaders[row.source]
  if not candidate or candidate.sourceSha1~=row.sourceSha1 or candidate.sourceBytes~=row.sourceBytes or candidate.reader~=context.reader then mismatch('current public Source header witness') end
  local h=candidate.header
  if not h or h.t~='Header' or h.c[1]~=1 then mismatch('first public Source H1') end
  local attr=h.c[2]
  if type(attr)~='table' or type(attr[1])~='string' then mismatch('normal Header id') end
  if attr[1]~='' then plain(attr[1]:gsub('_','-'));if attr[1]:find('[ ,.:;()+/]') then mismatch('normal Header id') end end
  for _,cl in ipairs(attr[2]) do if cl~='unnumbered' and cl~='unlisted' then mismatch('normal Header class') end end
  if #attr[3]~=0 then mismatch('unknown Header attribute') end
  local values={}
  for _,inline in ipairs(h.c[3]) do if inline.t=='Str' then values[#values+1]=inline.c elseif inline.t=='Space' then values[#values+1]=' ' else mismatch('rich Source Header') end end
  local text=plain(table.concat(values))
  if text~=candidate.plaintext then mismatch('Source Header lexical candidate differs') end
  return text
end
local function fixed_numeric(raw,slot)
  local tag="data-listing-"..slot.."-sort='"
  local at=raw:find(tag,1,true)
  if not at then fail('SOURCE.NATIVE_LISTING_NUMERIC_SLOT_INVALID',slot) end
  local start=at+#tag;local last=raw:find("'",start,true)
  local text=last and raw:sub(start,last-1) or ''
  if not text:match('^[1-9][0-9]*$') then fail('SOURCE.NATIVE_LISTING_NUMERIC_SLOT_INVALID',slot) end
  local n=tonumber(text)
  if not n or n>9007199254740991 or n%1~=0 then fail('SOURCE.NATIVE_LISTING_NUMERIC_SLOT_INVALID',slot) end
  return n
end
local function row_stats(group,rows)
  local all={};carriers(group,'',all);local headers={}
  for _,raw in ipairs(all) do if raw.kind=='RawBlock' and raw.format=='html' and raw.text:find("<tr data-index='",1,true) then headers[#headers+1]=raw.text end end
  if #headers~=#rows then mismatch('exact row header count') end
  local result={}
  for i,row in ipairs(rows) do
    local count=fixed_numeric(headers[i],'word-count');local minutes=fixed_numeric(headers[i],'reading-time')
    if count>row.sourceBytes+1 or minutes~=math.ceil(count/200) then fail('SOURCE.NATIVE_LISTING_NUMERIC_SLOT_INVALID',row.source) end
    result[i]={count=count,minutes=minutes}
  end
  return result
end
local function integer(n)
  if type(n)~='number' or n%1~=0 or n<0 or n>9007199254740991 then mismatch('native canonical integer') end
  return string.format('%.0f',n)
end
local function attrs(row,index,text,stats)
  -- Exact default field-type insertion order, then title/filename field links.
  return "data-index='"..index.."' data-categories='"..base64(uri_component(table.concat(row.categories,','))).."' data-listing-file-modified-sort='"..integer(row.mtimeMs).."' data-listing-reading-time-sort='"..integer(stats.minutes).."' data-listing-word-count-sort='"..integer(stats.count).."' data-listing-title-sort='"..text.."' data-listing-filename-sort='index.qmd'"
end
local function table_markdown(declaration,rows,titles,stats)
  local header='<table class="quarto-listing-table table">\n<thead>\n<tr>\n'
  for _,field in ipairs(declaration.fields) do header=header..'\n<th>\n'..plain(declaration.displayNames[field])..'\n</th>\n' end
  header=header..'\n</tr>\n</thead>\n<tbody class="list">\n'
  local markdown=''
  for index,row in ipairs(rows) do
    local row_header="\n<tr "..attrs(row,index-1,titles[index],stats[index])..'>'
    markdown=markdown..raw_block((index==1 and header or '\n</tr>\n')..row_header)
    for _,field in ipairs(declaration.fields) do
      local value
      if field=='title' then value='<a href="'..row.sourceHref..'" class="title listing-title">'..titles[index]..'</a>'
      elseif field=='categories' then local values={};for _,c in ipairs(row.categories) do values[#values+1]=plain(c) end;value='<span class="listing-categories">'..table.concat(values,', ')..'</span>'
      elseif field=='semester' then if type(row.semester)~='number' or row.semester%1~=0 or row.semester<1 or row.semester>16 then mismatch('semester') end;value='<span class="listing-semester">'..integer(row.semester)..'</span>'
      else mismatch('unknown table field') end
      markdown=markdown..'<td>'..value..'</td>\n\n'
    end
  end
  markdown=markdown..raw_block('\n</tr>\n\n</tbody>\n</table>')
  return markdown..raw_block('<div class="listing-no-matching d-none">'..plain(declaration.noMatches)..'</div>')
end
function M.verify(doc,plan,context)
  if not plan or plan.protocol~=1 or plan.reader~='markdown' or not context.options then mismatch('plan/reader context') end
  if context.identity~=nil and context.identity~=false and context.identity~=true then mismatch('identity context type') end
  -- Only the current invocation supplies identity; the frozen native plan stays base Markdown.
  local effective_reader=context.identity==true and 'markdown-auto_identifiers' or 'markdown'
  if context.reader~=effective_reader then mismatch('plan/effective reader context') end
  local actual=ast(assert(context.listingBlock,'Listing block required'))
  if actual.t~='Div' or not equal(actual.c[1],{'quarto-listing-pipeline',{'hidden'},{}}) or #actual.c[2]~=#plan.declarations+1 then mismatch('Listing outer envelope') end
  local markdown=':::{#quarto-listing-pipeline .hidden}\n[$e = mC^2$]{.hidden .quarto-markdown-envelope-contents render-id="cXVhcnRvLWVuYWJsZS1tYXRoLWlubGluZQ=="}\n'
  local addresses,trace={},{}
  for i,declaration in ipairs(plan.declarations) do
    if declaration.index~=i-1 or not declaration.id:match('^[a-z][a-z0-9-]*$') or declaration.filterUi~=false or declaration.sortUi~=false or declaration.sort~='title' or #declaration.rows==0 or #declaration.rows>declaration.pageSize then mismatch('closed declaration') end
    local indexed={};for index,row in ipairs(declaration.rows) do
      if row.sourceHref~='/'..row.source or row.reader~=plan.reader or not row.source:match('^[^?%%#&<>"\'\\]+/index%.qmd$') then mismatch('typed Source address') end
      indexed[#indexed+1]={row=row,title=title(row,context),index=index-1}
    end
    table.sort(indexed,function(a,b) if a.title==b.title then return a.index<b.index end;return a.title<b.title end)
    local rows,titles,order={},{},{}
    for index,item in ipairs(indexed) do rows[index]=item.row;titles[index]=item.title;order[index]=item.index end
    local stats=row_stats(actual.c[2][i+1],rows)
    markdown=markdown..'\n\n:::{.hidden .quarto-markdown-envelope-contents render-id="'..base64('pipeline-listing-'..declaration.id)..'"}\n'..table_markdown(declaration,rows,titles,stats)..'\n:::\n'
    local detail={declarationId=declaration.id,declarationIndex=declaration.index,rowOrder=order,rows={}}
    for ordinal,row in ipairs(rows) do
      addresses[#addresses+1]={declarationId=declaration.id,declarationIndex=declaration.index,rowIndex=order[ordinal],targetSource=row.source,sourceHref=row.sourceHref}
      detail.rows[#detail.rows+1]={rowIndex=order[ordinal],source=row.source,sourceHref=row.sourceHref,title=titles[ordinal],wordCount=stats[ordinal].count,readingTime=stats[ordinal].minutes}
    end
    trace[#trace+1]=detail
  end
  markdown=markdown..'\n:::\n'
  local expected=ast(pandoc.read(markdown,context.reader,context.options).blocks[1])
  if not equal(actual,expected) then
    local function diff(a,b,path)
      if type(a)~=type(b) then return path..' type' end
      if type(a)~='table' then if a~=b then return path..' value' end;return end
      for k,v in pairs(a) do local d=diff(v,b[k],path..'/'..tostring(k));if d then return d end end
      for k in pairs(b) do if a[k]==nil then return path..' missing '..tostring(k) end end
    end
    mismatch('complete finite table/math emitter AST '..(diff(actual,expected,'') or ''))
  end
  local occurrences={};carriers(actual,'',occurrences)
  return {carrierOccurrences=occurrences,addresses=addresses,trace={declarations=trace}}
end
return M
