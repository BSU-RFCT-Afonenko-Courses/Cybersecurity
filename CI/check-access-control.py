"""Проверить выбранные Body и разделение решений семинара 4 в готовых сайтах."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import json
import re


ROOT = Path(__file__).resolve().parents[1]
LINK = ('https://bsu-rfct-afonenko-courses.github.io/Cybersecurity/'
        'task/access-control/rbac.html#exr-access-control-rbac')


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
    source = (ROOT / 'task/seminar/04-access-control.qmd').read_text()
    return re.findall(r'^\d+\. @(exr-[\w-]+)\s*$', source, re.M)


def check_link(package, name):
    question = next((q for q in package['questions']
                     if q['id'] == 'exr-access-control-verification'), None)
    require(question is not None, f'{name}: нет exr-access-control-verification')
    links = [n['c'][2][0] for n in nodes(question['condition']) if n.get('t') == 'Link']
    require(links == [LINK], f'{name}: неверный Pandoc Link exr-access-control-verification')


def check_body(directory):
    checks = json.loads((directory / 'checks.json').read_text())
    require(checks.get('schemaVersion') == 1, 'checks.json: schemaVersion != 1')
    require(checks.get('projects') == [], 'checks.json: declared inventory не пуст')
    expected = assigned_ids()
    require(len(expected) == len(set(expected)) == 13, 'Исходник семинара: ожидалось 13 назначений')
    for stem, work_id, count in [('backup', 'sec-work-data-integrity-backup', 1),
                                 ('access-control', 'sec-work-access-control', 13)]:
        teacher = json.loads((directory / f'{stem}.json').read_text())
        public = json.loads((directory / f'{stem}.public.json').read_text())
        for label, package in [('teacher', teacher), ('public', public)]:
            name = f'{stem}/{label}'
            require(package.get('schema') == 'course-body-package-v2', f'{name}: schema')
            require(len(package['works']) == 1 and package['works'][0]['id'] == work_id,
                    f'{name}: неверная работа {work_id}')
            slots = package['works'][0]['slots']
            require(len(slots) == count, f'{name}: slots: ожидалось {count}, получено {len(slots)}')
            require(len(package['questions']) == count, f'{name}: questions: ожидалось {count}')
            raw = json.dumps(package, ensure_ascii=False)
            require('?@' not in raw and '#qrc-unresolved' not in raw, f'{name}: неразрешённая QRC-ссылка')
            if stem == 'access-control':
                require([s['candidates'] for s in slots] ==
                        [[f"{package['owner']}/{qid}"] for qid in expected],
                        f'{name}: порядок slots/candidates отличается от исходника')
                require([s['assignment']['requirement'] for s in slots] ==
                        ['required'] * 5 + ['optional'] * 8, f'{name}: requirement')
                for i, slot in enumerate(slots):
                    assignment = slot['assignment']
                    require(assignment.get('workMode') == 'individual', f'{name}: {slot["id"]}: workMode')
                    require(assignment.get('stage') == ('classroom' if 1 <= i <= 7 else None),
                            f'{name}: {slot["id"]}: stage')
                    require(slot['selection'] == 'fixed', f'{name}: {slot["id"]}: selection')
                check_link(package, name)
            used = {key for slot in slots for key in slot['candidates']}
            require(used == {q['key'] for q in package['questions']}, f'{name}: потерянные/лишние candidates')
        require(teacher['works'] == public['works'], f'{stem}: работы teacher/public различаются')
        tq = {q['id']: q for q in teacher['questions']}
        pq = {q['id']: q for q in public['questions']}
        require(len(tq) == len(pq) == count and tq.keys() == pq.keys(), f'{stem}: ID вопросов')
        for node in nodes(public):
            for key in ('closedKey', 'solution', 'gradingNotes'):
                require(key not in node, f'{stem}/public: закрытое поле {key}')
        for qid, t in tq.items():
            p = pq[qid]
            if stem == 'access-control':
                require(bool(t.get('solution')), f'{qid}: нет teacher solution')
            require(not p['hasPublicSolution'], f'{qid}: hasPublicSolution')
            require(t['condition'] == p['condition'], f'{qid}: condition teacher/public различается')
    print('PASS Body: backup — 1 назначение; семинар 4 — 13 slots, 5 required, 8 optional; Link и решения')


class Solutions(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.stack = []
        self.active = None
        self.content = {}
        self.feed(text)

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
        self.feed(text)

    def handle_data(self, text):
        self.text.append(text)


def check_site(student, full):
    sources = {}
    source_solutions = {}
    solution_pattern = r'^::: \{#(sol-[\w-]+)\}\n(.*?)^:::\s*$'
    for source in sorted((ROOT / 'task/access-control').glob('*.qmd')):
        for sid, body in re.findall(solution_pattern, source.read_text(), re.M | re.S):
            require(sid not in sources, f'Повторный исходный ID {sid}')
            sources[sid] = source
            body = re.sub(r'^`{3,}[^\n]*$', '', body, flags=re.M)
            words = norm(body).split()
            require(len(words) >= 12, f'{sid}: короткий исходник решения')
            source_solutions[sid] = {' '.join(words[i:i + 12])
                                     for i in range(len(words) - 11)}
    require(len(sources) == 13, f'Исходники: ожидалось 13 sol-ID, получено {len(sources)}')
    open_sources = []
    for source in ROOT.rglob('*.qmd'):
        relative = source.relative_to(ROOT)
        if any(part.startswith(('_', '.')) for part in relative.parts):
            continue
        open_sources.append(norm(re.sub(solution_pattern, '', source.read_text(), flags=re.M | re.S)))
    open_text = '\n'.join(open_sources)
    search = list(student.rglob('search.json'))
    require(bool(search), 'Нет student search.json')
    solution_texts = {}
    for sid, source in sources.items():
        relative = source.relative_to(ROOT).with_suffix('.html')
        public_html = (student / relative).read_text()
        content = Solutions((full / relative).read_text()).content
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
        for source in (ROOT / 'theory/assets/access-control').iterdir():
            if source.is_file():
                target = site / source.relative_to(ROOT)
                require(target.is_file() and target.read_bytes() == source.read_bytes(),
                        f'{site.name}: изменён/потерян ресурс {source.name}')
        page = site / 'theory/access-control/access-control.html'
        text = page.read_text()
        for name in ('architecture', 'dac', 'mac', 'rbac', 'session'):
            require(f'../assets/access-control/{name}.html' in text,
                    f'{page.name}: потеряна схема {name}')
        require('access-figure' in text and '@media print' in text and text.count('<iframe') == 5,
                f'{page.name}: потеряно интерактивное/печатное представление')
        slides = site / 'seminars/04-access-control.html'
        require(slides.is_file() and 'class="reveal"' in slides.read_text(),
                f'{site.name}: нет Reveal семинара 4')
    print('PASS site: 13 решений только в full; student HTML/search/resources; 5 схем и печать; Reveal')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='mode', required=True)
    commands.add_parser('body').add_argument('model', type=Path)
    site = commands.add_parser('site')
    site.add_argument('student', type=Path)
    site.add_argument('full', type=Path)
    args = parser.parse_args()
    try:
        if args.mode == 'body':
            check_body(args.model.resolve())
        else:
            check_site(args.student.resolve(), args.full.resolve())
    except (ValueError, KeyError, IndexError, OSError) as error:
        parser.exit(1, f'FAIL {error}\n')


if __name__ == '__main__':
    main()
