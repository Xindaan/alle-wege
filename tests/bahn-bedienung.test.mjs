import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ortsnamen, ergaenzeOrt } from "../dist/ortslisten.js";
import { verdichteAtlas, atlasLeerHinweis } from "../dist/bahn-atlas-core.js";
import { atlasBerechnen } from "../dist/bahn-atlas-ui.js";
import { STANDARDORTE } from "../dist/standardorte.js";

test("Ergaenzte Orte (extra-places) sind suchbar, aber keine Standardvorschlaege", () => {
  const extra = JSON.parse(readFileSync(new URL("../scripts/extra-places.json", import.meta.url)));
  const orte = JSON.parse(readFileSync(new URL("../dist/data/places.json", import.meta.url)));
  for (const ort of extra) {
    const gefunden = orte.find((p) => p.id === ort.id);
    assert.equal(gefunden?.name, ort.name);
    assert.ok(gefunden.rail.id);
    assert.equal(STANDARDORTE.includes(ort.name), false);
  }
  assert.match(orte.find((p) => p.name === "Heidesee").rail.name, /Friedersdorf/);
});

test("Ortsauswahl erhaelt alte mehrzeilige Links, Reihenfolge und Grenzen", () => {
  assert.deepEqual(ortsnamen(" Berlin\n\n Göttingen \nLüneburg"), [
    "Berlin",
    "Göttingen",
    "Lüneburg",
  ]);
  assert.equal(
    ergaenzeOrt("Berlin\nGöttingen", "Lüneburg"),
    "Berlin\nGöttingen\nLüneburg",
  );
  assert.throws(
    () => ergaenzeOrt("Berlin\nGöttingen", "Berlin"),
    /schon ausgewählt/,
  );
  assert.throws(
    () => ergaenzeOrt("Berlin\nGöttingen\nLüneburg", "Fulda", 3),
    /Höchstens 3/,
  );
});

test("Realer Nutzerfall: Fulda wird trotz altem Zwei-/Vierstundenbudget gefunden", async () => {
  const f = JSON.parse(readFileSync(new URL("./fixtures/bahn-treffpunkt-zeitgrenze.json", import.meta.url)));
  const grenzen = JSON.parse(readFileSync(new URL("../dist/data/borders.json", import.meta.url)));
  const personen = f.names.map((name, i) => ({ name, stopId: `test-${i}` }));
  for (const horizont of [120, 240]) {
    let i = 0;
    const r = await atlasBerechnen({ typ: "finden", personen, grenzen,
      opt: { zeit: f.start, horizont, umstiege: 4 }, status: () => {},
      lade: async (url) => {
        assert.equal(new URL(url).searchParams.get("maxTravelTime"), "360");
        return verdichteAtlas(f.queries[360][i++]);
      },
    });
    assert.equal(r.punkte[0].name, "Fulda Bahnhof");
    assert.deepEqual(r.punkte[0].zeiten, [244, 271, 271]);
    assert.equal(r.rangVollstaendig, true);
    assert.equal(i, 3);
  }
});

test("Leerer Fahrplandatensatz wird von fehlender gemeinsamer Schnittmenge unterschieden", () => {
  const r = {
    typ: "finden",
    personen: [{ name: "A" }, { name: "B" }],
    anzahlen: [10, 0],
    opt: { horizont: 480 },
  };
  const h = atlasLeerHinweis(r);
  assert.match(h.text, /Für B liefert/);
  assert.match(h.text, /Fahrplandaten fehlen/);
  assert.equal(h.naechsterHorizont, null);
  assert.equal(
    atlasLeerHinweis({ ...r, opt: { horizont: 30 } }).naechsterHorizont,
    null,
  );
});
