// Spike T-0021 "Bahn schlaegt Auto": Machbarkeit an echter Fahrplan-Fixture.
// Frage: Laesst sich je erreichbarer Haltestelle Bahnzeit gegen Autozeit stellen,
// korrekt (unabhaengige Referenzen), schnell genug fuer den Browser und mit
// ausgewiesenen Grenzen? Keine Fahrplananfrage: nutzt tests/fixtures.
// Aufruf: node scripts/spike-bahn-auto.mjs   (Exit 1, wenn eine Pruefung scheitert)
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const ROOT = process.env.ALLE_WEGE_ROOT
  ? pathToFileURL(process.env.ALLE_WEGE_ROOT.replace(/\/?$/, "/"))
  : new URL("../", import.meta.url);
const { buildGraph, shortest } = await import(new URL("dist/graph.js", ROOT));
const { autobahnZeit } = await import(new URL("dist/autobahntempo.js", ROOT));

const TEMPO = 130,
  MAX_SNAP_KM = 5,
  TOLERANZ_MIN = 5;
const fehler = [];
const pruefe = (ok, text) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${text}`);
  if (!ok) fehler.push(text);
};

const data = JSON.parse(
  gunzipSync(readFileSync(new URL("dist/data/roads.json.gz", ROOT))),
);
const g = buildGraph(data);
const fixture = JSON.parse(
  readFileSync(new URL("tests/fixtures/bahn-erreichbarkeit.json", ROOT)),
);

function km(a, b) {
  const r = Math.PI / 180;
  const u =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(u)));
}

// Haltestellen nur an Knoten mit Nicht-Autobahn-Kante (wie Ortsanschluss).
const geeignet = new Uint8Array(g.nodes.length);
for (const e of g.edges)
  if (e[5] !== 0 && !e[8]) geeignet[e[0]] = geeignet[e[1]] = 1;
const geeigneteListe = [];
geeignet.forEach((x, i) => x && geeigneteListe.push(i));

let t = performance.now();
const raster = new Map();
for (const i of geeigneteListe) {
  const [x, y] = g.nodes[i];
  const k = `${Math.floor(x * 10)},${Math.floor(y * 10)}`;
  if (!raster.has(k)) raster.set(k, []);
  raster.get(k).push(i);
}
const tRaster = performance.now() - t;

function einrasten(lon, lat) {
  const bx = Math.floor(lon * 10),
    by = Math.floor(lat * 10);
  let best = -1,
    bestKm = Infinity;
  // Ein Nachbarring genuegt: 0,1 Grad Laenge >= 6,4 km bis 55,1 N > MAX_SNAP_KM.
  for (let a = bx - 1; a <= bx + 1; a++)
    for (let b = by - 1; b <= by + 1; b++)
      for (const i of raster.get(`${a},${b}`) || []) {
        const d = km([lon, lat], g.nodes[i]);
        if (d < bestKm) (bestKm = d), (best = i);
      }
  return bestKm <= MAX_SNAP_KM ? { node: best, km: bestKm } : { node: -1, km: bestKm };
}
function einrastenReferenz(lon, lat) {
  let best = -1,
    bestKm = Infinity;
  for (const i of geeigneteListe) {
    const d = km([lon, lat], g.nodes[i]);
    if (d < bestKm) (bestKm = d), (best = i);
  }
  return bestKm <= MAX_SNAP_KM ? { node: best, km: bestKm } : { node: -1, km: bestKm };
}

// Unabhaengiger Vorwaerts-Dijkstra direkt auf den Rohkanten (eigene Adjazenz, eigener Heap).
function referenzDijkstra(start) {
  const n = data.nodes.length,
    kopf = new Int32Array(n).fill(-1),
    ziel = [],
    kosten = [],
    next = [];
  const kante = (u, v, c) => {
    ziel.push(v), kosten.push(c), next.push(kopf[u]), (kopf[u] = ziel.length - 1);
  };
  for (const e of data.edges) {
    if (e[3] > 0) kante(e[0], e[1], autobahnZeit(e, TEMPO, true));
    if (e[4] > 0) kante(e[1], e[0], autobahnZeit(e, TEMPO, false));
  }
  const d = new Float64Array(n).fill(Infinity),
    hk = [],
    hv = [];
  const push = (c, v) => {
    let i = hk.length;
    hk.push(c), hv.push(v);
    while (i && hk[(i - 1) >> 1] > hk[i]) {
      const p = (i - 1) >> 1;
      [hk[i], hk[p]] = [hk[p], hk[i]];
      [hv[i], hv[p]] = [hv[p], hv[i]];
      i = p;
    }
  };
  const pop = () => {
    const c = hk[0],
      v = hv[0],
      lc = hk.pop(),
      lv = hv.pop();
    if (hk.length) {
      hk[0] = lc;
      hv[0] = lv;
      let i = 0;
      for (;;) {
        let m = i;
        const l = 2 * i + 1,
          r = l + 1;
        if (l < hk.length && hk[l] < hk[m]) m = l;
        if (r < hk.length && hk[r] < hk[m]) m = r;
        if (m === i) break;
        [hk[i], hk[m]] = [hk[m], hk[i]];
        [hv[i], hv[m]] = [hv[m], hv[i]];
        i = m;
      }
    }
    return [c, v];
  };
  d[start] = 0;
  push(0, start);
  while (hk.length) {
    const [c, u] = pop();
    if (c > d[u]) continue;
    for (let k = kopf[u]; k !== -1; k = next[k]) {
      const nd = c + kosten[k];
      if (nd < d[ziel[k]]) (d[ziel[k]] = nd), push(nd, ziel[k]);
    }
  }
  return d;
}

// 1) Einrasten: Raster gegen Brute Force, an Fixture-Halten und 3.000 Zufallspunkten.
let s = 12345;
const zufall = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const punkte = fixture.all.map((r) => [r.place.lon, r.place.lat]);
for (let i = 0; i < 3000; i++) punkte.push([5.9 + zufall() * 9.1, 47.3 + zufall() * 7.7]);
let abweichung = 0;
for (const [lon, lat] of punkte) {
  const a = einrasten(lon, lat),
    b = einrastenReferenz(lon, lat);
  if (a.node !== b.node) abweichung++;
}
pruefe(abweichung === 0, `Einrasten Raster = Brute Force fuer ${punkte.length} Punkte (Abweichungen ${abweichung})`);
// Unabhaengig von `geeignet`: Knoten, deren Kanten alle Autobahn (Klasse 0) sind.
const andereKante = new Uint8Array(g.nodes.length),
  hatKante = new Uint8Array(g.nodes.length);
for (const e of data.edges)
  for (const v of [e[0], e[1]]) {
    hatKante[v] = 1;
    if (e[5] > 0) andereKante[v] = 1;
  }
const autobahnSnaps = punkte.filter(([lon, lat]) => {
  const r = einrasten(lon, lat);
  return r.node >= 0 && hatKante[r.node] && !andereKante[r.node];
}).length;
pruefe(autobahnSnaps === 0, `kein Halt rastet auf reinen Autobahnknoten (${autobahnSnaps})`);

// Laufzeit fuer eine volle Antwort (Fixture-Quelle nennt 33.092 Eintraege).
t = performance.now();
for (let i = 0; i < 33092; i++) einrasten(5.9 + zufall() * 9.1, 47.3 + zufall() * 7.7);
const tSnap = performance.now() - t;
pruefe(tSnap < 3000, `33.092 Halte einrasten in ${Math.round(tSnap)} ms (+ Raster ${Math.round(tRaster)} ms)`);

// 2) Autozeit vom Startpunkt: graph.js gegen unabhaengigen Dijkstra, alle Knoten.
const start = einrasten(fixture.one.lon, fixture.one.lat);
t = performance.now();
const vor = shortest(g, [start.node], { reverse: false, autobahnTempo: TEMPO });
const tDijkstra = performance.now() - t;
const ref = referenzDijkstra(start.node);
let maxDiff = 0,
  endlichAnders = 0;
for (let i = 0; i < ref.length; i++) {
  if (Number.isFinite(ref[i]) !== Number.isFinite(vor.d[i])) endlichAnders++;
  else if (Number.isFinite(ref[i])) maxDiff = Math.max(maxDiff, Math.abs(ref[i] - vor.d[i]));
}
pruefe(
  endlichAnders === 0 && maxDiff < 1e-6,
  `Autozeiten = Referenz-Dijkstra auf ${ref.length} Knoten (max Abweichung ${maxDiff.toExponential(1)} min, Erreichbarkeit verschieden ${endlichAnders}); Lauf ${Math.round(tDijkstra)} ms`,
);

// 3) Vergleich je Fixture-Halt.
console.log(`\nStart ${fixture.one.lat}, ${fixture.one.lon} (Snap ${start.km.toFixed(2)} km), Abfahrt ${fixture.one.departure}, Auto ${TEMPO} km/h-Szenario`);
console.log("Halt | Bahn min | Auto min | Snap km | Ergebnis");
for (const r of fixture.all) {
  const h = einrasten(r.place.lon, r.place.lat);
  const auto = h.node >= 0 ? vor.d[h.node] : Infinity;
  const diff = r.duration - auto;
  const urteil = !Number.isFinite(auto)
    ? "nicht angebunden"
    : diff < -TOLERANZ_MIN
      ? "Bahn schneller"
      : diff > TOLERANZ_MIN
        ? "Auto schneller"
        : "Gleichstand";
  console.log(`${r.place.name} | ${r.duration} | ${auto.toFixed(1)} | ${h.km.toFixed(2)} | ${urteil}`);
}

if (fehler.length) {
  console.log(`\n${fehler.length} Pruefung(en) gescheitert.`);
  process.exit(1);
}
console.log("\nAlle Pruefungen bestanden.");
