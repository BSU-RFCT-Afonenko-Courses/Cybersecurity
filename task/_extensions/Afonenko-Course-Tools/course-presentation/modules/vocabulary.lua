local file = assert(io.open(pandoc.path.join({pandoc.path.directory(debug.getinfo(1, "S").source:sub(2)), "vocabulary.json"}), "r"))
local vocabulary = pandoc.json.decode(file:read("*a")); file:close()
return vocabulary
