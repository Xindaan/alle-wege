# Alle Wege · Deutschland

Interaktiver deutscher Strassen- und Fahrplanatlas, inspiriert von [All Roads Lead To](https://all-roads-lead-to.netlify.app/). Er beantwortet: Wohin komme ich in einer bestimmten Zeit, von wo erreiche ich einen Ort, und wo treffen wir uns fair? Das OpenStreetMap-Strassenmodell rechnet lokal im Browser. Bahn und Bus verwenden ausdruecklich angeforderte Transitous-Fahrplandaten.

[Website oeffnen](https://xindaan.github.io/alle-wege/) — oeffentlich auf GitHub Pages.

## Quickstart

```sh
npm start
# http://localhost:8765
npm test
```

Python 3 startet den statischen Server, Node >= 20 fuehrt die Tests aus. Keine npm-Abhaengigkeiten; `dist/data/` enthaelt die aufbereiteten Daten.

## Nutzung

Zwischen **Strasse** und **Bahn & Bus** wechseln: ausgewaehlte Orte/Kartenpunkte, Richtung, Treffpunktziel und Zeitlimit werden uebernommen. Bahn-Datum, Uhrzeit und Umstiege sowie Strassen-Wunschtempo bleiben fuer den Rueckwechsel erhalten. Beide Einstellungen sind im Ansichtslink enthalten. Allgemeine Standardvorschlaege: Berlin, Hamburg, Muenchen, Koeln, Frankfurt und Leipzig. Gaertringen, Schleiz, Zollgruen, Lehnitz bei Oranienburg, Westerland, Tanna, Pfakofen und Burgk bei Schleiz bleiben in beiden Suchen und Berechnungen, erscheinen aber nicht als Standardchips oder private Beispielwerte.

### Strasse

- **Erreichbarkeit / Fahrzeit:** Startansicht mit zwei Stunden ab Berlin. Ort, Richtung **von diesem Ort / zu diesem Ort** und Zeitbudget waehlen. Farben zeigen die Modellfahrzeit; bei zwei Stunden 0–30, 30–60, 60–90, 90–120 Minuten. Ortsliste und Zaehler verwenden dasselbe Budget. Karte passt den Ausschnitt an. Grau dient als Orientierungsnetz. Nur vollstaendig innerhalb des Budgets liegende Abschnitte werden eingefaerbt.
- **Erreichbarkeit / Hauptaeste:** Startansicht: Hauptaeste ueber ganz Deutschland; Fahrzeit ist die alternative Einfaerbung derselben Frage (Wechsel setzt 2 Std. Zeitbudget). Schnellste oder kuerzeste Wege von/nach Ort bzw. Kartenpunkt, gewichtete Hauptaeste und optional begrenzter Einzugsbereich. Farben bezeichnen hier Zufluesse, nicht Minuten. Gemeinsamer Stamm und kleine Nebenarme bleiben neutral.
- **Fairer Treffpunkt:** 2–8 Startorte, laengste Anreise oder gesamte Fahrzeit minimieren. Alle geladenen Orte ohne Zeitlimit vergleichen; bis zu fuenf Vorschlaege mit Einzelzeiten. Das separate Erreichbarkeitsbudget bleibt gespeichert und ist hier ausgeblendet.
- **Einzugsgebiete:** 5, 10 oder 20 groesste geladene Orte oder aus der Bahn uebernommene Zentren; jeder Netzknoten gehoert zum am schnellsten/kuerzesten erreichbaren Zentrum.
- **Wunschtempo Autobahn:** 100–200 km/h in Zehnerschritten, Standard 130. Ein vereinfachtes Tagesverkehr-Szenario rechnet 65 % der Strecke mit Wunschtempo und 35 % mit hoechstens 100 km/h, beide begrenzt durch erfasste richtungsabhaengige Tempolimits. Routen, Reichweite und Treffpunkte werden neu gesucht. Ohne Limit ergeben 160/200 etwa 132/148 km/h im Modell; das ist kein garantierter Reiseschnitt.
- **Erfasste Ueberfahrten:** automatisch enthalten, ohne Sonderbedienung. Autozug Niebüll–Westerland: 35 Minuten Fahrt + 45 Minuten Terminalpuffer. Faehre Havneby–List: 40 + 30 Minuten mit Strassenanschluss ueber Daenemark. Dazu 103 innerdeutsche Autofaehren (Rhein, Elbe inkl. Glueckstadt–Wischhafen, Nord-Ostsee-Kanal, Weser, Bodensee Konstanz–Meersburg u. a.): OSM-Fahrzeit (`duration`, sonst 15 km/h) plus Wartepauschale 10 Minuten bis 2 km bzw. 30 Minuten darueber, ohne Fahrplan. Anleger, die nur ueber Ortsstrassen erreichbar sind (z. B. Kaub), sind ueber den kuerzesten Ortsstrassen-Pfad bis 3 km angebunden; endet der OSM-Faehrweg neben der Strasse, gilt der naechste Strassenknoten bis 150 m. Rund 20 innerdeutsche Faehren fehlen weiter (Anleger ohne Strasse in OSM), Liste in `metadata.json` unter `zusatz.faehren.fehlendInDeutschland`. Gestrichelte Linien kennzeichnen Ueberfahrten. Annahmen stehen unter Daten & Modell.
- Papier/Nacht/Tinte, Zoom/Verschieben, Animation, URL-Ansicht und PNG-Export. Linienstaerke zaehlt Netzknoten oder geladene Orte, kein beobachtetes Verkehrsaufkommen.

**Aenderung:** Der missverstaendliche Autobahnvergleich mit 60 km/h wurde durch Reichweite ersetzt. Alte `effect`-Links oeffnen jetzt Reichweite zum bisherigen Ziel. Neu ist das offen ausgewiesene Wunschtempo-Szenario statt einer konstanten Autobahngeschwindigkeit. Dadurch aendern sich auch die Zeiten bei Standardwahl 130 km/h.

### Bahn & Bus

Ortslisten verwenden wie der Strassenmodus ein Suchfeld mit Hinzufuegen per Enter/Pfeil und einzeln entfernbaren Zeilen. Das gilt fuer Startorte, Zentren und eigene Treffpunkte. Alte mehrzeilige Ansichtslinks bleiben lesbar.

Gemeinsame Optionen: Reisetag, Abfahrtszeit oder Ankunftsfrist in Europe/Berlin, 0–6 Umstiege, zusaetzlicher Umstiegspuffer, Nahverkehrsfilter. Erreichbarkeit und Einzugsgebiete haben 30 Minuten bis 8 Stunden Suchhorizont; Treffpunkte haben kein persoenliches Zeitlimit.

- **Erreichbarkeit:** Fahrplan-Erreichbarkeit von oder nach einem Ort/einer Haltestelle. Zeit umfasst Warten ab Wunschabfahrt bzw. bis zur gemeinsamen Ankunftsfrist. Fusszugang maximal 15 Minuten. Karte zeigt erreichbare Haltepunkte auf einem vereinfachten realen Bahnnetz. Auswahl eines Halts zeichnet die aktuelle Verbindungsgeometrie ein. Keine flaechige Isochrone oder vollstaendiger deutschlandweiter Linienbaum.
- **Fairer Treffpunkt:** Automatisch gemeinsame deutsche Haltepunkte fuer 2–8 Startorte suchen; gleiche Wunschabfahrt, wahlweise kuerzeste laengste Anreise oder geringste gesamte Fahrzeit. Die jeweils andere Groesse entscheidet bei Gleichstand. Kein Zeitlimit aus der Erreichbarkeitskarte: die Suche erweitert ihren Fahrplanausschnitt automatisch, bis das Optimum abgesichert ist oder eine technische Grenze erreicht wird. Die Karte zeigt den besten Haltepunkt und bis zu vier Alternativen mit mindestens 20 km Abstand. Nummern entsprechen der Liste, Farben den Startorten. Anreisen zum besten Vorschlag werden automatisch geladen; andere Vorschlaege per Klick. Alternativ 1–3 eigene Orte vergleichen. Treffpunkte werden ueber dieselbe Haltestellen-ID geschnitten, nicht nur ueber gleich klingende Namen. Optional "Alle zurueck zu Hause bis" (Uhrzeit, frueher als die Abfahrt = Folgetag) mit Mindestaufenthalt 1-6 Std.: je Person eine zusaetzliche Rueckwaerts-Anfrage mit Ankunftsfrist am Startort; es zaehlen nur Halte, an denen nach der letzten Ankunft noch der Mindestaufenthalt bleibt und alle danach rechtzeitig heimkommen. Liste nennt Zusammenzeit und erste noetige Rueckfahrt. Rueckfahrten werden bis Frist minus Abfahrt minus Aufenthalt, hoechstens 8 Std. gesucht; lehnt der Dienst das ab, 6 Std. mit Hinweis. Bei einer Kappung sind Suche und Rangfolge unvollstaendig; der Hinweis bleibt auch bei leerem Ergebnis sichtbar. Das Rueckwaertsfenster enthaelt auch die Zeit zwischen frueher Heimkehr und Rueckkehrfrist, nicht nur die Fahrt. Die Rangfolge bleibt die der Anreise. "Treffpunkt soll haben": keine Vorgabe, einen Bahnhof, einen stufenfreien Bahnhof (laut DB) oder einen Bahnhof mit mindestens 3 Lokalen (Restaurant, Cafe, Imbiss, Kneipe, Bar, Biergarten); Bahnhof oder Haltepunkt hoechstens 300 m vom Halt, Lokale hoechstens 300 m vom Bahnhof, Luftlinie. Vorberechnet aus OpenStreetMap (`dist/data/bahnhof-umfeld.json`, `python3 scripts/bahnhof_umfeld.py`); Oeffnungszeiten nicht enthalten. Stufenfreiheit aus den DB-Stationsdaten (StaDa, DB InfraGO, CC BY 4.0, Feld `hasSteplessAccess`): naechste DB-Station hoechstens 300 m vom Bahnhof; nur DB-Stationen, Stand des Abrufs, kein aktueller Aufzugsstatus. Danach `python3 scripts/bahnhof_stufenfrei.py <stations.json> <abrufzeit>` (StaDa-Abruf von Hand mit eigenem DB-API-Schluessel, hoechstens 1 Abruf/Tag). Liste nennt Lokalzahl und Stufenfreiheit.
- **Einzugsgebiete:** 2–20 Zentren mit derselben Ankunftsfrist; Zuordnung der erreichbaren Haltepunkte zur kuerzesten Anreise.
- **Fernverkehr-Effekt:** Gleiche Suche mit/ohne Fernverkehr. Fehlt die Nahverkehrsroute innerhalb des Horizonts, wird dies markiert und kein unendlicher Zeitgewinn behauptet.
- **Bahn gegen Auto:** Je erreichbarer Haltestelle Fahrplanzeit gegen Modell-Autozeit vom selben Ausgangspunkt, von oder nach dem Ort. Blau = Bahn mehr als 5 Minuten schneller, Braun = Auto, Grau = etwa gleich; Liste nach Bahnvorteil sortiert. Vier Fahrplananfragen im 15-Minuten-Raster ab der gewählten Zeit (bei Ankunft davor), je Haltestelle zählt die schnellste; das Straßennetz (ca. 24 MB) wird erst beim ersten Vergleich geladen und rechnet im Worker mit dem Wunschtempo aus der Straßenansicht (Standard 130 km/h). Haltestellen werden an den nächsten Nicht-Autobahn-Knoten bis 5 km angebunden, sonst nicht verglichen. Ungleiche Zeitbasis: Bahn mit verbleibender Wartezeit ab dem jeweiligen Abfragezeitpunkt bzw. bis zur Ankunftsfrist (auch mehr als 15 Minuten) und Fußweg bis 15 Minuten; die vier Abfragen sind eine Stichprobe, keine reine Fahrzeit, Auto ohne Stau, Parken und letzte Strecke; keine Tür-zu-Tür-Aussage.
- Haltestelle auf Karte/Liste waehlen: Die konkrete Verbindung wird automatisch eingezeichnet. **Verbindung/Anreisen aktuell pruefen** laedt sie bei Bedarf erneut. Linien, Fusswege, Wartezeiten, verfuegbare Gleise und Echtzeitkennzeichnung werden als Details gezeigt. Einzelne Verbindungssuche bleibt separat erreichbar.
- Der rechte Bereich scrollt unabhaengig. Normales Scrollen ueber der Karte bewegt die Seite; +/− oder Strg/Command+Scrollen zoomt. Mobil scrollt die gesamte Seite.

Atlas und automatische Rangfolge beruhen auf dem Sollfahrplan **ohne Echtzeit**. Die aktuelle Detailpruefung kann davon abweichen; beide Zeitangaben stehen bei Treffpunkten nebeneinander. Verspaetungen koennen andere Anschluesse ermoeglichen oder verhindern. Bahnsteige und verschiedene Fahrplanquellen koennen doppelte Bahnhofseintraege liefern; Liste fasst benachbarte Treffer zusammen, Zaehler nennt Haltepunkte. Deutschlandfilter verwendet die vereinfachte Natural-Earth-Grenze. Fuer Orte ohne passenden eigenen Bahnhof sind teilweise Bushaltestellen hinterlegt; der Weg von der Haustuer dorthin ist nicht enthalten.

Die Treffpunktsuche startet intern mit sechs Stunden und erweitert bei Bedarf auf acht, zwoelf und 24 Stunden ab Wunschabfahrt. Sobald ein gemeinsamer Halt gefunden ist, steht das Minimax-Optimum innerhalb der gelieferten Daten fest: ein noch nicht erfasster Halt braucht fuer mindestens eine Person laenger. Bei Minimierung der Summe wird weitergesucht, bis die beste Summe nicht groesser als der Suchhorizont ist. Fahrplandienst-/Kontingentgrenzen werden offen gemeldet; vorhandene gepruefte Vorschlaege bleiben sichtbar, eine nicht abgesicherte Gesamtrangfolge wird markiert. Ein leeres Ergebnis behauptet keine grundsaetzliche Unmoeglichkeit eines Treffens. Erreichbarkeitsbudgets bleiben dagegen strikt.

Heidesee ist mit Bezugspunkt Friedersdorf und dessen Bahnhof enthalten; persoenliche Ergaenzungen erscheinen nicht in Standardvorschlaegen.

## Konfiguration und Daten

Statische Site unter `dist`. GitHub Pages veroeffentlicht eine Kopie von `dist` unter `xindaan.github.io/alle-wege/`. Stand: 971 Orte, 460.743 Netzknoten, 628.977 Kanten (`roads.json.gz` 23,7 MB); OSM 2026-11-02T21:21:26Z.

Reproduzierbarer Import:

1. `scripts/roads.overpass` fuer die vier dokumentierten Breitenstreifen nacheinander abfragen; `roads-0.json` bis `roads-3.json` speichern. Vollstaendigkeit und identischer OSM-Stichtag werden geprueft, OSM-IDs dedupliziert.
2. [GeoNames cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip) als `cities.zip` speichern.
3. [Natural Earth Countries](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson) als `countries.json` speichern.
4. `scripts/local-roads.overpass`, `scripts/heidesee-roads.overpass`, `scripts/sylt-roads.overpass` und `scripts/sylt-transport.overpass` abfragen: `local-roads.json`, `heidesee-roads.json`, `sylt-roads.json`, `sylt-transport.json`, gleicher Stichtag. Ortsdefinitionen: `scripts/extra-places.json`.
5. Zusatznetz (T-0003, gleicher Stichtag, Overpass-Spiegel mit Tagesstand): `scripts/hole_zusatz.sh <zusatzordner> zusatz-<i> scripts/zusatz-de.overpass <sued> <nord>` fuer die vier Breitenstreifen (Kreisstrassen und durch `motorcar`/`motor_vehicle` erlaubte Hauptstrassen), `grenzsaum-<i>` mit `scripts/grenzsaum.overpass` fuer die sechs `GRENZRECHTECKE` aus `scripts/zusatz_netz.py`, `faehren` mit `scripts/faehren.overpass`.
6. `python3 scripts/prepare_data.py /absoluter/pfad/zum/arbeitsverzeichnis /absoluter/pfad/zum/zusatzordner` (ohne zweites Argument: Netz ohne Zusatz).
7. Pruefen: `node scripts/validate_data.mjs`, `node scripts/validate_tempo.mjs`, `node scripts/validate_t0003.mjs <alte roads.json.gz>` (Luecken, Faehren, Grenzsaum, Routenvergleich).

Abbiegeverbote: Via-Knoten bleiben sowohl beim Aufteilen der OSM-Wege als auch beim Kontrahieren von Grad-2-Knoten erhalten. Hauptaeste und Linienstärken folgen dem vollstaendigen Suchzustandsbaum; jeder Ort/Knoten liefert sein Gewicht nur im besten Zustand.

Autobahnprofil: originale richtungsabhaengige OSM-Limits je Teilstrecke bleiben auch beim Zusammenfassen von Kanten erhalten. `0` bedeutet ausdruecklich unbeschraenkt, `-1` unbekannt/unlesbar (konservative Obergrenze 130). Ueber 130 wird nur bei expliziter Limitfreiheit oder entsprechend hoeherem numerischen Limit gerechnet. Die gespeicherten Basiszeiten bleiben fuer alte Rechenkernaufrufe erhalten; die Anwendung verwendet das gewaehlte Wunschtempo-Szenario. Sonstige Strassen: trunk 85, primary 65, secondary 55, *_link 40, tertiary 45, unclassified 35, residential 25, service 15, living_street 7 km/h. Numerische Limits begrenzen sonst auf 85 % des Limits; Kreisverkehre auf 25 km/h. Fehlendes Limit beweist keine Limitfreiheit.

Bahn ist eine nichtkommerzielle Open-Source-Anwendung (MIT) gemaess [Transitous API-Regeln](https://transitous.org/api/). Breiter oder automatisierter Betrieb braucht Abstimmung mit Transitous (T-0007); das lokale Kontingent begrenzt nicht die gesamte Dienstlast. 40 neue Fahrplananfragen pro Browser/Tag, zehn Minuten Speicher-Cache mit maximal 12 Antworten, keine Hintergrundabfragen. Atlas: eine Sammelanfrage pro Ausgangsort/Zentrum, bei automatischen Treffpunkten je Suchrunde eine pro Person, zwei fuer Fernverkehrvergleich, vier fuer Bahn gegen Auto; konkrete Anreisen zum besten Treffpunkt eine pro Person, eigener Zielvergleich bis 24 Einzelanfragen. Kontingent wird vorher geprueft.

## Grenzen / FAQ

**Sind Strassenzeiten Navigationsauskuenfte?** Nein: kein Liveverkehr, keine Ampelwartezeiten oder bedingten Limits; Abbiegeverbote nur an Knoten mit Autobahn, Schnell- oder Bundesstrasse (ohne bedingte Verbote und Via-Wege); Kreisstrassen enthalten, Gemeinde- und Wohnstrassen nur in ergaenzten Gebieten. Ausland: Autobahnen, Schnell- und Hauptstrassen bis etwa 20 km jenseits der Grenze, dazu der Sylt-Faehrkorridor. Letzte Strecke zwischen Ortsmitte und Netzknoten fehlt. Sylt-Zeiten setzen eine geplante Ueberfahrt voraus, ohne Fahrplan, Nachtbetrieb, Kapazitaet, Ausfaelle oder Fahrzeugbeschraenkungen. Terminalpuffer ist eine Modellannahme, keine durchschnittliche Wartezeit.

**Bleibt jedes Zeitbudget beim Wechsel identisch?** Das Budget gilt fuer Erreichbarkeit, nicht fuer die Treffpunktsuche; deren Hin-/Rueckwechsel erhaelt das gespeicherte Reichweitenbudget. 30 Minuten bis 8 Stunden werden exakt uebernommen. Eine unbegrenzte Strassenansicht wird bei Bahn sichtbar auf deren maximalen Suchhorizont 8 Stunden begrenzt; beim unveraenderten Rueckwechsel bleibt die Strassenansicht unbegrenzt. Entfernungsbudgets werden nicht in Stunden umgedeutet. Einzelne Bahnverbindungen und eigene Bahn-Treffpunktziele bleiben im Link fuer den Rueckwechsel erhalten; Strasse zeigt dazu die entsprechende Erreichbarkeits-/Treffpunktsuche.

**Wie belastbar ist das Autobahnszenario?** Die 65/35-Streckenanteile sind eine eigene transparente Annahme, keine empirisch bestaetigte individuelle Tagesfahrzeitfunktion. Die BASt-Studie 2025 nennt gemessen 112,0 km/h bei Limit 120 und 99,7 bei Limit 100; 117,3 bei Limit 130 ist dort modelliert (Tabelle 7, S. 35). Das dient nur als Plausibilitaetsvergleich. Ausgewaehlte Hochgeschwindigkeitsprofile belegen keinen repraesentativen Schnitt bei Wunschtempo 160/200. Keine Live-/Stauprognose, kein Berufsverkehrs- oder Wettermodell. Die Szenariozeit addiert `0.65 * km / min(Wunsch, Limit) + 0.35 * km / min(Wunsch, Limit, 100)` in Stunden.

**Westerland mit Festland vergleichen?** Beide Ueberfahrten sind integriert, einschliesslich gerichteter Lade-/Entladerampen und daenischem Damm. Alte Links mit Ueberfahrtausschluss oder Zusatzwartezeit werden auf die festen Standardannahmen normalisiert.

**Ist fair gleich lange Fahrt?** Minimax minimiert die laengste Anreise, nicht den Unterschied. Strasse optimiert unter 971 Orten, Bahn unter den gemeinsamen Haltepunkten der automatisch erweiterten Fahrplanauskunft. Keine Empfehlung fuer die praktische Eignung eines Treffpunkts.

**Warum fehlt ein Ort?** Grundkatalog: GeoNames ab etwa 15.000 Einwohnern, dazu neun OSM-Orte. Bahn kann ueber die Lupe weitere Haltestellen suchen. Unvollstaendige Fahrplaene und vereinfachte Landesgrenzen koennen Ergebnisse ausschliessen.

**Datenschutz?** Strassenberechnung lokal, keine Tracker/Standortabfrage. Explizite Bahnsuchen senden Orte/Haltestellen und Reiseparameter an Transitous. Lokal gespeichert wird nur der Kontingentzaehler; Ergebnisse bleiben im Arbeitsspeicher. Links enthalten die ausgewaehlten Orte/Parameter, starten aber keine Fahrplansuche beim Oeffnen.

## Development


Bahn-Hintergrundnetz: [Natural Earth Railroads](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson) herunterladen und `python3 scripts/prepare_rail_background.py /pfad/ne_10m_railroads.geojson` ausfuehren. Das Asset dient ausschliesslich der Orientierung; die Fahrplan-API liefert die ausgewaehlten Reisegeometrien.

- `npm test`: Routing gegen unabhaengige Floyd-Warshall-Referenz, Minimax, Treffpunkt mit Rueckfahrt (Zusammenzeit, Kontingent, 6-Std.-Rueckfall), Treffpunkt-Umfeld (Radius, Rasterkante, Lokalschwelle), Sylt-Kosten/Wahl, Richtung und Reichweitenbudget; Bahnzeiten, Umstiege, echte Fahrplan-Fixtures, automatische Treffpunkte gegen brute-force Referenz, Gebiete und Fernverkehrvergleich.
- `node scripts/validate_abbiegefluss.mjs`: alle 971 Ortswege von und nach Berlin gegen Abbiegeverbote und aufsummierte Kantenlast pruefen; B-56-Verbotsknoten muss erhalten bleiben.
- `python3 -B tests/test_import.py`: Import, Richtungserhalt, Kreuzungen, Tempolimits und unvollstaendige Downloads.
- `node scripts/validate_data.mjs`: echtes Netz, sechs Routenpaare, neun Wunschorte, acht Sylt-Richtungs-/Verkehrsmittelpruefungen, zwei Farbfaelle, vier Zwei-Stunden-Richtungsfaelle Berlin/Reutlingen.
- `node scripts/validate_tempo.mjs`: 22.260 Profilkanten, vier vollstaendige Monotoniepruefungen, 24 richtungsabhaengige Routennachrechnungen, Gegenrichtungen und vom Reichweitenbudget unabhaengige Treffpunkte.
- `node scripts/spike-bahn-auto.mjs`: Haltestellen-Anbindung gegen Brute Force, Autozeiten gegen unabhaengigen Dijkstra auf dem echten Netz, Rechenzeit fuer 33.092 Halte.
- Rohdaten-Herkunft/Hashes: `docs/data-provenance.json`.

## Architektur und Quellen

OSM-Topologie verbindet nur geteilte OSM-Knoten, nicht geometrische Kreuzungen. Darstellung mit 30 m Toleranz; Laengen/Zeiten aus voller Geometrie. Grad-2-Knoten werden mit addierten Richtungszeiten zusammengefasst. Sylt ist Teil derselben stark verbundenen Komponente. Autozugkanten verbinden ausschliesslich echte Strassen-Terminalknoten entlang der OSM-Bahntrasse; keine Zusteigeorte an Bahnuebergaengen. Ortsanschluss an Nicht-Autobahnknoten innerhalb 5 km, sonst Ausschluss.

`dist/graph.js` und `worker.js`: Strassenberechnung. `app.js`: Bedienung/Canvas. `bahn-core.js`: Verbindungsdaten. `bahn-atlas-core.js`: Sammelrouting und Berechnung; `bahn-atlas-ui.js`: Karte/Liste; `bahn-auto-core.js`: Haltestellen-Anbindung und Bahn-Auto-Vergleich (Worker-Nachricht `bahnauto`). MOTIS `/api/v6/one-to-all`: Dauer in Minuten, `k` = Zahl der Fahrzeuge, nicht Umstiege. Geografie statt Feed-Praefix bestimmt Deutschland. Eingabeaenderung/Abbruch verwirft veraltete Antworten; Teilfehler werden nicht als vollstaendige Rangliste ausgegeben.

- Autobahnszenario/Plausibilitaet: [BASt 2025, Tempolimit-Auswirkungen](https://www.bmv.de/SharedDocs/DE/Publikationen/StV/studie-tempolimit-auswirkungen.pdf?__blob=publicationFile), Tabellen 7/9 und Grenzen S. 54; eigene 65/35-Annahme klar getrennt.
- Strassen: © OpenStreetMap-Mitwirkende, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); abgeleitete Datenbank `dist/data/roads.json.gz` ebenfalls ODbL, in der Site herunterladbar.
- Orte: GeoNames, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); kein einheitlicher Bevoelkerungsstichtag. OSM-Zusatzorte mit `population:0` als Nicht-Ranking-Marker.
- Ueberfahrten: [Autozug-Fahrplan](https://www.autozug-sylt.de/de/fahrplan?stage=Live), [Sylt Shuttle Anreise](https://www.syltshuttle.de/syltshuttle-de/reiseinformationen/anreisetipps-2049338), [FRS FAQ](https://www.frs-syltfaehre.de/faq), [Faehrfahrplan 2026](https://www.frs-syltfaehre.de/fahrplan-2026). Abruf 2026-11-03; Terminalpuffer eigene Modellannahme.
- Bahn: [Transitous-Datenquellen](https://transitous.org/sources/), jeweilige Lizenzen. [MOTIS one-to-all Quellcode v2.11.4](https://github.com/motis-project/motis/blob/v2.11.4/src/endpoints/one_to_all.cc) fuer Zeit-/Echtzeitsemantik.
- Grenzen und Bahnnetz-Hintergrund: Natural Earth, Public Domain. Inspiration: All Roads Lead To / Arterial Mapping; kein fremder Anwendungscode uebernommen.

## Lizenz

Code: MIT (`LICENSE` im oeffentlichen Repository). Daten in `dist/data/`: OpenStreetMap ODbL 1.0, GeoNames CC BY 4.0, DB InfraGO StaDa CC BY 4.0 (Stufenfreiheit in `bahnhof-umfeld.json`), Natural Earth Public Domain; Schriften unter SIL Open Font License (`dist/fonts/`). Rohdaten der Importe sind nicht enthalten, die Abfragen liegen in `scripts/`.
