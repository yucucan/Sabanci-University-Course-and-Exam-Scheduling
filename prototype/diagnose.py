"""
"Why was it not placed, and which rules would have to be relaxed?"

Step 1  Solve normally (all rules hard) and list the unplaced sections.
Step 2  Solve again in relax mode: every section must be placed, and the
        relaxable rules may be broken at a cost (relaxation_weights.csv).
        The solver finds the cheapest set of rule changes that places everything.
Step 3  Report each rule change: which rule, which section(s), what exactly.

Never relaxed (physically impossible): two classes in one room at the same time,
an instructor in two places at once, a room without the required equipment,
a session that does not fit in one day.

Usage:
    python diagnose.py                       # data/
    python diagnose.py --data scenario_tight
"""
import argparse
import csv
import os
from collections import defaultdict

import model

RULE_NAMES = {
    "R3": "Academic block clash",
    "R5": "Instructor unavailable",
    "R6": "Common activity hour",
    "R7": "Fixed time not kept",
    "R12": "Room too small",
    "C5": "Two sessions on the same day",
}


def load_weights():
    weights = {}
    for r in model.read("relaxation_weights.csv"):
        weights[r["rule"]] = float(r["weight"])
    return weights


def chosen(x):
    return [key for key, v in x.items() if v.value() and v.value() > 0.5]


def main(data_dir, time_limit):
    model.set_data_dir(data_dir)
    out = os.path.join(model.HERE, "results")
    os.makedirs(out, exist_ok=True)

    # ---------------------------------------------------------------- step 1
    D, A, x, u, m = model.solve("unplaced", time_limit=time_limit)
    unplaced = [s for s in D["sections"] if u[s].value() and u[s].value() > 0.5]
    print(f"[1] Normal solve ({data_dir}): {len(D['sections']) - len(unplaced)} placed, "
          f"{len(unplaced)} unplaced")
    for s in unplaced:
        no_opt = [k + 1 for k in range(len(D["sections"][s]["lengths"])) if not A[(s, k)]]
        why = (f"session {no_opt} has no allowed (slot, room) at all"
               if no_opt else "blocked by other sections")
        print(f"    - {s}: {why}")
    if not unplaced:
        print("    Everything fits; nothing to relax.")
        return

    # ---------------------------------------------------------------- step 2
    weights = load_weights()
    D, A, x, u, m = model.solve("unplaced", time_limit=time_limit, relax=weights)
    still = [s for s in D["sections"] if u[s].value() and u[s].value() > 0.5]

    # ---------------------------------------------------------------- step 3
    rows = []
    sel = chosen(x)
    for key in sel:
        for rule, detail, _ in D["viol"].get(key, []):
            s, k = key[0], key[1]
            rows.append([rule, RULE_NAMES[rule], s, k + 1, detail])

    occupied = defaultdict(set)          # (day, hour) -> courses in class
    for (s, k, d, t, r) in sel:
        for h in range(t, t + D["sections"][s]["lengths"][k]):
            occupied[(d, h)].add(D["sections"][s]["course"])
    for (b, d, h), y in m.slack_block.items():
        if y.value() and y.value() > 0.5:
            clash = sorted(occupied[(d, h)] & D["blocks"][b])
            rows.append(["R3", RULE_NAMES["R3"], " & ".join(clash), "",
                         f"block {b} clash on {d} {D['labels'][(d, h)]}"])
    for (s, d), y in m.slack_days.items():
        if y.value() and y.value() > 0.5:
            rows.append(["C5", RULE_NAMES["C5"], s, "", f"two sessions on {d}"])

    rows.sort(key=lambda r: (r[0], r[2]))
    with open(os.path.join(out, "diagnosis.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rule", "rule_name", "section", "session", "what_changes"])
        w.writerows(rows)

    print(f"\n[2] Relaxed solve: to place all {len(D['sections']) - len(still)} sections, "
          f"the cheapest option breaks {len(rows)} rule(s):")
    by_rule = defaultdict(list)
    for r in rows:
        by_rule[r[0]].append(r)
    for rule, items in by_rule.items():
        print(f"    {rule} {RULE_NAMES[rule]} (x{len(items)})")
        for it in items:
            sess = f" session {it[3]}" if it[3] else ""
            print(f"        - {it[2]}{sess}: {it[4]}")
    if still:
        print("\n    Still unplaced even after relaxing (blocked by physical rules):",
              ", ".join(still))
    print(f"\n    Weights used ({os.path.join(data_dir, 'relaxation_weights.csv')}): "
          + ", ".join(f"{k}={v:g}" for k, v in weights.items()))
    print(f"    Details written to {os.path.join(out, 'diagnosis.csv')}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data")
    p.add_argument("--time-limit", type=int, default=120)
    a = p.parse_args()
    main(a.data, a.time_limit)
