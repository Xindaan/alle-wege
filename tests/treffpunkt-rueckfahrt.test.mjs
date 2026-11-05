import test from "node:test";
import assert from "node:assert/strict";
import { atlasTreffpunkte, mitRueckfahrt, atlasLeerHinweis } from "../dist/bahn-atlas-core.js";
const h = (id, dauer) => ({ id, name: id, lat: 0, lon: 0, dauer, umstiege: 0 });
const start = "2026-11-07T08:00:00Z", frist = "2026-11-07T20:00:00Z"; // 12 h Fenster
// Hin: A 60/120, B 90/90, C 30/200
const hin = [[h("A", 60), h("B", 90), h("C", 30)], [h("A", 120), h("B", 90), h("C", 200)]];

test("Rueckfahrt: Zusammenzeit = spaeteste erste Rueckabfahrt minus letzte Ankunft", () => {
  const punkte = atlasTreffpunkte(hin); // B (max 90), A (120), C (200)
  // Rueck: A 100/500, B 60/60, C fehlt fuer Person 2
  const rueck = [[h("A", 100), h("B", 60), h("C", 10)], [h("A", 500), h("B", 60)]];
  const r = mitRueckfahrt(punkte, rueck, { start, frist, aufenthalt: 0 });
  assert.deepEqual(r.map((p) => p.id), ["B", "A"]);
  // B: Treffen 09:30, beide muessen 19:00 los -> 570 Min.
  assert.equal(r[0].zusammen, 570);
  assert.equal(r[0].treffen, "2026-11-07T09:30:00.000Z");
  // A: Treffen 10:00, Person 2 muss 11:40 los (500 Min. vor 20:00) -> 100 Min.
  assert.equal(r[1].zusammen, 100);
  assert.deepEqual(r[1].abfahrten, ["2026-11-07T18:20:00.000Z", "2026-11-07T11:40:00.000Z"]);
});

test("Rueckfahrt: Mindestaufenthalt filtert, Reihenfolge der Hin-Rangfolge bleibt", () => {
  const punkte = atlasTreffpunkte(hin);
  const rueck = [[h("A", 100), h("B", 60), h("C", 10)], [h("A", 500), h("B", 60), h("C", 10)]];
  assert.deepEqual(mitRueckfahrt(punkte, rueck, { start, frist, aufenthalt: 120 }).map((p) => p.id), ["B", "C"]);
  assert.deepEqual(mitRueckfahrt(punkte, rueck, { start, frist, aufenthalt: 100 }).map((p) => p.id), ["B", "A", "C"]);
});

test("Rueckfahrt: Frist nicht nach Start ergibt keine Vorschlaege", () => {
  const punkte = atlasTreffpunkte(hin);
  assert.deepEqual(mitRueckfahrt(punkte, [[h("B", 1)], [h("B", 1)]], { start, frist: start }), []);
});

import { atlasBerechnen, atlasAnzeigen } from "../dist/bahn-atlas-ui.js";
const grenzen = { features: [{ properties: { code: "DEU" }, geometry: {
  type: "Polygon", coordinates: [[[5, 47], [16, 47], [16, 56], [5, 56], [5, 47]]] } }] };
const personen = [{ name: "A", stopId: "a" }, { name: "B", stopId: "b" }];
const halt = (id, dauer) => ({ id, name: id, dauer, umstiege: 0, lat: 50, lon: 10 });
// Abfahrt 09:00, Rueckkehr bis 19:00, 2 Std. zusammen -> Rueckfahrt hoechstens 480 Min.
const basis = { typ: "finden", personen, grenzen, status: () => {},
  opt: { zeit: "2026-11-07T09:00:00Z", umstiege: 4, horizont: 120, rueckFrist: "2026-11-07T19:00:00Z", aufenthalt: 120 } };
const rueckwaerts = (url) => new URL(url).searchParams.get("arriveBy") === "true";

test("Rueckfahrt in der Suche: je Person eine Anfrage, vorab gezaehlt, filtert Treffpunkte", async () => {
  const anfragen = [], kontingent = [];
  const r = await atlasBerechnen({ ...basis, pruefeBudget: (u) => kontingent.push(u.length),
    lade: async (url) => {
      const u = new URL(url), a = u.searchParams.get("one") === "a";
      anfragen.push(`${rueckwaerts(url) ? "rueck" : "hin"} ${u.searchParams.get("maxTravelTime")}`);
      // "nah" ist hin schneller, aber B kommt von dort nicht rechtzeitig heim.
      if (rueckwaerts(url)) return a ? [halt("nah", 50), halt("fern", 100)] : [halt("fern", 100)];
      return [halt("nah", 60), halt("fern", 100)];
    } });
  assert.deepEqual(anfragen, ["rueck 480", "rueck 480", "hin 360", "hin 360"]);
  assert.deepEqual(kontingent, [4]);
  assert.deepEqual(r.punkte.map((p) => p.id), ["fern"]);
  assert.equal(r.punkte[0].zusammen, 400); // 10:40 bis 17:20
  assert.equal(r.rangVollstaendig, true);
  assert.equal(r.suchHinweis, undefined);
});

test("Rueckfahrt: Dienstgrenze bei 8 Std. faellt auf 6 Std. zurueck und sagt es", async () => {
  const anfragen = [];
  const r = await atlasBerechnen({ ...basis,
    lade: async (url) => {
      const h = Number(new URL(url).searchParams.get("maxTravelTime"));
      anfragen.push(`${rueckwaerts(url) ? "rueck" : "hin"} ${h}`);
      if (rueckwaerts(url) && h > 360) throw new Error("too many results");
      return [halt("fern", 100)];
    } });
  assert.deepEqual(anfragen, ["rueck 480", "rueck 360", "rueck 480", "rueck 360", "hin 360", "hin 360"]);
  assert.equal(r.punkte[0].id, "fern");
  assert.match(r.suchHinweis, /letzten 6 Stunden/);
});

test("Gekapptes leeres Rueckfahrtergebnis widerlegt einen moeglichen Dreistundenaufenthalt nicht", async () => {
  const opt = { ...basis.opt, zeit: "2026-11-07T06:00:00Z", rueckFrist: "2026-11-07T22:00:00Z", aufenthalt: 180 };
  const punkte = atlasTreffpunkte([[halt("frueh", 60)], [halt("frueh", 60)]]);
  // Treffen 07:00, Rueckabfahrt 10:00, Heimkehr 11:00. Bis zur Frist
  // bleiben elf Stunden: arriveBy-Dauer 720 statt nur 60 Minuten Fahrt.
  assert.equal(mitRueckfahrt(punkte, [[halt("frueh", 720)], [halt("frueh", 720)]],
    { start: opt.zeit, frist: opt.rueckFrist, aufenthalt: 180 })[0].zusammen, 180);
  for (const fallback of [false, true]) {
    const r = await atlasBerechnen({ ...basis, opt, lade: async (url) => {
      if (rueckwaerts(url)) {
        if (fallback && Number(new URL(url).searchParams.get("maxTravelTime")) > 360) throw Error("too many results");
        return []; // fruehe, zulaessige Heimfahrt liegt ausserhalb des Suchfensters
      }
      return [halt("frueh", 60)];
    } });
    assert.equal(r.punkte.length, 0);
    assert.equal(r.rangVollstaendig, false);
    assert.equal(r.rueck.gekappt, fallback ? 360 : 480);
    const hinweis = atlasLeerHinweis(r);
    assert.match(hinweis.titel, /Fahrplanausschnitt/);
    assert.match(hinweis.text, /unvollständig/);
    assert.match(hinweis.text, /früher Heimkehr/);
    assert.match(hinweis.text, new RegExp(`letzten ${fallback ? 6 : 8} Stunden`));
    // Derselbe Hinweis muss im tatsaechlichen Leerzustand der Oberflaeche erscheinen.
    const elemente = new Map();
    const vorher = globalThis.document;
    globalThis.document = { getElementById: (id) => {
      if (!elemente.has(id)) elemente.set(id, {});
      return elemente.get(id);
    } };
    try { atlasAnzeigen(r, () => {}); assert.match(elemente.get("atlas-leer").innerHTML, /unvollständig/); }
    finally { globalThis.document = vorher; }
  }
});

test("Auch ein gefundener Vorschlag nach gekappter Rueckfahrtsuche ist keine vollstaendige Rangfolge", async () => {
  const r = await atlasBerechnen({ ...basis, opt: { ...basis.opt, rueckFrist: "2026-11-07T23:00:00Z" }, lade: async () => [halt("fern", 100)] });
  assert.equal(r.punkte.length, 1);
  assert.equal(r.rangVollstaendig, false);
  assert.match(r.suchHinweis, /bessere Treffpunkte fehlen/);
});
