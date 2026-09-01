# -*- coding: utf-8 -*-
"""Isolated KB rebuild for Sep 2026 NPA batch (no full raw/ process)."""
from __future__ import annotations

import datetime
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import process_kb as pk  # noqa: E402

BATCH_TXT = ROOT / "raw_batch_sep2026" / "txt"
ISO_RAW = ROOT / "raw_batch_sep2026" / "iso_raw"
ISO_KB = ROOT / "raw_batch_sep2026" / "iso_kb"
FE = ROOT / "future_extension"
KB = ROOT / "kb"

# ConsultantPlus-style names so parse_filename works
SOURCES = [
    (
        "npa_mpr_227_uchet.txt",
        "npa__mpr1__PR__MPR__16_04_2026_227 ОБ УТВЕРЖДЕНИИ ПОРЯДКА УЧЕТА В ОБЛАСТИ ОБРАЩЕНИЯ С ОТХОДАМИ.txt",
    ),
    (
        "npa_mpr_182_deklaraciya.txt",
        "npa__mpr1__PR__MPR__01_04_2026_182 ОБ УТВЕРЖДЕНИИ ПОРЯДКА ПРЕДСТАВЛЕНИЯ ДЕКЛАРАЦИИ О ПЛАТЕ ЗА НЕГАТИВНОЕ ВОЗДЕЙСТВИЕ.txt",
    ),
    (
        "npa_rpn_242_fkko.txt",
        "npa__rpn1__PR__RPN__22_05_2017_242 ОБ УТВЕРЖДЕНИИ ФЕДЕРАЛЬНОГО КЛАССИФИКАЦИОННОГО КАТАЛОГА ОТХОДОВ ФККО.txt",
    ),
]

EXPECTED_STEMS = {
    "227": None,  # discover after run
    "182": None,
    "242": "242-PR-RPN-utverzhdenii-federalnogo-klassifikacionnogo-kataloga-othodov-fkko.md",
}

SUPERSEDED_KB = [
    "1028-PR-Minprirody-utverzhdenii-poryadka-ucheta-oblasti-obrascheniya-othodami.md",
    "1043-PR-Minprirody-utverzhdenii-poryadka-predostavleniya-deklaracii-plate-za.md",
    "241-PR-Minprirody-deklaraciya-plate-za-negativnoe-vozdeystvie-okruzhayuschuyu.md",
]


def prepare_iso_raw() -> None:
    if ISO_RAW.exists():
        shutil.rmtree(ISO_RAW)
    if ISO_KB.exists():
        shutil.rmtree(ISO_KB)
    ISO_RAW.mkdir(parents=True)
    ISO_KB.mkdir(parents=True)
    for src_name, dest_name in SOURCES:
        src = BATCH_TXT / src_name
        if not src.exists():
            raise SystemExit(f"Missing {src}")
        shutil.copy2(src, ISO_RAW / dest_name)
        print(f"iso_raw: {dest_name}")


def run_process() -> None:
    pk.RAW_DIR = str(ISO_RAW)
    pk.KB_DIR = str(ISO_KB)
    pk.TODAY = datetime.date(2026, 9, 1)
    pk.TODAY_STR = "2026-09-01"
    pk.REPORT_PATH = str(ROOT / "raw_batch_sep2026" / "Processing_kb_batch_report.md")
    pk.main()


def install_outputs() -> list[str]:
    FE.mkdir(parents=True, exist_ok=True)
    installed: list[str] = []
    produced = list(ISO_KB.glob("*.md"))
    print("produced:", [p.name for p in produced])

    by_num: dict[str, Path] = {}
    for p in produced:
        for num in ("227", "182", "242"):
            if p.name.startswith(num + "-"):
                by_num[num] = p

    if set(by_num) != {"227", "182", "242"}:
        raise SystemExit(f"Unexpected outputs: {by_num}")

    # 242: keep stable stem used by eval/docs
    target_242 = KB / EXPECTED_STEMS["242"]
    shutil.copy2(by_num["242"], target_242)
    installed.append(target_242.name)
    if by_num["242"].name != target_242.name:
        print(f"242 renamed {by_num['242'].name} -> {target_242.name}")

    for num in ("227", "182"):
        dest = KB / by_num[num].name
        shutil.copy2(by_num[num], dest)
        installed.append(dest.name)

    for name in SUPERSEDED_KB:
        src = KB / name
        if src.exists():
            dest = FE / name
            shutil.move(str(src), str(dest))
            print(f"retired {name} -> future_extension/")

    # Replace active raw copies so future full process_kb won't resurrect old texts
    raw = ROOT / "raw"
    replacements = {
        "npa__mpr1__PR__MPR__08_12_2020_1028 ОБ УТВЕРЖДЕНИИ ПОРЯДКА УЧЕТА В ОБЛАСТИ ОБРАЩЕНИЯ С ОТХОДАМИ.txt": None,
        "npa__mpr1__PR__MPR__10_12_2020_1043 ОБ УТВЕРЖДЕНИИ ПОРЯДКА ПРЕДОСТАВЛЕНИЯ ДЕКЛАРАЦИИ  О ПЛАТЕ ЗА НЕГАТИВНОЕ ВОЗДЕЙСТВИЕ.txt": None,
        "npa__mpr1__PR__MPR__29_04_2025_241 ДЕКЛАРАЦИЯ о плате за негативное воздействие на окружающую среду.txt": None,
    }
    # Archive superseded raw into future_extension/raw_archived
    arch = FE / "raw_archived_sep2026"
    arch.mkdir(parents=True, exist_ok=True)
    for pattern_prefix, _ in [
        ("npa__mpr1__PR__MPR__08_12_2020_1028", "1028"),
        ("npa__mpr1__PR__MPR__10_12_2020_1043", "1043"),
        ("npa__mpr1__PR__MPR__29_04_2025_241", "241"),
        ("npa__mpr1__PR_MPR_13_12_2023_825", "825"),
    ]:
        for p in raw.glob(pattern_prefix + "*"):
            shutil.move(str(p), str(arch / p.name))
            print(f"archived raw {p.name}")

    # Replace FKKO raw with new dump
    old_242 = list(raw.glob("npa__rpn1__PR*242*ФККО*.txt")) + list(
        raw.glob("npa__rpn1__PR*242*fkko*.txt")
    )
    # also latin/cyrillic variants
    old_242 = list(raw.glob("*242*ФККО*.txt")) + list(raw.glob("*242*FKKO*.txt"))
    old_242 = list({p.resolve() for p in old_242})
    for p in old_242:
        shutil.move(str(p), str(arch / p.name))
        print(f"archived old fkko raw {p.name}")

    new_242_name = (
        "npa__rpn1__PR__RPN__22_05_2017_242 ОБ УТВЕРЖДЕНИИ ФЕДЕРАЛЬНОГО "
        "КЛАССИФИКАЦИОННОГО КАТАЛОГА ОТХОДОВ ФККО.txt"
    )
    shutil.copy2(ISO_RAW / new_242_name, raw / new_242_name)

    new_227_name = (
        "npa__mpr1__PR__MPR__16_04_2026_227 ОБ УТВЕРЖДЕНИИ ПОРЯДКА УЧЕТА "
        "В ОБЛАСТИ ОБРАЩЕНИЯ С ОТХОДАМИ.txt"
    )
    new_182_name = (
        "npa__mpr1__PR__MPR__01_04_2026_182 ОБ УТВЕРЖДЕНИИ ПОРЯДКА "
        "ПРЕДСТАВЛЕНИЯ ДЕКЛАРАЦИИ О ПЛАТЕ ЗА НЕГАТИВНОЕ ВОЗДЕЙСТВИЕ.txt"
    )
    shutil.copy2(ISO_RAW / new_227_name, raw / new_227_name)
    shutil.copy2(ISO_RAW / new_182_name, raw / new_182_name)

    return installed


def main() -> None:
    prepare_iso_raw()
    run_process()
    installed = install_outputs()
    print("INSTALLED", installed)
    # sanity: superseded gone from kb root
    for name in SUPERSEDED_KB:
        assert not (KB / name).exists(), name
    assert (KB / EXPECTED_STEMS["242"]).exists()
    print("OK")


if __name__ == "__main__":
    main()
