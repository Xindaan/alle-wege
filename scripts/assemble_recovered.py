"""Gezielte Vervollstaendigung abgebrochener Overpass-Ausgaben.

Nur wenn Print der Knoten (Zeile 5 der versionierten Abfrage) abbrach,
ist die davor vollstaendig ausgegebene Menge der Ways verwendbar.
Fehlende Koordinaten/Tags muessen exakt per OSM-ID ergaenzt werden.
Die Ausgabe ist erst erlaubt, wenn jeder Way jedes benoetigte Feld hat.
"""
import json,pickle,shutil,sys
from pathlib import Path
from prepare_data import read_osm
raw=Path(sys.argv[1]);coords,ways,metas=pickle.load((raw/'middle-recovery.pickle').open('rb'))
for i in [0,3]:
    meta,cs,ws=read_osm(raw/f'roads-{i}.json');coords.update(cs);ways.update({w['id']:w for w in ws});metas.append(meta);print('Complete part',i,len(cs),len(ws),flush=True)
tagmeta,_,tags=read_osm(raw/'roads-complete.json',recovery=True);metas.append(tagmeta)
for w in tags:
    if w['id'] in ways:ways[w['id']]['tags']=w['tags']
del tags
missing_nodes=sorted({n for w in ways.values() for n in w['nodes']}-coords.keys())
missing_ways=sorted(w['id'] for w in ways.values() if not w.get('tags',{}).get('highway'))
(raw/'missing-final-nodes.json').write_text(json.dumps(missing_nodes));(raw/'missing-final-ways.json').write_text(json.dumps(missing_ways))
print('Required node gaps:',len(missing_nodes),'tag gaps:',len(missing_ways),flush=True)
for path in sorted(raw.glob('gaps-*.json')):
    m,cs,ws=read_osm(path,recovery=True);metas.append(m);coords.update(cs)
    for w in ws:ways[w['id']]['tags']=w['tags']
missing_nodes={n for w in ways.values() for n in w['nodes']}-coords.keys();missing_ways=[w['id'] for w in ways.values() if not w.get('tags',{}).get('highway')]
with (raw/'assembled.pickle').open('wb') as f:pickle.dump((coords,ways,metas),f)
if missing_nodes or missing_ways:
    print('INCOMPLETE: fetch exact gaps before finalizing.');sys.exit(2)
stamps={m.get('timestamp_osm_base') for m in metas};assert len(stamps)==1,stamps
complete=raw/'complete';complete.mkdir(exist_ok=True)
# Kompaktes, vollstaendig geprueftes Eingabeformat fuer den reproduzierbaren Build.
with (complete/'source.json').open('w') as f:json.dump({'metadata':{'timestamp_osm_base':next(iter(stamps))},'coords':coords,'ways':list(ways.values())},f,separators=(',',':'))
for name in ['cities.zip','countries.json']:shutil.copy2(raw/name,complete/name)
report={'osmTimestamp':next(iter(stamps)),'ways':len(ways),'nodes':len(coords),'missingNodes':0,'missingWayTags':0,'recovery':'Way sets from all four strips complete; partial middle files ended in node print at line 5; exact ID gaps filled; tags joined by OSM way ID from matching-date source.'}
(complete/'provenance.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
