-- Private Core writer: no merge, no Lua-table conversion of typed metadata.
function Writer(doc)
  assert(#doc.blocks == 0 and doc.meta.rows, 'Invalid native raw transport')
  local keys = 0
  for key in pairs(doc.meta) do assert(key == 'rows', 'Extra native raw transport field'); keys = keys + 1 end
  assert(keys == 1, 'Missing native raw transport field')
  local rows, seen = {}, {}
  for _, row in ipairs(doc.meta.rows) do
    local count = 0
    for key in pairs(row) do assert(key == 'path' or key == 'kind' or key == 'hash' or key == 'text', 'Extra raw row field'); count = count + 1 end
    assert(count == 4 and type(row.path) == 'string' and type(row.text) == 'string' and type(row.hash) == 'string' and (row.kind == 'qmd' or row.kind == 'include-metadata'), 'Invalid raw row')
    local key = row.path .. '\0' .. row.kind
    assert(not seen[key], 'Duplicate raw row'); seen[key] = true
    local logs = #PANDOC_STATE.log
    pandoc.mediabag.empty()
    local native = pandoc.system.with_working_directory(pandoc.path.directory(row.path), function()
      return pandoc.write(pandoc.read(row.text, 'markdown'), 'json')
    end)
    assert(#PANDOC_STATE.log == logs, 'Native raw parser emitted diagnostics')
    pandoc.mediabag.empty()
    rows[#rows + 1] = {path = row.path, kind = row.kind, hash = row.hash, document = native}
  end
  return pandoc.json.encode({rows = rows})
end
