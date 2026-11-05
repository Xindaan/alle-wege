import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  atlasURL,
  verdichteAtlas,
  atlasTreffpunkte,
  atlasGebiete,
  atlasEffekt,
  inGebiet,
} from "../dist/bahn-atlas-core.js";
import { verbindungen, planURL } from "../dist/bahn-core.js";
const zeit = "2026-11-04T07:00:00Z",
  opt = { zeit, horizont: 120, umstiege: 4, puffer: 5, nurRegional: false };
test("Atlas nutzt Sammelrouting, echte Ankunftsrichtung und Minutenparameter", () => {
  const u = new URL(
    atlasURL({ stopId: "de-berlin" }, { ...opt, arriveBy: true }),
  );
  assert.equal(u.pathname, "/api/v6/one-to-all");
  assert.equal(u.searchParams.get("maxTravelTime"), "120");
  assert.equal(u.searchParams.get("arriveBy"), "true");
  assert.equal(u.searchParams.get("additionalTransferTime"), "5");
  assert.equal(u.searchParams.get("maxPreTransitTime"), "900");
  assert.equal(u.searchParams.get("one"), "de-berlin");
  assert.throws(() => atlasURL({ stopId: "x" }, { ...opt, horizont: 0 }));
});
test("Echte Sammelantwort: Minuten, Fahrzeuge minus eins, auslaendische Feed-ID in Berlin bleibt erhalten", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/bahn-erreichbarkeit.json", import.meta.url),
    ),
  );
  const rs = verdichteAtlas(raw);
  assert.equal(rs[0].id, "al-ShowMeBus_station-191");
  assert.equal(rs[0].dauer, 33);
  assert.equal(rs[0].umstiege, 1);
  for (const r of raw.all)
    assert.equal(
      (Date.parse(r.place.arrival) - Date.parse(zeit)) / 60000,
      r.duration,
    );
  assert.ok(rs.some((s) => s.umstiege === 4));
});
test("Doppelte Halte, ungueltige Werte und getrennte Bahnsteige nicht verwechseln", () => {
  const p = { stopId: "a", name: "Halt", lat: 52, lon: 13 };
  assert.deepEqual(
    verdichteAtlas({
      all: [
        { place: p, duration: 30, k: 2 },
        { place: p, duration: 20, k: 1 },
        { place: p, duration: -1, k: 0 },
      ],
    }),
    [{ id: "a", name: "Halt", lat: 52, lon: 13, dauer: 20, umstiege: 0 }],
  );
  assert.throws(() => verdichteAtlas({}));
  assert.equal(
    atlasTreffpunkte([
      [{ id: "a", name: "Gleicher Name", dauer: 10 }],
      [{ id: "b", name: "Gleicher Name", dauer: 10 }],
    ]).length,
    0,
  );
});
test("Echte Rueckwaertsantwort misst Zeit bis zur gemeinsamen Ankunftsfrist", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/bahn-erreichbarkeit-rueckwaerts.json",
        import.meta.url,
      ),
    ),
  );
  for (const r of raw.all)
    assert.equal(
      (Date.parse(raw.one.arrival) - Date.parse(r.place.departure)) / 60000,
      r.duration,
    );
  assert.deepEqual(
    verdichteAtlas(raw).map((s) => s.dauer),
    [16, 24, 16],
  );
});
test("Fairness gegen unabhaengige brute-force Referenz einschliesslich Summen-Tie-Break", () => {
  const matrix = [
      [30, 50, 20, 60],
      [50, 50, 70, 20],
      [40, 50, 30, 30],
    ],
    ids = ["a", "b", "c", "d"];
  const listen = matrix.map((row) =>
    row.map((dauer, i) => ({ id: ids[i], dauer, name: ids[i] })),
  );
  const erwartung = ids
    .map((id, j) => ({
      id,
      max: Math.max(...matrix.map((r) => r[j])),
      sum: matrix.reduce((s, r) => s + r[j], 0),
    }))
    .sort((a, b) => a.max - b.max || a.sum - b.sum);
  const r = atlasTreffpunkte(listen);
  assert.deepEqual(
    r.map((x) => x.id),
    erwartung.map((x) => x.id),
  );
  assert.equal(r[0].max, 50);
  assert.equal(r[0].summe, 120);
  assert.equal(
    atlasTreffpunkte([
      listen[0],
      listen[1].filter((s) => s.id !== "a"),
      listen[2],
    ])[0].id,
    "b",
  );
});
test("Einzugsgebiete, fehlende Vergleichsroute und Geographie", () => {
  const a = [
      { id: "x", dauer: 50 },
      { id: "y", dauer: 20 },
    ],
    b = [
      { id: "x", dauer: 30 },
      { id: "z", dauer: 10 },
    ];
  assert.deepEqual(
    atlasGebiete([a, b]).map((s) => [s.id, s.gebiet]),
    [
      ["x", 1],
      ["y", 0],
      ["z", 1],
    ],
  );
  const e = atlasEffekt(b, a);
  assert.equal(e[0].vorteil, 20);
  assert.equal(e[1].vorteil, null);
  const geo = {
    type: "Polygon",
    coordinates: [
      [
        [5, 47],
        [16, 47],
        [16, 56],
        [5, 56],
        [5, 47],
      ],
      [
        [10, 50],
        [11, 50],
        [11, 51],
        [10, 51],
        [10, 50],
      ],
    ],
  };
  assert.equal(inGebiet({ lon: 13, lat: 52 }, geo), true);
  assert.equal(inGebiet({ lon: 10.5, lat: 50.5 }, geo), false);
  assert.equal(inGebiet({ lon: 2, lat: 49 }, geo), false);
});
test("Detailpruefung nach Ankunftsfrist erlaubt frueheren Start, verwirft zu spaete Ankunft", () => {
  const r = {
    startTime: "2026-11-04T06:00:00Z",
    endTime: zeit,
    transfers: 0,
    legs: [
      {
        startTime: "2026-11-04T06:00:00Z",
        endTime: zeit,
        from: { name: "A" },
        to: { name: "B" },
      },
    ],
  };
  assert.equal(verbindungen({ itineraries: [r] }, zeit, 0, true).length, 1);
  assert.equal(verbindungen({ itineraries: [r] }, zeit, 0, false).length, 0);
  const spaet = structuredClone(r);
  spaet.endTime = "2026-11-04T07:01:00Z";
  spaet.legs[0].endTime = spaet.endTime;
  assert.equal(verbindungen({ itineraries: [spaet] }, zeit, 0, true).length, 0);
  assert.equal(
    new URL(
      planURL({ stopId: "a" }, { stopId: "b" }, { ...opt, arriveBy: true }),
    ).searchParams.get("arriveBy"),
    "true",
  );
});
