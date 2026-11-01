-- Доставка оформления и статических SVG. OJS компилируется самим Quarto.
local base = quarto.utils.resolve_path(".")
local function read(path)
  local file = assert(io.open(path, 'rb'))
  local content = file:read('*a'); file:close(); return content
end
return {{
  Meta = function(meta)
    if quarto.doc.is_format('html') then
      quarto.doc.add_html_dependency({name='course-visualizations',version='0.2.0',stylesheets={base .. '/browser/style.css'}})
    end
    return meta
  end,
  Image = function(image)
    local tail = image.src:match('_prepared/visualizations/(.+%.svg)$')
    if not tail then return nil end
    if tail:find('..', 1, true) then error('Недопустимый путь SVG') end
    local source = quarto.project.directory .. '/_prepared/visualizations/' .. tail
    local target = 'course-viz-' .. tail:gsub('/', '-')
    pandoc.mediabag.insert(target,'image/svg+xml',read(source)); image.src=target; return image
  end
}}
