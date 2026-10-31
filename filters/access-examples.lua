-- Адаптер публикации существующих схем, без нового языка описания виджетов.
local assets = quarto.utils.resolve_path('../shared/access-control')
local added = false
local function has_class(el, name)
  for _, cls in ipairs(el.classes) do if cls == name then return true end end
  return false
end
return {{
  Image = function(el)
    local name = el.src:match('shared/access%-control/static/([%w%-]+%.svg)$')
    if not name then return nil end
    local file = assert(io.open(assets .. '/static/' .. name, 'rb'))
    local svg = file:read('*a'); file:close()
    local target = 'course-access-' .. name
    pandoc.mediabag.insert(target, 'image/svg+xml', svg)
    el.src = target
    return el
  end,
  Div = function(el)
    if not has_class(el, 'acx-widget') then return nil end
    if not quarto.format.is_format('html') and not quarto.format.is_format('revealjs') then return pandoc.Null() end
    if not added then
      quarto.doc.add_html_dependency({
        name = 'course-access-examples', version = '1.0.0',
        scripts = {{path = assets .. '/widget.js', afterBody = true}},
        stylesheets = {assets .. '/widget.css'}
      })
      added = true
    end
    return el
  end
}}
