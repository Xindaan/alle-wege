import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, shortest, pathTo, analyze } from "../dist/graph.js";
const kante = (a, b, t) => [a, b, t, t, t, 2, 0, []];

test("Flussbaum behaelt Umwegzustaende, zaehlt Quellen einmal und faerbt deren echte Pfade", () => {
  const g = buildGraph({ nodes: Array.from({ length: 5 }, () => [0, 0]),
    edges: [kante(0, 1, 1), kante(1, 2, 1), kante(1, 3, 1), kante(0, 4, 5), kante(4, 2, 5)],
    cities: Array.from({ length: 5 }, (_, node) => ({ id: String(node), node })), turns: [[1, 0, 1, 0]] });
  for (const reverse of [false, true]) for (const weight of ["nodes", "cities"]) for (const limit of [0, 3, 20]) {
    const root = reverse ? 2 : 0;
    const r = shortest(g, [root], { reverse });
    const a = analyze(g, { mode: "one", node: root, direction: reverse ? "to" : "from", metric: "time", weight, limit: limit / 60, branches: 3 });
    const f = a.fluss || a, erwartet = new Float64Array(g.edges.length), wirklich = new Float64Array(g.edges.length);
    let quellen = 0;
    for (let v = 0; v < 5; v++) if (!limit || r.d[v] <= limit) {
      quellen++;
      for (const e of pathTo(r, v)) erwartet[e]++;
      let z = a.fluss ? r.zustand.best[v] : v; const pfad = [];
      while (f.parent[z] >= 0) { pfad.push(f.edge[z]); z = f.parent[z]; }
      assert.deepEqual(pfad, pathTo(r, v));
    }
    for (const z of f.order) if (f.edge[z] >= 0) wirklich[f.edge[z]] += f.w[z];
    assert.deepEqual(wirklich, erwartet);
    assert.equal(f.w[root], quellen);
    assert.equal(f.source.reduce((a, b) => a + b, 0), quellen);
    assert.equal(f.colors.length, f.parent.length);
  }
  const a = analyze(g, { mode: "basins", seeds: ["0", "2"], weight: "cities", metric: "time" });
  for (const z of a.fluss.order) if (a.fluss.parent[z] >= 0)
    assert.equal(a.fluss.colors[z], a.fluss.colors[a.fluss.parent[z]]);
});
