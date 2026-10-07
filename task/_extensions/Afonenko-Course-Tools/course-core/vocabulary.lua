-- Единственный словарь допустимой разметки; исходник принадлежит пакету Core.
local file = assert(io.open(pandoc.path.join({pandoc.path.directory(debug.getinfo(1, "S").source:sub(2)), "contract-vocabulary.json"}), "r"))
local vocabulary = pandoc.json.decode(file:read("*a")); file:close()
return vocabulary
