import test from "node:test";
import assert from "node:assert/strict";
import { leseZustand, vergleichLink, strasseZuBahn, bahnZuStrasse } from "../dist/vergleich.js";
const orte = [
  { id: "b", name: "Berlin", state: "16", lon: 13.4, lat: 52.5 },
  { id: "g", name: "Göttingen", state: "03", lon: 9.93, lat: 51.53 },
  { id: "h", name: "Königs Wusterhausen", state: "12", lon: 13.62, lat: 52.29 },
  { id: "n1", name: "Neustadt", state: "02", label: "Neustadt (Bayern)" },
  { id: "n2", name: "Neustadt", state: "11", label: "Neustadt (Brandenburg)" },
];
const s = { mode: "reach", direction: "to", destination: "h", point: null, limit: 2, metric: "time", theme: "night", travelers: ["b", "g"], centers: [], seeds: ["b", "g"], autobahnTempo: 160, objective: "fair" };
test("Orte, Richtung und Zeitbudget bleiben in beiden Verkehrsmitteln gleich", () => {
  const b = strasseZuBahn(s, orte, { datum: "2026-11-04", uhrzeit: "08:00", umstiege: "2" });
  assert.equal(b["atlas-ort"], "Königs Wusterhausen");
  assert.equal(b["atlas-richtung"], "nach");
  assert.equal(b.horizont, "120");
  assert.equal(b.umstiege, "2");
  const zurueck = bahnZuStrasse(b, orte, s);
  assert.equal(zurueck.strasse.destination, "h");
  assert.equal(zurueck.strasse.direction, "to");
  assert.equal(zurueck.strasse.limit, 2);
  assert.equal(zurueck.strasse.autobahnTempo, 160);
  assert.deepEqual(strasseZuBahn(zurueck.strasse, orte, zurueck.bahn), zurueck.bahn);
  const geaendert = bahnZuStrasse({ ...b, "atlas-ort": "Göttingen", "atlas-richtung": "von", horizont: "90" }, orte, s).strasse;
  assert.equal(geaendert.destination, "g"); assert.equal(geaendert.direction, "from"); assert.equal(geaendert.limit, 1.5);
});
test("Treffpunktpersonen, Namen mit Umlauten und Fairness werden uebernommen", () => {
  const b = strasseZuBahn({ ...s, mode: "meet", travelers: ["b", "g", "h"], objective: "total", limit: 4 }, orte);
  assert.equal(b.personen, "Berlin\nGöttingen\nKönigs Wusterhausen");
  assert.equal(b.art, "finden"); assert.equal(b.horizont, "240"); assert.equal(b.objective, "total");
  const neu = bahnZuStrasse({ ...b, personen: "Königs Wusterhausen\nGöttingen", horizont: "180" }, orte, s).strasse;
  assert.deepEqual(neu.travelers, ["h", "g"]); assert.equal(neu.limit, 3); assert.equal(neu.mode, "meet");
});
test("Zentren und doppelte Ortsnamen bleiben eindeutig", () => {
  const b = strasseZuBahn({ ...s, mode: "basins", seeds: ["n1", "n2"] }, orte);
  assert.equal(b.zentren, "Neustadt (02)\nNeustadt (11)");
  assert.deepEqual(bahnZuStrasse(b, orte, s).strasse.centers, ["n1", "n2"]);
});
test("Kartenpunkte und ausgewaehlte Haltestellen behalten Koordinaten", () => {
  const b = strasseZuBahn({ ...s, point: [13.41, 52.51] }, orte);
  assert.equal(b.auswahl["atlas-ort"].punkt, true);
  assert.deepEqual(bahnZuStrasse(b, orte, s).strasse.point, [13.41, 52.51]);
  const halt = { ...b, "atlas-ort": "Bahnhof A", auswahl: { "atlas-ort": { name: "Bahnhof A", stopId: "stop-a", lon: 11, lat: 50 } } };
  assert.deepEqual(bahnZuStrasse(halt, orte, s).strasse.point, [11, 50]);
  assert.throws(() => bahnZuStrasse({ ...halt, "atlas-ort": "Unbestaetigt" }, orte, s));
});
test("Ganzes Netz wird sichtbar begrenzt, beim Rueckwechsel wiederhergestellt", () => {
  const ganz = { ...s, mode: "one", limit: 0 };
  const b = strasseZuBahn(ganz, orte);
  assert.equal(b.horizont, "480"); assert.match(b.uebernahme, /höchstens 8 Stunden/);
  assert.equal(bahnZuStrasse(b, orte, ganz).strasse.limit, 0);
  assert.equal(bahnZuStrasse({ ...b, horizont: "180" }, orte, ganz).strasse.limit, 3);
});
test("Distanzbudget wird nicht als Zeit umgedeutet; einzelne Bahnverbindung bleibt erhalten", () => {
  const distanz = { ...s, mode: "one", metric: "distance", limit: 3 };
  const b = strasseZuBahn(distanz, orte, { horizont: "90" });
  assert.equal(b.horizont, "90"); assert.match(b.uebernahme, /Straßenentfernung/);
  assert.equal(bahnZuStrasse(b, orte, distanz).strasse.limit, 3);
  assert.equal(bahnZuStrasse(b, orte, distanz).strasse.metric, "distance");
  const einzel = { ...b, art: "route", von: "Berlin", nach: "Königs Wusterhausen", datum: "2026-11-04", uhrzeit: "08:00" };
  const neu = bahnZuStrasse(einzel, orte, s);
  assert.equal(strasseZuBahn(neu.strasse, orte, neu.bahn).art, "route");
  assert.equal(strasseZuBahn(neu.strasse, orte, neu.bahn).von, "Berlin");
});
test("Beide Ansichten sind im teilbaren Link; defekte Daten werden abgewiesen", () => {
  const b = strasseZuBahn(s, orte);
  const link = vergleichLink("bahn.html", s, b).split("#")[1];
  assert.deepEqual(leseZustand(link, "s"), s); assert.deepEqual(leseZustand(link, "bahn"), b);
  assert.equal(leseZustand("#s=kaputt", "s"), null);
  assert.throws(() => bahnZuStrasse({ ...b, personen: "Berlin\nFehlt" }, orte, s));
});
