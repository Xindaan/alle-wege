// T-0030: Abbiegeverbote an grossen Knoten (turns: [via, vonKante, nachKante, nur])
import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, shortest, pathTo, accumulate } from "../dist/graph.js";
const kante = (a, b, t, back = t) => [a, b, t, t, back, 2, 0, []];
// 0 -e0- 1 -e1- 2 ; 1 -e2- 3 ; Umweg 0 -e3- 4 -e4- 2 (je 5 Min.)
const netz = (turns, e2back = 1) =>
  buildGraph({
    nodes: Array.from({ length: 5 }, () => [0, 0]),
    edges: [kante(0, 1, 1), kante(1, 2, 1), kante(1, 3, 1, e2back), kante(0, 4, 5), kante(4, 2, 5)],
    cities: [],
    turns,
  });
test("Verbot wirkt vorwaerts und rueckwaerts, Wenden am Nachbarknoten bleibt moeglich", () => {
  assert.equal(shortest(netz([]), [0], { reverse: false }).d[2], 2);
  const g = netz([[1, 0, 1, 0]]);
  const vor = shortest(g, [0], { reverse: false });
  // 0-1-3-1-2: der beste Zustand an Knoten 1 (Ankunft ueber e0) darf e1 nicht nehmen
  assert.equal(vor.d[2], 4);
  assert.equal(vor.d[1], 1);
  assert.equal(vor.d.length, 5);
  assert.deepEqual(pathTo(vor, 2).sort(), [0, 1, 2, 2].sort());
  assert.equal(new Set(vor.order).size, vor.order.length);
  assert.equal(accumulate(g, vor).w[0], 5);
  const rueck = shortest(g, [2], { reverse: true });
  assert.equal(rueck.d[0], 4);
});
test("only_* verbietet alle anderen Kanten; ohne Wendemoeglichkeit bleibt der Umweg", () => {
  const g = netz([[1, 0, 2, 1]], -1);
  const vor = shortest(g, [0], { reverse: false });
  assert.equal(vor.d[3], 2);
  assert.equal(vor.d[2], 10);
  assert.equal(shortest(g, [2], { reverse: true }).d[0], 10);
  // von 3 kommt man nicht zurueck (Einbahn 1->3), von 2 nach 0 gilt das Gebot nicht
  assert.equal(shortest(g, [2], { reverse: false }).d[0], 2);
});
