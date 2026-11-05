import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { treffVorschlaege, reiseStrecken } from "../dist/bahn-karten-core.js";

test("Treffpunktkarte behaelt Optimum und zeigt raeumlich getrennte Alternativen", () => {
  const punkte = [
    { id: "best", name: "Bahnhof", lat: 52, lon: 13, max: 100 },
    { id: "platform", name: "Bahnhof", lat: 52.001, lon: 13, max: 101 },
    { id: "bus", name: "Nachbarhalt", lat: 52.02, lon: 13, max: 102 },
    { id: "alternative", name: "Anderer Ort", lat: 52.3, lon: 13, max: 110 },
    { id: "same-name", name: "Bahnhof", lat: 52.6, lon: 13, max: 120 },
  ];
  assert.deepEqual(
    treffVorschlaege(punkte).map((p) => p.id),
    ["best", "alternative", "same-name"],
  );
  assert.deepEqual(
    treffVorschlaege(punkte, 1).map((p) => p.id),
    ["best"],
  );
  assert.deepEqual(
    treffVorschlaege(punkte, 5, " ANDERER ").map((p) => p.id),
    ["alternative"],
  );
  assert.equal(treffVorschlaege(punkte, 5, "fehlt").length, 0);
});

test("Kartenlinien aus realer Fahrplangeometrie erhalten Person und Fusswege", () => {
  const { itineraries } = JSON.parse(
    readFileSync(
      new URL("./fixtures/bahn-erkner-leonberg.json", import.meta.url),
    ),
  );
  const linien = reiseStrecken([itineraries[0], itineraries[0]]);
  assert.equal(linien.length, 14);
  assert.equal(linien.filter((l) => l.person === 0).length, 7);
  assert.equal(linien.filter((l) => l.person === 1 && l.fuss).length, 3);
  assert.ok(linien.every((l) => l.punkte.length >= 2));
  assert.ok(Math.abs(linien[0].punkte[0][1] - 52.42) < 0.1);
});

test("Fehlende oder defekte Geometrie erfindet keine Luftlinien", () => {
  assert.deepEqual(
    reiseStrecken([
      null,
      {
        legs: [
          { from: { lat: 52, lon: 13 }, to: { lat: 48, lon: 9 } },
          { legGeometry: { points: "kaputt", precision: 6 } },
          { legGeometry: { points: "??", precision: 6 } },
        ],
      },
    ]),
    [],
  );
});

test("Kartografisches Bahnnetz bleibt separates lizenziertes Orientierungsasset", () => {
  const netz = JSON.parse(
    readFileSync(new URL("../dist/data/rail-network.json", import.meta.url)),
  );
  assert.equal(netz.license, "Public Domain");
  assert.match(netz.purpose, /not used for routing/);
  assert.equal(netz.lines.length, 3640);
  assert.ok(
    netz.lines.every(
      (l) =>
        l.length > 1 &&
        l.every((p) => p.length === 2 && p.every(Number.isFinite)),
    ),
  );
});
