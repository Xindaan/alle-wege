"""Reproduzierbarer OSM-/GeoNames-Import. Keine synthetischen Strassen."""
import collections, gzip, json, math, re, sys, zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sylt_transfers import laden as sylt_laden
ROOT=Path(__file__).resolve().parents[1]
RAW=Path(sys.argv[1] if len(sys.argv)>1 else '/private/tmp/alle-wege-data')
# T-0003: optionaler Zusatzordner (zusatz-0..3, grenzsaum, faehren); ohne ihn der Stand vom 2026-11-03.
ZUSATZ=Path(sys.argv[2]) if len(sys.argv)>2 else None
OUT=ROOT/'dist/data'

def dist(a,b):
    r=math.pi/180
    u=math.sin((b[1]-a[1])*r/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin((b[0]-a[0])*r/2)**2
    return 12742*math.asin(min(1,math.sqrt(u)))

def speed(tags, direction):
    h=tags['highway']
    base={'motorway':130,'trunk':85,'primary':65,'secondary':55,'tertiary':45,'unclassified':35,'residential':25,'service':15,'living_street':7}.get(h,40)
    raw=tags.get('maxspeed:'+direction,tags.get('maxspeed',''))
    if raw=='DE:urban': cap=50
    elif raw=='DE:rural': cap=100
    elif raw=='walk': cap=7
    else:
        nums=re.findall(r'\d+(?:\.\d+)?',raw)
        cap=min(map(float,nums)) if nums else None
        if cap and 'mph' in raw: cap*=1.609344
    if cap is not None and cap>0: base=min(base,cap if h=='motorway' else cap*.85)
    if tags.get('junction')=='roundabout': base=min(base,25)
    return max(5,base)

def motorway_limit(tags, direction):
    raw=tags.get('maxspeed:'+direction,tags.get('maxspeed','')).strip()
    if raw in ('none','DE:motorway'):return 0
    if raw=='DE:urban':return 50
    if raw=='DE:rural':return 100
    if raw=='walk':return 7
    # Unlesbare oder fehlende Grenzen niemals als unbegrenzt interpretieren.
    if not re.fullmatch(r'\d+(?:\.\d+)?(?:\s*mph)?',raw):
        bisher=speed(tags,direction)
        return bisher if bisher<130 else -1
    wert=float(re.search(r'\d+(?:\.\d+)?',raw).group())
    return wert*(1.609344 if 'mph' in raw else 1) if wert>0 else -1

def tempo_profil(kante, vorwaerts):
    profil=kante[9] if len(kante)>9 else []
    return profil if vorwaerts else [[km,r,h] for km,h,r in reversed(profil)]

def contract(nodes,edges,verbleib=None,geschuetzt=(),knotenmapping=None):
    # Grad-2-Knoten mit gleicher Strassenklasse/Referenz kontrahieren.
    # Richtungszeiten werden addiert, maximal 2 km lange Kanten erhalten
    # ausreichend dichte Ortsanschluesse. Keine Kreuzung wird entfernt.
    # verbleib (T-0030, optional): dict wird mit alter Kantennummer -> neuer Kantennummer gefuellt.
    geschuetzt=set(geschuetzt)
    alias={}
    incident=[set() for _ in nodes]
    for i,e in enumerate(edges):incident[e[0]].add(i);incident[e[1]].add(i)
    for u in range(len(nodes)):
        if u in geschuetzt or len(incident[u])!=2:continue
        i,j=incident[u];a,b=edges[i],edges[j]
        if a is None or b is None or a[5:7]!=b[5:7] or a[2]+b[2]>2:continue
        if bool(len(a)>9)!=bool(len(b)>9):continue
        left=a[1] if a[0]==u else a[0];right=b[1] if b[0]==u else b[0]
        if left==right:continue
        af,ab=(a[3],a[4]) if a[1]==u else (a[4],a[3])
        bf,bb=(b[3],b[4]) if b[0]==u else (b[4],b[3])
        if (af>0)!=(bf>0) or (ab>0)!=(bb>0):continue
        pa=list(zip(a[7][::2],a[7][1::2]));pb=list(zip(b[7][::2],b[7][1::2]))
        if a[0]==u:pa.reverse()
        if b[1]==u:pb.reverse()
        geom=[v for p in pa+pb[1:] for v in p]
        merged=[left,right,round(a[2]+b[2],5),round(af+bf,5) if af>0 else -1,round(ab+bb,5) if ab>0 else -1,a[5],a[6],geom]
        if len(a)>9:
            profil=tempo_profil(a,a[1]==u)+tempo_profil(b,b[0]==u)
            kompakt=[]
            for km,hin,rueck in profil:
                if kompakt and kompakt[-1][1:]==[hin,rueck]:kompakt[-1][0]=round(kompakt[-1][0]+km,5)
                else:kompakt.append([km,hin,rueck])
            merged.extend([None,kompakt])
        for node in a[:2]:incident[node].discard(i)
        for node in b[:2]:incident[node].discard(j)
        edges[i]=merged;edges[j]=None;alias[j]=i;incident[left].add(i);incident[right].add(i)
    used=sorted({u for e in edges if e is not None for u in e[:2]});mapping={u:i for i,u in enumerate(used)}
    if knotenmapping is not None:knotenmapping.update(mapping)
    if verbleib is not None:
        neu={};k=0
        for i,e in enumerate(edges):
            if e is not None:neu[i]=k;k+=1
        for i in range(len(edges)):
            j=i
            while j in alias:j=alias[j]
            verbleib[i]=neu[j]
    edges=[[mapping[e[0]],mapping[e[1]],*e[2:]] for e in edges if e is not None]
    nodes=[nodes[u] for u in used]
    return nodes,edges

def simplify(shape,tolerance=.03):
    points=list(zip(shape[::2],shape[1::2]))
    if len(points)<=2:return shape
    projected=[(x*69.98,y*111.2) for x,y in points];keep={0,len(points)-1};stack=[(0,len(points)-1)]
    while stack:
        a,b=stack.pop();ax,ay=projected[a];bx,by=projected[b];dx,dy=bx-ax,by-ay;den=dx*dx+dy*dy;far=-1;md=tolerance*tolerance
        for i in range(a+1,b):
            x,y=projected[i];t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/den)) if den else 0;d=(x-ax-t*dx)**2+(y-ay-t*dy)**2
            if d>md:md=d;far=i
        if far>=0:keep.add(far);stack.extend([(a,far),(far,b)])
    return [v for i in sorted(keep) for v in points[i]]

def read_osm(path, recovery=False):
    """Elementweise lesen: der grosse Rohdownload wird nicht komplett dupliziert."""
    decoder=json.JSONDecoder(); coords={}; ways=[]; waymap={}
    fields={'highway','oneway','junction','maxspeed','maxspeed:forward','maxspeed:backward','ref','name'}
    with path.open(encoding='utf-8') as f:
        buf=f.read(1024*1024)
        marker=re.search(r'"elements"\s*:\s*\[',buf)
        if not marker:raise ValueError('OSM-Antwort ohne Elemente')
        head=buf[:marker.start()]; match=re.search(r'"osm3s"\s*:\s*(\{.*?\})',head,re.S)
        metadata=json.loads(match.group(1)) if match else {}
        if '"remark"' in head:raise ValueError('Overpass meldet eine unvollstaendige Antwort')
        pos=marker.end()
        while True:
            while pos<len(buf) and buf[pos] in ' \r\n\t,':pos+=1
            if pos<len(buf) and buf[pos]==']':
                tail=buf[pos+1:]+f.read()
                if tail.strip()!='}' and not recovery:raise ValueError('Unerwarteter OSM-Abschluss: '+tail[:300])
                if tail.strip()!='}':metadata['recoveryRemark']=tail.strip()
                break
            try:
                item,end=decoder.raw_decode(buf,pos)
            except json.JSONDecodeError:
                chunk=f.read(1024*1024)
                if not chunk:raise ValueError('OSM-Download ist abgeschnitten oder fehlerhaft')
                buf=buf[pos:]+chunk;pos=0;continue
            pos=end
            if item['type']=='node':coords[item['id']]=[item['lon'],item['lat']]
            elif item['type']=='way':
                item['tags']={k:v for k,v in item.get('tags',{}).items() if k in fields}
                ways.append(item);waymap[item['id']]=item
            elif item['type']=='route':
                waymap[item['id']]['tags']={k:v for k,v in item['tags'].items() if k in fields and v}
    for w in ways:
        if not recovery and 'highway' not in w.get('tags',{}):raise ValueError('Strassenmerkmale fehlen fuer '+str(w['id']))
    return metadata,coords,ways

def behalte_knoten(ways,verbote=(),transfers=()):
    # Via-Knoten muessen bereits vor dem Aufteilen der OSM-Wege erhalten bleiben.
    counts=collections.Counter(n for w in ways for n in set(w['nodes']))
    keep={n for n,c in counts.items() if c>1}
    for w in ways:keep.update((w['nodes'][0],w['nodes'][-1]))
    keep.update(v['via'] for v in verbote if v['via'] in counts)
    for t in transfers:keep.update((t['von'],t['nach']))
    return keep

def build():
    if (RAW/'source.json').exists():
        source=json.loads((RAW/'source.json').read_text());metadata=source['metadata'];coords={int(k):v for k,v in source['coords'].items()};ways=source['ways'];del source
    else:
        parts=sorted(RAW.glob('roads-[0-3].json'))
        if parts and len(parts)!=4:raise ValueError('Es werden alle vier Deutschland-Teile benoetigt')
        if not parts:parts=[RAW/'roads.json']
        coords={};waymap={};stamps=set()
        for path in parts:
            metadata,cs,ws=read_osm(path);coords.update(cs);waymap.update({w['id']:w for w in ws});stamps.add(metadata.get('timestamp_osm_base'));print('Read',path.name,len(cs),len(ws),flush=True)
        if len(stamps)!=1:raise ValueError('OSM-Stichtage der Teilabfragen stimmen nicht ueberein')
        ways=list(waymap.values());del waymap,cs,ws
    extra=json.loads((ROOT/'scripts/extra-places.json').read_text())
    if (RAW/'local-roads.json').exists():
        localmeta,localcoords,localways=read_osm(RAW/'local-roads.json')
        if localmeta.get('timestamp_osm_base')!=metadata.get('timestamp_osm_base'):raise ValueError('Ortsnetze haben einen anderen OSM-Stichtag')
        coords.update(localcoords); joined={w['id']:w for w in ways};joined.update({w['id']:w for w in localways});ways=list(joined.values());del joined
    else:raise ValueError('Ergaenzende Ortsnetze local-roads.json fehlen')
    heidemeta,heidecoords,heideways=read_osm(RAW/'heidesee-roads.json')
    if heidemeta.get('timestamp_osm_base')!=metadata.get('timestamp_osm_base'):raise ValueError('Heidesee-Strassen haben einen anderen OSM-Stichtag')
    coords.update(heidecoords);joined={w['id']:w for w in ways};joined.update({w['id']:w for w in heideways});ways=list(joined.values());del joined
    syltmeta,syltcoords,syltways=read_osm(RAW/'sylt-roads.json')
    if syltmeta.get('timestamp_osm_base')!=metadata.get('timestamp_osm_base'):raise ValueError('Sylt-Strassen haben einen anderen OSM-Stichtag')
    coords.update(syltcoords);joined={w['id']:w for w in ways};joined.update({w['id']:w for w in syltways});ways=list(joined.values());del joined
    tc,transfers,transportmeta=sylt_laden(RAW/'sylt-transport.json',set(coords),dist)
    if transportmeta['osmTimestamp']!=metadata.get('timestamp_osm_base'):raise ValueError('Sylt-Ueberfahrten haben einen anderen OSM-Stichtag')
    coords.update(tc)
    faehrkanten=[];zusatzmeta=None
    if ZUSATZ:
        from zusatz_netz import grenzsaum_zellen,waehle_grenzsaum,faehren,deutschland_ringe,GRENZSAUM_KM,FAEHRE_MAX_KM,FAEHRE_KMH
        stand=metadata.get('timestamp_osm_base');joined={w['id']:w for w in ways};zusatzmeta={'osmTimestamp':stand}
        for i in range(4):
            m,cs,ws=read_osm(ZUSATZ/f'zusatz-{i}.json')
            if m.get('timestamp_osm_base')!=stand:raise ValueError(f'zusatz-{i} hat einen anderen OSM-Stichtag')
            neu=sum(1 for w in ws if w['id'] not in joined);coords.update(cs);joined.update({w['id']:w for w in ws})
            zusatzmeta[f'zusatz-{i}']={'ways':len(ws),'neu':neu};print('Zusatz',i,len(ws),'Wege,',neu,'neu',flush=True)
        zellen=grenzsaum_zellen(coords.values())
        from zusatz_netz import GRENZRECHTECKE
        gc={};gwm={}
        for i in range(len(GRENZRECHTECKE)):
            m,cs,ws=read_osm(ZUSATZ/f'grenzsaum-{i}.json')
            if m.get('timestamp_osm_base')!=stand:raise ValueError(f'grenzsaum-{i} hat einen anderen OSM-Stichtag')
            gc.update(cs);gwm.update({w['id']:w for w in ws})
        gw=list(gwm.values());del gwm
        gewaehlt=[w for w in waehle_grenzsaum(gw,gc,zellen) if w['id'] not in joined]
        coords.update({n:gc[n] for w in gewaehlt for n in w['nodes']});joined.update({w['id']:w for w in gewaehlt})
        zusatzmeta['grenzsaum']={'abgefragt':len(gw),'uebernommen':len(gewaehlt),'km':GRENZSAUM_KM};print('Grenzsaum',len(gw),'->',len(gewaehlt),flush=True)
        ways=list(joined.values());del joined,gc,gw,zellen
        roh=json.loads((ZUSATZ/'faehren.json').read_text())
        if roh['osm3s']['timestamp_osm_base']!=stand:raise ValueError('Faehren haben einen anderen OSM-Stichtag')
        strassenknoten={n for w in ways for n in w['nodes']}
        ersatz={};ringe=deutschland_ringe(json.loads((RAW/'countries.json').read_text()))
        if (ZUSATZ/'faehranleger.json').exists():  # T-0029
            from zusatz_netz import anlegerwege,ANLEGER_MAX_KM,ANLEGER_FANG_KM
            from faehranleger_knoten import anleger_knoten
            m,ac,aw=read_osm(ZUSATZ/'faehranleger.json')
            if m.get('timestamp_osm_base')!=stand:raise ValueError('Faehranleger haben einen anderen OSM-Stichtag')
            ac={**{e['id']:[e['lon'],e['lat']] for e in roh['elements'] if e['type']=='node'},**ac,**{n:coords[n] for w in aw for n in w['nodes'] if n in coords}}
            neuwege,agr,ersatz=anlegerwege(anleger_knoten(roh),ac,aw,strassenknoten,ringe,dist)
            vorhanden={x['id'] for x in ways};neuwege=[w for w in neuwege if w['id'] not in vorhanden];del vorhanden
            coords.update({n:ac[n] for w in neuwege for n in w['nodes']});ways+=neuwege
            strassenknoten.update(n for w in neuwege for n in w['nodes'])
            zusatzmeta['faehranleger']={'wege':len(neuwege),'maxKm':ANLEGER_MAX_KM,'fangKm':ANLEGER_FANG_KM,**agr};print('Faehranleger',len(neuwege),'Wege',agr,flush=True)
        faehrkanten,gruende,fehlend=faehren(roh,strassenknoten,ringe,dist,ersatz,coords)
        del strassenknoten,roh
        zusatzmeta['faehren']={'uebernommen':len(faehrkanten),'mitDuration':sum(1 for k in faehrkanten if k['quelle']=='duration'),'ausgelassen':gruende,'fehlendInDeutschland':fehlend,'maxKm':FAEHRE_MAX_KM,'kmhOhneDuration':FAEHRE_KMH,'wartepauschale':'10 min bis 2 km, sonst 30 min; kein Fahrplan'}
        print('Faehren',len(faehrkanten),gruende,flush=True)
    print('OSM source',len(coords),'nodes',len(ways),'ways',flush=True)
    liste=[];verbotmeta=None;vgr=None
    if ZUSATZ and (ZUSATZ/'abbiegeverbote.json').exists():
        from zusatz_netz import abbiegeverbote
        roh=json.loads((ZUSATZ/'abbiegeverbote.json').read_text())
        if roh['osm3s']['timestamp_osm_base']!=metadata.get('timestamp_osm_base'):raise ValueError('Abbiegeverbote haben einen anderen OSM-Stichtag')
        liste,vgr=abbiegeverbote(roh);del roh
    keep=behalte_knoten(ways,liste,transfers+faehrkanten)
    ids=sorted(keep); ix={n:i for i,n in enumerate(ids)}; nodes=[coords[n] for n in ids]
    refs=[]; refmap={}; edges=[]; herkunft=[]  # herkunft: (OSM-Weg, Startknoten, Endknoten) je Rohkante (T-0030)
    for w in ways:
        t=w['tags']; ns=w['nodes']; start=0
        h=t['highway']; classes=['motorway','trunk','primary','secondary'];base=h.replace('_link','');klass=classes.index(base) if base in classes else 4
        ref=t.get('ref',t.get('name',''))[:80]
        if ref not in refmap: refmap[ref]=len(refs); refs.append(ref)
        one=t.get('oneway')
        if one is None: one='yes' if h=='motorway' or t.get('junction')=='roundabout' else 'no'
        sf=0 if one=='-1' else speed(t,'forward'); sb=0 if one in ('yes','true','1') else speed(t,'backward')
        for end in range(1,len(ns)):
            if ns[end] not in keep: continue
            path=[coords[n] for n in ns[start:end+1]]
            km=sum(dist(a,b) for a,b in zip(path,path[1:]))
            if km>0 and ns[start]!=ns[end]:
                # Alle Kurvenpunkte bleiben erhalten; nur die Topologie wird komprimiert.
                shape=[round(v,5) for p in path for v in p]
                edges.append([ix[ns[start]],ix[ns[end]],round(km,5),round(km/sf*60,5) if sf else -1,round(km/sb*60,5) if sb else -1,klass,refmap[ref],shape]);herkunft.append((w['id'],ns[start],ns[end]))
                if h=='motorway':edges[-1].extend([None,[[round(km,5),motorway_limit(t,'forward'),motorway_limit(t,'backward')]]])
            start=end
    for t in transfers:
        name=transportmeta[t['art']]['name'];refmap[name]=len(refs);refs.append(name)
        form=[round(v,5) for p in t['form'] for v in p]
        edges.append([ix[t['von']],ix[t['nach']],round(t['km'],5),t['minuten'],t['minuten'] if t['beide'] else -1,5 if t['art']=='autozug' else 6,refmap[name],form,t['art']]);herkunft.append(None)
    for t in faehrkanten:
        name=t['name'][:80]
        if name not in refmap:refmap[name]=len(refs);refs.append(name)
        form=[round(v,5) for p in t['form'] for v in p]
        edges.append([ix[t['von']],ix[t['nach']],round(t['km'],5),t['minuten'],t['minuten'],6,refmap[name],form,'faehre']);herkunft.append(None)
    print('Raw graph',len(nodes),len(edges),flush=True)
    # T-0030: Abbiegeverbote an grossen Knoten den Rohkanten zuordnen (Von-/Nach-Kante = Kante des Weges mit Ende am Via-Knoten)
    verbote_roh=[]
    if vgr is not None:
        anvia=collections.defaultdict(list)
        for i,h in enumerate(herkunft):
            if h:anvia[(h[0],h[1])].append(i);anvia[(h[0],h[2])].append(i)
        for v in liste:
            a=anvia.get((v['von'],v['via']),[]);b=anvia.get((v['nach'],v['via']),[])
            if not a or not b:vgr['Weg nicht im Netz']=vgr.get('Weg nicht im Netz',0)+1;continue
            if len(a)!=1 or len(b)!=1:vgr['Via mitten im Weg']=vgr.get('Via mitten im Weg',0)+1;continue
            verbote_roh.append((v['via'],a[0],b[0],v['nur'],v['osm']))
        verbotmeta={'geladen':len(liste),'zugeordnet':len(verbote_roh),'ausgelassen':vgr}
        print('Abbiegeverbote',verbotmeta,flush=True)
    # Iteratives Kosaraju: Hauptnetz plus die Komponente am Ortskern Westerland.
    sylt=min(range(len(nodes)),key=lambda i:dist(nodes[i],[8.3071734,54.9064856]))
    n=len(nodes); adj=[[] for _ in nodes]; rev=[[] for _ in nodes]
    for e in edges:
        a,b,_,tf,tb,*_=e
        if tf>0: adj[a].append(b);rev[b].append(a)
        if tb>0: adj[b].append(a);rev[a].append(b)
    seen=bytearray(n); order=[]
    for root in range(n):
        if seen[root]: continue
        seen[root]=1; stack=[(root,0)]
        while stack:
            u,k=stack[-1]
            if k<len(adj[u]):
                v=adj[u][k]; stack[-1]=(u,k+1)
                if not seen[v]:seen[v]=1;stack.append((v,0))
            else:order.append(u);stack.pop()
    seen=bytearray(n); largest=[]; island=[]; comps=0
    for root in reversed(order):
        if seen[root]:continue
        comps+=1; seen[root]=1; stack=[root]; comp=[]
        while stack:
            u=stack.pop();comp.append(u)
            for v in rev[u]:
                if not seen[v]:seen[v]=1;stack.append(v)
        if sylt in comp:island=comp
        if len(comp)>len(largest):largest=comp
    if len(island)<100:raise ValueError('Sylt-Ortsnetz unerwartet klein')
    if set(island)!=set(largest):raise ValueError('Sylt ist trotz Ueberfahrten nicht mit dem Hauptnetz verbunden')
    active=sorted(set(largest)|set(island)); mapping={a:i for i,a in enumerate(active)}
    newedges=[];alt2neu={}
    for i,e in enumerate(edges):
        if e[0] in mapping and e[1] in mapping:alt2neu[i]=len(newedges);newedges.append([mapping[e[0]],mapping[e[1]],*e[2:]])
    excluded=len(nodes)-len(active); nodes=[nodes[i] for i in active];edges=newedges
    geschuetzt={mapping[ix[v[0]]] for v in verbote_roh if ix[v[0]] in mapping}
    verbleib={};knotenmapping={}
    nodes,edges=contract(nodes,edges,verbleib,geschuetzt,knotenmapping)
    print('Contracted graph',len(nodes),len(edges),flush=True)
    turns=[]
    if verbotmeta is not None:
        weg_komp=0
        for via,a,b,nur,osm in verbote_roh:
            if a not in alt2neu or b not in alt2neu:weg_komp+=1;continue
            k=knotenmapping[mapping[ix[via]]];ea,eb=verbleib[alt2neu[a]],verbleib[alt2neu[b]]
            if k not in edges[ea][:2] or k not in edges[eb][:2]:raise ValueError(f'Abbiegeverbot {osm}: Via-Knoten nicht an beiden Kanten')
            turns.append([k,ea,eb,1 if nur else 0])
        # Widerspruechliche only_*-Verbote (gleicher Via und Von-Kante, verschiedene Ziele) sind OSM-Fehler: alle streichen.
        ziele=collections.defaultdict(set)
        for t in turns:
            if t[3]:ziele[(t[0],t[1])].add(t[2])
        wider={k for k,s in ziele.items() if len(s)>1};vor=len(turns)
        turns=[t for t in turns if not (t[3] and (t[0],t[1]) in wider)];verbotmeta['widerspruechlich']=vor-len(turns)
        # Verbote, die Knoten abschneiden (Anbindung im Modellnetz fehlt, z. B. Stichstrassen), streichen.
        from zusatz_netz import entschaerfe_verbote
        turns,verbotmeta['abschneidend']=entschaerfe_verbote(len(nodes),edges,turns,0)
        verbotmeta['ausserhalbNetz']=weg_komp;verbotmeta['imNetz']=len(turns);verbotmeta['viaKnoten']=len({t[0] for t in turns})
    # Staedte an innerorts geeignete Nicht-Autobahnknoten anbinden.
    eligible=set()
    for e in edges:
        if 2<=e[5]<=4:eligible.update(e[:2])
    bins=collections.defaultdict(list)
    for i in eligible:
        x,y=nodes[i]; bins[(int(x*10),int(y*10))].append(i)
    aliases={'Munich':'München','Cologne':'Köln','Frankfurt am Main':'Frankfurt am Main','Nuremberg':'Nürnberg','Hanover':'Hannover','Duesseldorf':'Düsseldorf','Freiburg':'Freiburg im Breisgau'}
    cities=[]; unavailable=[]
    z=zipfile.ZipFile(RAW/'cities.zip')
    for line in z.read('cities15000.txt').decode().splitlines():
        f=line.split('\t')
        if f[8]!='DE' or f[7] in ('PPLX','PPLH','PPLQ','PPLL'):continue
        x,y=float(f[5]),float(f[4]); name=aliases.get(f[1],f[1]); pool=[]
        bx,by=int(x*10),int(y*10)
        for a in range(bx-2,bx+3):
            for b in range(by-2,by+3):pool.extend(bins[(a,b)])
        if not pool: unavailable.append(name); continue
        nearest=min(pool,key=lambda i:dist([x,y],nodes[i])); snap=dist([x,y],nodes[nearest])
        if snap>5:unavailable.append(name);continue
        cities.append({'id':f[0],'name':name,'lon':x,'lat':y,'population':int(f[14] or 0),'state':f[10],'node':nearest,'snapKm':round(snap,3)})
    for place in extra:
        c={k:v for k,v in place.items() if k!='rail'}
        c['node']=min(eligible,key=lambda i:dist([c['lon'],c['lat']],nodes[i]));c['snapKm']=round(dist([c['lon'],c['lat']],nodes[c['node']]),3)
        if c['snapKm']>0.8:raise ValueError('Ortsanschluss zu weit entfernt: '+c['name'])
        cities=[x for x in cities if x['name']!=c['name']];cities.append(c)
    cities.sort(key=lambda c:(-c['population'],c['id']))
    meta={'osmTimestamp':metadata.get('timestamp_osm_base'),'retrieved':'2026-11-03','nodes':len(nodes),'edges':len(edges),'excludedNodes':excluded,'components':comps,'cities':len(cities),'excludedCities':unavailable,'source':'OpenStreetMap contributors / Overpass Europe (dresel.systems)','license':'ODbL-1.0','projection':'equirectangular centered at 51N, 10.5E','speedKmh':{'motorway':130,'trunk':85,'primary':65,'secondary':55,'links':40},'speedRule':'motorway: min(130 km/h, numeric maxspeed); other roads: min(class speed, 85% of numeric maxspeed); roundabouts max 25 km/h','limitations':['no traffic','no turn restrictions or junction delay','no local residential streets','no foreign through routes','largest strongly connected component only','city centers snapped to primary/secondary nodes within 5 km']}
    meta['geometryToleranceMeters']=30
    meta['motorwayProfile']='edge[9]: [km, forward limit, backward limit]; 0 explicit unlimited, -1 unknown; motorway links excluded'
    meta['networkComponentsRetained']=1
    meta['transfers']=transportmeta
    meta['localRoadAreas']=['Gärtringen','Schleiz/Zollgrün/Tanna/Burgk','Lehnitz bei Oranienburg','Sylt/Niebüll/Rømø/Danish access corridor','Pfakofen','Heidesee (Friedersdorf)']
    meta['limitations']=['no traffic','no turn restrictions or junction delay','local roads only in selected areas','foreign roads only in Sylt ferry access corridor; other ferries/car trains excluded','Sylt transfers use fixed planned-crossing times plus terminal buffer, no timetable','city centers snapped to road nodes within 5 km']
    if zusatzmeta:
        meta['retrieved']='2026-11-03; Zusatz 2026-11-05 (gleicher OSM-Stand)'
        meta['zusatz']=zusatzmeta
        meta['limitations']=['no traffic','no turn restrictions or junction delay','local residential roads only in selected areas; tertiary roads included',f'foreign roads: motorway/trunk/primary within about {GRENZSAUM_KM} km of Germany plus the Sylt access corridor','car ferries inside Germany (OSM ways, split ways joined, ends on roads or snapped up to 150 m, landings linked by local roads up to 3 km, max {} km); OSM duration or {} km/h plus fixed waiting time, no timetable'.format(FAEHRE_MAX_KM,FAEHRE_KMH),'Sylt transfers use fixed planned-crossing times plus terminal buffer, no timetable','city centers snapped to road nodes within 5 km']
    meta['speedKmh'].update({'tertiary':45,'unclassified':35,'residential':25,'service':15,'living_street':7})
    for e in edges:e[7]=simplify(e[7])
    if verbotmeta is not None:
        meta['abbiegeverbote']={**verbotmeta,'format':'turns: [Via-Knoten, Von-Kante, Nach-Kante, 1=only_* sonst no_*]','umfang':'Von- oder Nach-Weg motorway/trunk/primary(_link); PKW; ohne bedingte Verbote und Via-Wege'}
        meta['limitations']=[x if x!='no turn restrictions or junction delay' else 'turn restrictions only at major junctions (motorway/trunk/primary); no junction delay' for x in meta['limitations']]
    payload={'meta':meta,'nodes':nodes,'edges':edges,'refs':refs,'cities':cities,**({'turns':turns} if turns else {})}
    OUT.mkdir(exist_ok=True,parents=True)
    with gzip.GzipFile(str(OUT/'roads.json.gz'),'wb',mtime=0) as f:f.write(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode())
    (OUT/'metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    rail={c['id']:c['rail'] for c in extra}
    (OUT/'places.json').write_text(json.dumps([{'id':c['id'],'name':c['name'],'lon':c['lon'],'lat':c['lat'],'state':c['state'],**({'rail':rail[c['id']]} if c['id'] in rail else {})} for c in cities],ensure_ascii=False,separators=(',',':')))
    # Vereinfachte Grenzen nur fuer die Darstellung.
    world=json.loads((RAW/'countries.json').read_text()); features=[]
    for f in world['features']:
        p=f['properties']; code=p.get('ADM0_A3')
        if code not in ['DEU','FRA','BEL','NLD','LUX','CHE','AUT','CZE','POL','DNK']:continue
        features.append({'type':'Feature','properties':{'code':code,'name':p.get('NAME_DE',p.get('NAME'))},'geometry':f['geometry']})
    (OUT/'borders.json').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')))
    print(json.dumps(meta,ensure_ascii=False,indent=2));print('Compressed bytes', (OUT/'roads.json.gz').stat().st_size)

if __name__=='__main__':build()
