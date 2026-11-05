import test from "node:test";
import assert from "node:assert/strict";
import { modellTempo, autobahnZeit } from "../dist/autobahntempo.js";
import { buildGraph, shortest, analyze } from "../dist/graph.js";
import { atlasTreffpunkte } from "../dist/bahn-atlas-core.js";
const kante = (limitHin = 0, limitRueck = 0) => [0, 1, 60, 60 / 130 * 60, 60 / 130 * 60, 0, 0, [10, 50, 11, 50], null, [[60, limitHin, limitRueck]]];
test("Tages-Szenario addiert Teilzeiten und garantiert keinen Wunschtemposchnitt", () => {
  // Unabhaengiges Rechenbeispiel: 39 km frei + 21 km bei 100 km/h.
  assert.ok(Math.abs(autobahnZeit(kante(), 160, true) - (39 / 160 * 60 + 21 / 100 * 60)) < 1e-10);
  assert.equal(autobahnZeit(kante(), 200, true), 24.3);
  assert.ok(Math.abs(modellTempo(160) - 132.2314049587) < 1e-8);
  for (const v of [100, 130, 160, 200]) assert.ok(modellTempo(v) <= v);
  assert.ok((modellTempo(160) - modellTempo(130)) / 30 > (modellTempo(200) - modellTempo(160)) / 40);
});
test("Erfasste Limits je Richtung, unbekannte Abschnitte, Rampen und Faehren bleiben begrenzt", () => {
  const e = kante(80, 120);
  assert.equal(autobahnZeit(e, 200, true), 45);
  assert.ok(Math.abs(autobahnZeit(e, 200, false) - 32.1) < 1e-8);
  assert.equal(autobahnZeit(kante(-1, -1), 200, true), autobahnZeit(kante(-1, -1), 130, true));
  assert.equal(autobahnZeit([0, 1, 2, 8, -1, 0], 200, true), 8);
  assert.equal(autobahnZeit([0, 1, 40, 80, 80, 5, 0, [], "autozug"], 200, true), 80);
  assert.equal(autobahnZeit([0, 1, 2, -1, 8, 0], 200, true), -1);
});
test("Kontrahierte Abschnitte behalten unterschiedliche Limits", () => {
  const e = kante(); e[9] = [[20, 80, 100], [40, 0, 120]];
  assert.ok(Math.abs(autobahnZeit(e, 200, true) - (15 + 16.2)) < 1e-8);
  assert.ok(Math.abs(autobahnZeit(e, 200, false) - (12 + 21.4)) < 1e-8);
});
test("Wunschtempo aendert die Route, auch rueckwaerts und im Treffpunktvergleich", () => {
  const e = kante(); e[1] = 2;
  const g = buildGraph({ nodes: [[0, 0], [1, 0], [2, 0]], edges: [e, [0, 1, 30, 15, 20, 2], [1, 2, 30, 15, 20, 2]], cities: [{ id: "a", node: 0 }, { id: "b", node: 2 }] });
  const langsam = shortest(g, [0], { reverse: false, autobahnTempo: 130 });
  const schnell = shortest(g, [0], { reverse: false, autobahnTempo: 200 });
  assert.equal(langsam.d[2], 30); assert.equal(schnell.edge[2], 0); assert.equal(schnell.d[2], 24.3);
  assert.equal(shortest(g, [2], { autobahnTempo: 200 }).d[0], 24.3);
  const s = { mode: "meet", travelers: ["a", "b"], objective: "fair", limit: 0.5 };
  assert.equal(analyze(g, { ...s, autobahnTempo: 130 }).candidates.length, 2);
  assert.equal(analyze(g, { ...s, autobahnTempo: 200 }).candidates.length, 2);
  assert.equal(shortest(g, [0], { metric: "distance", reverse: false, autobahnTempo: 200 }).d[2], 60);
});
test("Bahn und Strasse koennen dieselbe Fairness-Zielsetzung verwenden", () => {
  const listen = [[{ id: "x", dauer: 4 }, { id: "y", dauer: 1 }], [{ id: "x", dauer: 4 }, { id: "y", dauer: 6 }]];
  assert.equal(atlasTreffpunkte(listen)[0].id, "x");
  assert.equal(atlasTreffpunkte(listen, "total")[0].id, "y");
});
