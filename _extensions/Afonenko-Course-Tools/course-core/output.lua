local M = {}
function M.invalidate()
  local root = assert(quarto.project.directory, "Требуется проект Quarto")
  os.remove(root .. "/_generated/course-spec/course.json")
end
function M.write(value)
  local root = assert(quarto.project.directory, "Требуется проект Quarto")
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  value.source = pandoc.path.make_relative(input, root)
  local directory = root .. "/_generated/course-spec/core"
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(directory .. "/" .. pandoc.utils.sha1(value.source) .. ".json", "w"))
  file:write(pandoc.json.encode(value)); file:close()
end
return M
