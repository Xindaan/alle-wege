#!/bin/bash
# T-0003: Zusatzabfragen vom Overpass-Spiegel mit festem Tagesstand holen.
# Aufruf: scripts/hole_zusatz.sh <rohordner> <name> <abfragedatei> [SUED NORD WEST OST]; KNOTEN=... fuer faehranleger.overpass
# Ergebnis: <rohordner>/<name>.json; bricht ab, wenn Stichtag nicht 2026-11-02T21:21:26Z.
set -u
ROH=$1; NAME=$2; DATEI=$3; SUED=${4:-}; NORD=${5:-}; WEST=${6:-}; OST=${7:-}
STAND="2026-11-02T21:21:26Z"
URL="https://ovp.dresel.systems/api/interpreter"
AGENT="alle-wege-deutschland import (https://xindaan.github.io/alle-wege/)"
mkdir -p "$ROH"
Q=$(grep -v '^//' "$DATEI")
if [ -n "$SUED" ]; then Q=$(printf '%s' "$Q" | sed -e "s/SOUTH/$SUED/g" -e "s/NORTH/$NORD/g" -e "s/WEST/$WEST/g" -e "s/EAST/$OST/g"); fi
# T-0029: Knotenliste (Umgebungsvariable KNOTEN, kommagetrennt) fuer faehranleger.overpass
if [ -n "${KNOTEN:-}" ]; then Q=$(printf '%s' "$Q" | sed -e "s/KNOTEN/$KNOTEN/g"); fi
for warten in 0 60 180 600; do
  [ "$warten" -gt 0 ] && echo "warte $warten s" && sleep "$warten"
  curl -sS -m 900 -A "$AGENT" --data-urlencode "data=$Q" "$URL" -o "$ROH/$NAME.json.tmp"
  if python3 - "$ROH/$NAME.json.tmp" "$STAND" <<'PY'
import sys,re
p,stand=sys.argv[1],sys.argv[2]
kopf=open(p,encoding='utf-8',errors='replace').read(4000)
ende=open(p,'rb');ende.seek(0,2);n=ende.tell();ende.seek(max(0,n-300));schluss=ende.read().decode('utf-8','replace')
ok=f'"timestamp_osm_base": "{stand}"' in kopf and '"remark"' not in kopf and '"remark"' not in schluss and schluss.rstrip().endswith('}')
print('stichtag/ende ok' if ok else 'ungueltig: '+(kopf[:200]+' ... '+schluss[-200:]).replace('\n',' '))
sys.exit(0 if ok else 1)
PY
  then mv "$ROH/$NAME.json.tmp" "$ROH/$NAME.json"; ls -l "$ROH/$NAME.json"; exit 0; fi
done
echo "$NAME nach allen Versuchen nicht geladen"; exit 1
