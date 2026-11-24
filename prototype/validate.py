"""
Independent check of results/timetable.csv against the input data.
It does not reuse the model code, so a bug in model.py would show up here.
"""
import csv
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def read(*p):
    with open(os.path.join(HERE, *p), encoding="utf-8") as f:
        return list(csv.DictReader(f))


tt = read("results", "timetable.csv")
rooms = {r["room"]: r for r in read("data", "rooms.csv")}
secs = {f'{r["course"]}-{r["section"]}': r for r in read("data", "sections.csv")}
blocks = defaultdict(set)
for r in read("data", "academic_blocks.csv"):
    blocks[r["block"]].add(r["course"])
unavail = {(r["instructor"], r["day"], int(r["slot"])) for r in read("data", "instructor_unavailability.csv")}
common = {(r["day"], int(r["slot"])) for r in read("data", "common_hours.csv")}
fixed = read("data", "fixed_times.csv")

errors = []
hours = []  # (section, course, instructor, room, day, slot)
for r in tt:
    start = int(r["start"].split(":")[0]) - 8
    for h in range(start, start + int(r["hours"])):
        hours.append((r["section"], r["course"], r["instructor"], r["room"], r["day"], h))
        if (r["instructor"], r["day"], h) in unavail:
            errors.append(f"R5 instructor unavailable: {r['section']} {r['day']} {h}")
        if (r["day"], h) in common:
            errors.append(f"R6 common hour used: {r['section']} {r['day']} {h}")
    req = set(filter(None, secs[r["section"]]["class_req"].split(";")))
    have = set(filter(None, rooms[r["room"]]["equipment"].split(";")))
    if not req <= have:
        errors.append(f"R11 equipment missing: {r['section']} in {r['room']}")
    if int(rooms[r["room"]]["capacity"]) < int(r["expected_enrollment"]):
        errors.append(f"R12 room too small: {r['section']} in {r['room']}")


def clash(key, label):
    seen = defaultdict(set)
    for hrec in hours:
        k = key(hrec)
        if k is None:
            continue
        seen[k].add(hrec[0])
    for k, ss in seen.items():
        if len(ss) > 1:
            errors.append(f"{label}: {sorted(ss)} at {k}")


clash(lambda h: (h[3], h[4], h[5]), "(2) room clash")
clash(lambda h: (h[2], h[4], h[5]), "(3) instructor clash")
for b, cs in blocks.items():
    seen = defaultdict(set)
    for h in hours:
        if h[1] in cs:
            seen[(h[4], h[5])].add(h[1])
    for k, c in seen.items():
        if len(c) > 1:
            errors.append(f"(4) block {b} clash: {sorted(c)} at {k}")

days = defaultdict(list)
for r in tt:
    days[r["section"]].append(r["day"])
for s, ds in days.items():
    if len(ds) != len(set(ds)):
        errors.append(f"(5) sessions on same day: {s}")
    if len(ds) != len(secs[s]["dist_of_hours"].split("+")):
        errors.append(f"(1) wrong number of sessions: {s}")

for f in fixed:
    s = f'{f["course"]}-{f["section"]}'
    ok = any(r["section"] == s and r["day"] == f["day"]
             and int(r["start"].split(":")[0]) - 8 == int(f["start_slot"]) for r in tt)
    if not ok:
        errors.append(f"R7 fixed time not kept: {s}")

print(f"Checked {len(tt)} placed sessions, {len(days)} sections.")
print("All checks passed." if not errors else "\n".join(errors))
