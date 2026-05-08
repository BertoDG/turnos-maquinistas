import json

with open("scripts/lh820_parsed.json", encoding="utf-8") as f:
    data = json.load(f)

trains_to_check = ["70400", "70402", "70401"]

for num in trains_to_check:
    trenes = [t for t in data if t["numero"] == num]
    if not trenes:
        print(f"Train {num}: NOT FOUND")
        continue
    tren = trenes[0]
    print(f"\nTrain {num} ({tren['tipo']}): {len(tren['paradas'])} paradas")
    for p in tren["paradas"]:
        print(f"  km={str(p['sit_km']):>7} | {p['estacion']:<45} | {p['hora']}")

print("\n\n=== SUMMARY ===")
tipos = {}
for t in data:
    tipos[t["tipo"]] = tipos.get(t["tipo"], 0) + 1
for tp, cnt in sorted(tipos.items()):
    print(f"  {tp}: {cnt} trenes")
print(f"  TOTAL: {len(data)} trenes, {sum(len(t['paradas']) for t in data)} paradas")
