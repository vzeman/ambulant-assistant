import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
