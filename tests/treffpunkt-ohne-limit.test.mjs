import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildGraph, analyze } from "../dist/graph.js";
import { atlasBerechnen } from "../dist/bahn-atlas-ui.js";
import { strasseZuBahn, bahnZuStrasse } from "../dist/vergleich.js";

const grenzen = { features: [{ properties: { code: "DEU" }, geometry: {
  type: "Polygon", coordinates: [[[5, 47], [16, 47], [16, 56], [5, 56], [5, 47]]],
} }] };
const personen = [{ name: "A", stopId: "a" }, { name: "B", stopId: "b" }];
const halt = (id, dauer) => ({ id, name: id, dauer, umstiege: 0, lat: 50, lon: 10 });
const basis = { typ: "finden", personen, grenzen, status: () => {},
  opt: { zeit: "2026-11-04T09:00:00Z", umstiege: 4, horizont: 120 } };

test("Treffpunkt Kassel trotz Zweistundenbudget, Erreichbarkeit bleibt begrenzt", () => {
  const d = JSON.parse(gunzipSync(readFileSync(new URL("../dist/data/roads.json.gz", import.meta.url))));
  const g = buildGraph(d), ort = (name) => d.cities.find((c) => c.name === name);
  const s = { mode: "meet", travelers: ["Berlin", "Aachen", "Freiburg im Breisgau"].map((n) => ort(n).id), objective: "fair", limit: 2, autobahnTempo: 200 };
  const r = analyze(g, s);
  assert.equal(d.cities[r.selected.index].name, "Kassel");
  assert.ok(Math.abs(r.selected.max - 193.73225555) < 1e-7);
  assert.equal(r.paths.length, 3);
  assert.ok(r.paths.every((p) => p.length > 0));
  assert.deepEqual(analyze(g, { ...s, limit: 0.5 }).candidates, r.candidates);
  assert.deepEqual(analyze(g, { ...s, limit: 8 }).candidates, r.candidates);
  assert.equal(s.limit, 2);
});

test("Bahn erweitert selbststaendig bis zum gemeinsamen Treffpunkt", async () => {
  const anfragen = [], kontingent = [];
  const r = await atlasBerechnen({ ...basis, pruefeBudget: (u) => kontingent.push(u.length),
    lade: async (url) => {
      const u = new URL(url), h = Number(u.searchParams.get("maxTravelTime")), a = u.searchParams.get("one") === "a";
      anfragen.push(h);
      return h === 360 ? [halt(a ? "nur-a" : "nur-b", 20)] : [halt("gemeinsam", a ? 420 : 400)];
    } });
  assert.deepEqual(anfragen, [360, 360, 480, 480]);
  assert.deepEqual(kontingent, [2, 2]);
  assert.equal(r.punkte[0].max, 420);
  assert.equal(r.rangVollstaendig, true);
});

test("Gesamtsumme: erster gemeinsamer Halt reicht als Abbruchkriterium nicht", async () => {
  const anfragen = [];
  const r = await atlasBerechnen({ ...basis, opt: { ...basis.opt, objective: "total" },
    lade: async (url) => {
      const u = new URL(url), h = Number(u.searchParams.get("maxTravelTime")), a = u.searchParams.get("one") === "a";
      anfragen.push(h);
      return [halt("x", 300), ...(h >= 480 ? [halt("y", a ? 450 : 20)] : [])];
    } });
  assert.deepEqual(anfragen, [360, 360, 480, 480]);
  assert.equal(r.punkte[0].id, "y");
  assert.equal(r.punkte[0].summe, 470);
  assert.equal(r.rangVollstaendig, true);
});

test("Technische Fehler behalten gepruefte Vorschlaege, behaupten aber kein Optimum", async () => {
  const lade = async (url) => {
    if (Number(new URL(url).searchParams.get("maxTravelTime")) > 360) throw new Error("Dienstgrenze");
    return [halt("x", 350)];
  };
  const r = await atlasBerechnen({ ...basis, opt: { ...basis.opt, objective: "total" }, lade });
  assert.equal(r.punkte.length, 1);
  assert.equal(r.rangVollstaendig, false);
  assert.match(r.suchHinweis, /Dienstgrenze/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(atlasBerechnen({ ...basis, opt: { ...basis.opt, objective: "total" }, signal: controller.signal, lade }));
});

test("Bahn-Erreichbarkeit verwendet weiterhin das gewaehlte Zweistundenbudget", async () => {
  const r = await atlasBerechnen({ ...basis, typ: "reichweite", personen: [personen[0]],
    lade: async (url) => {
      assert.equal(new URL(url).searchParams.get("maxTravelTime"), "120");
      return [halt("nah", 119), halt("fern", 121)];
    } });
  assert.deepEqual(r.punkte.map((p) => p.id), ["nah"]);
});

test("Treffpunktwechsel behaelt das separate Erreichbarkeitsbudget", () => {
  const orte = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const s = { mode: "meet", travelers: ["a", "b"], destination: "a", direction: "from", limit: 2, metric: "time" };
  const b = strasseZuBahn(s, orte);
  assert.equal(b.uebernahme, "");
  assert.equal(bahnZuStrasse(b, orte, s).strasse.limit, 2);
  assert.equal(strasseZuBahn({ ...s, limit: 0 }, orte).uebernahme, "");
});
