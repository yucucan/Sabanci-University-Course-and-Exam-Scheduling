"""
Generates a FULL-SCALE SYNTHETIC instance in scenario_full/.

Target size follows the numbers the Registrar's Office gave for Fall 2026-27 (S2):
    654 courses, 1,599 sections, 114 classrooms
and the illustrative grid in the model document: 5 days x 12 hourly slots (08:00-20:00).

IMPORTANT: everything except those three counts is INVENTED to test the code
(course codes, instructors, enrollments, room sizes, blocks, unavailability...).
None of it describes Sabancı University.

Simplifications (see README):
  - "Service" courses with many sections (first-year and university-wide courses)
    are not put into academic blocks, because the strictest block reading in
    constraint (4) would then make most of the week unusable [OPEN].
"""
import csv
import os
import random
from collections import Counter, defaultdict

random.seed(2026)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "scenario_full")
os.makedirs(OUT, exist_ok=True)

N_COURSES, N_SECTIONS, N_ROOMS = 654, 1599, 114
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
N_SLOTS = 12                                    # 08:00-20:00
COMMON = [("Wed", 5), ("Wed", 6)]               # 13:00-15:00 (invented)


def write(name, header, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


# ------------------------------------------------------------------ time grid
write("time_grid.csv", ["day", "slot", "label"],
      [(d, s, f"{8 + s:02d}:00-{9 + s:02d}:00") for d in DAYS for s in range(N_SLOTS)])
write("common_hours.csv", ["day", "slot"], COMMON)

# ------------------------------------------------------------------ rooms (114)
rooms = []
tiers = [  # (prefix, count, cap_low, cap_high)
    ("S", 26, 20, 35),     # seminar rooms
    ("M", 36, 40, 60),     # medium classrooms
    ("L", 28, 65, 90),     # large classrooms
    ("XL", 10, 100, 150),  # very large
    ("A", 4, 180, 300),    # amphitheatres
]
for prefix, count, lo, hi in tiers:
    for i in range(count):
        cap = random.randrange(lo, hi + 1, 5)
        equip = "projector" if random.random() < 0.85 else ""
        rooms.append((f"{prefix}{i + 1:02d}", cap, equip))
for i in range(N_ROOMS - len(rooms)):          # 10 computer labs
    rooms.append((f"LAB{i + 1:02d}", random.randrange(25, 45, 5), "computer;projector"))
assert len(rooms) == N_ROOMS
write("rooms.csv", ["room", "capacity", "equipment"], rooms)

# ------------------------------------------------------------------ courses (654)
PROGRAMS = ["CS", "IE", "EE", "ME", "MAT", "BIO", "DSA", "ECON", "PSY", "POLS",
            "VA", "CULT", "MGMT", "FIN", "MKTG", "OPIM"]
SERVICE_PREFIX = ["MATH", "NS", "SPS", "HIST", "TLL", "IF", "AL", "ENS", "PHYS", "CHEM"]

courses = []     # dict(code, program, term, n_sections, kind)
used = set()


def new_code(prefix, level):
    while True:
        code = f"{prefix}{level}{random.randint(0, 99):02d}"
        if code not in used:
            used.add(code)
            return code


# service courses: many sections, large, never in blocks
n_service = 44
for i in range(n_service):
    prefix = SERVICE_PREFIX[i % len(SERVICE_PREFIX)]
    courses.append(dict(code=new_code(prefix, random.choice([1, 2])), program=None,
                        term=None, kind="service"))
# program courses: 8 terms per program, graduate ones at 5xx
while len(courses) < N_COURSES:
    p = random.choice(PROGRAMS)
    term = random.randint(1, 8)
    grad = random.random() < 0.12
    level = 5 if grad else (term + 1) // 2
    courses.append(dict(code=new_code(p, level), program=p, term=term,
                        kind="grad" if grad else "program"))

# section counts summing exactly to 1,599
for c in courses:
    if c["kind"] == "service":
        c["n"] = random.randint(10, 18)
    elif c["kind"] == "grad":
        c["n"] = 1
    else:
        c["n"] = random.choices([1, 2, 3], weights=[60, 30, 10])[0]
total = sum(c["n"] for c in courses)
prog = [c for c in courses if c["kind"] == "program"]
serv = [c for c in courses if c["kind"] == "service"]
while total != N_SECTIONS:                      # nudge counts to hit the target exactly
    if total < N_SECTIONS:
        c = random.choice(serv)
        if c["n"] < 22:
            c["n"] += 1; total += 1
    else:
        c = random.choice(prog)
        if c["n"] > 1:
            c["n"] -= 1; total -= 1

# ------------------------------------------------------------------ sections
PATTERNS = ["2+1", "2+2", "1+2", "3", "2", "1"]
WEIGHTS = [55, 22, 18, 3, 1, 1]          # ~2 sessions per section
instructors = defaultdict(int)                  # instructor -> weekly hours
pools = defaultdict(list)                       # program -> its instructors
inst_id = 0


def pick_instructor(program, hours):
    """Reuse an instructor of the same program if they have room, else hire a new one."""
    global inst_id
    cands = [i for i in pools[program] if instructors[i] + hours <= 9]
    if cands and random.random() < 0.8:
        return random.choice(cands)
    inst_id += 1
    ins = f"INS{inst_id:03d}"
    pools[program].append(ins)
    return ins


sections = []
for c in courses:
    pattern = random.choices(PATTERNS, WEIGHTS)[0]
    hours = sum(int(h) for h in pattern.split("+"))
    lab = c["kind"] != "service" and c["program"] in ("CS", "DSA", "EE") and random.random() < 0.25
    req = "computer" if lab else ("projector" if random.random() < 0.3 else "")
    for k in range(c["n"]):
        ins = pick_instructor(c["program"] or c["code"][:3], hours)
        instructors[ins] += hours
        if c["kind"] == "service":
            enroll = random.randrange(35, 95, 5)
        elif c["kind"] == "grad":
            enroll = random.randrange(8, 30, 2)
        else:
            base = 90 if c["term"] <= 2 else (60 if c["term"] <= 4 else 40)
            enroll = max(10, min(170, int(random.gauss(base / c["n"] * 1.2, base / 6))))
        if lab:
            enroll = min(enroll, 40)
        sec_name = chr(ord("A") + k) if k < 26 else f"S{k + 1:02d}"
        sections.append((c["code"], sec_name, ins, pattern, enroll, req))
assert len(sections) == N_SECTIONS
write("sections.csv", ["course", "section", "instructor", "dist_of_hours",
                       "expected_enrollment", "class_req"], sections)

# ------------------------------------------------------------------ academic blocks (~350)
pool = defaultdict(list)                        # (program, term) -> courses
for c in courses:
    if c["kind"] == "program" and c["n"] <= 2:  # see docstring
        pool[(c["program"], c["term"])].append(c["code"])
blocks, bid = [], 0
seen = set()
for key, cs in sorted(pool.items()):
    if len(cs) < 2:
        continue
    for _ in range(random.randint(2, 4)):
        size = min(len(cs), random.randint(2, 4))
        members = tuple(sorted(random.sample(cs, size)))
        if members in seen:
            continue
        seen.add(members)
        bid += 1
        blocks += [(f"B{bid:03d}", m) for m in members]
write("academic_blocks.csv", ["block", "course"], blocks)

# ------------------------------------------------------------------ instructors
unavail, prefs = [], []
for ins in instructors:
    r = random.random()
    if r < 0.30:                                # one full day off
        d = random.choice(DAYS)
        unavail += [(ins, d, s) for s in range(N_SLOTS)]
    elif r < 0.45:                              # one afternoon off
        d = random.choice(DAYS)
        unavail += [(ins, d, s) for s in range(6, N_SLOTS)]
    if random.random() < 0.40:                  # dislikes early / late hours
        for d in DAYS:
            prefs += [(ins, d, 0, 3), (ins, d, N_SLOTS - 1, 2), (ins, d, N_SLOTS - 2, 1)]
write("instructor_unavailability.csv", ["instructor", "day", "slot"], unavail)
write("instructor_preferences.csv", ["instructor", "day", "slot", "penalty"], prefs)

# ------------------------------------------------------------------ fixed times (~2% of sessions)
fixed = []
for (course, sec, ins, pattern, enroll, req) in sections:
    if random.random() < 0.02:
        L = int(pattern.split("+")[0])
        day = random.choice(["Mon", "Tue", "Thu", "Fri"])
        start = random.randint(1, N_SLOTS - L - 1)
        if not any(u[0] == ins and u[1] == day and start <= u[2] < start + L for u in unavail):
            fixed.append((course, sec, 0, day, start))
write("fixed_times.csv", ["course", "section", "session", "day", "start_slot"], fixed)

# ------------------------------------------------------------------ relaxation weights
write("relaxation_weights.csv", ["rule", "weight", "unit", "description"], [
    ("R3", 1, "per clashing hour", "Academic block clash"),
    ("R5", 1, "per unavailable hour used", "Instructor teaches in an unavailable hour"),
    ("R6", 1, "per session", "Class in a common academic activity hour"),
    ("R7", 1, "per session", "Faculty's fixed time request not kept"),
    ("R12", 0.1, "per missing seat (10 missing seats = 1)", "Room smaller than expected enrollment"),
    ("C5", 1, "per day", "Two sessions of a section on the same day"),
])

# ------------------------------------------------------------------ summary
sessions = sum(len(p.split("+")) for _, _, _, p, _, _ in sections)
hours = sum(sum(int(h) for h in p.split("+")) for _, _, _, p, _, _ in sections)
room_hours = N_ROOMS * (len(DAYS) * N_SLOTS - len(COMMON))
print(f"Written to {OUT}")
print(f"  courses {len(courses)} | sections {len(sections)} | sessions {sessions} "
      f"| rooms {len(rooms)} | slots {len(DAYS) * N_SLOTS}")
print(f"  instructors {len(instructors)} | academic blocks {bid} | fixed times {len(fixed)}")
print(f"  x variables before filtering: {sessions} x {len(DAYS) * N_SLOTS} x {N_ROOMS} = "
      f"{sessions * len(DAYS) * N_SLOTS * N_ROOMS:,}")
print(f"  teaching hours {hours} / room-hours available {room_hours} "
      f"= {100 * hours / room_hours:.1f}% overall room use")
caps = sorted(r[1] for r in rooms)
print("  capacity check (sections with at least this enrollment vs rooms big enough):")
for lo in [36, 61, 91, 151]:
    need = sum(sum(int(h) for h in p.split("+")) for _, _, _, p, e, _ in sections if e >= lo)
    have = sum(1 for c in caps if c >= lo) * (len(DAYS) * N_SLOTS - len(COMMON))
    print(f"    >= {lo:3d} students: {need:5d} h needed / {have:5d} h available = {100 * need / have:.0f}%")
