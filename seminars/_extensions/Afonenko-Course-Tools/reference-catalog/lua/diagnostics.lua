local M = {}
-- Formatter завершает существующий guard и не вводит новый runtime ошибок.
function M.message(code, message, id, field, hint)
  local details = {code .. ": " .. message}
  if quarto.doc.input_file then details[#details + 1] = "источник=" .. quarto.doc.input_file end
  if id then details[#details + 1] = "ID=" .. id end
  if field then details[#details + 1] = "поле=" .. field end
  if hint then details[#details + 1] = "подсказка: " .. hint end
  return table.concat(details, "; ")
end
return M
