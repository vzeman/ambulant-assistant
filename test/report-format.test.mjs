import test from "node:test";
import assert from "node:assert/strict";
import {
  inlineReport,
  renderReport,
  plainReport,
  reportDocument,
  reportSections,
} from "../public/report-format.js";

test("renders headings, lists, bold facts and underlined uncertainty while preserving negation", () => {
  const input =
    "## Stručný prehľad pre lekára\n- **Bolesť na hrudníku popiera.**\n- __Dávkovanie nebolo overené.__\n\n## Aktuálna liečba a adherencia\nBudezonid/formoterol: jeden vdych ráno a večer podľa pacienta.";
  const html = renderReport(input);
  assert.match(html, /<h3>Stručný prehľad pre lekára<\/h3>/);
  assert.match(
    html,
    /<li><strong>Bolesť na hrudníku popiera\.<\/strong><\/li>/,
  );
  assert.match(html, /<u>Dávkovanie nebolo overené\.<\/u>/);
  assert.ok(html.includes("jeden vdych ráno a večer podľa pacienta."));
});
test("formats existing plain text reports without regeneration or rewriting their assertions", () => {
  const input =
    "Dôvod návštevy a terajšie ťažkosti\nPacient udáva tri dni trvajúci suchý kašeľ.\n\nVarovné príznaky podľa vyjadrenia pacienta\nBolesť na hrudníku popiera.\n\nNezodpovedané okruhy:\n• Aké lieky užívate?";
  const html = renderReport(input, { missing: ["Aké lieky užívate?"] });
  assert.equal(reportSections(input).length, 3);
  assert.match(html, /<strong>Bolesť na hrudníku popiera\.<\/strong>/);
  assert.match(html, /<u>Nezodpovedané okruhy<\/u>/);
  assert.equal(html.includes("Doplniť pri osobnom rozhovore"), false);
  assert.equal(html.includes("report-alert"), false);
});
test("never executes or trusts HTML from AI, patient text, or report metadata", () => {
  const malicious =
    '<script>alert(1)</script> **<img src=x onerror=alert(2)>** <u onclick="evil()">text</u>';
  const html = renderReport(malicious);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<u onclick"));
  assert.ok(html.includes("&lt;script&gt;"));
  const exported = reportDocument({
    patient: "<img src=x>",
    protocol: "<script>evil()</script>",
    text: malicious,
  });
  assert.ok(!exported.includes("<script>"));
  assert.ok(!exported.includes("<img"));
  assert.ok(exported.includes("default-src 'none'"));
});
test("plain text export removes formatting without changing clinical wording", () => {
  assert.equal(
    plainReport(
      "## Liečba\n**Liečbu nevynecháva.**\n__Dávkovanie neoverené.__\n<u>Lieky neuviedol.</u>",
    ),
    "Liečba\nLiečbu nevynecháva.\nDávkovanie neoverené.\nLieky neuviedol.",
  );
});
test("unknown data and explicit urgent flags stay distinct", () => {
  const ordinary = renderReport("Údaj nebol zistený.", {
    missing: ["Dýchavica?"],
  });
  assert.ok(ordinary.includes("Doplniť pri osobnom rozhovore"));
  assert.ok(!ordinary.includes('class="report-alert"'));
  const urgent = renderReport("Pacient uvádza závažné ťažkosti.", {
    urgent: true,
  });
  assert.ok(urgent.includes('class="report-alert"'));
});
