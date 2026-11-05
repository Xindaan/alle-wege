"""Sylt-Ueberfahrten: echte OSM-Terminalknoten und Trassen, feste Modellzeiten."""
import collections, heapq, json

QUELLEN = [
    'https://www.autozug-sylt.de/de/fahrplan?stage=Live',
    'https://www.syltshuttle.de/syltshuttle-de/reiseinformationen/anreisetipps-2049338',
    'https://www.frs-syltfaehre.de/faq',
    'https://www.frs-syltfaehre.de/fahrplan-2026',
    'https://www.frs-syltfaehre.de/informationen/anreise-und-haefen/havneby-auf-roemoe',
]

def bahnpfad(wege, coords, start, ziel, dist):
    adj=collections.defaultdict(list)
    for w in wege:
        if w.get('tags',{}).get('railway')!='rail':continue
        for a,b in zip(w['nodes'],w['nodes'][1:]):
            km=dist(coords[a],coords[b]);adj[a].append((b,km));adj[b].append((a,km))
    kosten={start:0};eltern={};heap=[(0,start)]
    while heap:
        d,u=heapq.heappop(heap)
        if d!=kosten[u]:continue
        if u==ziel:break
        for v,km in adj[u]:
            nd=d+km
            if nd<kosten.get(v,float('inf')):
                kosten[v]=nd;eltern[v]=u;heapq.heappush(heap,(nd,v))
    if ziel not in kosten:raise ValueError('Autozug-Trasse nicht durchgehend')
    pfad=[ziel]
    while pfad[-1]!=start:pfad.append(eltern[pfad[-1]])
    return list(reversed(pfad))

def laden(datei, strassenknoten, dist):
    raw=json.loads(datei.read_text())
    if raw.get('remark'):raise ValueError('Unvollstaendige Sylt-Transportquelle')
    coords={e['id']:[e['lon'],e['lat']] for e in raw['elements'] if e['type']=='node'}
    wege=[e for e in raw['elements'] if e['type']=='way']
    # Niebüll hat getrennte Lade-/Entladerampen mit gerichteten Zufahrten.
    # Nur diese Terminals werden verbunden, keine Bahnuebergaenge unterwegs.
    west_ein=572415561;west_aus=308837482;nie_ein=4278583112;nie_aus=4278583111
    faehre=next(w for w in wege if w['id']==34142186)
    pfade=[('autozug',nie_ein,west_aus,bahnpfad(wege,coords,nie_ein,west_aus,dist),35,45,False),
           ('autozug',west_ein,nie_aus,bahnpfad(wege,coords,west_ein,nie_aus,dist),35,45,False),
           ('faehre',faehre['nodes'][0],faehre['nodes'][-1],faehre['nodes'],40,30,True)]
    kanten=[]
    for art,a,b,pfad,fahrt,puffer,beide in pfade:
        if a not in strassenknoten or b not in strassenknoten:raise ValueError('Terminal fehlt im Strassennetz')
        form=[coords[n] for n in pfad]
        km=sum(dist(x,y) for x,y in zip(form,form[1:]))
        lo,hi=(35,45) if art=='autozug' else (10,20)
        if not lo<km<hi:raise ValueError(f'Unerwartete {art}-Strecke: {km}')
        kanten.append({'art':art,'von':a,'nach':b,'form':form,'km':km,'minuten':fahrt+puffer,'beide':beide})
    meta={'osmTimestamp':raw['osm3s']['timestamp_osm_base'],'checked':'2026-11-03',
          'autozug':{'name':'Autozug Niebüll–Westerland','rideMinutes':35,'terminalBufferMinutes':45},
          'faehre':{'name':'Autofähre Havneby–List','rideMinutes':40,'terminalBufferMinutes':30},
          'assumption':'Planned crossing plus fixed terminal buffer; no timetable, capacity, night-service or cancellation model.',
          'sources':QUELLEN}
    return coords,kanten,meta
