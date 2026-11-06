import test from "node:test";
import assert from "node:assert/strict";
import { selectSlovakVoice, loadSlovakVoice } from "../public/slovak-voice.js";

test("Slovak speech never falls back to Czech, English or an empty catalogue", () => {
  assert.equal(selectSlovakVoice([]), null);
  assert.equal(
    selectSlovakVoice([{ lang: "cs-CZ", default: true }, { lang: "en-US" }]),
    null,
  );
  assert.equal(
    selectSlovakVoice([{ lang: "sk-SK", name: "Slovenský" }]).name,
    "Slovenský",
  );
  assert.equal(
    selectSlovakVoice([{ lang: "sk_SK", name: "Slovenský" }]).name,
    "Slovenský",
  );
});
test("prefers a local Slovak voice over a foreign default or a remote Slovak voice", () => {
  const selected = selectSlovakVoice([
    { lang: "cs-CZ", default: true },
    { lang: "sk-SK", localService: false, default: true },
    { lang: "sk-SK", localService: true, name: "Lokálny" },
  ]);
  assert.equal(selected.name, "Lokálny");
});
test("waits for asynchronously loaded Slovak voices and cleans up its listener", async () => {
  const synth = new EventTarget();
  let voices = [{ lang: "cs-CZ" }];
  synth.getVoices = () => voices;
  const pending = loadSlovakVoice(synth, 100);
  voices = [{ lang: "sk-SK", name: "Slovenský" }];
  synth.dispatchEvent(new Event("voiceschanged"));
  assert.equal((await pending).name, "Slovenský");
});
test("returns no voice when Slovak remains unavailable", async () => {
  const synth = new EventTarget();
  synth.getVoices = () => [{ lang: "cs-CZ" }];
  assert.equal(await loadSlovakVoice(synth, 5), null);
});
