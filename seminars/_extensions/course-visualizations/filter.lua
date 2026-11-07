-- OJS и изображения обрабатывает Quarto; пакет подключает оформление.
local base = quarto.utils.resolve_path(".")
return {{
  Meta = function(meta)
    if quarto.doc.is_format('html') then
      quarto.doc.add_html_dependency({name='course-visualizations',version='0.3.6',stylesheets={base .. '/browser/style.css',base .. '/browser/cipher.css',base .. '/browser/password.css',base .. '/browser/generator.css'}})
    end
    return meta
  end
}}
