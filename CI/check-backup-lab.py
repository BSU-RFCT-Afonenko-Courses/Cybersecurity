#!/usr/bin/env python3
"""Проверка файлов опыта: python3 check-backup-lab.py /tmp/backup-lab.XXXXXX.

Запускается после всех блоков .lab-run из docs/demonstrations/backup-lab.qmd.
Ничего не меняет; абсолютные пути каталога BB должны оставаться доступными.
"""

import configparser
from pathlib import Path
import sys


STATES = {
    "S0": {"plan.txt": b"plan-v0\n", "budget.csv": b"sum,100\n",
           "readme.txt": b"readme-v0\n"},
    "S1": {"plan.txt": b"plan-v1\n", "budget.csv": b"sum,100\n",
           "readme.txt": b"readme-v0\n", "notes.txt": b"notes-v0\n"},
    "S2": {"plan.txt": b"plan-v1\n", "budget.csv": b"sum,120\n",
           "readme.txt": b"readme-v0\n", "notes.txt": b"notes-v0\n"},
    "S3": {"plan.txt": b"plan-v2\n", "readme.txt": b"readme-v0\n",
           "notes.txt": b"notes-v0\n"},
}
MODES = ("full", "incremental", "differential", "mirror")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_tree(path, state):
    require(path.is_dir(), f"Нет папки {path}")
    entries = list(path.rglob("*"))
    require(all(p.is_file() and not p.is_symlink() for p in entries),
            f"Неожиданные вложенные папки или ссылки: {path}")
    actual = {p.relative_to(path).as_posix(): p.read_bytes() for p in entries}
    require(actual == STATES[state],
            f"{path}: ожидалось {state} {STATES[state]!r}, получено {actual!r}")


def identity(path):
    info = path.stat()
    return info.st_dev, info.st_ino


def check(root):
    paths = {}
    for mode in MODES:
        catalog = configparser.ConfigParser()
        catalog.read(root / "copies" / mode / ".catalog.cfg")
        require(len(catalog.sections()) == 4, f"{mode}: нужны ровно 4 записи")
        ids = []
        for stage in STATES:
            bid = (root / "ids" / f"{mode}-{stage}.txt").read_text().strip()
            ids.append(bid)
            record = catalog[bid]
            expected_type = "full" if stage == "S0" and mode != "mirror" else mode
            require(record["type"] == expected_type, f"{mode}/{stage}: тип копии")
            require(record["status"] == "0", f"{mode}/{stage}: ошибка BB")
            path = Path(record["path"])
            require(path.is_relative_to(root / "copies" / mode),
                    f"{mode}/{stage}: путь вне отдельного каталога")
            paths[mode, stage] = path
            check_tree(path / "project", "S3" if mode == "mirror" else stage)
        require(len(set(ids)) == 4, f"{mode}: ID этапов должны различаться")
        unique_paths = {paths[mode, s] for s in STATES}
        require(len(unique_paths) == (1 if mode == "mirror" else 4),
                f"{mode}: неверное число путей состояний")

    for mode in MODES[:3]:
        readmes = {identity(paths[mode, s] / "project/readme.txt") for s in STATES}
        require(len(readmes) == (4 if mode == "full" else 1),
                f"{mode}: совместное хранение неизменного файла")
        same_plan = (identity(paths[mode, "S1"] / "project/plan.txt") ==
                     identity(paths[mode, "S2"] / "project/plan.txt"))
        require(same_plan == (mode == "incremental"),
                f"{mode}: неверная база для повторной версии plan-v1")
        for stage in ("S1", "S3"):
            check_tree(root / "restore" / f"{mode}-{stage}" / "project", stage)

    for stage in ("S1", "S3"):
        check_tree(root / "restore" / f"mirror-{stage}" / "project", "S3")
    check_tree(root / "restore/incremental-S2/project", "S2")
    check_tree(root / "project", "S3")
    require((root / "recovered-budget.csv").read_bytes() == b"sum,120\n",
            "Возвращена неверная смета")
    print("Проверены 16 записей копий, 9 восстановлений, рабочая S3, "
          "возврат сметы и совместное хранение файлов.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Укажите путь к исходному каталогу LAB.")
    try:
        check(Path(sys.argv[1]).resolve())
    except (OSError, KeyError, ValueError) as error:
        raise SystemExit(f"Проверка не пройдена: {error}") from error
