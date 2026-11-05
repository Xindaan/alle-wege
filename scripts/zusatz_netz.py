"""T-0003: Zusatznetz zum OSM-Stand 2026-11-02 (Kreisstrassen, PKW-Freigaben, Grenzsaum, Autofaehren).

Abfragen: scripts/zusatz-de.overpass (vier Streifen), scripts/grenzsaum.overpass, scripts/faehren.overpass;
Abruf: scripts/hole_zusatz.sh. Keine synthetischen Strassen: Faehren verbinden nur echte OSM-Knoten,
die zugleich Strassenknoten sind.
"""
import json, re

GRENZSAUM_KM = 20
FAEHRE_MAX_KM = 60
FAEHRE_KMH = 15  # nur ohne OSM-duration
ANLEGER_MAX_KM = 3  # T-0029: Ortsstrassen-Pfad vom Anleger zum Netz (Abfrage-Umkreis 1,5 km je Anleger)
ANLEGER_FANG_KM = 0.15  # T-0029: Faehrende ohne gemeinsamen Strassenknoten auf naechsten Knoten legen
SYLT_FAEHRE = 34142186
# Grenzrechtecke (sued, west, nord, ost) fuer grenzsaum.overpass: West, Schweiz/Oesterreich, Salzburg/Passau,
# Tschechien, Polen, Daenemark. Ueberdecken auch deutsche Flaeche; doppelte OSM-IDs fallen beim Zusammenfuehren weg.
GRENZRECHTECKE = [(47.5, 5.5, 54.0, 7.3), (47.2, 7.3, 48.0, 13.1), (47.2, 12.0, 49.2, 14.0),
                  (48.6, 11.9, 51.1, 15.1), (50.8, 14.2, 54.2, 15.6), (54.4, 8.0, 55.1, 10.2)]  # eigene Modellierung in sylt_transfers.py
ERLAUBT = re.compile(r'^(yes|designated|permissive|destination)$')
VERBOTEN = re.compile(r'^(no|private)$')


def wartepauschale(km):
    """Annahme ohne Fahrplan: Pendelfaehren kurz, Insel-/Linienfaehren mit Takt."""
    return 10 if km <= 2 else 30


def pkw_erlaubt(t):
    """Spezifitaet: motorcar vor motor_vehicle vor access (wie roads.overpass)."""
    for k in ('motorcar', 'motor_vehicle', 'access'):
        v = t.get(k, '')
        if ERLAUBT.match(v):
            return True
        if VERBOTEN.match(v):
            return False
    return True


def minuten_aus_duration(text):
    text = (text or '').strip()
    m = re.fullmatch(r'(\d+):(\d{1,2})(?::(\d{1,2}))?', text)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2)) + (int(m.group(3) or 0) / 60)
    m = re.fullmatch(r'(\d+)', text)
    if m:
        return float(m.group(1))
    m = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?', text)
    if m and (m.group(1) or m.group(2)):
        return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)
    return None


def im_polygon(punkt, ringe):
    """Gerade-Ungerade-Regel ueber alle Ringe (Loecher eingeschlossen)."""
    x, y = punkt
    innen = False
    for ring in ringe:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                innen = not innen
    return innen


def deutschland_ringe(countries):
    for f in countries['features']:
        if f['properties'].get('ADM0_A3') == 'DEU':
            g = f['geometry']
            polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
            return [ring for poly in polys for ring in poly]
    raise ValueError('Deutschland fehlt in countries.json')


def grenzsaum_zellen(coords_de):
    """0,1-Grad-Zellen mit deutschen Netzpunkten, um ~20 km erweitert (2 Zellen Breite, 3 Zellen Laenge)."""
    basis = {(int(lon * 10), int(lat * 10)) for lon, lat in coords_de}
    return {(a + i, b + j) for a, b in basis for i in range(-3, 4) for j in range(-2, 3)}


def waehle_grenzsaum(ways, coords, zellen):
    return [w for w in ways if any((int(coords[n][0] * 10), int(coords[n][1] * 10)) in zellen
                                    for n in w['nodes'] if n in coords)]


def faehr_wege(raw):
    """(Weg, Tags) je Faehrweg; Tags der Routen-Relation, vom Weg ueberschrieben."""
    el = raw['elements']
    rel = {}
    for e in el:
        if e['type'] == 'relation':
            for m in e['members']:
                if m['type'] == 'way':
                    rel.setdefault(m['ref'], e.get('tags', {}))
    gesehen = set()  # Overpass liefert Wege aus Weg- und Relationsabfrage doppelt
    for w in (e for e in el if e['type'] == 'way'):
        if w['id'] in gesehen:
            continue
        gesehen.add(w['id'])
        t = dict(rel.get(w['id'], {}))
        t.update(w.get('tags', {}))
        if t.get('route') == 'ferry' or w['id'] in rel:
            yield w, t


def anlegerwege(anleger, coords, ways, strassenknoten, ringe, dist):
    """T-0029: Ortsstrassen vom Anleger zum Netz. Je Anleger-Knoten (in Deutschland, nicht im Netz)
    kuerzester Pfad ueber die geladenen Wege bis zum ersten Netzknoten, hoechstens ANLEGER_MAX_KM;
    uebernommen werden nur die Wege auf diesem Pfad (ganze OSM-Wege, Richtung bleibt aus den Tags)."""
    import heapq
    nachbarn = {}
    for w in ways:
        ns = w['nodes']
        for a, b in zip(ns, ns[1:]):
            if a in coords and b in coords:
                km = dist(coords[a], coords[b])
                nachbarn.setdefault(a, []).append((b, km, w['id']))
                nachbarn.setdefault(b, []).append((a, km, w['id']))
    gewaehlt, gruende, ersatz = set(), {}, {}
    for anleger_knoten in anleger:
        start = anleger_knoten
        if start in strassenknoten:
            continue
        if start not in coords:
            gruende['Anleger ohne Koordinate'] = gruende.get('Anleger ohne Koordinate', 0) + 1; continue
        if not im_polygon(coords[start], ringe):
            gruende['Anleger im Ausland'] = gruende.get('Anleger im Ausland', 0) + 1; continue
        if start not in nachbarn:
            # Faehrweg endet neben der Strasse (Rampe/Pier): naechster Strassenknoten bis ANLEGER_FANG_KM
            p = coords[start]; g = ANLEGER_FANG_KM / 111.0 * 1.6
            nah = [(dist(p, coords[n]), n) for n in nachbarn
                   if abs(coords[n][0] - p[0]) < g and abs(coords[n][1] - p[1]) < g]
            nah = [x for x in nah if x[0] <= ANLEGER_FANG_KM]
            if not nah:
                gruende['Anleger ohne Strasse'] = gruende.get('Anleger ohne Strasse', 0) + 1; continue
            start = min(nah)[1]
            gruende['Ende verschoben'] = gruende.get('Ende verschoben', 0) + 1
            if start in strassenknoten:
                ersatz[anleger_knoten] = start
                gruende['angebunden'] = gruende.get('angebunden', 0) + 1; continue
        best, vor, heap, ziel = {start: 0}, {}, [(0, start)], None
        while heap:
            d, n = heapq.heappop(heap)
            if d > best[n]:
                continue
            if n in strassenknoten:
                ziel = n; break
            if d > ANLEGER_MAX_KM:
                break
            for m, km, wid in nachbarn[n]:
                if d + km < best.get(m, 1e9):
                    best[m] = d + km; vor[m] = (n, wid); heapq.heappush(heap, (d + km, m))
        if ziel is None:
            gruende['kein Netz in Reichweite'] = gruende.get('kein Netz in Reichweite', 0) + 1; continue
        gruende['angebunden'] = gruende.get('angebunden', 0) + 1
        if start != anleger_knoten:
            ersatz[anleger_knoten] = start
        while ziel != start:
            ziel, wid = vor[ziel]; gewaehlt.add(wid)
    return [w for w in ways if w['id'] in gewaehlt], gruende, ersatz


def verkette(wege, strassenknoten):
    """T-0029: in OSM geteilte Faehrwege (Treffpunkt im Wasser, kein Strassenknoten) zu einem Weg verbinden.
    Verbunden wird nur, wenn genau zwei Faehrwege den Endknoten teilen; Tags vom ersten Weg."""
    enden = {}
    for i, (w, t) in enumerate(wege):
        for n in (w['nodes'][0], w['nodes'][-1]):
            enden.setdefault(n, []).append(i)
    benutzt, aus = set(), []
    for i, (w, t) in enumerate(wege):
        if i in benutzt:
            continue
        benutzt.add(i); knoten, ids = list(w['nodes']), [w['id']]
        for _ in range(2):
            while True:
                n = knoten[-1]
                andere = [j for j in enden.get(n, []) if j not in benutzt]
                if n in strassenknoten or len(enden.get(n, [])) != 2 or len(andere) != 1:
                    break
                j = andere[0]; benutzt.add(j); nj = wege[j][0]['nodes']
                knoten += (nj if nj[0] == n else nj[::-1])[1:]; ids.append(wege[j][0]['id'])
            knoten.reverse()
        aus.append(({**w, 'nodes': knoten, 'teile': ids}, t))
    return aus


def faehren(raw, strassenknoten, ringe, dist, ersatz=None, knotenpos=None):
    """Kanten fuer Autofaehren mit beiden Enden auf deutschen Strassenknoten.
    ersatz: Faehrende -> Strassenknoten (T-0029, verschobenes Ende), knotenpos: dessen Koordinaten."""
    coords = {e['id']: [e['lon'], e['lat']] for e in raw['elements'] if e['type'] == 'node'}
    ersatz = ersatz or {}
    coords.update({n: (knotenpos or {})[n] for n in ersatz.values()})
    kanten, gruende, fehlend = [], {}, []
    wege = [(w, t) for w, t in faehr_wege(raw) if w['id'] != SYLT_FAEHRE and pkw_erlaubt(t)]
    gruende['sylt eigen'] = 1
    gruende['kein PKW'] = sum(1 for w, t in faehr_wege(raw) if w['id'] != SYLT_FAEHRE and not pkw_erlaubt(t))
    vorher = len(wege); wege = verkette(wege, strassenknoten)
    gruende['verkettet'] = vorher - len(wege)
    for w, t in wege:
        def weg(grund):
            gruende[grund] = gruende.get(grund, 0) + 1
        knoten = list(w['nodes'])
        if knoten[0] in ersatz: knoten.insert(0, ersatz[knoten[0]])
        if knoten[-1] in ersatz: knoten.append(ersatz[knoten[-1]])
        a, b = knoten[0], knoten[-1]
        if a == b or a not in strassenknoten or b not in strassenknoten:
            weg('Enden nicht im Strassennetz')
            if a in coords and b in coords and im_polygon(coords[a], ringe) and im_polygon(coords[b], ringe):
                fehlend.append({'name': t.get('name') or 'Fähre', 'osm': w['id'], 'vonImNetz': a in strassenknoten, 'nachImNetz': b in strassenknoten})
            continue
        if not (im_polygon(coords[a], ringe) and im_polygon(coords[b], ringe)):
            weg('Ende im Ausland'); continue
        form = [coords[n] for n in knoten]
        km = sum(dist(x, y) for x, y in zip(form, form[1:]))
        if km > FAEHRE_MAX_KM:
            weg('zu lang'); continue
        fahrt = minuten_aus_duration(t.get('duration'))
        quelle = 'duration'
        if fahrt is None or fahrt <= 0:
            fahrt, quelle = max(2, km / FAEHRE_KMH * 60), 'schaetzung'
        kanten.append({'art': 'faehre', 'von': a, 'nach': b, 'form': form, 'km': km,
                       'minuten': round(fahrt + wartepauschale(km), 2), 'beide': True,
                       'name': t.get('name') or 'Fähre', 'quelle': quelle, 'osm': w['id']})
    return kanten, gruende, fehlend


VERBOT_ARTEN = {'no_left_turn', 'no_right_turn', 'no_straight_on', 'no_u_turn',
                'only_left_turn', 'only_right_turn', 'only_straight_on', 'only_u_turn'}


def abbiegeverbote(raw):
    """T-0030: einfache Abbiegeverbote (ein Von-Weg, ein Via-Knoten, ein Nach-Weg) fuer PKW.
    Ergebnis: Liste {'osm','via','von','nach','nur'}; nur=True bei only_*. Gruende fuer Auslassungen gezaehlt."""
    aus, gruende = [], {}
    def weg(g):
        gruende[g] = gruende.get(g, 0) + 1
    for r in raw['elements']:
        if r.get('type') != 'relation':
            continue
        t = r.get('tags', {})
        if t.get('type') != 'restriction':
            continue
        art = t.get('restriction:motorcar') or t.get('restriction')
        if not art:
            weg('nur bedingt oder andere Fahrzeuge'); continue
        if art not in VERBOT_ARTEN:
            weg('andere Art'); continue
        if 'motorcar' in t.get('except', '').split(';'):
            weg('PKW ausgenommen'); continue
        rollen = {}
        for m in r.get('members', []):
            rollen.setdefault(m.get('role'), []).append(m)
        von, via, nach = rollen.get('from', []), rollen.get('via', []), rollen.get('to', [])
        if len(von) != 1 or len(nach) != 1 or len(via) != 1 or von[0]['type'] != 'way' or nach[0]['type'] != 'way':
            weg('kein einfaches Verbot'); continue
        if via[0]['type'] != 'node':
            weg('Via ist ein Weg'); continue
        aus.append({'osm': r['id'], 'via': via[0]['ref'], 'von': von[0]['ref'], 'nach': nach[0]['ref'],
                    'nur': art.startswith('only_')})
    return aus, gruende


def abbiege_erreichbar(n, edges, turns, start):
    """T-0030: Erreichbarkeit mit Abbiegeverboten wie dist/graph.js (Zustand je Via + Ankunftskante),
    vorwaerts und rueckwaerts ab start. Ergebnis: Menge der Knoten, die in einer Richtung fehlen."""
    out = [[] for _ in range(n)]; inc = [[] for _ in range(n)]
    for i, e in enumerate(edges):
        a, b, tf, tb = e[0], e[1], e[3], e[4]
        if tf > 0: out[a].append((b, i)); inc[b].append((a, i))
        if tb > 0: out[b].append((a, i)); inc[a].append((b, i))
    paare = {}
    for via, a, b, nur in turns:
        if not nur:
            paare.setdefault(via, set()).add((a, b))
        else:
            for k in {x[1] for x in out[via]} | {x[1] for x in inc[via]}:
                if k != b: paare.setdefault(via, set()).add((a, k))
    fehlt = set()
    for vorwaerts in (True, False):
        adj = out if vorwaerts else inc
        verbot = {}
        for via, ps in paare.items():
            for a, b in ps:
                an, weg = (a, b) if vorwaerts else (b, a)
                verbot.setdefault((via, an), set()).add(weg)
        gesehen = {(start, None)}; knoten = {start}; stapel = [(start, None)]
        while stapel:
            u, an = stapel.pop()
            gesperrt = verbot.get((u, an), ()) if an is not None else ()
            for v, i in adj[u]:
                if i in gesperrt: continue
                z = (v, i) if (v, i) in verbot else (v, None)
                if z not in gesehen:
                    gesehen.add(z); knoten.add(v); stapel.append(z)
        fehlt |= set(range(n)) - knoten
    return fehlt


def entschaerfe_verbote(n, edges, turns, start):
    """Verbote streichen, die Knoten abschneiden (Netz unvollstaendig, z. B. fehlende Nebenstrassen im Grenzsaum).
    Gestrichen werden Verbote mit Via an einem abgeschnittenen Knoten oder dessen Nachbarn; Wiederholung bis alles erreichbar."""
    nachbar = [set() for _ in range(n)]
    for e in edges:
        nachbar[e[0]].add(e[1]); nachbar[e[1]].add(e[0])
    gestrichen = 0
    for _ in range(50):
        fehlt = abbiege_erreichbar(n, edges, turns, start)
        if not fehlt:
            return turns, gestrichen
        zone = set(fehlt)
        for v in fehlt: zone |= nachbar[v]
        neu = [t for t in turns if t[0] not in zone]
        if len(neu) == len(turns):
            raise ValueError(f'{len(fehlt)} Knoten trotz Streichung unerreichbar')
        gestrichen += len(turns) - len(neu); turns = neu
    raise ValueError('Verbote nach 50 Runden nicht entschaerft')
