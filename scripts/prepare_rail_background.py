"""Vereinfachtes Natural-Earth-Bahnnetz als rein kartografischer Hintergrund."""
import hashlib, json, sys
from pathlib import Path
raw=Path(sys.argv[1]).read_bytes()
daten=json.loads(raw)
linien=[]
def nah(p):return 4.5<=p[0]<=16.5 and 46.5<=p[1]<=56
for f in daten['features']:
    if f['geometry']['type']!='LineString':continue
    lauf=[]
    for a,b in zip(f['geometry']['coordinates'],f['geometry']['coordinates'][1:]):
        if nah(a) or nah(b):
            if not lauf:lauf.append(a)
            lauf.append(b)
        elif lauf:
            linien.append(lauf);lauf=[]
    if lauf:linien.append(lauf)
# Die Quelle ist bereits kartografisch generalisiert; auf 5 Dezimalstellen runden.
linien=[[[round(x,5),round(y,5)] for x,y,*_ in l] for l in linien if len(l)>1]
out={'source':'Natural Earth 1:10m Railroads','url':'https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_railroads.geojson','license':'Public Domain','retrieved':'2026-11-03','sourceSha256':hashlib.sha256(raw).hexdigest(),'purpose':'Simplified cartographic background, not used for routing or accessibility','lines':linien}
p=Path(__file__).resolve().parents[1]/'dist/data/rail-network.json'
p.write_text(json.dumps(out,separators=(',',':'))+'\n')
print(len(linien),'Linien,',sum(map(len,linien)),'Punkte,',p.stat().st_size,'Bytes')
