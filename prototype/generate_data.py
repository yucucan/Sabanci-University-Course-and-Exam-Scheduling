"""
Generates a SMALL SYNTHETIC test instance for the course timetabling prototype.

IMPORTANT: Every value in this file is invented for testing the code.
None of it describes Sabancı University. Replace the CSV files with real
(or anonymized) data from the Registrar's Office when it becomes available.

The CSV columns follow the fields the Registrar's Office named in S1/S2
(Dist. of Hours, Class Reqs, capacity / expected enrollment, academic blocks,
instructor unavailability, common activity hours, fixed time requests).
"""
import csv
import os
import random

random.seed(42)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT, exist_ok=True)

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
N_SLOTS = 10  # 10 one-hour slots per day (illustrative grid)


def write(name, header, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


# ---------------- time grid ----------------
write("time_grid.csv", ["day", "slot", "label"],
      [(d, s, f"{8 + s}:00-{9 + s}:00") for d in DAYS for s in range(N_SLOTS)])

# ---------------- classrooms ----------------
rooms = [
    ("R101", 30, ""), ("R102", 40, ""), ("R103", 60, ""),
    ("R201", 120, ""), ("LAB1", 35, "computer"), ("LAB2", 25, "computer"),
    ("R301", 80, "projector"),
]
write("rooms.csv", ["room", "capacity", "equipment"], rooms)

# ---------------- sections ----------------
# (course, section, instructor, dist_of_hours, expected_enrollment, class_req)
sections = [
    ("MATH101", "A", "INS01", "2+2", 110, ""),
    ("MATH101", "B", "INS02", "2+2", 55, ""),
    ("PHYS101", "A", "INS03", "2+1", 100, ""),
    ("PHYS101R", "A", "INS09", "1", 35, ""),          # recitation
    ("CS201", "A", "INS04", "2+1", 75, "projector"),
    ("CS201L", "A", "INS10", "2", 30, "computer"),     # lab
    ("ENS205", "A", "INS05", "3", 58, ""),
    ("IE311", "A", "INS06", "2+1", 38, ""),
    ("IE311", "B", "INS06", "2+1", 28, ""),
    ("MATH306", "A", "INS02", "2+1", 40, ""),
    ("DSA210", "A", "INS07", "2+2", 60, ""),
    ("SPS303", "A", "INS08", "3", 110, ""),
    ("ECON201", "A", "INS11", "2+1", 50, ""),
    ("ECON201", "B", "INS11", "2+1", 45, ""),
    ("IE413", "A", "INS06", "2+1", 35, ""),
    ("CS204", "A", "INS04", "2+2", 70, "projector"),
    ("CS204L", "A", "INS10", "2", 24, "computer"),
    ("HIST191", "A", "INS12", "2", 115, ""),
    ("HIST191", "B", "INS12", "2", 100, ""),
    ("MGMT301", "A", "INS13", "3", 40, ""),
    ("IE413", "B", "INS14", "1+2", 30, ""),
    ("ECON301", "A", "INS15", "1", 25, ""),
]
write("sections.csv",
      ["course", "section", "instructor", "dist_of_hours",
       "expected_enrollment", "class_req"],
      sections)

# ---------------- academic blocks ----------------
# Courses in the same block must not overlap (mirrors the S2 example structure).
blocks = [
    ("B1", "MATH101"), ("B1", "PHYS101"), ("B1", "HIST191"),
    ("B2", "ENS205"), ("B2", "CS201"), ("B2", "CS201L"),
    ("B3", "CS204"), ("B3", "CS204L"), ("B3", "DSA210"), ("B3", "IE311"),
    ("B3", "MATH306"), ("B3", "SPS303"),
    ("B4", "IE413"), ("B4", "ECON201"), ("B4", "MGMT301"),
]
write("academic_blocks.csv", ["block", "course"], blocks)

# ---------------- instructor unavailability ----------------
unavail = []
for ins in ["INS01", "INS03", "INS06", "INS11"]:
    day = random.choice(DAYS)
    for s in range(N_SLOTS):
        unavail.append((ins, day, s))          # whole day off
unavail += [("INS04", "Fri", s) for s in range(5, N_SLOTS)]
write("instructor_unavailability.csv", ["instructor", "day", "slot"], unavail)

# ---------------- instructor preferences (soft) ----------------
# penalty > 0 means "would rather not teach then"
prefs = []
for ins in ["INS02", "INS05", "INS07", "INS08", "INS12"]:
    for d in DAYS:
        prefs.append((ins, d, 0, 3))           # dislikes first slot
        prefs.append((ins, d, N_SLOTS - 1, 2))  # dislikes last slot
write("instructor_preferences.csv", ["instructor", "day", "slot", "penalty"], prefs)

# ---------------- common activity hours ----------------
write("common_hours.csv", ["day", "slot"], [("Wed", 5), ("Wed", 6)])

# ---------------- fixed time requests ----------------
# (course, section, session_index, day, start_slot)
write("fixed_times.csv", ["course", "section", "session", "day", "start_slot"],
      [("SPS303", "A", 0, "Tue", 2)])

print(f"Synthetic instance written to {OUT}: "
      f"{len(sections)} sections, {len(rooms)} rooms, {len(DAYS) * N_SLOTS} slots")


# =====================================================================
# Relaxation weights: how "costly" it is to break each relaxable rule.
# Used only by diagnose.py. Equal weights are a PLACEHOLDER: which rule is
# easier to relax is the Registrar's Office's decision [OPEN].
# =====================================================================
write("relaxation_weights.csv", ["rule", "weight", "unit", "description"], [
    ("R3", 1, "per clashing hour", "Academic block clash"),
    ("R5", 1, "per unavailable hour used", "Instructor teaches in an unavailable hour"),
    ("R6", 1, "per session", "Class in a common academic activity hour"),
    ("R7", 1, "per session", "Faculty's fixed time request not kept"),
    ("R12", 0.1, "per missing seat (10 missing seats = 1)", "Room smaller than expected enrollment"),
    ("C5", 1, "per day", "Two sessions of a section on the same day"),
])

# =====================================================================
# Scenario "tight": the same instance made harder ON PURPOSE, so that some
# sections cannot be placed. Used to demonstrate the diagnosis.
#   - the only 120-seat room (R201) is closed (e.g., renovation)
#   - INS06 is available only on Monday and Tuesday mornings
# =====================================================================
import shutil
TIGHT = os.path.join(os.path.dirname(OUT), "scenario_tight")
if os.path.exists(TIGHT):
    shutil.rmtree(TIGHT)
shutil.copytree(OUT, TIGHT)
with open(os.path.join(TIGHT, "rooms.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["room", "capacity", "equipment"])
    w.writerows(r for r in rooms if r[0] != "R201")
tight_unavail = [u for u in unavail if u[0] != "INS06"]
tight_unavail += [("INS06", d, s) for d in DAYS for s in range(N_SLOTS)
                  if not (d in ("Mon", "Tue") and s < 3)]
with open(os.path.join(TIGHT, "instructor_unavailability.csv"), "w", newline="",
          encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["instructor", "day", "slot"])
    w.writerows(tight_unavail)
print(f"Tight scenario written to {TIGHT}")
