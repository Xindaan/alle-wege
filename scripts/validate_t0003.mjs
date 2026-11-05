// T-0003: Wirkung des Neuimports pruefen (Luecken, Faehren, Grenzsaum, Groesse).
// Aufruf: node scripts/validate_t0003.mjs <alt/roads.json.gz> [neu/roads.json.gz]
import { readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { buildGraph, shortest } from "../dist/graph.js";

const altPfad = process.argv[2],
  neuPfad = process.argv[3] || new URL("../dist/data/roads.json.gz", import.meta.url).pathname;
const lade = (p) => JSON.parse(gunzipSync(readFileSync(p)));
const alt = lade(altPfad),
  neu = lade(neuPfad);
const km = (a, b) => {
  const r = Math.PI / 180,
    x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r),
    y = (b[1] - a[1]) * r;
  return 6371 * Math.hypot(x, y);
};
// Abstand [lon, lat] zur naechsten Netzstrecke (Punkt-Strecke, Formen sind vereinfacht)
function abstand(d, p) {
  let best = Infinity;
  const c = Math.cos((p[1] * Math.PI) / 180),
    xy = (lon, lat) => [(lon - p[0]) * c * 111.2, (lat - p[1]) * 111.2];
  for (const e of d.edges) {
    const f = e[7];
    for (let i = 0; i + 3 < f.length; i += 2) {
      if (Math.min(Math.abs(f[i] - p[0]), Math.abs(f[i + 2] - p[0])) > 0.05 || Math.min(Math.abs(f[i + 1] - p[1]), Math.abs(f[i + 3] - p[1])) > 0.05) continue;
      const [ax, ay] = xy(f[i], f[i + 1]),
        [bx, by] = xy(f[i + 2], f[i + 3]),
        dx = bx - ax,
        dy = by - ay,
        t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
const bericht = { groesse: {}, luecken: {}, faehren: {}, routen: {} };
bericht.groesse = {
  altMB: +(statSync(altPfad).size / 1e6).toFixed(1),
  neuMB: +(statSync(neuPfad).size / 1e6).toFixed(1),
  altKnoten: alt.nodes.length,
  neuKnoten: neu.nodes.length,
  altKanten: alt.edges.length,
  neuKanten: neu.edges.length,
  neuOrte: neu.cities.length,
  altOrte: alt.cities.length,
};
// 1. Die vier Luecken aus dem Zugangsfilter: Mittelpunkte (Overpass "center") der dort fehlenden OSM-Wege.
// Mittelpunkte gekruemmter Wege liegen nicht exakt auf der Strasse, daher Schwelle 150 m.
const luecken = {
  "A 72 Leipzig-Sued": [[12.40044, 51.20915], [12.39319, 51.21246], [12.40782, 51.20665], [12.40598, 51.2072]],
  "B 58 Ahlen/Beckum": [[8.08664, 51.75014], [8.07694, 51.76104], [8.10879, 51.74334], [8.09713, 51.74655]],
  "B 3 Babenhaeuser Landstrasse": [[8.72989, 50.0708], [8.70041, 50.08358], [8.72973, 50.0702]],
  "Friedrich-Ebert-Damm Hamburg": [[10.10943, 53.59309], [10.11141, 53.59653]],
};
for (const [name, punkte] of Object.entries(luecken)) {
  const a = Math.max(...punkte.map((p) => abstand(alt, p))),
    n = Math.max(...punkte.map((p) => abstand(neu, p)));
  bericht.luecken[name] = { altMaxKm: +a.toFixed(3), neuMaxKm: +n.toFixed(3) };
  assert.ok(n < 0.15, `${name}: neu bis ${n} km vom Netz`);
}
// 2. Faehren: erwartete innerdeutsche Autofaehren ja, Auslandsfaehren nein
const faehrNamen = neu.edges.filter((e) => e[8] === "faehre").map((e) => neu.refs[e[6]]);
bericht.faehren.anzahl = faehrNamen.length;
// Kaub und Bingen erreichen ihre Anleger nur ueber Ortsstrassen (T-0029)
for (const muster of [/Gl[üu]ckstadt|Wischhafen/, /Konstanz - Meersburg/, /Missunde/, /Kanalf[äa]hre Brunsb[üu]ttel/, /Kaub/, /Bingen - R[üu]desheim/])
  assert.ok(faehrNamen.some((n) => muster.test(n)), `Faehre ${muster} fehlt`);
for (const muster of [/R[øo]dby|Puttgarden/, /Malm[öo]/, /Trelleborg/, /Fåborg|Lyø/])
  assert.ok(!faehrNamen.some((n) => muster.test(n)), `Auslandsfaehre ${muster} enthalten`);
bericht.faehren.beispiele = faehrNamen.slice(0, 12);
// 3. Routen: Grenzsaum (Deutsches Eck) und allgemeine Plausibilitaet
const gAlt = buildGraph(alt),
  gNeu = buildGraph(neu);
const ort = (d, n) => {
  const c = d.cities.find((c) => c.name === n);
  assert.ok(c, n);
  return c.node;
};
for (const [von, nach] of [
  ["Berlin", "München"],
  ["Hamburg", "Köln"],
  ["Konstanz", "Lörrach"],
  ["Cuxhaven", "Itzehoe"],
]) {
  const t = (d, g) => shortest(g, [ort(d, von)], { reverse: false }).d[ort(d, nach)];
  bericht.routen[`${von} -> ${nach}`] = { altMin: Math.round(t(alt, gAlt)), neuMin: Math.round(t(neu, gNeu)) };
}
console.log(JSON.stringify(bericht, null, 2));
const r = bericht.routen;
// Grenzsaum: Konstanz-Loerrach fuehrt ueber Schweizer Autobahnen (vorher Umweg durch den Schwarzwald).
assert.ok(r["Konstanz -> Lörrach"].neuMin < r["Konstanz -> Lörrach"].altMin - 20, "Grenzsaum muss Konstanz-Loerrach verkuerzen");
for (const k of ["Berlin -> München", "Hamburg -> Köln"])
  assert.ok(Math.abs(r[k].neuMin - r[k].altMin) <= 15, `${k} darf sich kaum aendern`);
