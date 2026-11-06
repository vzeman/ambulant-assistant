import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateProtocol, validateResult, coverage } from "../core.mjs";
const protocol = JSON.parse(
  await readFile(new URL("../examples/protocol.json", import.meta.url)),
);
test("cough follow-up activates only on an affirmative answer", () => {
  assert.equal(coverage(protocol, []).total, 10);
  assert.equal(coverage(protocol, [{ id: "cough", value: "yes" }]).total, 11);
  assert.equal(coverage(protocol, [{ id: "cough", value: "no" }]).total, 10);
  assert.equal(
    coverage(protocol, [{ id: "cough", value: "deferred" }]).total,
    10,
  );
});
test("protocol rejects invalid IDs, broken conditions and empty report template", () => {
  assert.doesNotThrow(() => validateProtocol(protocol));
  for (const mutate of [
    (p) => (p.questions[1].id = p.questions[0].id),
    (p) => (p.questions[0].when = { id: "missing", equals: "yes" }),
    (p) => (p.reportSections = []),
  ]) {
    const p = structuredClone(protocol);
    mutate(p);
    assert.throws(() => validateProtocol(p));
  }
});
test("AI answers must quote the patient, never assistant or history", () => {
  const result = {
    reply: "Ďakujem.",
    choices: [],
    answers: [{ id: "cough", value: "no", evidence: "Kašeľ nemám." }],
    urgent: false,
    report: "",
  };
  assert.doesNotThrow(() =>
    validateResult(result, protocol, [{ role: "user", text: "Kašeľ nemám." }]),
  );
  assert.throws(() =>
    validateResult(result, protocol, [
      { role: "assistant", text: "Kašeľ nemám." },
    ]),
  );
  assert.throws(() =>
    validateResult(result, protocol, [{ role: "user", text: "Kašlem." }]),
  );
  const r = structuredClone(result);
  r.answers.push(r.answers[0]);
  assert.throws(() =>
    validateResult(r, protocol, [{ role: "user", text: "Kašeľ nemám." }]),
  );
});
