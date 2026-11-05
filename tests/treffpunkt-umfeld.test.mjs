import test from "node:test";
import assert from "node:assert/strict";
import { umfeldIndex, mitUmfeld } from "../dist/bahn-atlas-core.js";
// Bahnhof "Mitte" bei 51.0/10.0 mit 5 Lokalen, "Dorf" bei 51.2/10.0 mit 1 Lokal.
const index = umfeldIndex({ radiusM: 300, halte: [[51.0, 10.0, "Mitte", 5], [51.2, 10.0, "Dorf", 1]] });
const p = (id, lat, lon) => ({ id, lat, lon, max: 60 });
// Gleis 200 m noerdlich von Mitte, Bushalt 1 km entfernt, Halt am Dorfbahnhof, Halt knapp ueber
// der Rasterkante westlich von Mitte (250 m).
const punkte = [p("gleis", 51.0 + 0.2 / 111.2, 10.0), p("bus", 51.0 + 1 / 111.2, 10.0), p("dorf", 51.2, 10.0), p("kante", 51.0, 10.0 - 0.25 / 70)];

test("Umfeld: naechster Bahnhof innerhalb 300 m, sonst keiner", () => {
  const r = mitUmfeld(punkte, index);
  assert.deepEqual(r.map((x) => x.umfeld), [
    { bahnhof: "Mitte", gastro: 5, stufenfrei: null }, null, { bahnhof: "Dorf", gastro: 1, stufenfrei: null }, { bahnhof: "Mitte", gastro: 5, stufenfrei: null },
  ]);
});

test("Umfeld: Anspruch filtert, Reihenfolge bleibt", () => {
  assert.deepEqual(mitUmfeld(punkte, index, "bahnhof").map((x) => x.id), ["gleis", "dorf", "kante"]);
  assert.deepEqual(mitUmfeld(punkte, index, "gastro").map((x) => x.id), ["gleis", "kante"]);
  assert.deepEqual(mitUmfeld(punkte, index, "gastro", { minGastro: 1 }).map((x) => x.id), ["gleis", "dorf", "kante"]);
});

import { atlasBerechnen } from "../dist/bahn-atlas-ui.js";
const grenzen = { features: [{ properties: { code: "DEU" }, geometry: {
  type: "Polygon", coordinates: [[[5, 47], [16, 47], [16, 56], [5, 56], [5, 47]]] } }] };
const basis = { typ: "finden", grenzen, status: () => {},
  personen: [{ name: "A", stopId: "a" }, { name: "B", stopId: "b" }],
  opt: { zeit: "2026-11-07T09:00:00Z", umstiege: 4, horizont: 120 },
  // "bus" ist fuer beide schneller, liegt aber nicht am Bahnhof.
  lade: async () => [{ ...punkte[1], dauer: 30, umstiege: 0, name: "bus" }, { ...punkte[0], dauer: 50, umstiege: 0, name: "gleis" }] };

test("Umfeld in der Suche: Anspruch filtert vor der Rangfolge, ohne Daten unveraendert", async () => {
  const mit = await atlasBerechnen({ ...basis, umfeld: index, opt: { ...basis.opt, nutzbar: "gastro" } });
  assert.deepEqual(mit.punkte.map((x) => x.id), ["gleis"]);
  assert.equal(mit.rangVollstaendig, true);
  const egal = await atlasBerechnen({ ...basis, umfeld: index, opt: { ...basis.opt, nutzbar: "egal" } });
  assert.deepEqual(egal.punkte.map((x) => [x.id, x.umfeld?.bahnhof ?? null]), [["bus", null], ["gleis", "Mitte"]]);
  const ohne = await atlasBerechnen({ ...basis, opt: { ...basis.opt, nutzbar: "gastro" } });
  assert.deepEqual(ohne.punkte.map((x) => [x.id, x.umfeld]), [["bus", undefined], ["gleis", undefined]]);
});

test("Umfeld: stufenfrei nur bei DB-Angabe ja (T-0026)", () => {
  // Mitte stufenfrei, Dorf teilweise, Alt ohne fuenftes Feld (alte Datei)
  const idx = umfeldIndex({ halte: [[51.0, 10.0, "Mitte", 5, 2], [51.2, 10.0, "Dorf", 1, 1], [51.4, 10.0, "Alt", 2]] });
  const pp = [p("gleis", 51.0, 10.0), p("dorf", 51.2, 10.0), p("alt", 51.4, 10.0), p("bus", 51.0 + 1 / 111.2, 10.0)];
  assert.deepEqual(mitUmfeld(pp, idx, "stufenfrei").map((x) => x.id), ["gleis"]);
  assert.deepEqual(mitUmfeld(pp, idx).map((x) => x.umfeld?.stufenfrei), [2, 1, null, undefined]);
});
