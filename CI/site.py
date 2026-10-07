"""Check rendered sites without assuming any course source inventory."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import argparse
import json

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("sites", nargs="+", type=Path, help="Rendered site directories")
args = parser.parse_args()


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids = set()
        self.links = []
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        for key in ('href', 'src'):
            if attrs.get(key):
                self.links.append(attrs[key])


counts = {}

for directory in args.sites:
    site = directory.resolve()
    view = directory.name
    pages = {p.resolve(): Page(p.read_text(encoding='utf-8')) for p in site.rglob('*.html')}
    assert pages, f'{directory}: no HTML pages; render this site first'
    links = 0
    for file, page in pages.items():
        for raw in page.links:
            url = urlsplit(raw)
            if url.scheme or url.netloc: continue
            target = (site/unquote(url.path).lstrip('/')) if url.path.startswith('/') else (file.parent/unquote(url.path)) if url.path else file
            if target.is_dir():
                target = target/'index.html'
            target = target.resolve()
            assert target.is_file(), f'{view}: missing {raw} from {file.relative_to(site)}'
            fragment = unquote(url.fragment).removeprefix('/')
            if fragment and target in pages and not fragment.replace('/','').isdigit():
                assert fragment in pages[target].ids, f'{view}: missing #{fragment} in {target.relative_to(site)}'
            links += 1
    for p in site.rglob('*'):
        assert not any(part in {'_generated', '_extensions', 'CI', 'ci-logs'} or part.startswith('_site') for part in p.relative_to(site).parts), f'Service/private directory leaked: {p}'
    counts[view] = {'pages': len(pages), 'local_links': links}
print('PASS rendered pages and local links', json.dumps(counts, ensure_ascii = False))
