#!/usr/bin/env python3
"""Подготовить отдельный проект просмотра черновиков, не меняя курс.

python3 docs/drafts/technical-seminars-migration/checks/prepare-draft-preview.py \
    /tmp/cybersecurity-draft-preview
Затем в полученном каталоге: quarto render --profile student (или full).
Нужны зависимости действующего CI/prepare-bank-fragments.py и Quarto.
"""

import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[4]
DRAFT = ROOT / "docs/drafts/technical-seminars-migration"
TOPICS = ("access-control", "crypto", "data-trust", "data-preservation")
THEORY = ("access-control", "randomness", "integrity-keys",
          "signature-certificates", "backups", "error-control-raid")


def nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child)


def preview_links(text, source):
    """HTML для шести объяснений; авторские заметки читаются в GitHub."""
    def replace(match):
        path, anchor = match.group(1), match.group(2) or ""
        if ":" in path or path.startswith("#"):
            return match.group(0)
        target = (source.parent / path).resolve()
        if target.parent == DRAFT / "theory" and target.stem in THEORY:
            return "](" + path[:-3] + ".html" + anchor + ")"
        if target.is_relative_to(ROOT):
            url = ("https://github.com/BSU-RFCT-Afonenko-Courses/Cybersecurity/"
                   "blob/codex/technical-seminars-tasks-20261108/")
            return "](" + url + target.relative_to(ROOT).as_posix() + anchor + ")"
        return match.group(0)
    return re.sub(r"\]\(([^)\s]+\.md)(#[^)\s]+)?\)", replace, text)


def prepare(output):
    if output.exists():
        raise ValueError("Каталог результата уже существует; выберите новый.")
    if output.is_relative_to(ROOT):
        raise ValueError("Проект просмотра должен находиться вне исходного репозитория.")
    for name in THEORY:
        if not (DRAFT / "theory" / f"{name}.md").is_file():
            raise ValueError(f"Не найдено объяснение {name}")
    for name in TOPICS:
        if not (DRAFT / "slides" / f"{name}.qmd").is_file():
            raise ValueError(f"Не найден сценарий {name}")
    output.mkdir(parents=True)
    shutil.copytree(ROOT / "_extensions", output / "_extensions")
    shutil.copytree(DRAFT / "slides", output / "slides")
    shutil.copytree(DRAFT / "visuals", output / "visuals")
    # Quarto может сохранять относительный ресурс включения к файлу фрагмента.
    shutil.copytree(DRAFT / "visuals", output / "_prepared/visuals")
    shutil.copytree(DRAFT / "tasks", output / "tasks")
    (output / "theory").mkdir()
    for name in THEORY:
        src = DRAFT / "theory" / f"{name}.md"
        text = src.read_text()
        # Временные QMD нужны для штатного native HTML-рендера.
        text = preview_links(text, src)
        (output / "theory" / f"{name}.qmd").write_text(text)
    for page in (output / "slides").glob("*.qmd"):
        text = page.read_text()
        text = preview_links(text, DRAFT / "slides" / page.name)
        # Отдельный проект не публикует абсолютный логотип сайта курса.
        text = text.replace("  revealjs:\n", "  revealjs:\n    logo: false\n", 1)
        page.write_text(text)
    # Существующий штатный отбор работает только с каноническим task/bank.
    # Временная копия сохраняет этот контракт; исходники курса не заменяются.
    with tempfile.TemporaryDirectory(prefix="cybersecurity-draft-bank-") as tmp:
        staging = Path(tmp)
        (staging / "CI").mkdir()
        (staging / "task/bank").mkdir(parents=True)
        shutil.copy(ROOT / "CI/prepare-bank-fragments.py", staging / "CI")
        shutil.copy(ROOT / "task/bank/_metadata.yml", staging / "task/bank")
        for topic in TOPICS:
            source = staging / "task/bank" / f"{topic}.qmd"
            shutil.copy(DRAFT / "tasks" / source.name, source)
            ast = json.loads(subprocess.check_output(
                ["quarto", "pandoc", str(source), "-f", "markdown", "-t", "json"],
                text=True))
            identifiers = [n["c"][0][0] for n in nodes(ast)
                           if n.get("t") == "Div" and n["c"][0][0].startswith("exr-")]
            args = [sys.executable, str(staging / "CI/prepare-bank-fragments.py"),
                    "--source", str(source), "--output",
                    str(staging / "prepared")]
            for identifier in identifiers:
                args.extend(["--id", identifier])
            subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
        shutil.copytree(staging / "prepared", output / "_prepared/bank-fragments")
    (output / "_quarto.yml").write_text("""project:
  type: default
  output-dir: _output
  render:
    - theory/*.qmd
    - slides/*.qmd
  pre-render:
    - _extensions/Afonenko-Course-Tools/course-core/entrypoints/pre.ts
  post-render:
    - _extensions/Afonenko-Course-Tools/course-core/entrypoints/post.ts
filters:
  - course-core
  - course-presentation
lang: ru
html-math-method: mathml
format:
  html:
    html-math-method: mathml
    toc: true
course-presentation:
  answers: auto
""")
    for profile in ("student", "full"):
        (output / f"_quarto-{profile}.yml").write_text(
            f"project:\n  output-dir: _output/{profile}\ncourse:\n  view: {profile}\n")
    print(output)
    print("Просмотр: quarto render --profile student; quarto render --profile full")
    print("Сборка проверяет только отдельный черновой проект, не действующий курс.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Укажите новый абсолютный каталог результата вне репозитория.")
    try:
        prepare(Path(sys.argv[1]).resolve())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Подготовка просмотра не выполнена: {error}") from error
