import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
test("server protects clinician data, validates origin, and persists protocol", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ambulant-test-"));
  const port = 14317;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), AMBULANT_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error("server exited");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("startup timeout")), 5000).unref(),
      ),
    ]);
    const base = `http://localhost:${port}`;
    const request = (url, method = "GET", data, cookie, origin = base) =>
      fetch(base + url, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
    assert.equal((await request("/")).status, 200);
    const voiceModule = await request("/slovak-voice.js");
    assert.equal(voiceModule.status, 200);
    assert.match(voiceModule.headers.get("content-type"), /javascript/);
    assert.equal((await request("/api/admin")).status, 401);
    assert.equal((await request("/data/patient.json")).status, 404);
    assert.equal(
      (
        await request(
          "/api/login",
          "POST",
          { pin: "wrong" },
          null,
          "https://other.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/login", "POST", { pin: "wrong" })).status,
      401,
    );
    const pin = (
      await readFile(path.join(dir, "FIRST-RUN-PIN.txt"), "utf8")
    ).trim();
    const logged = await request("/api/login", "POST", { pin });
    assert.equal(logged.status, 200);
    const cookie = logged.headers.get("set-cookie").split(";")[0];
    let r = await request("/api/admin", "GET", null, cookie);
    assert.equal(r.status, 200);
    const payload = await r.json();
    assert.equal(payload.patient.fictional, true);
    const protocol = payload.protocol;
    protocol.title = "Test kontrola";
    assert.equal(
      (await request("/api/protocol", "PUT", protocol, cookie)).status,
      200,
    );
    assert.equal(
      JSON.parse(await readFile(path.join(dir, "protocol.json"), "utf8")).title,
      "Test kontrola",
    );
    protocol.questions[1].id = protocol.questions[0].id;
    assert.equal(
      (await request("/api/protocol", "PUT", protocol, cookie)).status,
      400,
    );
    assert.equal(
      (await request("/api/start", "POST", { consent: false })).status,
      400,
    );
    assert.equal((await request("/api/confirm", "POST", {})).status, 401);
    await request("/api/lock", "POST", {}, cookie);
    assert.equal(
      (await request("/api/admin", "GET", null, cookie)).status,
      401,
    );
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});

test("patient can finish with no answers or include an unsent final answer and save a partial report", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ambulant-partial-test-"));
  const cli = path.join(dir, "fake-cli.mjs");
  await writeFile(
    cli,
    `
if(process.argv.includes('--help')) {console.log('--ignore-user-config');process.exit(0);}
let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const data=JSON.parse(prompt.split('DÁTA:\\n').at(-1));
const users=data.messages.filter(m=>m.role==='user');
const last=users.at(-1);
const report=prompt.includes('TERAZ VYTVOR') ? 'Získané údaje: '+(last?.text || 'Pacient zatiaľ neodpovedal.') : '';
const result={reply:report?'Správa je pripravená.':'Čo vás dnes trápi?',choices:[],urgent:false,report,answers:last?[{id:'reason',value:'text',sourceMessageId:last.sourceMessageId}]:[]};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));
`,
  );
  const port = 14318,
    base = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      AMBULANT_DATA_DIR: dir,
      CODEX_BIN: cli,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const request = (url, body, cookie) =>
    fetch(base + url, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error("server exited");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("startup timeout")), 5000).unref(),
      ),
    ]);
    const pin = (
      await readFile(path.join(dir, "FIRST-RUN-PIN.txt"), "utf8")
    ).trim();
    const login = await request("/api/login", { pin });
    const adminCookie = login.headers.get("set-cookie").split(";")[0];
    const doctorReports = async () => {
      const response = await fetch(base + "/api/admin", {
        headers: { Cookie: adminCookie },
      });
      assert.equal(response.status, 200);
      return (await response.json()).reports;
    };
    for (const text of [undefined, "Som tu na pravidelnej kontrole."]) {
      const start = await request("/api/start", { consent: true });
      assert.equal(start.status, 200);
      const cookie = start.headers
        .getSetCookie()
        .find((c) => c.startsWith("patient="))
        .split(";")[0];
      const prepared = await request(
        "/api/prepare",
        text === undefined ? {} : { text },
        cookie,
      );
      assert.equal(prepared.status, 200);
      const draft = await prepared.json();
      assert.ok(draft.coverage.missing.length > 0);
      assert.match(draft.report, /NEÚPLNÝ ROZHOVOR/);
      assert.ok(draft.report.includes("\n\n"));
      assert.ok(!draft.report.includes("\\n"));
      assert.match(draft.report, /Nezodpovedané okruhy:/);
      if (text)
        assert.ok(
          draft.messages.some((m) => m.role === "user" && m.text === text),
        );
      else
        assert.equal(draft.messages.filter((m) => m.role === "user").length, 0);
      let visible = (await doctorReports()).filter((r) => r.id === draft.id);
      assert.equal(visible.length, 1);
      assert.equal(visible[0].text, draft.report);
      assert.equal(visible[0].patientConfirmed, false);
      assert.equal((await request("/api/confirm", {}, cookie)).status, 200);
      visible = (await doctorReports()).filter((r) => r.id === draft.id);
      assert.equal(visible.length, 1);
      assert.equal(visible[0].patientConfirmed, true);
      const sessionOnDisk = JSON.parse(
        await readFile(path.join(dir, "sessions", draft.id + ".json")),
      );
      assert.equal(sessionOnDisk.saved, true);
      const saved = JSON.parse(
        await readFile(path.join(dir, "reports", draft.id + ".json")),
      );
      assert.equal(saved.text, draft.report);
      assert.ok(saved.coverage.missing.length > 0);
      assert.equal(saved.answers.length, text ? 1 : 0);
    }
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});
