"""Проверить разделение решений семинара 4 в готовых сайтах."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import base64
import json
import re


ROOT = Path(__file__).resolve().parents[1]
SOLUTION_BLOCKS = re.compile(
    r'^(:{3,})[ \t]+\{#(?P<identifier>sol-[\w-]+)(?:[ \t]+[^}\n]*)?\}[ \t]*\n'
    r'(?P<body>.*?)^\1[ \t]*$', re.M | re.S)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nodes(value):
    if isinstance(value, list):
        for child in value:
            yield from nodes(child)
    elif isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child)


def assigned_ids():
    source = (ROOT / 'task/works/04-access-control.qmd').read_text()
    return re.findall(r'^\d+\. \[?@(exr-[\w-]+)(?:\]\{requirement="optional"\})?\s*$', source, re.M)


def validate_solution_inventory(sources):
    expected = {"sol-" + qid[4:] for qid in assigned_ids()}
    require(len(expected) == 13, "Назначенная работа должна сохранять 13 решений")
    require(expected.issubset(sources),
            f"В банке отсутствуют назначенные решения: {sorted(expected - set(sources))}")


def mathml_tex(text):
    # MathML хранит формулу дважды: presentation и исходную TeX-аннотацию.
    def replace(match):
        annotation = re.search(
            r"<annotation\b[^>]*\bencoding=[\"']application/x-tex[\"'][^>]*>(.*?)</annotation\s*>",
            match[0], re.I | re.S)
        return ' ' + annotation[1] + ' ' if annotation else match[0]
    return re.sub(r'<math\b[^>]*>.*?</math\s*>', replace, text, flags=re.I | re.S)


class Solutions(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.stack = []
        self.active = None
        self.content = {}
        self.feed(mathml_tex(text))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                   'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            return
        self.stack.append(tag)
        if attrs.get('id', '').startswith('sol-'):
            require(self.active is None, 'Вложенные решения')
            self.active = (attrs['id'], len(self.stack))
            require(attrs['id'] not in self.content, f'Повторный ID {attrs["id"]}')
            self.content[attrs['id']] = []

    def handle_endtag(self, tag):
        if self.active and len(self.stack) == self.active[1]:
            self.active = None
        if self.stack:
            self.stack.pop()

    def handle_data(self, text):
        if self.active:
            self.content[self.active[0]].append(text)


def norm(value):
    return ' '.join(re.findall(r'\w+', value.lower()))


def text_values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for child in value:
            yield from text_values(child)
    elif isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from text_values(child)


class PageText(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.text = []
        self.feed(mathml_tex(text))

    def handle_data(self, text):
        self.text.append(text)


class OJSModules(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.contents = []
        self.chunks = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('type') == 'ojs-module-contents':
            self.chunks = []

    def handle_endtag(self, tag):
        if tag == 'script' and self.chunks is not None:
            encoded = ''.join(''.join(self.chunks).split())
            payload = json.loads(base64.b64decode(encoded, validate=True))
            require(isinstance(payload, dict) and isinstance(payload.get('contents'), list),
                    'Некорректное содержимое модуля OJS')
            self.contents.append(payload)
            self.chunks = None

    def handle_data(self, text):
        if self.chunks is not None:
            self.chunks.append(text)


def ojs_sources(text):
    return [node['source'] for payload in OJSModules(text).contents
            for node in nodes(payload) if isinstance(node.get('source'), str)]


def check_visualizations(site, project, relative_page):
    project_output = site / project
    resources = project_output / '_prepared/visualizations'
    source_root = ROOT / 'shared/visualizations'
    expected = {}
    for source in source_root.rglob('*'):
        if not source.is_file() or source.suffix not in {'.js', '.svg'}:
            continue
        relative = source.relative_to(source_root)
        content = source.read_bytes()
        if relative == Path('common/runtime.js'):
            content = content.replace(
                b'../../../extensions/course-visualizations/_extensions/course-visualizations/browser/runtime.js',
                b'./course-runtime.js')
        expected[relative] = content
    runtime = ROOT / project / '_extensions/course-visualizations/browser/runtime.js'
    expected[Path('common/course-runtime.js')] = runtime.read_bytes()
    require(bool(expected), 'Не найдены исходные ресурсы визуализаций')
    for relative, content in expected.items():
        published = resources / relative
        require(published.is_file() and published.read_bytes() == content,
                f'{site.name}/{project}: изменён или потерян ресурс визуализации {relative}')
    actual = {file.relative_to(resources) for file in resources.rglob('*') if file.is_file()}
    require(actual == set(expected),
            f'{site.name}/{project}: лишние ресурсы визуализаций {sorted(actual - set(expected))}')
    require(not (site / 'shared/access-control').exists(),
            f'{site.name}: опубликована удалённая галерея доступа')

    page = project_output / relative_page
    text = page.read_text()
    cells = '\n'.join(ojs_sources(text))
    require('quarto-ojs-runtime.js' in text and bool(cells),
            f'{project}/{relative_page}: нет скомпилированных ячеек OJS')
    attachments = set(re.findall(r"FileAttachment\([\"']([^\"']+)[\"']\)", cells))
    for model in ('dac', 'mac', 'rbac'):
        require(f'/_prepared/visualizations/access-control/{model}/lesson.js' in attachments,
                f'{project}/{relative_page}: нет импорта действующей модели {model}')
        require(f'_prepared/visualizations/access-control/{model}/static/overview.svg' in text,
                f'{project}/{relative_page}: нет статической схемы {model}')
    require('_prepared/visualizations/access-control/static/procedures.svg' in text,
            f'{project}/{relative_page}: нет схемы процедур доступа')
    if project == 'seminars':
        require('class="reveal"' in text, f'{project}/{relative_page}: нет презентации Reveal')


def check_site(student, full, targeted=False):
    def output(site, relative):
        return site / relative if (site / "task").is_dir() else site / relative.relative_to("task")
    sources = {}
    source_solutions = {}
    for source in [ROOT / 'task/bank/access-control.qmd']:
        for solution in SOLUTION_BLOCKS.finditer(source.read_text()):
            sid, body = solution.group('identifier', 'body')
            require(sid not in sources, f'Повторный исходный ID {sid}')
            sources[sid] = source
            body = re.sub(r'^`{3,}[^\n]*$', '', body, flags=re.M)
            words = norm(body).split()
            require(len(words) >= 12, f'{sid}: короткий исходник решения')
            source_solutions[sid] = {' '.join(words[i:i + 12])
                                     for i in range(len(words) - 11)}
    validate_solution_inventory(sources)
    # Дальнейший скан проверяет каждый найденный ключ, включая новые вопросы банка.
    open_sources = []
    for source in ROOT.rglob('*.qmd'):
        relative = source.relative_to(ROOT)
        if any(part.startswith(('_', '.')) for part in relative.parts):
            continue
        open_sources.append(norm(SOLUTION_BLOCKS.sub('', source.read_text())))
    open_text = '\n'.join(open_sources)
    search = list(student.rglob('search.json'))
    require(bool(search), 'Нет student search.json')
    solution_texts = {}
    for sid, source in sources.items():
        relative = source.relative_to(ROOT).with_suffix('.html')
        public_html = output(student, relative).read_text()
        content = Solutions(output(full, relative).read_text()).content
        require(sid in content, f'{relative}: нет full {sid}')
        text = norm(' '.join(content[sid]))
        require(all(fragment in text for fragment in source_solutions[sid]),
                f'{relative}: изменено содержимое решения {sid}')
        require(sid not in public_html and text not in norm(public_html), f'{relative}: утечка {sid}')
        solution_texts[sid] = {fragment for fragment in source_solutions[sid]
                              if fragment not in open_text}
        require(bool(solution_texts[sid]), f'{sid}: нет частных сигнатур решения')
    for file in student.rglob('*'):
        if not file.is_file():
            continue
        raw = file.read_bytes()
        relative = file.relative_to(student)
        for sid in sources:
            require(sid.encode() not in raw, f'{relative}: закрытый sol-ID {sid}')
        try:
            decoded = raw.decode('utf-8')
        except UnicodeDecodeError:
            continue
        representations = [decoded]
        if file.suffix == '.html':
            require(not re.search(r'<[^>]+\bid=[\"\']quarto-embedded-source', decoded),
                    f'{relative}: встроенный исходник в student HTML')
            representations.append(' '.join(PageText(decoded).text))
            representations.extend(ojs_sources(decoded))
        if file.suffix == '.json':
            representations.append(' '.join(text_values(json.loads(decoded))))
        for representation in representations:
            text = norm(representation)
            for sid, fragments in solution_texts.items():
                require(sid not in representation, f'{relative}: закрытый sol-ID {sid}')
                require(not any(fragment in text for fragment in fragments),
                        f'{relative}: текст решения {sid}')
    for site in (student, full):
        for file in site.rglob('*'):
            if not file.is_file():
                continue
            relative = file.relative_to(site)
            require(file.suffix not in {'.qmd', '.lua', '.ts', '.py', '.sh', '.cue',
                                        '.zip', '.tar', '.gz', '.tgz', '.zst', '.diff', '.patch'}
                    and not (file.name.startswith('_quarto') and file.suffix in {'.yml', '.yaml'}),
                    f'{site.name}/{relative}: служебный исходник/архив')
            require(not any(part in {'_extensions', '_generated', 'CI', 'ci-logs'}
                            for part in relative.parts), f'{site.name}/{relative}: служебный каталог')
            if file.suffix != '.json':
                continue
            require(file.name not in {'backup.json', 'backup.public.json', 'access-control.json',
                                      'access-control.public.json', 'teacher.json', 'checks.json'},
                    f'{site.name}/{relative}: Body/служебный JSON')
            payload = json.loads(file.read_text())
            for node in nodes(payload):
                require(node.get('schema') != 'course-body-package-v2'
                        and not any(key in node for key in ('closedKey', 'solution', 'gradingNotes')),
                        f'{site.name}/{relative}: Body/закрытое поле JSON')
        if targeted:
            continue
        check_visualizations(site, 'theory', Path('access-control/access-control.html'))
        check_visualizations(site, 'seminars', Path('04-access-control.html'))
    print(f'Проверено: {len(sources)} решений только в full; публичные HTML, поиск и ресурсы'
          + ('; целевой банк' if targeted else '; действующие OJS, SVG и Reveal'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='mode', required=True)
    site = commands.add_parser('site')
    site.add_argument('student', type=Path)
    site.add_argument('full', type=Path)
    site.add_argument('--targeted', action='store_true', help='Проверить только банк без требования полной сборки')
    args = parser.parse_args()
    try:
        check_site(args.student.resolve(), args.full.resolve(), args.targeted)
    except (ValueError, KeyError, IndexError, OSError) as error:
        parser.exit(1, f'FAIL {error}\n')


if __name__ == '__main__':
    main()
