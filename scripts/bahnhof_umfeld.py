#!/usr/bin/env python3
"""T-0004: Bahnhoefe/Haltepunkte in Deutschland mit Zahl der Gastronomie-Orte im Umkreis.

Einmalige Vorberechnung aus OpenStreetMap ueber Overpass, in vier Breitenstreifen und mit
exponentiellem Warten bei Ueberlast (Overpass-Bitte an automatisierte Nutzer). Ergebnis:
dist/data/bahnhof-umfeld.json = {"radiusM": 300, "stand": ..., "halte": [[lat, lon, name, anzahl], ...]}.
Aufruf: python3 scripts/bahnhof_umfeld.py [rohordner]
"""
import json, math, os, subprocess, sys, time

RADIUS = 300
GASTRO = "restaurant|cafe|fast_food|pub|bar|biergarten"
STREIFEN = [(47.2, 49), (49, 51), (51, 53), (53, 55.1)]
URL = "https://overpass-api.de/api/interpreter"
AGENT = "alle-wege-deutschland vorberechnung (https://xindaan.github.io/alle-wege/)"
WIEDEROFT = [60, 120, 240, 480, 960]


def abfrage(sued, nord):
    return (f"[out:json][timeout:240][bbox:{sued},5.8,{nord},15.1];"
            'node[railway~"^(station|halt)$"]->.st;.st out qt;'
            f'nwr[amenity~"^({GASTRO})$"](around.st:{RADIUS});out center qt;')


def hole(sued, nord, roh):
    ziel = os.path.join(roh, f"streifen_{sued}.json")
    if os.path.exists(ziel):
        try:
            with open(ziel) as f:
                d = json.load(f)
            if isinstance(d.get("elements"), list):
                return d
        except ValueError:
            pass
        os.remove(ziel)  # Fehlerseite oder abgebrochener Download: neu laden
    for warten in [0] + WIEDEROFT:
        if warten:
            print(f"  Overpass ausgelastet, warte {warten} s", flush=True)
            time.sleep(warten)
        try:
            # curl statt urllib: das Xcode-Python 3.9 scheitert am TLS-Handshake mit Overpass.
            text = subprocess.run(
                ["curl", "-sS", "-m", "280", "-A", AGENT, "--data-urlencode", "data=" + abfrage(sued, nord), URL],
                capture_output=True, check=True).stdout
            d = json.loads(text)
            if "remark" in d and "error" in d["remark"].lower():
                raise RuntimeError(d["remark"])
            with open(ziel, "wb") as f:
                f.write(text)
            return d
        except Exception as e:  # 429/502/504/Timeout: spaeter erneut
            print(f"  Streifen {sued}-{nord}: {e}", flush=True)
    raise SystemExit(f"Streifen {sued}-{nord} nach allen Wiederholungen nicht geladen.")


def km(a, b):
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    return 6371 * math.hypot(dlat, dlon)


def zaehle(halte, gastro, radius_m=RADIUS):
    """Je Halt die Zahl verschiedener Gastronomie-Orte innerhalb radius_m (Luftlinie)."""
    gitter = {}
    for g in gastro:
        gitter.setdefault((int(g[0] * 100), int(g[1] * 100)), []).append(g)
    out = []
    for h in halte:
        n = 0
        zi, zj = int(h[0] * 100), int(h[1] * 100)
        for i in (zi - 1, zi, zi + 1):
            for j in (zj - 1, zj, zj + 1):
                n += sum(1 for g in gitter.get((i, j), []) if km(h, g) * 1000 <= radius_m)
        out.append([round(h[0], 5), round(h[1], 5), h[2], n])
    return out


def main():
    roh = sys.argv[1] if len(sys.argv) > 1 else "/private/tmp/alle-wege-data/osm-gastro"
    os.makedirs(roh, exist_ok=True)
    halte, gastro, gesehen, stand = {}, {}, set(), ""
    for sued, nord in STREIFEN:
        print(f"Streifen {sued}-{nord}", flush=True)
        d = hole(sued, nord, roh)
        stand = d.get("osm3s", {}).get("timestamp_osm_base", stand)
        for e in d["elements"]:
            key = (e["type"], e["id"])
            if key in gesehen:
                continue
            gesehen.add(key)
            t = e.get("tags", {})
            lat, lon = (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
            if t.get("railway") in ("station", "halt") and e["type"] == "node":
                halte[key] = (lat, lon, t.get("name", ""))
            elif "amenity" in t:
                gastro[key] = (lat, lon)
    ergebnis = {"radiusM": RADIUS, "stand": stand, "quelle": "OpenStreetMap (ODbL) via Overpass",
                "halte": zaehle(list(halte.values()), list(gastro.values()))}
    ziel = os.path.join(os.path.dirname(__file__), "..", "dist", "data", "bahnhof-umfeld.json")
    with open(ziel, "w") as f:
        json.dump(ergebnis, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(ergebnis['halte'])} Halte, {len(gastro)} Gastronomie-Orte -> {os.path.normpath(ziel)}")


if __name__ == "__main__":
    main()
