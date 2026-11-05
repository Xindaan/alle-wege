// Vollstaendiger Flussbaum: reale Ortswege gegen OSM-Verbote und Kantenlast pruefen.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { buildGraph, shortest, analyze } from "../dist/graph.js";
const d = JSON.parse(gunzipSync(readFileSync(new URL("../dist/data/roads.json.gz", import.meta.url))));
const g = buildGraph(d), root = d.cities.find(c => c.name === "Berlin").node;
const verboten = new Map();
for (const [via, a, b, nur] of d.turns) {
  const k = `${via},${a}`;
  if (!verboten.has(k)) verboten.set(k, []);
  verboten.get(k).push([b, nur]);
}
function pruefe(kanten, start) {
  let v = start, vorher = -1;
  for (const id of kanten) {
    for (const [b, nur] of verboten.get(`${v},${vorher}`) || [])
      assert.ok(nur ? id === b : id !== b, `Verbot am Knoten ${v}: ${vorher} -> ${id}`);
    const e = d.edges[id];
    assert.ok(e[0] === v || e[1] === v, "Zusammenhaengender Weg");
    if (e[0] === v) { assert.ok(e[3] > 0); v = e[1]; }
    else { assert.ok(e[4] > 0); v = e[0]; }
    vorher = id;
  }
  return v;
}
const bericht = {};
for (const reverse of [false, true]) {
  const r = shortest(g, [root], { reverse });
  const f = analyze(g, { mode: "one", node: root, direction: reverse ? "to" : "from", metric: "time", weight: "cities", branches: 6 }).fluss;
  const erwartet = new Float64Array(d.edges.length), wirklich = new Float64Array(d.edges.length);
  for (const c of d.cities) {
    const weg = [];
    let z = r.zustand.best[c.node];
    while (f.parent[z] >= 0) { weg.push(f.edge[z]); z = f.parent[z]; }
    assert.equal(z, root);
    assert.equal(pruefe(reverse ? weg : weg.slice().reverse(), reverse ? c.node : root), reverse ? root : c.node);
    for (const id of weg) erwartet[id]++;
  }
  for (const z of f.order) if (f.edge[z] >= 0) wirklich[f.edge[z]] += f.w[z];
  assert.deepEqual(wirklich, erwartet, "Flusslast entspricht der Summe aller legalen Ortswege");
  assert.equal(f.w[root], d.cities.length);
  bericht[reverse ? "nachBerlin" : "abBerlin"] = { legaleOrtswege: d.cities.length, kantenlast: "identisch mit einzeln summierten Wegen" };
}
// OSM-Relation 1797801: B 56, Via 1366528364 (OSM-Stichtag aus data-provenance.json).
const via = d.nodes.findIndex(([x,y]) => x === 6.1001085 && y === 50.9888308);
assert.ok(via >= 0, "B-56-Verbotsknoten bleibt beim Import erhalten");
const turns = d.turns.filter(t => t[0] === via);
const b56 = d.edges.filter(e => e.slice(0,2).includes(via) && d.refs[e[6]] === "B 56");
assert.equal(b56.length, 2, "B 56 bleibt am Verbotsknoten in zwei Kanten geteilt");
// Die From-Rampe der Relation (OSM 35777628) liegt schon vor der Kontraktion
// ausserhalb der stark zusammenhaengenden Hauptkomponente. Kein aktives Verbot
// erfinden: Die alte durchgehende B-56-Kante wird dennoch nicht mehr erzeugt.
assert.equal(d.nodes.findIndex(([x,y]) => x === 6.1008752 && y === 50.987895), -1);
for (const [,a,b] of turns) { assert.ok(d.edges[a].slice(0,2).includes(via)); assert.ok(d.edges[b].slice(0,2).includes(via)); }
bericht.b56 = { osmRelation: 1797801, via, getrennteB56Kanten: b56.length, verbote: turns, grenze: "From-Rampe ausserhalb Hauptkomponente; Via-Knoten und getrennte B-56-Kanten erhalten" };
console.log(JSON.stringify(bericht, null, 2));
