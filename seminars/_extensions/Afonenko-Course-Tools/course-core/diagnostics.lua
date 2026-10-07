-- Локальное оформление guard: входной документ, объект и поле, без span.
local M = {}
function M.format(code, message, context)
  context = context or {}
  local parts = {code .. ': ' .. message}
  local source = context.source or (quarto and quarto.doc and quarto.doc.input_file)
  if source and source ~= '' then parts[#parts+1] = 'источник=' .. source end
  if context.id and context.id ~= '' then parts[#parts+1] = 'объект=' .. context.id end
  if context.field then parts[#parts+1] = 'поле=' .. context.field end
  for _,related in ipairs(context.related or {}) do
    local values = {}
    if related.source then values[#values+1] = 'источник=' .. related.source end
    if related.id then values[#values+1] = 'объект=' .. related.id end
    if related.field then values[#values+1] = 'поле=' .. related.field end
    if #values > 0 then parts[#parts+1] = 'связано: ' .. table.concat(values, ', ') end
  end
  if context.hint then parts[#parts+1] = 'подсказка=' .. context.hint end
  return table.concat(parts, '; ')
end
function M.fail(code, message, context) assert(false, M.format(code, message, context)) end
return M
