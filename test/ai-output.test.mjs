import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { materializeEvidence, parseCodexOutput, runAI } from "../core.mjs";
const protocol = JSON.parse(
  await readFile(new URL("../examples/protocol.json", import.meta.url)),
);
const messages = [
  { role: "assistant", text: "Odkedy máte ťažkosti?" },
  { role: "user", text: "asi 3 dni, vecer viac" },
  { role: "assistant", text: "Kašlete?" },
  { role: "user", text: "nie, nekaslem" },
];
const result = {
  reply: "Rozumiem.",
  choices: [],
  urgent: false,
  report: "",
  answers: [
    { id: "onset", value: "text", sourceMessageId: "u1" },
    { id: "cough", value: "no", sourceMessageId: "u3" },
  ],
};
test("server copies original patient text without changing spelling, whitespace or negation", () => {
  const normalized = materializeEvidence(result, messages, protocol);
  assert.equal(normalized.answers[0].evidence, messages[1].text);
  assert.equal(normalized.answers[1].evidence, "nie, nekaslem");
  assert.equal(messages[3].text, "nie, nekaslem");
});
test("unknown sources and assistant messages cannot become patient evidence", () => {
  for (const sourceMessageId of ["u0", "u2", "u999", undefined]) {
    const r = structuredClone(result);
    r.answers[0].sourceMessageId = sourceMessageId;
    assert.throws(() => materializeEvidence(r, messages, protocol), {
      code: "AI_INVALID_SOURCE",
    });
  }
});
test("source references still reject duplicate or unknown clinical question IDs", () => {
  const duplicate = structuredClone(result);
  duplicate.answers.push(duplicate.answers[0]);
  assert.throws(() => materializeEvidence(duplicate, messages, protocol));
  const unknown = structuredClone(result);
  unknown.answers[0].id = "not_a_question";
  assert.throws(() => materializeEvidence(unknown, messages, protocol));
});
test("parses final Codex JSON and reports missing or malformed responses separately", () => {
  const event = (text) =>
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text },
    });
  assert.deepEqual(
    parseCodexOutput("not an event\n" + event(JSON.stringify(result))),
    result,
  );
  assert.deepEqual(
    parseCodexOutput(event("```json\n" + JSON.stringify(result) + "\n```")),
    result,
  );
  assert.throws(() => parseCodexOutput(event("{oops")), {
    code: "AI_INVALID_JSON",
  });
  assert.throws(() => parseCodexOutput('{"type":"turn.completed"}'), {
    code: "AI_MISSING_RESULT",
  });
});
test("automatically retries an invalid source once and returns verified evidence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ambulant-ai-test-"));
  const cli = path.join(dir, "fake-cli.mjs"),
    counter = path.join(dir, "attempts.json");
  const previous = process.env.CODEX_BIN;
  await writeFile(
    cli,
    `
import {readFile,writeFile} from 'node:fs/promises';
if(process.argv.includes('--help')){console.log('--ignore-user-config');process.exit(0);}
let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const file=${JSON.stringify(counter)};let n=0;try{n=JSON.parse(await readFile(file)).attempts;}catch{}
n++;await writeFile(file,JSON.stringify({attempts:n,repairRequested:prompt.includes('OPRAVA VÝSTUPU')}));
const result=${JSON.stringify(result)};if(n===1)result.answers[0].sourceMessageId='u999';
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));
`,
  );
  try {
    process.env.CODEX_BIN = cli;
    const answer = await runAI(
      { patient: { fictional: true }, protocol, messages },
      path.join(dir, "runtime"),
    );
    assert.equal(answer.answers[0].evidence, messages[1].text);
    assert.deepEqual(JSON.parse(await readFile(counter)), {
      attempts: 2,
      repairRequested: true,
    });
  } finally {
    if (previous === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
