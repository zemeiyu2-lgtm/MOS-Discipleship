#!/usr/bin/env python3
# MOS-DIS / BILA V2.0 curriculum integrity validator
# Standard library only.

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEEK_FILE = ROOT / "mos-52w.csv"
DAY_FILE = ROOT / "mos-364d.csv"

EXPECTED_STEPS = ["看见", "挖根", "回经文", "对照", "行动", "关系", "回顾"]
FORBIDDEN_COLUMNS = {"score", "points", "rank", "ranking", "积分", "评分", "排名"}

def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def fail(msg):
    print("FAIL:", msg)
    raise SystemExit(1)

weeks = read_csv(WEEK_FILE)
days = read_csv(DAY_FILE)

if len(weeks) != 52:
    fail(f"52周表应为52行，实际 {len(weeks)} 行")
if len(days) != 364:
    fail(f"364日表应为364行，实际 {len(days)} 行")

week_nums = [int(r["week"]) for r in weeks]
if week_nums != list(range(1, 53)):
    fail("52周编号不是连续的 1–52")

if len({r["week"] for r in weeks}) != 52:
    fail("52周存在重复周号")

day_ids = [r["day_id"] for r in days]
if len(set(day_ids)) != 364:
    fail("364日存在重复 day_id")

for row in days:
    m = re.fullmatch(r"W(\d{2})D(\d{2})", row["day_id"])
    if not m:
        fail(f"非法 day_id: {row['day_id']}")
    w, d = map(int, m.groups())
    if not (1 <= w <= 52 and 1 <= d <= 7):
        fail(f"day_id 越界: {row['day_id']}")
    if int(row["week"]) != w:
        fail(f"day_id 与 week 不一致: {row['day_id']}")
    if int(row["dow"]) != d:
        fail(f"day_id 与 dow 不一致: {row['day_id']}")
    if not row["reference"].strip():
        fail(f"缺少经文: {row['day_id']}")
    if not row["week_theme"].strip() or not row["day_title"].strip():
        fail(f"缺少主题内容: {row['day_id']}")

headers = set(days[0].keys()) | set(weeks[0].keys())
for forbidden in FORBIDDEN_COLUMNS:
    if forbidden in headers:
        fail(f"发现禁止的评分/比较字段: {forbidden}")

by_week = {}
for row in days:
    by_week.setdefault(int(row["week"]), []).append(row)

for w in range(1, 53):
    rows = by_week.get(w, [])
    if len(rows) != 7:
        fail(f"W{w:02d} 应有7日，实际 {len(rows)} 日")
    actual_ids = [r["day_id"] for r in rows]
    expected_ids = [f"W{w:02d}D{d:02d}" for d in range(1, 8)]
    if actual_ids != expected_ids:
        fail(f"W{w:02d} 日序不完整或错序")
    steps = [r["day_title"] for r in rows]
    if steps != EXPECTED_STEPS:
        fail(f"W{w:02d} 七步结构异常: {steps}")

    week = weeks[w - 1]
    for row in rows:
        if row["stage"] != week["stage"]:
            fail(f"{row['day_id']} stage 与周表不一致")
        if row["week_theme"] != week["sunday_theme"]:
            fail(f"{row['day_id']} week_theme 与周主题不一致")
        if row["week_guide"] != week["bila_theme"]:
            fail(f"{row['day_id']} week_guide 与 BILA 周主题不一致")
        if row["reference"] != week["reference"]:
            fail(f"{row['day_id']} 经文与周表不一致")

print("PASS: MOS-DIS / BILA V2.0 curriculum integrity")
print("52周 =", len(weeks))
print("364日 =", len(days))
print("每周7日 = PASS")
print("七步结构 = PASS")
print("经文/主题一致性 = PASS")
print("评分/排名字段 = PASS")
