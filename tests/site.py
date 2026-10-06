"""Check actual native publication paths, profile inventory and local links."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
root = Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.ids=set(); self.links=[]; self.feed(text)
    def handle_starttag(self, tag, attributes):
        attrs=dict(attributes)
        if attrs.get('id'): self.ids.add(attrs['id'])
        for key in ('href','src'):
            if attrs.get(key): self.links.append(attrs[key])
counts={}
for view in ('student','full'):
    site=root/('_site-'+view)
    assert (site/'index.html').is_file(), f'Render {view} first'
    pages={p.resolve():Page(p.read_text()) for p in site.rglob('*.html')}
    links=0
    for file,page in pages.items():
        for raw in page.links:
            url=urlsplit(raw)
            if url.scheme or url.netloc: continue
            target=(site/unquote(url.path).lstrip('/')) if url.path.startswith('/') else (file.parent/unquote(url.path)) if url.path else file
            if target.is_dir(): target=target/'index.html'
            target=target.resolve()
            assert target.is_file(), f'{view}: missing {raw} from {file.relative_to(site)}'
            fragment=unquote(url.fragment).removeprefix('/')
            if fragment and target in pages and not fragment.replace('/','').isdigit():
                assert fragment in pages[target].ids, f'{view}: missing #{fragment} in {target.relative_to(site)}'
            links+=1
    content=(site/'reference-catalog.json').read_text()
    present=any(any(i.startswith('sec-control-') for i in p.ids) for p in pages.values())
    assert present == (view=='full'), f'{view}: control source inventory incorrect'
    if view=='student':
        assert 'sec-control-' not in content, 'Control target leaked into student catalog'
        for p in site.rglob('*'):
            assert not any(part in {'_generated','_site-full','_extensions'} for part in p.relative_to(site).parts), f'Service/private directory leaked: {p}'
    counts[view]={'pages':len(pages),'local_links':links}
assert (root/'task/seminar/data-integrity/checksum.qmd').is_file(), 'Existing empty author source lost'
print('PASS actual publication and profile isolation',json.dumps(counts,ensure_ascii=False))
