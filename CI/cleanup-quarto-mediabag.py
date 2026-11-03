"""Убрать остатки HTML и пустые mediabag Quarto рядом с исходными QMD."""
from html.parser import HTMLParser
from pathlib import Path

class QuartoHTML(HTMLParser):
    generated = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if (tag == 'meta' and attrs.get('name', '').lower() == 'generator'
                and attrs.get('content', '').lower().startswith('quarto-')):
            self.generated = True


root = Path.cwd()
for source in root.rglob('*.qmd'):
    if any(part.startswith(('_', '.')) for part in source.relative_to(root).parts):
        continue
    html = source.with_suffix('.html')
    if html.is_file() and not html.is_symlink():
        parser = QuartoHTML()
        with html.open(encoding='utf-8', errors='replace') as content:
            parser.feed(content.read(8192))
        # Удаляем только HTML с маркером Quarto и одноимённым исходным QMD.
        if parser.generated:
            html.unlink()
    generated = source.with_name(source.stem + '_files')
    mediabag = generated / 'mediabag'
    # rmdir не удаляет содержимое. Непустой каталог остаётся для проверки Core.
    if generated.is_symlink() or mediabag.is_symlink():
        continue
    for directory in (mediabag, generated):
        try:
            directory.rmdir()
        except (FileNotFoundError, OSError):
            pass
