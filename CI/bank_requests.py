"""Однозначно сгруппировать включаемые условия по свежим каноническим исходникам."""
import re

def group_requests(needed, sources):
    indexed = {}
    for source in sorted(sources):
        for identifier in set(re.findall(r'\{#(exr-[\w-]+)(?:\s|\})', source.read_text())):
            indexed.setdefault(identifier, []).append(source)
    groups = {}
    for identifier in sorted(needed):
        matches = indexed.get(identifier, [])
        if len(matches) != 1:
            raise ValueError(f'Ожидался один канонический источник {identifier}: {matches}')
        groups.setdefault(matches[0], []).append(identifier)
    return groups
