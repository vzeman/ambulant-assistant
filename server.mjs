import http from "node:http";
import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAI, coverage, validateProtocol } from "./core.mjs";
const root = path.dirname(fileURLToPath(import.meta.url)),
  data = process.env.AMBULANT_DATA_DIR || path.join(root, "data");
await mkdir(data, { recursive: true, mode: 0o700 });
async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function save(file, value) {
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}
for (const name of ["patient", "protocol"]) {
  try {
    await readFile(path.join(data, name + ".json"));
  } catch {
    await save(
      path.join(data, name + ".json"),
      await json(path.join(root, "examples", name + ".json")),
    );
  }
}
let config;
try {
  config = await json(path.join(data, "config.json"));
} catch {
  const pin = (randomBytes(4).readUInt32BE() % 900000) + 100000;
  const salt = randomBytes(16).toString("hex");
  config = { salt, pinHash: scryptSync(String(pin), salt, 32).toString("hex") };
  await save(path.join(data, "config.json"), config);
  await writeFile(path.join(data, "FIRST-RUN-PIN.txt"), String(pin) + "\n", {
    mode: 0o600,
  });
}
const adminTokens = new Map(),
  patients = new Map(),
  attempts = new Map();
const PORT = Number(process.env.PORT || 4317);
function cookie(req, name) {
  return (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
function admin(req) {
  const token = cookie(req, "admin");
  return token && adminTokens.get(token) > Date.now();
}
function session(req) {
  const s = patients.get(cookie(req, "patient"));
  if (!s || s.expires < Date.now())
    throw Object.assign(Error("Rozhovor vypršal. Začnite nový."), {
      status: 401,
    });
  return s;
}
function requireAdmin(req) {
  if (!admin(req))
    throw Object.assign(Error("Zadajte PIN lekára."), { status: 401 });
}
function send(res, status, obj, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(obj));
}
async function body(req) {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (Buffer.byteLength(s) > 150000)
      throw Object.assign(Error("Príliš veľa údajov."), { status: 413 });
  }
  try {
    return JSON.parse(s || "{}");
  } catch {
    throw Object.assign(Error("Neplatné JSON dáta."), { status: 400 });
  }
}
function view(s) {
  return {
    id: s.id,
    messages: s.messages,
    reply: s.result.reply,
    choices: s.result.choices,
    urgent: s.result.urgent,
    coverage: coverage(s.protocol, s.result.answers),
    report: s.draft || null,
    saved: s.saved || false,
  };
}
async function turn(s, text, finalize = false) {
  if (s.busy)
    throw Object.assign(Error("Počkajte na odpoveď asistenta."), {
      status: 409,
    });
  if (s.saved) throw Error("Rozhovor je už uložený. Začnite nový.");
  if (s.result?.urgent && !finalize)
    throw Error("Rozhovor je prerušený. Privolajte personál.");
  if (s.messages.length > 100)
    throw Error("Dosiahli ste limit rozhovoru. Pripravte záznam.");
  s.busy = true;
  try {
    const messages = text
      ? [...s.messages, { role: "user", text }]
      : s.messages;
    const result = await runAI(
      { patient: s.patient, protocol: s.protocol, messages, finalize },
      path.join(data, "runtime"),
    );
    s.messages = [...messages, { role: "assistant", text: result.reply }];
    s.result = result;
    if (finalize) {
      if (!result.report.trim())
        throw Error("AI nevytvorila protokol. Skúste znova.");
      s.draft = result.report;
    } else s.draft = null;
    await save(path.join(data, "sessions", s.id + ".json"), {
      ...s,
      busy: false,
    });
    return view(s);
  } finally {
    s.busy = false;
  }
}
await mkdir(path.join(data, "sessions"), { recursive: true, mode: 0o700 });
await mkdir(path.join(data, "reports"), { recursive: true, mode: 0o700 });
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  try {
    const host = req.headers.host;
    if (![`localhost:${PORT}`, `127.0.0.1:${PORT}`].includes(host))
      return send(res, 403, { error: "Iba lokálny prístup." });
    if (req.method !== "GET" && req.headers.origin !== `http://${host}`)
      return send(res, 403, { error: "Nepovolený pôvod požiadavky." });
    const url = new URL(req.url, "http://" + host),
      route = url.pathname;
    if (route === "/api/session" && req.method === "GET")
      return send(res, 200, view(session(req)));
    if (route === "/api/status" && req.method === "GET")
      return send(res, 200, {
        admin: !!admin(req),
        engine: "Codex · ChatGPT účet",
        fictional: true,
      });
    if (route === "/api/login" && req.method === "POST") {
      const b = await body(req);
      const key = req.socket.remoteAddress;
      let a = attempts.get(key) || { count: 0, until: 0 };
      if (a.until > Date.now())
        return send(res, 429, {
          error: "Príliš veľa pokusov. Skúste o minútu.",
        });
      const pin = String(b.pin || "");
      const hash = scryptSync(pin.slice(0, 100), config.salt, 32);
      if (!timingSafeEqual(hash, Buffer.from(config.pinHash, "hex"))) {
        a.count++;
        if (a.count >= 5) {
          a.until = Date.now() + 60000;
          a.count = 0;
        }
        attempts.set(key, a);
        return send(res, 401, { error: "Nesprávny PIN." });
      }
      attempts.delete(key);
      const token = randomBytes(32).toString("hex");
      adminTokens.set(token, Date.now() + 1800000);
      return send(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": `admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`,
        },
      );
    }
    if (route === "/api/lock" && req.method === "POST") {
      adminTokens.delete(cookie(req, "admin"));
      return send(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": "admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        },
      );
    }
    if (route === "/api/start" && req.method === "POST") {
      const b = await body(req);
      if (b.consent !== true)
        throw Error("Potvrďte spracovanie ukážkových údajov AI.");
      if (patients.size >= 100)
        for (const [k, s] of patients)
          if (s.expires < Date.now()) patients.delete(k);
      const patient = await json(path.join(data, "patient.json"));
      if (patient.fictional !== true)
        throw Error("Toto MVP povoľuje len fiktívne údaje.");
      const s = {
        id: randomUUID(),
        patient,
        protocol: validateProtocol(
          await json(path.join(data, "protocol.json")),
        ),
        messages: [],
        expires: Date.now() + 7200000,
      };
      const result = await turn(s);
      const token = randomBytes(32).toString("hex");
      patients.set(token, s);
      // Entering patient mode revokes the clinician session on the server.
      adminTokens.delete(cookie(req, "admin"));
      return send(res, 200, result, {
        "Set-Cookie": [
          `patient=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`,
          "admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        ],
      });
    }
    if (route === "/api/chat" && req.method === "POST") {
      const b = await body(req);
      if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 4000)
        throw Error("Napíšte odpoveď do 4 000 znakov.");
      return send(res, 200, await turn(session(req), b.text.trim()));
    }
    if (route === "/api/prepare" && req.method === "POST")
      return send(res, 200, await turn(session(req), null, true));
    if (route === "/api/confirm" && req.method === "POST") {
      const s = session(req);
      if (s.busy) throw Error("Počkajte na dokončenie AI.");
      if (!s.draft) throw Error("Najprv pripravte záznam.");
      const report = {
        id: s.id,
        patient: s.patient.name,
        createdAt: new Date().toISOString(),
        protocol: s.protocol.title,
        text: s.draft,
        coverage: coverage(s.protocol, s.result.answers),
        answers: s.result.answers,
        urgent: s.result.urgent,
        doctorReviewed: false,
      };
      await save(path.join(data, "reports", s.id + ".json"), report);
      s.saved = true;
      return send(res, 200, { ok: true, id: s.id });
    }
    if (route === "/api/admin" && req.method === "GET") {
      requireAdmin(req);
      const reports = await Promise.all(
        (await readdir(path.join(data, "reports")))
          .filter((n) => n.endsWith(".json"))
          .map((n) => json(path.join(data, "reports", n))),
      );
      return send(res, 200, {
        patient: await json(path.join(data, "patient.json")),
        protocol: await json(path.join(data, "protocol.json")),
        reports: reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      });
    }
    if (route === "/api/protocol" && req.method === "PUT") {
      requireAdmin(req);
      const p = validateProtocol(await body(req));
      await save(path.join(data, "protocol.json"), p);
      return send(res, 200, { ok: true });
    }
    if (route === "/api/pin" && req.method === "PUT") {
      requireAdmin(req);
      const b = await body(req);
      if (!/^\d{6,12}$/.test(b.pin)) throw Error("Použite 6 až 12 číslic.");
      const salt = randomBytes(16).toString("hex");
      config = { salt, pinHash: scryptSync(b.pin, salt, 32).toString("hex") };
      await save(path.join(data, "config.json"), config);
      await writeFile(
        path.join(data, "FIRST-RUN-PIN.txt"),
        "PIN bol zmenený v aplikácii.\n",
        { mode: 0o600 },
      );
      adminTokens.clear();
      return send(res, 200, { ok: true });
    }
    const staticFiles = {
      "/": "index.html",
      "/app.js": "app.js",
      "/slovak-voice.js": "slovak-voice.js",
      "/style.css": "style.css",
    };
    if (req.method === "GET" && staticFiles[route]) {
      const file = staticFiles[route];
      res.writeHead(200, {
        "Content-Type": file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(await readFile(path.join(root, "public", file)));
    }
    send(res, 404, { error: "Stránka neexistuje." });
  } catch (e) {
    send(res, e.status || 400, { error: e.message || "Nastala chyba." });
  }
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? "Port je obsadený. Otvorte bežiacu aplikáciu alebo zmeňte PORT."
      : e.message,
  );
  process.exitCode = 1;
});
server.listen(PORT, "127.0.0.1", () =>
  console.log(
    `Ambulant beží na http://localhost:${PORT}\nPrvý PIN: data/FIRST-RUN-PIN.txt\nPoužívajte iba fiktívne údaje.`,
  ),
);
