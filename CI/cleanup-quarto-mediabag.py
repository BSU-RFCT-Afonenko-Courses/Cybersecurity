"""Убрать только пустые mediabag, оставленные Quarto рядом с исходными QMD."""
from pathlib import Path

root = Path.cwd()
for source in root.rglob('*.qmd'):
    if any(part.startswith(('_', '.')) for part in source.relative_to(root).parts):
        continue
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
