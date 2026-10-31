-- HTML reader снимает data-; восстанавливается только транспорт QRC.
local keys = {['qrc-ref']=true,['qrc-style']=true,['qrc-custom']=true,['qrc-deferred']=true}
local function transport(el)
  local found = {}
  for key,value in pairs(el.attributes) do
    local plain = key:gsub('^data%-','')
    if keys[plain] then
      if found[plain] then error('SITE.CONDITIONS_INVALID: неоднозначный QRC transport '..plain) end
      found[plain] = value
    end
  end
  for key,value in pairs(found) do
    el.attributes[key] = nil
    el.attributes['data-'..key] = value
  end
  return el
end
return {{Span=transport,Link=transport}}
