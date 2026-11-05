import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  shortest,
  accumulate,
  rankMeetings,
  analyze,
  pathTo,
  branches,
} from "../dist/graph.js";
const edge = (a, b, t, back = -1, km = t, cls = 2) => [
  a,
  b,
  km,
  t,
  back,
  cls,
  0,
  [],
];
const fixture = (n, edges, cities = []) =>
  buildGraph({ nodes: Array.from({ length: n }, () => [0, 0]), edges, cities });
test("Sylt-Verkehrsmittel, Wartepuffer und Treffpunkte verwenden dieselben Kosten", () => {
  const zug = [...edge(0, 1, 80, 80, 39, 5), "autozug"],
    faehre = [...edge(0, 2, 70, 70, 12, 6), "faehre"];
  const g = fixture(
    4,
    [zug, faehre, edge(2, 1, 30, 30, 20), edge(1, 3, 20, 20, 20)],
    [
      { id: "a", node: 0 },
      { id: "b", node: 1 },
      { id: "c", node: 3 },
    ],
  );
  assert.equal(shortest(g, [3]).d[0], 100);
  assert.equal(shortest(g, [3], { sylt: "faehre" }).d[0], 120);
  assert.equal(shortest(g, [3], { sylt: "none" }).d[0], Infinity);
  assert.equal(shortest(g, [3], { transferWait: 30 }).d[0], 130);
  assert.equal(
    shortest(g, [3], { metric: "distance", transferWait: 180 }).d[0],
    52,
  );
  assert.equal(
    rankMeetings(g, [0, 3], "fair", { sylt: "none" }).candidates.length,
    0,
  );
  const r = analyze(g, {
    mode: "meet",
    travelers: ["a", "c"],
    sylt: "faehre",
    transferWait: 30,
    objective: "fair",
  });
  assert.equal(r.selected.max, 130);
  assert.ok(r.paths.flat().includes(1));
  assert.ok(!r.paths.flat().includes(0));
});
test("Gemeinsame Zufahrt verdeckt grosse Zufluesse nicht; Wege bleiben unveraendert", () => {
  const es = [edge(1, 0, 1), edge(2, 1, 1)];
  let next = 3;
  // Zehn winzige Abzweige fuellten bisher das Farbbudget direkt am Ziel.
  for (let j = 0; j < 10; j++) es.push(edge(next++, 0, 1));
  const aeste = [];
  for (let j = 0; j < 6; j++) {
    let parent = 2;
    const first = next;
    for (let k = 0; k < 20; k++) {
      es.push(edge(next, parent, 1));
      parent = next++;
    }
    aeste.push(first);
  }
  const g = fixture(next, es),
    r = shortest(g, [0]),
    vorher = Array.from(r.parent),
    { w } = accumulate(g, r),
    b = branches(r, w, 6);
  assert.equal(new Set(aeste.map((u) => b.colors[u])).size, 6);
  assert.ok(aeste.every((u) => b.colors[u] >= 0));
  assert.equal(b.colors[1], -1);
  assert.equal(b.colors[2], -1);
  assert.equal(b.roots.length, 6);
  assert.deepEqual(Array.from(r.parent), vorher);
});
test("Unerreichbare Orte erhalten auch bei unendlichem Radius kein Gewicht", () => {
  const g = fixture(3, [edge(1, 0, 1)], [{ node: 1 }, { node: 2 }]);
  assert.deepEqual(
    Array.from(accumulate(g, shortest(g, [0]), "cities").w),
    [1, 1, 0],
  );
});
function floyd(g, metric = "time", slow = false) {
  const n = g.nodes.length,
    d = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
    );
  for (const [a, b, km, tf, tb, cls] of g.edges) {
    const cost = (t) =>
      metric === "distance" ? km : slow && cls === 0 ? Math.max(t, km) : t;
    if (tf > 0) d[a][b] = Math.min(d[a][b], cost(tf));
    if (tb > 0) d[b][a] = Math.min(d[b][a], cost(tb));
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
  return d;
}
test("Zielrouting respektiert Fahrtrichtung und unerreichbare Knoten", () => {
  const g = fixture(4, [edge(0, 1, 3), edge(1, 2, 4)]);
  const r = shortest(g, [2]);
  assert.deepEqual(Array.from(r.d), [7, 4, 0, Infinity]);
  assert.deepEqual(pathTo(r, 0), [0, 1]);
  assert.equal(shortest(g, [0]).d[2], Infinity);
});
test("Gegenrichtung darf andere Fahrzeit haben", () => {
  const g = fixture(2, [edge(0, 1, 3, 8)]);
  assert.equal(shortest(g, [1]).d[0], 3);
  assert.equal(shortest(g, [0]).d[1], 8);
});
test("Schnellste und kuerzeste Route unterscheiden sich", () => {
  const g = fixture(3, [
    edge(0, 2, 5, -1, 2),
    edge(0, 1, 1, -1, 3),
    edge(1, 2, 1, -1, 3),
  ]);
  assert.equal(shortest(g, [2]).d[0], 2);
  assert.equal(shortest(g, [2], { metric: "distance" }).d[0], 2);
  assert.deepEqual(pathTo(shortest(g, [2], { metric: "distance" }), 0), [0]);
});
test("Einzugsgebiete waehlen erreichbares Ziel statt Luftlinie", () => {
  const g = fixture(4, [edge(0, 1, 4), edge(0, 2, 2), edge(3, 1, 1)]);
  const r = shortest(g, [1, 2]);
  assert.deepEqual(Array.from(r.basin), [1, 0, 1, 0]);
});
test("Quellgewicht und Reichweite sind getrennt vom durchlaufenden Weg", () => {
  const g = fixture(
    3,
    [edge(0, 1, 2), edge(1, 2, 2)],
    [{ node: 0 }, { node: 1 }],
  );
  const r = shortest(g, [2]);
  assert.deepEqual(Array.from(accumulate(g, r, "cities", 3).w), [0, 1, 1]);
  assert.deepEqual(Array.from(accumulate(g, r, "nodes").w), [1, 2, 3]);
});
test("Autobahn-Szenario optimiert Wege neu, beschleunigt keine langsame Strasse", () => {
  const g = fixture(3, [
    edge(0, 2, 2, -1, 10, 0),
    edge(0, 1, 3),
    edge(1, 2, 3),
  ]);
  assert.equal(shortest(g, [2]).d[0], 2);
  assert.equal(shortest(g, [2], { slow: true }).d[0], 6);
  const slow = fixture(2, [edge(0, 1, 20, -1, 10, 0)]);
  assert.equal(shortest(slow, [1], { slow: true }).d[0], 20);
});
test("Treffpunkt nutzt Vorwaertszeiten, keine umgedrehten Anreisen", () => {
  const cities = [
    { node: 2, id: "a" },
    { node: 3, id: "b" },
  ];
  const g = fixture(
    4,
    [edge(0, 2, 4, 99), edge(1, 2, 5, 99), edge(0, 3, 2, 1), edge(1, 3, 8, 1)],
    cities,
  );
  const fair = rankMeetings(g, [0, 1]);
  assert.equal(fair.candidates[0].index, 0);
  assert.deepEqual(fair.candidates[0].times, [4, 5]);
});
test("Minimax und Summe liefern bewusst verschiedene Treffpunkte", () => {
  const cities = [
    { node: 2, id: "a" },
    { node: 3, id: "b" },
  ];
  const g = fixture(
    4,
    [edge(0, 2, 5), edge(1, 2, 5), edge(0, 3, 1), edge(1, 3, 8)],
    cities,
  );
  assert.equal(rankMeetings(g, [0, 1], "fair").candidates[0].index, 0);
  assert.equal(rankMeetings(g, [0, 1], "total").candidates[0].index, 1);
});
test("Kein gemeinsames erreichbares Ziel und zu wenige Startorte", () => {
  const g = fixture(3, [edge(0, 2, 1)], [{ node: 2, id: "a" }]);
  assert.equal(rankMeetings(g, [0, 1]).candidates.length, 0);
  assert.equal(rankMeetings(g, [0]).candidates.length, 0);
});
test("Alle Distanzrichtungen gegen unabhaengigen Floyd-Warshall, 30 deterministische Graphen", () => {
  let seed = 991;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 30; trial++) {
    const n = 9,
      edges = [];
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        if (rnd() < 0.35)
          edges.push(
            edge(
              a,
              b,
              1 + Math.floor(rnd() * 20),
              rnd() < 0.5 ? -1 : 1 + Math.floor(rnd() * 20),
              1 + Math.floor(rnd() * 30),
              rnd() < 0.3 ? 0 : 2,
            ),
          );
    const g = fixture(n, edges);
    for (const metric of ["time", "distance"])
      for (const slow of [false, true]) {
        const ref = floyd(g, metric, slow);
        for (let source = 0; source < n; source++) {
          const forward = shortest(g, [source], {
              reverse: false,
              metric,
              slow,
            }),
            reverse = shortest(g, [source], { metric, slow });
          for (let v = 0; v < n; v++) {
            assert.equal(forward.d[v], ref[source][v]);
            assert.equal(reverse.d[v], ref[v][source]);
          }
        }
      }
  }
});
test("Mehrfachquellen und Treffpunkt-Rangfolge gegen exhaustive Referenz", () => {
  const g = fixture(
    5,
    [
      edge(0, 1, 7, 4),
      edge(1, 2, 3, 8),
      edge(0, 3, 2, 5),
      edge(3, 4, 6, 2),
      edge(4, 2, 1, 9),
    ],
    Array.from({ length: 5 }, (_, i) => ({ id: String(i), node: i })),
  );
  const ref = floyd(g);
  const r = shortest(g, [1, 4]);
  for (let i = 0; i < 5; i++)
    assert.equal(r.d[i], Math.min(ref[i][1], ref[i][4]));
  for (const objective of ["fair", "total"]) {
    const rows = g.cities.map((c, index) => {
      const t = [ref[0][c.node], ref[2][c.node], ref[4][c.node]];
      return { index, max: Math.max(...t), sum: t.reduce((a, b) => a + b) };
    });
    rows.sort((a, b) =>
      objective === "fair"
        ? a.max - b.max || a.sum - b.sum || a.index - b.index
        : a.sum - b.sum || a.max - b.max || a.index - b.index,
    );
    assert.deepEqual(
      rankMeetings(g, [0, 2, 4], objective).candidates.map((c) => c.index),
      rows.map((c) => c.index),
    );
  }
});

test("Reichweite unterscheidet Hin/Rueckrichtung und zaehlt nur Orte im Zeitbudget", () => {
  const g = fixture(
    4,
    [edge(0, 1, 30, 90), edge(1, 2, 40, 40), edge(0, 3, 121, 20)],
    [
      { id: "start", node: 0 },
      { id: "a", node: 1 },
      { id: "b", node: 2 },
      { id: "c", node: 3 },
    ],
  );
  const s = {
    mode: "reach",
    node: 0,
    limit: 2,
    metric: "distance",
    weight: "nodes",
    branches: 6,
  };
  const hin = analyze(g, { ...s, direction: "from" });
  const rueck = analyze(g, { ...s, direction: "to" });
  assert.deepEqual(Array.from(hin.d), [0, 30, 70, 121]);
  assert.deepEqual(Array.from(rueck.d), [0, 90, 130, 20]);
  assert.deepEqual(
    hin.samples.map((x) => x.id),
    ["start", "a", "b"],
  );
  assert.deepEqual(
    rueck.samples.map((x) => x.id),
    ["start", "c", "a"],
  );
  assert.equal(hin.w[3], 0);
  assert.equal(rueck.w[2], 0);
  assert.equal(hin.median, 30);
  assert.equal(rueck.median, 20);
});
