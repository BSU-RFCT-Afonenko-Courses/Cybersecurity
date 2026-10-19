-- Pandoc Attr принимает список пар: порядок карты Lua не является порядком HTML.
local M = {}
function M.sorted(attributes)
  local keys, result = {}, {}
  for key in pairs(attributes) do keys[#keys+1] = key end
  table.sort(keys)
  for _,key in ipairs(keys) do result[#result+1] = {key, attributes[key]} end
  return result
end
return M
