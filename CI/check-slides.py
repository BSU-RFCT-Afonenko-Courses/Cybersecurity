#!/usr/bin/env python3
"""Проверить структуру навигации и учебных блоков готовых слайдов без браузера."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

import yaml


ROOT = Path(__file__).resolve().parents[1]
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())


class Slides(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.stack, self.references, self.scripts = [], [], []
        self.titles, self.groups, self.answers = 0, 0, []
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = set(attrs.get('class', '').split())
        identifier = attrs.get('id', '')
        inside = (bool(self.stack) and self.stack[-1]['inside']) or 'slides' in classes
        self.titles += identifier == 'title-slide'
        if inside and tag == 'section' and {'slide', 'level1'} <= classes and identifier != 'title-slide':
            self.groups += 1
        if identifier.startswith('sol-') or 'course-answer' in classes:
            self.answers.append(identifier or '.course-answer')
        reference = {'id': attrs['data-qrc-ref'], 'text': []} if inside and 'data-qrc-ref' in attrs else None
        if reference is not None:
            self.references.append(reference)
        script = {'attrs': attrs, 'text': []} if tag == 'script' else None
        if script is not None:
            self.scripts.append(script)
        if tag not in VOID:
            self.stack.append({'tag': tag, 'inside': inside, 'reference': reference, 'script': script})

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]['tag'] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        for frame in self.stack:
            for key in ('reference', 'script'):
                if frame[key] is not None:
                    frame[key]['text'].append(data)

    def problems(self):
        problems = []
        if self.titles != 1:
            problems.append(f'ожидается один #title-slide, найдено {self.titles}')
        if self.groups < 2:
            problems.append(f'нужно не менее двух тематических групп section.level1, найдено {self.groups}')
        if self.answers:
            problems.append(f'на слайды попали решения: {", ".join(self.answers[:3])}')
        expanded = [ref['id'] for ref in self.references if ''.join(ref['text']).strip() != '[*]']
        if expanded:
            problems.append(f'ссылки QRC должны иметь текст [*]: {", ".join(expanded[:3])}')
        loaded = any(urlsplit(script['attrs'].get('src', '')).path.endswith('/course-navigation/plugin.js')
                     for script in self.scripts)
        registered = any(re.search(r'plugins\s*:\s*\[[^\]]*\bCourseNavigation\b', ''.join(script['text']))
                         for script in self.scripts)
        if not loaded or not registered:
            problems.append('штатный плагин CourseNavigation должен быть загружен и зарегистрирован')
        contexts = [script for script in self.scripts if script['attrs'].get('id') == 'course-navigation-context']
        try:
            context = json.loads(''.join(contexts[0]['text'])) if len(contexts) == 1 else None
            if not isinstance(context, dict) or not isinstance(context.get('links'), list) or not context['links']:
                raise ValueError('пустой контекст')
        except (ValueError, TypeError):
            problems.append('нужен один корректный course-navigation-context с переходами по курсу')
        return problems


def expected_pages():
    owner = ROOT / 'seminars'
    config = yaml.safe_load((owner / '_quarto.yml').read_text(encoding='utf-8'))
    patterns = config['project']['render']
    selected, excluded = set(), set()
    for pattern in patterns:
        target = excluded if pattern.startswith('!') else selected
        target.update(owner.glob(pattern.removeprefix('!')))
    sources = sorted(path.relative_to(owner) for path in selected - excluded
                     if path.suffix == '.qmd' and path.name != 'index.qmd')
    if not sources:
        raise ValueError('В seminars/_quarto.yml не найдены презентации для проверки')
    return [Path('seminars') / path.with_suffix('.html') for path in sources]


def check_sites(sites):
    pages = expected_pages()
    failures, counts = [], {}
    for site in sites:
        checked = 0
        for relative in pages:
            path = site / relative
            if not path.is_file():
                failures.append(f'{path}: презентация отсутствует')
                continue
            page = Slides(path.read_text(encoding='utf-8'))
            failures.extend(f'{path}: {problem}' for problem in page.problems())
            checked += 1
        counts[str(site)] = checked
    if failures:
        raise ValueError('\n'.join(failures))
    print('Проверены навигация и разметка слайдов:', json.dumps(counts, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sites', nargs='+', type=Path, help='Каталоги готового общего курса')
    args = parser.parse_args()
    try:
        check_sites(args.sites)
    except (OSError, ValueError) as error:
        parser.exit(1, f'Ошибка проверки слайдов:\n{error}\n')
