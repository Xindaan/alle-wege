import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../dist/graph.js";
import {
  anbindungsRaster,
  anbinden,
  autoMinuten,
  vergleicheBahnAuto,
  bilanz,
  versetzteZeiten,
  bestwertJeHalt,
} from "../dist/bahn-auto-core.js";

// A --Autobahn--> B --Autobahn--> C, A --Einbahn secondary--> D, D <-> C.
// B haengt nur an Autobahnkanten; von D fuehrt kein Weg zurueck nach A.
const A = 0,
  B = 1,
  C = 2,
  D = 3;
const g = buildGraph({
  nodes: [
    [10.0, 51.0],
    [10.05, 51.0],
    [10.1, 51.0],
    [10.1, 51.02],
  ],
  edges: [
    [A, B, 3.5, 2, -1, 0, 0, []],
    [B, C, 3.5, 2, -1, 0, 0, []],
    [A, D, 8, 10, -1, 3, 0, []],
    [D, C, 2, 1, 1, 3, 0, []],
  ],
  cities: [],
});
const raster = anbindungsRaster(g);

test("Haltestellen binden nie an reine Autobahnknoten und hoechstens 5 km weit an", () => {
  const nahB = anbinden(g, raster, 10.049, 51.0);
  assert.notEqual(nahB.node, B);
  assert.equal(nahB.node, A);
  assert.equal(anbinden(g, raster, 12, 51).node, -1);
});

test("Richtung zaehlt: von A nach D ueber die Autobahn, zurueck gibt es keinen Weg", () => {
  const halt = [{ lon: 10.1, lat: 51.02 }];
  const von = autoMinuten(g, raster, { lon: 10.0, lat: 51.0 }, halt, { richtung: "von" });
  assert.equal(von.minuten[0], 5);
  const nach = autoMinuten(g, raster, { lon: 10.0, lat: 51.0 }, halt, { richtung: "nach" });
  assert.equal(nach.minuten[0], null);
  assert.throws(() => autoMinuten(g, raster, { lon: 13, lat: 51 }, halt));
});

test("Vergleich: Bahn minus Auto mit Gleichstandsband von +-5 Minuten", () => {
  const punkte = [10, 10, 10, 10, 10].map((dauer, i) => ({ id: String(i), dauer }));
  const r = vergleicheBahnAuto(punkte, [20, 5, 15, 4.99, null]);
  assert.deepEqual(
    r.map((p) => p.urteil),
    ["bahn", "gleich", "gleich", "auto", "ohne"],
  );
  assert.equal(r[0].differenz, -10);
  assert.deepEqual(bilanz(r), { bahn: 1, auto: 1, gleich: 2, ohne: 1 });
});

test("Vier versetzte Zeitpunkte: Abfahrt spaeter, Ankunftsfrist frueher", () => {
  assert.deepEqual(versetzteZeiten("2026-11-05T09:00:00.000Z", false), [
    "2026-11-05T09:00:00.000Z",
    "2026-11-05T09:15:00.000Z",
    "2026-11-05T09:30:00.000Z",
    "2026-11-05T09:45:00.000Z",
  ]);
  assert.equal(versetzteZeiten("2026-11-05T11:00:00.000Z", true)[3], "2026-11-05T10:15:00.000Z");
});

test("Bestwert je Halt nimmt die kuerzeste Dauer und merkt sich deren Zeitpunkt", () => {
  const zeiten = ["t0", "t1", "t2"];
  const r = bestwertJeHalt(
    [
      [{ id: "erfurt", dauer: 93, umstiege: 0 }, { id: "gotha", dauer: 80, umstiege: 1 }],
      [{ id: "erfurt", dauer: 48, umstiege: 0 }],
      [{ id: "erfurt", dauer: 48, umstiege: 0 }, { id: "gotha", dauer: 80, umstiege: 0 }],
    ],
    zeiten,
  );
  const nach = Object.fromEntries(r.map((p) => [p.id, p]));
  assert.equal(nach.erfurt.dauer, 48);
  assert.equal(nach.erfurt.startZeit, "t1");
  assert.equal(nach.gotha.umstiege, 0);
  assert.equal(nach.gotha.startZeit, "t2");
});

test("Vier Abfragen garantieren bei Fahrt ab 10:30 keine 15 Minuten Wartezeit", () => {
  const zeiten = versetzteZeiten("2026-11-05T09:00:00Z", false);
  const abfahrt = Date.parse("2026-11-05T10:30:00Z");
  const listen = zeiten.map((z) => [{ id: "seltener Takt", dauer: (abfahrt - Date.parse(z)) / 60000 + 30, umstiege: 0 }]);
  const p = bestwertJeHalt(listen, zeiten)[0];
  assert.equal(p.dauer, 75); // 45 Min. Warten plus 30 Min. Fahrt
  assert.equal(vergleicheBahnAuto([p], [60])[0].urteil, "auto");
});
