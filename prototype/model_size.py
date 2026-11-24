"""
How big would the model be on a data folder, and how much do the two
reduction ideas help? Does not solve anything.

    python model_size.py --data scenario_full
"""
import argparse

import model


def main(data):
    model.set_data_dir(data)
    D = model.load()
    A = model.build_allowed(D, False)
    S, R = D["sections"], D["rooms"]
    n_slots = len(D["days"]) * D["n_slots"]
    sessions = len(A)
    before = sessions * n_slots * len(R)
    after = sum(len(v) for v in A.values())
    sized = sum(1 for (s, k), opts in A.items() for (d, t, r) in opts
                if R[r]["cap"] <= max(1.5 * S[s]["enroll"], S[s]["enroll"] + 20))
    stage1 = sum(len({(d, t) for (d, t, r) in opts}) for opts in A.values())
    no_opt = sum(1 for v in A.values() if not v)

    print(f"Data: {data} | {len(S)} sections, {sessions} sessions, {len(R)} rooms, {n_slots} slots\n")
    print(f"  x variables before filtering ({sessions} x {n_slots} x {len(R)}): {before:>12,}")
    print(f"  after filtering (rules applied before solving)      : {after:>12,}  ({100 * after / before:.1f}%)")
    print(f"  + keep only reasonably sized rooms                  : {sized:>12,}  ({100 * sized / before:.1f}%)")
    print(f"  two-stage model, stage 1 (time only, no rooms)      : {stage1:>12,}  ({100 * stage1 / before:.2f}%)")
    print(f"\n  Sessions with no allowed (slot, room) at all: {no_opt}")
    print(f"  Single-stage limit in model.py: {model.MAX_VARS:,} variables")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data")
    main(p.parse_args().data)
