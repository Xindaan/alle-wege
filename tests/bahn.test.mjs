import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  abfahrtISO,
  lokal,
  planURL,
  verbindungen,
  treffpunkte,
  polyline,
  tageswechsel,
} from "../dist/bahn-core.js";
const ort = { key: "x", lat: 52.5, lon: 13.4 },
  ziel = { key: "y", stopId: "de-test_station" };
const start = "2026-11-04T07:00:00Z";
const reise = (ab, an, n = 0) => ({
  startTime: ab,
  endTime: an,
  transfers: n,
  legs: [
    {
      startTime: ab,
      endTime: an,
      from: { name: "A" },
      to: { name: "B" },
      mode: "REGIONAL_RAIL",
    },
  ],
});
test("Deutsche Abfahrt ist unabhaengig von Rechner-Zeitzone", () => {
  assert.equal(abfahrtISO("2026-11-04", "08:00"), "2026-11-04T07:00:00.000Z");
  assert.equal(abfahrtISO("2027-07-10", "08:00"), "2027-07-10T06:00:00.000Z");
  assert.equal(lokal("2026-11-04T07:00:00Z"), "2026-11-04T08:00");
});
test("Ungueltige und doppelte Uhrzeiten werden abgewiesen", () => {
  assert.throws(() => abfahrtISO("2027-03-28", "02:30"), /gibt es nicht/);
  assert.throws(() => abfahrtISO("2027-10-31", "02:30"), /zweimal/);
  assert.throws(() => abfahrtISO("2027-02-29", "08:00"));
  assert.throws(() => abfahrtISO("2027-11-01", "25:00"));
});
test("API-Semantik: 0 Umstiege, Zusatzpuffer in Minuten, Bus im Regionalfilter", () => {
  const u = new URL(
    planURL(ort, ziel, {
      zeit: start,
      umstiege: 0,
      puffer: 10,
      nurRegional: true,
    }),
  );
  assert.equal(u.searchParams.get("maxTransfers"), "0");
  assert.equal(u.searchParams.get("additionalTransferTime"), "10");
  assert.ok(u.searchParams.get("transitModes").includes("BUS"));
  assert.ok(!u.searchParams.get("transitModes").includes("HIGHSPEED_RAIL"));
  assert.equal(u.searchParams.get("fromPlace"), "52.5,13.4");
  assert.equal(u.searchParams.get("toPlace"), "de-test_station");
  assert.throws(() => planURL(ort, ziel, { zeit: start, umstiege: -1 }));
});
test("Antwortpruefung verwirft Ausfall, zu fruehe Fahrt, falsche Zeitfolge und zu viele Umstiege", () => {
  const gut = reise(start, "2026-11-04T08:00:00Z"),
    ausfall = structuredClone(gut);
  ausfall.legs[0].cancelled = true;
  const kaputt = structuredClone(gut);
  kaputt.legs[0].endTime = "2026-11-04T06:00:00Z";
  const rs = [
    gut,
    ausfall,
    kaputt,
    reise("2026-11-04T06:00:00Z", "2026-11-04T08:00:00Z"),
    reise(start, "2026-11-04T09:00:00Z", 3),
  ];
  assert.deepEqual(verbindungen({ itineraries: rs }, start, 2), [gut]);
  assert.throws(() => verbindungen({}, start, 4));
});
test("Treffpunktvergleich misst Ankunft ab Wunschabfahrt, nicht nur kuerzeste Fahrtdauer", () => {
  const a = {
    ort: { name: "A" },
    reisen: [
      reise("2026-11-04T10:00:00Z", "2026-11-04T11:00:00Z"),
      reise(start, "2026-11-04T09:00:00Z"),
    ],
  };
  const b = {
    ort: { name: "B" },
    reisen: [
      reise(start, "2026-11-04T10:00:00Z"),
      reise(start, "2026-11-04T10:00:00Z"),
    ],
  };
  const kein = { ort: { name: "C" }, reisen: [null, b.reisen[0]] },
    result = treffpunkte([a, kein, b], start);
  assert.deepEqual(
    result.map((k) => k.ort.name),
    ["B", "A", "C"],
  );
  assert.equal(result[0].max, 180);
  assert.equal(result[0].summe, 360);
  assert.equal(result[2].erreichbar, false);
});
test("Tageswechsel und Polylinien nach externem Google-Referenzbeispiel", () => {
  assert.equal(
    tageswechsel("2026-11-04T23:30:00Z", "2026-11-04T20:00:00Z"),
    " (+1 Tag)",
  );
  assert.deepEqual(polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5), [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
  assert.deepEqual(polyline("_p~iF", 5), []);
});
test("Echte Fahrplanantwort Erkner–Leonberg: 3 Umstiege und Bus-/Fuss-Semantik", () => {
  const x = JSON.parse(
    readFileSync(
      new URL("fixtures/bahn-erkner-leonberg.json", import.meta.url),
    ),
  );
  const rs = verbindungen(x, start, 4);
  assert.equal(rs.length, 1);
  const r = rs[0];
  assert.equal(r.transfers, 3);
  assert.equal(r.legs.filter((l) => l.mode !== "WALK").length, 4);
  assert.equal(r.legs[0].mode, "BUS");
  assert.equal(r.legs[0].from.name, "Erkner, Kirche");
  assert.equal(r.legs.at(-1).to.name, "Leonberg");
  assert.equal((Date.parse(r.endTime) - Date.parse(r.startTime)) / 60000, 445);
  assert.equal(verbindungen(x, start, 0).length, 0);
});
