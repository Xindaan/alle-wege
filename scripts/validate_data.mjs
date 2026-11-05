import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import {
  buildGraph,
  shortest,
  rankMeetings,
  pathTo,
  analyze,
} from "../dist/graph.js";
const d = JSON.parse(
  gunzipSync(
    readFileSync(new URL("../dist/data/roads.json.gz", import.meta.url)),
  ),
);
assert.ok(d.nodes.length > 10000, "Echter Deutschland-Graph erwartet");
assert.ok(d.cities.length > 500);
assert.equal(d.meta.speedKmh.motorway, 130);
let abschnitteUeber115 = 0;
for (const e of d.edges) {
  assert.ok(
    e[0] >= 0 && e[0] < d.nodes.length && e[1] >= 0 && e[1] < d.nodes.length,
  );
  assert.ok(e[2] > 0 && Number.isFinite(e[2]));
  assert.ok(e[3] > 0 || e[4] > 0);
  assert.ok(e[7].length >= 4 && e[7].length % 2 === 0);
  for (const t of [e[3], e[4]])
    if (t > 0) {
      const tempo = (e[2] / t) * 60;
      assert.ok(tempo < 131, "130 km/h plus Rundungstoleranz");
      if (tempo > 116) abschnitteUeber115++;
    }
}
assert.ok(
  abschnitteUeber115 > 1000,
  "130-km/h-Modell muss in den Fahrzeiten ankommen",
);
for (const c of d.cities) {
  assert.ok(c.snapKm <= 5);
  assert.ok(c.node >= 0 && c.node < d.nodes.length);
}
const g = buildGraph(d),
  byName = (n) => {
    const c = d.cities.find((c) => c.name === n);
    assert.ok(c, n);
    return c;
  };
assert.equal(
  shortest(g, [byName("Berlin").node]).order.length,
  d.nodes.length,
  "Alle Knoten zum Festland verbunden",
);
assert.equal(
  shortest(g, [byName("Berlin").node], { reverse: false }).order.length,
  d.nodes.length,
  "Alle Knoten vom Festland verbunden",
);
const pairs = [
  ["Berlin", "Hamburg", 220, 380],
  ["Berlin", "München", 490, 800],
  ["Köln", "Frankfurt am Main", 140, 270],
  ["Hamburg", "München", 590, 1000],
  ["Leipzig", "Dresden", 90, 180],
  ["Frankfurt am Main", "Stuttgart", 140, 280],
];
const results = [];
for (const [from, to, minKm, maxKm] of pairs) {
  const a = byName(from),
    b = byName(to),
    forward = shortest(g, [a.node], { reverse: false }),
    reverse = shortest(g, [b.node]),
    distance = shortest(g, [b.node], { metric: "distance" }),
    slow = shortest(g, [b.node], { slow: true });
  assert.ok(Math.abs(forward.d[b.node] - reverse.d[a.node]) < 1e-7);
  assert.ok(
    distance.d[a.node] > minKm && distance.d[a.node] < maxKm,
    `${from}-${to}: ${distance.d[a.node]} km`,
  );
  assert.ok(slow.d[a.node] >= reverse.d[a.node]);
  let time = 0,
    u = a.node;
  for (const id of pathTo(reverse, a.node)) {
    const e = d.edges[id];
    assert.equal(u === e[0] || u === e[1], true);
    const t = u === e[0] ? e[3] : e[4];
    assert.ok(t > 0);
    time += t;
    u = u === e[0] ? e[1] : e[0];
  }
  assert.equal(u, b.node);
  assert.ok(Math.abs(time - reverse.d[a.node]) < 1e-7);
  assert.ok(
    reverse.order.length === d.nodes.length,
    "Hauptnetz und Sylt sind ueber echte Terminals verbunden",
  );
  results.push({
    from,
    to,
    shortestKm: +distance.d[a.node].toFixed(1),
    fastestMinutes: +time.toFixed(1),
    slowMinutes: +slow.d[a.node].toFixed(1),
    sourceSnapKm: a.snapKm,
    destinationSnapKm: b.snapKm,
  });
}
const people = ["Berlin", "Hamburg", "München"].map((n) => byName(n).node),
  meeting = rankMeetings(g, people);
assert.equal(meeting.candidates.length, d.cities.length);
const best = meeting.candidates[0];
for (const c of meeting.candidates) assert.ok(c.max >= best.max);
const ortChecks = [];
for (const name of [
  "Gärtringen",
  "Schleiz",
  "Zollgrün",
  "Lehnitz",
  "Westerland",
  "Tanna",
  "Pfakofen",
  "Burgk",
  "Heidesee",
]) {
  const c = byName(name),
    r = shortest(g, [c.node]);
  assert.ok(c.snapKm < 0.1, name + " braucht nahen Ortsanschluss");
  assert.equal(Number.isFinite(r.d[byName("Berlin").node]), true);
  assert.equal(r.order.length, d.nodes.length);
  ortChecks.push({
    name,
    snapKm: c.snapKm,
    reachableNodes: r.order.length,
    mainland: true,
  });
}
const syltChecks = [];
for (const art of ["autozug", "faehre", "both", "none"]) {
  for (const [von, nach] of [
    ["Westerland", "Hamburg"],
    ["Hamburg", "Westerland"],
  ]) {
    const r = shortest(g, [byName(nach).node], { sylt: art });
    const pfad = pathTo(r, byName(von).node),
      arten = pfad.map((i) => d.edges[i][8]).filter(Boolean);
    assert.equal(Number.isFinite(r.d[byName(von).node]), art !== "none");
    if (art !== "none") {
      assert.equal(arten.length, 1);
      if (art !== "both") assert.equal(arten[0], art);
      assert.ok(r.d[byName(von).node] > 180 && r.d[byName(von).node] < 420);
      if (art === "faehre")
        assert.ok(
          pfad.some((i) =>
            d.edges[i][7].some((v, k) => k % 2 === 1 && v > 55.1),
          ),
          "Faehre nutzt Roemoe-Damm in Daenemark",
        );
    }
    syltChecks.push({
      von,
      nach,
      art,
      minutes: Number.isFinite(r.d[byName(von).node])
        ? r.d[byName(von).node]
        : null,
      used: arten,
    });
  }
}
assert.equal(
  rankMeetings(g, [byName("Westerland").node, byName("Berlin").node]).candidates
    .length,
  d.cities.length,
);
assert.equal(
  rankMeetings(g, [byName("Westerland").node, byName("Berlin").node], "fair", {
    sylt: "none",
  }).candidates.length,
  0,
);
const farbChecks = [];
for (const name of ["Reutlingen", "München"]) {
  const c = byName(name),
    r = analyze(g, {
      mode: "one",
      node: c.node,
      metric: "time",
      weight: "nodes",
      branches: 10,
    });
  const anteile = r.roots.map((u) => r.w[u] / r.order.length);
  assert.equal(anteile.length, 10);
  assert.ok(Math.max(...anteile) < 0.2);
  assert.ok(anteile.reduce((a, b) => a + b, 0) > 0.7);
  farbChecks.push({
    name,
    largestShare: Math.max(...anteile),
    coloredShare: anteile.reduce((a, b) => a + b, 0),
  });
}
const reichweitenChecks = [];
for (const name of ["Berlin", "Reutlingen"])
  for (const direction of ["from", "to"]) {
    const r = analyze(g, {
      mode: "reach",
      node: byName(name).node,
      direction,
      metric: "time",
      limit: 2,
      weight: "nodes",
      branches: 6,
    });
    assert.ok(r.samples.length > 10 && r.samples.length < d.cities.length);
    assert.ok(r.samples.every((c) => c.value <= 120));
    for (const u of r.order) if (r.w[u] > 0) assert.ok(r.d[u] <= 120);
    reichweitenChecks.push({
      name,
      direction,
      minutes: 120,
      cities: r.samples.length,
      median: r.median,
      max: Math.max(...r.samples.map((x) => x.value)),
    });
  }
const report = {
  reachability: reichweitenChecks,
  places: ortChecks,
  sylt: syltChecks,
  flows: farbChecks,
  date: "2026-11-03",
  nodes: d.nodes.length,
  edges: d.edges.length,
  cities: d.cities.length,
  motorwayReferenceKmh: d.meta.speedKmh.motorway,
  directedSectionsAbove115: abschnitteUeber115,
  onewayEdges: d.edges.filter((e) => e[3] < 0 || e[4] < 0).length,
  tests:
    "6 real route pairs: connectivity, direction, path sums, distance plausibility, slowdown monotonicity; all candidate minimax ranking",
  routes: results,
  meeting: {
    city: d.cities[best.index].name,
    times: best.times,
    max: best.max,
    sum: best.sum,
  },
  status: "passed",
};
writeFileSync(
  new URL("../docs/data-validation.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
