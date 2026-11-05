#!/usr/bin/env python3
"""T-0026: Stufenfreiheit der DB-Stationen (StaDa) an die Halte in dist/data/bahnhof-umfeld.json haengen.

Eingabe: StaDa-Abruf /station-data/v2/stations als JSON (hoechstens 1 Abruf/Tag je Schluessel; Abruf von Hand,
Zugangsdaten ausserhalb des Repos). Jeder Halt bekommt die naechste DB-Station (Hauptkoordinate) innerhalb RADIUS_M;
fuenftes Feld: 2 = stufenfrei, 1 = teilweise, 0 = nicht stufenfrei, None = keine DB-Station oder ohne Angabe.
Aufruf: python3 scripts/bahnhof_stufenfrei.py <stations.json> [<abrufzeit ISO>]
Nach jedem Lauf von scripts/bahnhof_umfeld.py erneut ausfuehren (der schreibt die Datei ohne fuenftes Feld neu).
"""
import hashlib, json, math, sys
from pathlib import Path

RADIUS_M = 300
CODE = {'yes': 2, 'partial': 1, 'no': 0}
ZIEL = Path(__file__).parents[1] / 'dist/data/bahnhof-umfeld.json'


def meter(lat1, lon1, lat2, lon2):
    k = math.cos(math.radians((lat1 + lat2) / 2))
    return 6371000 * math.hypot(math.radians(lat2 - lat1), math.radians(lon2 - lon1) * k)


def stationen(stada):
    """[(lat, lon, code, name)] je DB-Station mit Hauptkoordinate."""
    aus = []
    for s in stada['result']:
        for e in s.get('evaNumbers', []):
            if e.get('isMain') and e.get('geographicCoordinates'):
                lon, lat = e['geographicCoordinates']['coordinates']
                aus.append((lat, lon, CODE.get(s.get('hasSteplessAccess')), s['name']))
    return aus


def zuordnen(halte, db, radius_m=RADIUS_M):
    """Haengt an jeden Halt [lat, lon, name, gastro] den Code der naechsten DB-Station innerhalb radius_m."""
    gitter = {}
    for st in db:
        gitter.setdefault((math.floor(st[0] * 100), math.floor(st[1] * 100)), []).append(st)
    aus = []
    for h in halte:
        lat, lon = h[0], h[1]
        best, bd = None, radius_m
        i0, j0 = math.floor(lat * 100), math.floor(lon * 100)
        for i in (i0 - 1, i0, i0 + 1):
            for j in (j0 - 1, j0, j0 + 1):
                for st in gitter.get((i, j), ()):
                    d = meter(lat, lon, st[0], st[1])
                    if d <= bd:
                        best, bd = st, d
        aus.append([*h[:4], best[2] if best else None])
    return aus


def main():
    roh = Path(sys.argv[1]).read_bytes()
    stada = json.loads(roh)
    if stada.get('total') != len(stada.get('result', [])):
        raise ValueError('StaDa-Abruf unvollstaendig (total != result)')
    umfeld = json.loads(ZIEL.read_text())
    db = stationen(stada)
    umfeld['halte'] = zuordnen(umfeld['halte'], db)
    werte = [h[4] for h in umfeld['halte']]
    umfeld['stufenfrei'] = {
        'quelle': 'DB InfraGO AG, StaDa - Station Data (CC BY 4.0), Feld hasSteplessAccess',
        'stand': sys.argv[2] if len(sys.argv) > 2 else None,
        'sha256': hashlib.sha256(roh).hexdigest(),
        'radiusM': RADIUS_M,
        'codes': '2 = stufenfrei, 1 = teilweise, 0 = nicht stufenfrei, null = keine DB-Station/ohne Angabe',
        'dbStationen': len(db),
        'zugeordnet': {str(k): werte.count(k) for k in (2, 1, 0, None)},
    }
    ZIEL.write_text(json.dumps(umfeld, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps(umfeld['stufenfrei'], ensure_ascii=False))


if __name__ == '__main__':
    main()
