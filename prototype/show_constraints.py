"""
Shows which rules are in the model, where each one lives, and how many
constraints / removed options it creates on the current data.

    python show_constraints.py
    python show_constraints.py --data scenario_tight
    python show_constraints.py --example      # also print one written-out example per group
"""
import argparse
from collections import Counter

import model

# Rules written as constraints in the MIP (prefix of the constraint name in model.py)
IN_MODEL = [
    ("place", "(1)", "R2", "Her oturum bir kez yerleşir ya da ders 'yerleşemedi' sayılır",
     "Every session placed once, or the section is unplaced"),
    ("room", "(2)", "—", "Bir sınıfta aynı saatte en fazla bir ders",
     "At most one class per room per hour"),
    ("ins", "(3)", "R4", "Bir hoca aynı saatte en fazla bir derste",
     "An instructor teaches at most one class per hour"),
    ("link", "(4a)", "R3", "Bir dersin herhangi bir section'ı o saatte varsa z=1",
     "Links each section to its course's hourly indicator z"),
    ("block", "(4b)", "R3", "Aynı akademik bloktaki dersler aynı saatte olmaz",
     "Courses in the same academic block do not overlap"),
    ("diffday", "(5)", "[OPEN]", "Bir dersin oturumları farklı günlerde",
     "Sessions of a section on different days"),
]

# Rules applied BEFORE solving: options that break them are never created
FILTERS = [
    ("R5", "Hocanın müsait olmadığı saatler", "Instructor unavailability"),
    ("R6", "Ortak akademik etkinlik saatleri", "Common activity hours"),
    ("R7", "Fakültenin sabit saat talepleri", "Fixed time requests"),
    ("R11", "Sınıfta gerekli donanım", "Required room equipment"),
    ("R12", "Sınıf kapasitesi ≥ beklenen kayıt", "Room capacity ≥ expected enrollment"),
]


def main(data, example):
    model.set_data_dir(data)
    D, A, x, u, m = model.solve("unplaced")
    cons = m.constraints() if callable(m.constraints) else list(m.constraints.values())
    counts = Counter(c.name.split("_")[0] for c in cons)
    first = {}
    for c in cons:
        first.setdefault(c.name.split("_")[0], c)

    rows1 = [[num, brd, tr, counts.get(pref, 0)] for pref, num, brd, tr, _ in IN_MODEL]

    # how many (slot, room) options each filter removes
    total = sum((D["n_slots"] - L + 1) * len(D["days"]) * len(D["rooms"])
                for sec in D["sections"].values() for L in sec["lengths"])
    kept = sum(len(v) for v in A.values())
    Drel = model.load()
    relaxed = model.build_allowed(Drel, False, {"R5": 1, "R6": 1, "R7": 1, "R12": 1})
    removed = Counter()
    for broken in Drel["viol"].values():
        for rule, _, _ in broken:
            removed[rule] += 1
    removed["R11"] = total - sum(len(v) for v in relaxed.values())
    rows2 = [[rule, tr, removed.get(rule, 0)] for rule, tr, _ in FILTERS]

    print(f"Veri: {data}  |  {len(D['sections'])} section, {len(D['rooms'])} sınıf, "
          f"{len(D['days']) * D['n_slots']} saat dilimi\n")
    print(f"Değişkenler: {len(m.variables())}  |  Kısıtlar: {len(cons)}\n")
    try:
        import pandas as pd
        from IPython.display import display
        print("A) Modelin içindeki kısıtlar (model.py, solve fonksiyonu)")
        display(pd.DataFrame(rows1, columns=["Kısıt", "BRD", "Ne diyor", "Adet"]))
        print("\nB) Çözümden önce uygulanan kurallar (model.py, build_allowed)")
        print("   Bu kuralları bozan saat–sınıf seçenekleri hiç oluşturulmuyor.")
        display(pd.DataFrame(rows2, columns=["BRD", "Kural", "Elenen seçenek"]))
    except ImportError:
        for r in rows1:
            print("  ", r)
        for r in rows2:
            print("  ", r)
    print(f"\n   Olası saat–sınıf seçeneği: {total} | elendikten sonra kalan: {kept} "
          f"(%{100 * kept / total:.1f})")
    print("   Not: bir seçenek birden fazla kuralı bozabilir, o yüzden elenenlerin toplamı farklı olabilir.")

    print("\nC) Amaç fonksiyonu (Seçenek A): yerleşemeyen section sayısını minimize et;"
          "\n   eşitlikte hoca tercih cezalarını (R13) küçük ağırlıkla minimize et.")

    if example:
        print("\nÖrnek kısıtlar (her gruptan bir tane):")
        for pref, num, *_ in IN_MODEL:
            c = first.get(pref)
            if c is not None:
                text = str(c)
                print(f"\n  {num} {c.name}\n    {text[:300]}{' ...' if len(text) > 300 else ''}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data")
    p.add_argument("--example", action="store_true")
    a = p.parse_args()
    main(a.data, a.example)
