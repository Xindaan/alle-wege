# Changelog

Dieses Repository ist ein Snapshot des privaten Arbeitsstands (genau ein Commit, `Source:`-Zeile in der
Commit-Nachricht). Aenderungen stehen deshalb hier, nicht in der Git-Historie.

## 2026-11-05 — Routing- und Suchgrenzen korrigiert

- Hauptaeste und Linienstärken folgen den vollstaendigen Suchzustaenden mit Abbiegeverboten.
- Verbotsknoten bleiben beim Import erhalten; Strassendaten neu erzeugt (54.221 Verbote).
- Gekappte Rueckfahrtsuche ist auch bei leerem Ergebnis als unvollstaendig erkennbar.
- Bahn gegen Auto: verbleibende Wartezeit wird ehrlich als Teil der vier Abfragen ausgewiesen;
  keine garantierte Obergrenze von 15 Minuten.

## 2026-11-05 — erste Veroeffentlichung

- Strassenatlas: Erreichbarkeit, Hauptaeste, fairer Treffpunkt, Einzugsgebiete, Wunschtempo Autobahn.
- Strassennetz: OSM-Stand 2026-11-02, Kreisstrassen, Grenzsaum bis etwa 20 km, 103 Autofaehren,
  Abbiegeverbote an Knoten mit Autobahn, Schnell- oder Bundesstrasse.
- Bahn & Bus (Transitous): Erreichbarkeit, fairer Treffpunkt mit Rueckfahrt, Bahnhof-/Gastronomie- und
  Stufenfrei-Filter (DB StaDa), Einzugsgebiete, Fernverkehr-Effekt, Bahn gegen Auto.
