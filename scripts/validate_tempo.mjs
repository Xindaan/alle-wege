import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { buildGraph, shortest, pathTo, analyze } from "../dist/graph.js";

const daten = JSON.parse(gunzipSync(readFileSync(new URL("../dist/data/roads.json.gz", import.meta.url))));
const graph = buildGraph(daten);
const ort = (name) => daten.cities.find((c) => c.name === name);
// Unabhaengige Nachrechnung als zwei Streckenanteile, ohne Modell-Hilfsfunktion.
const kosten = (e, tempo, hin) => {
  if (!e[9]) return e[hin ? 3 : 4];
  return e[9].reduce((t, [km, vor, rueck]) => {
    const limit = hin ? vor : rueck;
    const v = Math.min(tempo, limit === 0 ? Infinity : limit > 0 ? limit : 130);
    return t + 60 * (0.65 * km / v + 0.35 * km / Math.min(v, 100));
  }, 0);
};
const profile = { kanten: 0, richtungen: { unbeschraenkt: 0, limitiert: 0, unbekannt: 0 } };
for (const e of daten.edges) {
  if (!e[9]) continue;
  profile.kanten++;
  assert.equal(e[5], 0);
  assert.ok(Math.abs(e[9].reduce((s, p) => s + p[0], 0) - e[2]) < 0.00002);
  for (const p of e[9]) for (const i of [1, 2]) {
    if (e[i + 2] <= 0) continue;
    profile.richtungen[p[i] === 0 ? "unbeschraenkt" : p[i] > 0 ? "limitiert" : "unbekannt"]++;
  }
}
assert.ok(profile.kanten > 1000);
const routen = [], reichweite = [];
for (const richtung of ["von", "nach"]) {
  let vorher;
  for (const tempo of [130, 160, 200]) {
    const r = shortest(graph, [ort("Berlin").node], { reverse: richtung === "nach", autobahnTempo: tempo });
    assert.equal(r.order.length, daten.nodes.length);
    if (vorher) for (let i = 0; i < r.d.length; i++) assert.ok(r.d[i] <= vorher.d[i] + 1e-8);
    vorher = r;
    reichweite.push({ richtung, tempo, zweiStundenOrte: daten.cities.filter((c) => r.d[c.node] <= 120).length });
    for (const name of ["Hamburg", "Freiburg im Breisgau", "Westerland", "Königs Wusterhausen"]) {
      const ziel = ort(name);
      let u = ziel.node, summe = 0;
      for (const id of pathTo(r, ziel.node)) {
        const e = daten.edges[id];
        const hin = richtung === "nach" ? e[0] === u : e[1] === u;
        assert.ok(e[hin ? 3 : 4] > 0);
        summe += kosten(e, tempo, hin);
        u = e[0] === u ? e[1] : e[0];
      }
      assert.equal(u, ort("Berlin").node);
      assert.ok(Math.abs(summe - r.d[ziel.node]) < 1e-7);
      routen.push({ richtung, ort: name, tempo, minuten: +summe.toFixed(2) });
    }
  }
}
// Unabhaengig gestartete Gegenrichtung muss dieselbe Fahrt liefern.
for (const name of ["Hamburg", "Freiburg im Breisgau", "Westerland"]) {
  const r = shortest(graph, [ort(name).node], { reverse: false, autobahnTempo: 200 });
  const erwartet = routen.find((x) => x.richtung === "nach" && x.ort === name && x.tempo === 200);
  assert.ok(Math.abs(r.d[ort("Berlin").node] - erwartet.minuten) < 0.006);
}
const treffen = analyze(graph, { mode: "meet", travelers: [ort("Berlin").id, ort("Königs Wusterhausen").id], objective: "fair", limit: 2, autobahnTempo: 160 });
assert.ok(treffen.candidates.length > 0);
assert.deepEqual(treffen.candidates, analyze(graph, { mode: "meet", travelers: [ort("Berlin").id, ort("Königs Wusterhausen").id], objective: "fair", limit: 0.5, autobahnTempo: 160 }).candidates);
const ergebnis = { stand: "2026-11-03", knoten: daten.nodes.length, profile, gepruefteRouten: routen.length, vollstaendigeMonotoniePruefungen: 4, reichweite, routen, treffpunkteOhneZeitlimit: treffen.candidates.length };
writeFileSync(new URL("../docs/tempo-validation.json", import.meta.url), JSON.stringify(ergebnis, null, 2) + "\n");
console.log(JSON.stringify(ergebnis, null, 2));
