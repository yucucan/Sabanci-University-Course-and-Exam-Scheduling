"""
Course timetabling prototype — implements "Course Timetabling Model — Draft v0".

Decides, for every session of every section, a starting slot and a room.
Constraint numbers (1)-(5) and BRD rows (R..) match the model document.

Usage:
    python model.py                      # Option A: minimize unplaced sections
    python model.py --objective seats    # Option B: minimize wasted seats
    python model.py --soft-capacity      # allow rooms smaller than expected enrollment
    python model.py --time-limit 60
"""
import argparse
import csv
import os
from collections import defaultdict

import pulp

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
RESULTS = os.path.join(HERE, "results")


# ---------------------------------------------------------------- data loading
def set_data_dir(path):
    """Point the model at another data folder (e.g. a scenario)."""
    global DATA
    DATA = path if os.path.isabs(path) else os.path.join(HERE, path)


def read(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load():
    grid = read("time_grid.csv")
    days = list(dict.fromkeys(r["day"] for r in grid))
    n_slots = max(int(r["slot"]) for r in grid) + 1
    labels = {(r["day"], int(r["slot"])): r["label"] for r in grid}

    rooms = {r["room"]: {"cap": int(r["capacity"]),
                         "equip": set(filter(None, r["equipment"].split(";")))}
             for r in read("rooms.csv")}

    sections = {}
    for r in read("sections.csv"):
        sid = f'{r["course"]}-{r["section"]}'
        sections[sid] = {
            "course": r["course"],
            "instructor": r["instructor"],
            "lengths": [int(x) for x in r["dist_of_hours"].split("+")],  # R8
            "enroll": int(r["expected_enrollment"]),
            "req": set(filter(None, r["class_req"].split(";"))),
        }

    blocks = defaultdict(set)
    for r in read("academic_blocks.csv"):
        blocks[r["block"]].add(r["course"])

    unavail = {(r["instructor"], r["day"], int(r["slot"]))
               for r in read("instructor_unavailability.csv")}
    pref = {(r["instructor"], r["day"], int(r["slot"])): int(r["penalty"])
            for r in read("instructor_preferences.csv")}
    common = {(r["day"], int(r["slot"])) for r in read("common_hours.csv")}
    fixed = {(f'{r["course"]}-{r["section"]}', int(r["session"])):
             (r["day"], int(r["start_slot"])) for r in read("fixed_times.csv")}

    return dict(days=days, n_slots=n_slots, labels=labels, rooms=rooms,
                sections=sections, blocks=blocks, unavail=unavail, pref=pref,
                common=common, fixed=fixed)


# ------------------------------------------------- preprocessing: allowed set A_sk
def build_allowed(D, soft_capacity, relax=None):
    """A[(s,k)] = list of (day, start, room) pairs.

    Normal mode: only pairs that pass every rule.
    Relax mode (relax = {rule: weight}): pairs that break a relaxable rule are kept,
    and D["viol"][(s,k,day,t,r)] lists the rules they break. Physical rules
    (session fits in the day, room equipment) are never relaxed.
    """
    relax = relax or {}
    A, V = {}, {}
    for s, sec in D["sections"].items():
        for k, length in enumerate(sec["lengths"]):
            options = []
            for day in D["days"]:
                for t in range(D["n_slots"] - length + 1):       # fits in the day
                    hours = [(day, h) for h in range(t, t + length)]
                    broken = []
                    bad = [h for d, h in hours if (sec["instructor"], d, h) in D["unavail"]]
                    if bad:                                       # R5
                        if "R5" not in relax:
                            continue
                        broken.append(("R5", f'{sec["instructor"]} unavailable {day} '
                                       + ", ".join(D["labels"][(day, h)] for h in bad), len(bad)))
                    if any(dh in D["common"] for dh in hours):    # R6
                        if "R6" not in relax:
                            continue
                        broken.append(("R6", f"common activity hour on {day}", 1))
                    if (s, k) in D["fixed"] and D["fixed"][(s, k)] != (day, t):   # R7
                        if "R7" not in relax:
                            continue
                        fd, ft = D["fixed"][(s, k)]
                        broken.append(("R7", f'fixed time {fd} {D["labels"][(fd, ft)]} not kept', 1))
                    for r, room in D["rooms"].items():
                        if not sec["req"] <= room["equip"]:
                            continue                              # R11 (physical, never relaxed)
                        b = list(broken)
                        if room["cap"] < sec["enroll"] and not soft_capacity:   # R12
                            if "R12" not in relax:
                                continue
                            short = sec["enroll"] - room["cap"]
                            b.append(("R12", f'{sec["enroll"]} students in {r} '
                                      f'({room["cap"]} seats), short by {short}', short))
                        options.append((day, t, r))
                        if b:
                            V[(s, k, day, t, r)] = b
            A[(s, k)] = options
    D["viol"] = V
    return A


def covers(day, start, length, d, h):
    return day == d and start <= h < start + length


# ------------------------------------------------- PuLP 2.x / 4.x compatibility
def binvar(m, name):
    """PuLP 4 creates variables through the problem; PuLP 2 through LpVariable."""
    if hasattr(m, "add_variable"):
        return m.add_variable(name, cat="Binary")
    return pulp.LpVariable(name, cat="Binary")


def make_solver(time_limit):
    """Use HiGHS if installed, otherwise the CBC solver that ships with PuLP 2."""
    if "HiGHS" in pulp.listSolvers(onlyAvailable=True):
        return pulp.HiGHS(msg=False, timeLimit=time_limit)
    return pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit)


def status_text(m, status):
    if isinstance(status, int) and hasattr(pulp, "LpStatus"):  # PuLP 2
        return pulp.LpStatus[status]
    for line in str(status).splitlines():                       # PuLP 4
        if line.startswith("status:"):
            return line.split(":", 1)[1].strip()
    return str(status)


# ----------------------------------------------------------------------- model
MAX_VARS = 1_000_000   # above this PuLP needs too much time/memory on a laptop


def solve(objective="unplaced", soft_capacity=False, time_limit=120, relax=None, force=False):
    D = load()
    S, rooms = D["sections"], D["rooms"]
    A = build_allowed(D, soft_capacity, relax)
    relax = relax or {}
    n_x = sum(len(v) for v in A.values())
    if n_x > MAX_VARS and not force:
        raise SystemExit(
            f"Stopped: this data gives {n_x:,} x variables after filtering "
            f"(limit {MAX_VARS:,}). The single-stage model is too large for this computer.\n"
            f"Use a smaller pilot or the two-stage (time first, rooms second) approach. "
            f"Add --force to try anyway.")
    T = [(d, h) for d in D["days"] for h in range(D["n_slots"])]

    m = pulp.LpProblem("course_timetabling", pulp.LpMinimize)
    x = {(s, k, d, t, r): binvar(m, f"x_{s}_{k}_{d}_{t}_{r}")
         for (s, k), opts in A.items() for (d, t, r) in opts}
    u = {s: binvar(m, f"u_{s}") for s in S}
    courses = {sec["course"] for sec in S.values()}
    m.slack_block, m.slack_days = {}, {}
    z = {(c, d, h): binvar(m, f"z_{c}_{d}_{h}")
         for c in courses for (d, h) in T}

    # x variables that occupy hour (d,h): index once for speed
    occ_by_hour = defaultdict(list)          # (d,h) -> [(s, k, r, var)]
    for (s, k, d0, t0, r), v in x.items():
        for h in range(t0, t0 + S[s]["lengths"][k]):
            occ_by_hour[(d0, h)].append((s, k, r, v))

    def occ(s, d, h):
        return pulp.lpSum(v for (s2, _, _, v) in occ_by_hour[(d, h)] if s2 == s)

    # (1) each session placed once, or the whole section is unplaced
    for (s, k), opts in A.items():
        m += pulp.lpSum(x[(s, k, d, t, r)] for (d, t, r) in opts) + u[s] == 1, f"place_{s}_{k}"

    # (2) one session per room per hour
    for (d, h), items in occ_by_hour.items():
        for r in rooms:
            vs = [v for (_, _, r2, v) in items if r2 == r]
            if len(vs) > 1:
                m += pulp.lpSum(vs) <= 1, f"room_{r}_{d}_{h}"

    # (3) no instructor clashes (R4)
    by_ins = defaultdict(list)
    for s, sec in S.items():
        by_ins[sec["instructor"]].append(s)
    for ins, secs in by_ins.items():
        for (d, h) in T:
            vs = [v for (s2, _, _, v) in occ_by_hour[(d, h)] if s2 in secs]
            if len(vs) > 1:
                m += pulp.lpSum(vs) <= 1, f"ins_{ins}_{d}_{h}"

    # (4) no academic-block clashes (R3) — strictest reading, see doc [OPEN]
    for s, sec in S.items():
        for (d, h) in T:
            if any(s2 == s for (s2, _, _, _) in occ_by_hour[(d, h)]):   # skip empty rows
                m += occ(s, d, h) <= z[(sec["course"], d, h)], f"link_{s}_{d}_{h}"
    for b, cs in D["blocks"].items():
        cs = [c for c in cs if c in courses]
        for (d, h) in T:
            if "R3" in relax:                 # relax mode: a clash is allowed but costs
                y = binvar(m, f"yblock_{b}_{d}_{h}")
                m.slack_block[(b, d, h)] = y
                m += pulp.lpSum(z[(c, d, h)] for c in cs) <= 1 + len(cs) * y, f"block_{b}_{d}_{h}"
            else:
                m += pulp.lpSum(z[(c, d, h)] for c in cs) <= 1, f"block_{b}_{d}_{h}"

    # (5) sessions of the same section on different days — [OPEN]
    for s, sec in S.items():
        if len(sec["lengths"]) > 1:
            for d in D["days"]:
                terms = [v for (s2, k, d2, t, r), v in x.items() if s2 == s and d2 == d]
                if len(terms) < 2:
                    continue                                  # nothing to restrict that day
                same_day = pulp.lpSum(terms)
                if "C5" in relax:
                    y = binvar(m, f"ydays_{s}_{d}")
                    m.slack_days[(s, d)] = y
                    m += same_day <= 1 + len(sec["lengths"]) * y, f"diffday_{s}_{d}"
                else:
                    m += same_day <= 1, f"diffday_{s}_{d}"

    # ------------------------------------------------------------- objective
    pref_term = pulp.lpSum(
        D["pref"].get((S[s]["instructor"], d, h), 0) * v
        for (s, k, d, t, r), v in x.items()
        for h in range(t, t + S[s]["lengths"][k]))
    if relax:
        pass                                            # objective set below (diagnosis)
    elif objective == "unplaced":                       # Option A
        W = 1000
        m += pulp.lpSum(u.values()) + pref_term * (1.0 / W)
    else:                                               # Option B (+ big penalty on unplaced)
        seats = pulp.lpSum(S[s]["lengths"][k] * max(rooms[r]["cap"] - S[s]["enroll"], 0) * v
                           for (s, k, d, t, r), v in x.items())
        over = pulp.lpSum(S[s]["lengths"][k] * max(S[s]["enroll"] - rooms[r]["cap"], 0) * v
                          for (s, k, d, t, r), v in x.items())
        m += 100000 * pulp.lpSum(u.values()) + seats + 10 * over

    if relax:   # diagnosis: place everything, breaking as few (weighted) rules as possible
        viol_cost = pulp.lpSum(sum(relax[rule] * qty for rule, _, qty in D["viol"].get(key, [])) * v
                               for key, v in x.items() if key in D["viol"])
        viol_cost += pulp.lpSum(relax["R3"] * y for y in m.slack_block.values())
        viol_cost += pulp.lpSum(relax["C5"] * y for y in m.slack_days.values())
        m += 100000 * pulp.lpSum(u.values()) + viol_cost + pref_term * (1.0 / 1000)

    status = m.solve(make_solver(time_limit))
    m.status_name = status_text(m, status)
    return D, A, x, u, m


# --------------------------------------------------------------------- reporting
def report(D, A, x, u, m, objective):
    os.makedirs(RESULTS, exist_ok=True)
    S, rooms = D["sections"], D["rooms"]
    rows = []
    for (s, k, d, t, r), v in x.items():
        if v.value() and v.value() > 0.5:
            L = S[s]["lengths"][k]
            rows.append([s, S[s]["course"], k + 1, S[s]["instructor"], d,
                         D["labels"][(d, t)].split("-")[0],
                         D["labels"][(d, t + L - 1)].split("-")[1],
                         L, r, rooms[r]["cap"], S[s]["enroll"],
                         rooms[r]["cap"] - S[s]["enroll"]])
    day_order = {d: i for i, d in enumerate(D["days"])}
    rows.sort(key=lambda r: (day_order[r[4]], r[5], r[8]))
    with open(os.path.join(RESULTS, "timetable.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["section", "course", "session", "instructor", "day", "start",
                    "end", "hours", "room", "room_capacity", "expected_enrollment",
                    "empty_seats"])
        w.writerows(rows)

    unplaced = [s for s in S if u[s].value() and u[s].value() > 0.5]
    no_option = [f"{s} (session {k+1})" for (s, k), o in A.items() if not o]

    # room utilization: hours used / hours available, and seat fill when used
    n_hours = len(D["days"]) * D["n_slots"] - len(D["common"])
    util = []
    for r, room in rooms.items():
        used = [row for row in rows if row[8] == r]
        h = sum(row[7] for row in used)
        seat_hours = sum(row[7] * row[10] for row in used)
        util.append((r, room["cap"], h, round(100 * h / n_hours, 1),
                     round(100 * seat_hours / (h * room["cap"]), 1) if h else 0.0))
    with open(os.path.join(RESULTS, "room_utilization.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["room", "capacity", "hours_used", "frequency_rate_%", "occupancy_rate_%"])
        w.writerows(util)

    print(f"Status: {m.status_name} | objective option: {objective}")
    print(f"Sections: {len(S)} | placed: {len(S) - len(unplaced)} | unplaced: {len(unplaced)}")
    if unplaced:
        print("  Unplaced:", ", ".join(unplaced))
    if no_option:
        print("  Sessions with NO feasible (slot, room) after filtering:", ", ".join(no_option))
    print(f"Variables: {len(m.variables())} | constraints: {len(m.constraints() if callable(m.constraints) else m.constraints)}")
    print("\nRoom utilization (frequency = share of hours used; occupancy = seats filled when used):")
    for r in util:
        print(f"  {r[0]:5s} cap {r[1]:4d} | {r[2]:2d} h | freq {r[3]:5.1f}% | occ {r[4]:5.1f}%")
    print(f"\nResults written to {RESULTS}")
    return rows, unplaced, util


def draw(D, rows, path):
    """Weekly grid per room, saved as PNG (skipped for many rooms: unreadable)."""
    if len(D["rooms"]) > 30:
        print("Grid image skipped: too many rooms to draw readably.")
        return
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    rooms = list(D["rooms"])
    days, n = D["days"], D["n_slots"]
    fig, axes = plt.subplots(1, len(days), figsize=(3.2 * len(days), 0.6 * n + 1.5), sharey=True)
    courses = sorted({r[1] for r in rows})
    cmap = plt.get_cmap("tab20")
    color = {c: cmap(i % 20) for i, c in enumerate(courses)}
    for ax, d in zip(axes, days):
        ax.set_title(d)
        ax.set_xlim(0, len(rooms))
        ax.set_ylim(n, 0)
        ax.set_xticks([i + 0.5 for i in range(len(rooms))])
        ax.set_xticklabels(rooms, rotation=90, fontsize=7)
        ax.set_yticks(range(n))
        ax.set_yticklabels([D["labels"][(d, h)].split("-")[0] for h in range(n)], fontsize=7)
        ax.grid(True, color="#ddd", linewidth=0.5)
        for (dd, h) in D["common"]:
            if dd == d:
                ax.axhspan(h, h + 1, color="#eee", zorder=0)
        for row in rows:
            if row[4] != d:
                continue
            i = rooms.index(row[8])
            start = int(row[5].split(":")[0]) - 8
            ax.add_patch(plt.Rectangle((i + 0.05, start + 0.05), 0.9, row[7] - 0.1,
                                       color=color[row[1]], alpha=0.85))
            ax.text(i + 0.5, start + row[7] / 2, row[0].replace("-", "\n"),
                    ha="center", va="center", fontsize=5.5)
    fig.suptitle("Synthetic instance — weekly timetable by room (grey = common activity hours)")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    print(f"Grid image written to {path}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--objective", choices=["unplaced", "seats"], default="unplaced")
    p.add_argument("--soft-capacity", action="store_true")
    p.add_argument("--time-limit", type=int, default=120)
    p.add_argument("--data", default="data", help="data folder, e.g. scenario_tight")
    p.add_argument("--force", action="store_true", help="solve even if the model is very large")
    a = p.parse_args()
    set_data_dir(a.data)
    D, A, x, u, m = solve(a.objective, a.soft_capacity, a.time_limit, force=a.force)
    rows, _, _ = report(D, A, x, u, m, a.objective)
    draw(D, rows, os.path.join(RESULTS, "timetable_grid.png"))
