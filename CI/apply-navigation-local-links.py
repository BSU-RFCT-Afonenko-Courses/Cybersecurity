#!/usr/bin/env python3
"""Воспроизводимая поправка Navigation 9.3.2 для локального просмотра курса."""
import argparse
from pathlib import Path


SCOPES = (Path('.'), Path('theory'), Path('task'), Path('seminars'))
UI_PATH = Path('_extensions/Afonenko-Course-Tools/course-navigation/navigation/ui.js')
BUILD_ANCHOR = '  function build(model, options, actions) {'
ORIGINAL_LINK = """        const url = new URL(item.href, document.baseURI);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
        link.setAttribute('href', item.href);"""
PATCHED_LINK = """        const href = permanentLinkHref(item, document.baseURI);
        if (href === null) continue;
        link.setAttribute('href', href);"""
HELPER = r"""  // Локальная поправка курса: CI/apply-navigation-local-links.py.
  function permanentLinkHref(item, baseURI) {
    try {
      if (typeof item.href !== 'string' || !item.href.trim()) return null;
      const url = new URL(item.href, baseURI);
      if (url.protocol === 'https:' || url.protocol === 'http:') return item.href;
      const base = new URL(baseURI);
      const relative = item.href === item.href.trim() &&
        !/^[a-z][a-z0-9+.-]*:/i.test(item.href) &&
        !/^[\/]/.test(item.href) && !item.href.includes('\\');
      const courseLink = (item.scope === 'course' || item.scope === 'project') &&
        (item.id === 'root' || /^subproject-[a-z0-9][a-z0-9_-]*$/i.test(item.id || ''));
      if (base.protocol !== 'file:' || url.protocol !== 'file:' ||
          url.host !== base.host || !relative || !courseLink) return null;
      if (url.pathname.endsWith('/')) url.pathname += 'index.html';
      return url.href;
    } catch (_) {
      return null;
    }
  }
"""


def patch_ui(source):
    """Не изменять неизвестную версию или частично применённую поправку."""
    patched_anchor = HELPER + BUILD_ANCHOR
    if source.count(patched_anchor) == 1 and source.count(PATCHED_LINK) == 1:
        if ORIGINAL_LINK in source:
            raise ValueError('Одновременно найдены исходная и исправленная проверки URL')
        return source
    if (source.count(BUILD_ANCHOR) != 1 or source.count(ORIGINAL_LINK) != 1
            or 'function permanentLinkHref(' in source or PATCHED_LINK in source):
        raise ValueError('Ожидаемый фрагмент Navigation 9.3.2 не найден; проверьте новую версию')
    return source.replace(BUILD_ANCHOR, patched_anchor, 1).replace(ORIGINAL_LINK, PATCHED_LINK, 1)


def apply(root):
    prepared = []
    # Сначала проверить все копии: несовместимый выпуск не оставляет часть файлов изменённой.
    for scope in SCOPES:
        path = root / scope / UI_PATH
        source = path.read_text()
        try:
            result = patch_ui(source)
        except ValueError as error:
            raise ValueError(f'{path}: {error}') from error
        prepared.append((path, source, result))
    for path, source, result in prepared:
        if result != source:
            path.write_text(result)
            print(f'Поправка Navigation: {path.relative_to(root)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1],
                        help='Корень курса с четырьмя установленными копиями Navigation')
    args = parser.parse_args()
    apply(args.root.resolve())
