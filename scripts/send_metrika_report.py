# -*- coding: utf-8 -*-
"""Run one Yandex Metrika email report immediately."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from metrika_report import load_corporate_cycles, run_cycle_report_job, run_due_cycle_reports, run_weekly_report_job


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    parser = argparse.ArgumentParser(description="Send Yandex Metrika reports")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--weekly", action="store_true", help="send weekly report (default)")
    actions.add_argument("--due-cycles", action="store_true", help="send due unsent cycles")
    actions.add_argument("--cycle-id", metavar="ID", help="force-send a cycle and mark it sent")
    args = parser.parse_args()
    if args.due_cycles:
        run_due_cycle_reports()
    elif args.cycle_id:
        cycle = next((item for item in load_corporate_cycles() if item.get("id") == args.cycle_id), None)
        if cycle is None:
            parser.error(f"unknown cycle id: {args.cycle_id}")
        run_cycle_report_job(cycle, force=True)
    else:
        run_weekly_report_job(force=True)
