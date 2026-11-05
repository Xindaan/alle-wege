"""T-0029: Endknoten aller PKW-Faehren aus faehren.json fuer scripts/faehranleger.overpass.
Aufruf: python3 scripts/faehranleger_knoten.py <zusatzordner>  -> druckt kommagetrennte OSM-Knoten-IDs.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from zusatz_netz import faehr_wege, pkw_erlaubt, SYLT_FAEHRE


def anleger_knoten(raw):
    knoten = set()
    for w, t in faehr_wege(raw):
        if w['id'] == SYLT_FAEHRE or not pkw_erlaubt(t):
            continue
        knoten.update((w['nodes'][0], w['nodes'][-1]))
    return sorted(knoten)


if __name__ == '__main__':
    raw = json.loads((Path(sys.argv[1]) / 'faehren.json').read_text())
    print(','.join(str(n) for n in anleger_knoten(raw)))
