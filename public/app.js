import { loadSlovakVoice } from "./slovak-voice.js";

const $ = (s) => document.querySelector(s),
  app = $("#app");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state = null,
  busy = false,
  voice = false,
  handsfree = false,
  voiceConsent = false,
  recognition = null,
  listening = false,
  adminData = null,
  tab = "history",
  speaking = false,
  voiceRevision = 0;
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
async function api(url, method = "GET", data) {
  const r = await fetch("/api/" + url, {
    method,
    headers: method !== "GET" ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j;
}
let toastTimer;
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 6500);
}
function header(isAdmin = false) {
  return `<header><div class="brand"><span class="brandmark">+</span>ambulant<span><small>POČÚVAME VÁS</small></span></div><div class="header-right"><span class="pill"><i class="dot"></i> Lokálne MVP · fiktívne údaje</span><button class="text-button" id="admin-button">${isAdmin ? "Uzamknúť pracovisko ↗" : "Vstup pre lekára ↗"}</button></div></header>`;
}
function footer() {
  return "<footer><span>AMBULANT / DEMONŠTRAČNÁ VERZIA 0.1</span><span>Viac času na to podstatné.</span></footer>";
}
function sidebar(step) {
  return `<aside><div class="eyebrow">PRED VAŠÍM VYŠETRENÍM</div><h2>Najprv rozhovor.<br>Potom starostlivosť.</h2><p>Pokojne, vlastnými slovami.<br>Pomôžeme vám pripraviť informácie pre vášho lekára.</p><ol class="steps"><li class="${step === 1 ? "active" : ""}"><span>01</span> Zoznámime sa</li><li class="${step === 2 ? "active" : ""}"><span>02</span> Porozprávate nám o sebe</li><li class="${step === 3 ? "active" : ""}"><span>03</span> Pripravíme záznam</li></ol><div class="aside-note">✧ &nbsp; Vy určujete tempo.<br>Otázku môžete preskočiť odpoveďou „Chcem prebrať osobne“.<p>Pri náhlych závažných ťažkostiach okamžite privolajte personál.</p></div></aside>`;
}
function bindHeader(isAdmin = false) {
  $("#admin-button").onclick = async () => {
    if (isAdmin) {
      await api("lock", "POST");
      stopVoice();
      adminData = null;
      home();
    } else {
      stopVoice();
      $("#login-error").textContent = "";
      $("#pin").value = "";
      $("#login").showModal();
      $("#pin").focus();
    }
  };
}
function home() {
  state = null;
  app.innerHTML =
    header() +
    `<main class="layout">${sidebar(1)}<section><div class="card welcome"><div class="avatar">✳</div><div class="eyebrow">VITAJTE V AMBULANCII</div><h1>Máme čas<br>vás vypočuť.</h1><p class="lead">Povedzte nám, ako sa cítite. Náš priateľský asistent s vami prejde pár otázok a pripraví pre lekára prehľadný záznam.</p><div class="features"><span>◉ &nbsp;Písanie aj hlas</span><span>✧ &nbsp;Vaším tempom</span><span>▤ &nbsp;Prehľad pre lekára</span></div><div class="notice"><strong>Skúšate ukážku s vymysleným pacientom.</strong><br>Záznamy sa ukladajú na tento počítač. Text rozhovoru a ukážková anamnéza sa odosielajú do Codexu (OpenAI) cez prihlásený ChatGPT účet. Táto ukážka neposkytuje diagnózu a nenahrádza vyšetrenie. Nevkladajte skutočné osobné údaje.</div><label class="consent"><input type="checkbox" id="consent"><span>Rozumiem a súhlasím so spracovaním fiktívnych údajov AI na účely tejto ukážky.</span></label><div class="actions"><button class="primary" id="start" disabled>Začať rozhovor &nbsp; →</button><button class="secondary" id="fullscreen">⛶ Celá obrazovka</button></div><p class="fine">Mikrofón je voliteľný. Odpovedať môžete vždy aj písaním alebo výberom možnosti.</p><p class="error" id="start-error" role="alert"></p></div><div class="bottom-caption">Jeden pokojný rozhovor. Lepšie pripravená návšteva.</div></section></main>` +
    footer();
  bindHeader();
  $("#consent").onchange = (e) => ($("#start").disabled = !e.target.checked);
  $("#fullscreen").onclick = () =>
    document.documentElement
      .requestFullscreen?.()
      .catch(() => toast("Celú obrazovku otvorte cez ponuku prehliadača."));
  $("#start").onclick = async () => {
    const b = $("#start");
    b.disabled = true;
    b.textContent = "✧ Asistent sa pripravuje…";
    try {
      state = await api("start", "POST", { consent: true });
      chat();
    } catch (e) {
      $("#start-error").textContent = e.message;
      b.disabled = false;
      b.textContent = "Skúsiť znova →";
    }
  };
}
function voiceSettings() {
  return `<div class="voice-info"><label><input type="checkbox" id="voice-consent" ${voiceConsent ? "checked" : ""}><span>Povoliť hlas: rozpoznávanie reči môže posielať zvuk poskytovateľovi prehliadača. Čítanie odpovedí používa iba slovenský hlas. Jeho dostupnosť závisí od prehliadača a systému.</span></label><label><input type="checkbox" id="handsfree" ${handsfree ? "checked" : ""} ${!voiceConsent || !SpeechRecognition ? "disabled" : ""}><span>Hlasový rozhovor: po odpovedi asistenta automaticky počúvať a odoslať reč.</span></label></div>`;
}
function chat() {
  const c = state.coverage;
  const complete = c.answered >= c.total;
  app.innerHTML =
    header() +
    `<main class="layout">${sidebar(2)}<section><div class="card"><div class="chat-head"><div class="chat-person"><div class="avatar">✳</div><div><strong>Váš asistent</strong><small>Pred návštevou · pneumológia</small></div></div><div class="chat-controls"><button id="voice">${voice ? "◉ Hlas zapnutý" : "◎ Zapnúť hlas"}</button><button id="repeat" aria-label="Zopakovať poslednú odpoveď">↻ Prečítať</button></div></div><div class="progress"><div class="progress-inner" id="progress"></div></div><div class="transcript" aria-live="polite" aria-relevant="additions">${state.messages.map((m) => `<div class="message ${m.role === "user" ? "user" : ""}"><div class="message-label">${m.role === "user" ? "VY" : "AMBULANT"}</div><div class="bubble">${esc(m.text)}</div></div>`).join("")}</div>${state.urgent ? '<div class="urgent" role="alert"><strong>Privolajte zdravotnícky personál.</strong><br>Rozhovor je prerušený. Pri bezprostrednom ohrození volajte 155 alebo 112.</div>' : `<div class="choices">${[...new Set(state.choices)].map((x) => `<button class="choice" data-choice="${esc(x)}">${esc(x)}</button>`).join("")}${state.choices.some((x) => /prebrať osobne/i.test(x)) ? "" : '<button class="choice" data-choice="Chcem prebrať osobne">Prebrať osobne</button>'}</div>`}<div class="status-line" role="status" id="chat-status">${complete ? "Zachytené sú všetky okruhy; asistent môže doplniť detaily." : `${c.answered} z ${c.total} okruhov zachytených · môžete doplniť čokoľvek`}</div>${!state.urgent ? `<form class="composer" id="message-form"><label class="eyebrow" for="message">VAŠA ODPOVEĎ</label><div class="input-row"><textarea id="message" placeholder="Napíšte, ako sa cítite…" rows="1" maxlength="4000" required></textarea><button class="mic" id="mic" type="button" aria-label="Začať alebo zastaviť nahrávanie" ${!SpeechRecognition ? "disabled" : ""}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/></svg></button><button class="primary send" type="submit" aria-label="Odoslať odpoveď">↑</button></div><div class="composer-foot"><span>${SpeechRecognition ? "Hlasový príkaz: „Pripraviť záznam“." : "Prehliadač nepodporuje rozpoznávanie. Skúste Chrome alebo diktovanie macOS (Fn). "}</span><button type="button" class="text-button" id="prepare">${complete ? "Pripraviť záznam →" : "Ukončiť a pripraviť záznam"}</button></div></form>` : '<div class="composer"><button class="secondary" id="prepare">Pripraviť záznam pre personál →</button></div>'}${voiceSettings()}</div><div class="bottom-caption">✧ Odpovedá Codex cez váš ChatGPT účet. Každú odpoveď spracúva AI.</div></section></main>` +
    footer();
  bindHeader();
  $("#progress").style.width = (100 * c.answered) / c.total + "%";
  $(".transcript").scrollTop = $(".transcript").scrollHeight;
  $("#voice").onclick = () => {
    if (!voiceConsent) {
      toast("Najprv povoľte hlas pod rozhovorom.");
      return;
    }
    voice = !voice;
    $("#voice").textContent = voice ? "◉ Hlas zapnutý" : "◎ Zapnúť hlas";
    if (voice) speak(state.reply);
    else stopVoice();
  };
  $("#repeat").onclick = () => {
    if (!voiceConsent) return toast("Najprv povoľte hlas pod rozhovorom.");
    speak(state.reply);
  };
  $("#voice-consent").onchange = (e) => {
    voiceConsent = e.target.checked;
    $("#handsfree").disabled = !voiceConsent || !SpeechRecognition;
    if (!voiceConsent) {
      voice = false;
      handsfree = false;
      stopVoice();
      $("#handsfree").checked = false;
      $("#voice").textContent = "◎ Zapnúť hlas";
    }
  };
  $("#handsfree").onchange = (e) => {
    handsfree = e.target.checked;
    if (handsfree) {
      voice = true;
      speak(state.reply);
    } else stopVoice();
  };
  if ($("#message-form")) {
    $("#message-form").onsubmit = (e) => {
      e.preventDefault();
      submit($("#message").value);
    };
    $("#message").onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit($("#message").value);
      }
    };
    $("#mic").onclick = () => {
      if (!voiceConsent) return toast("Najprv povoľte hlas pod rozhovorom.");
      listening ? recognition?.stop() : listen();
    };
    document
      .querySelectorAll("[data-choice]")
      .forEach((b) => (b.onclick = () => submit(b.dataset.choice)));
  }
  $("#prepare").onclick = prepare;
}
function setBusy(value, label = "Asistent premýšľa…") {
  busy = value;
  document
    .querySelectorAll(".choices button,.composer button,.composer textarea")
    .forEach((b) => (b.disabled = value));
  if ($("#chat-status"))
    $("#chat-status").textContent = value
      ? label
      : `${state.coverage.answered} z ${state.coverage.total} okruhov zachytených`;
}
function command(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?,]/g, "")
    .trim();
}
async function submit(text) {
  text = text.trim();
  if (!text || busy) return;
  const cmd = command(text);
  if ($("#confirm")) {
    if (
      /^(prosim )?(ulozit|ulozte|potvrdit|potvrdte)( a ulozit)? zaznam$/.test(
        cmd,
      )
    ) {
      stopVoice();
      $("#confirm").click();
      return;
    }
    if (/^(doplnit|doplnme|doplnte)( odpovede)?$/.test(cmd)) {
      stopVoice();
      chat();
      if (voice) speak("Čo chcete ešte doplniť?");
      return;
    }
    toast("Povedzte „uložiť záznam“ alebo „doplniť odpovede“.");
    return;
  }
  if (/^(prosim )?(pripravit|pripravte|priprav) zaznam$/.test(cmd)) {
    await prepare();
    return;
  }
  stopVoice();
  setBusy(true);
  try {
    state = await api("chat", "POST", { text });
    chat();
    if (voice) speak(state.reply);
  } catch (e) {
    toast(e.message);
    setBusy(false);
    return;
  }
  busy = false;
}
async function prepare() {
  if (busy) return;
  stopVoice();
  setBusy(true, "Pripravujeme odborný záznam pre lekára…");
  try {
    state = await api("prepare", "POST");
    busy = false;
    review();
    if (voice)
      speak(
        "Záznam je pripravený na kontrolu. Ak ho chcete uložiť pre lekára, povedzte uložiť záznam. Ak chcete ešte niečo doplniť, povedzte doplniť odpovede.",
      );
  } catch (e) {
    toast(e.message);
    setBusy(false);
  }
}
function review() {
  app.innerHTML =
    header() +
    `<main class="layout">${sidebar(3)}<section class="card review"><div class="eyebrow">ZÁZNAM Z ROZHOVORU</div><h2>Všetko podstatné<br>na jednom mieste.</h2><div class="notice">Návrh vytvorený AI. Odbornú správnosť a úplnosť musí skontrolovať lekár. ${state.coverage.missing.length ? `<br><strong>Nezodpovedané okruhy:</strong> ${esc(state.coverage.missing.join("; "))}` : ""}</div><div class="report">${esc(state.report)}</div><div class="actions"><button class="primary" id="confirm">Potvrdiť a uložiť na disk →</button><button class="secondary" id="back">Doplniť odpovede</button><button class="secondary" id="mic" aria-label="Hlasové potvrdenie záznamu">◉ Hlasový príkaz</button></div><p class="fine">Hlasom povedzte „uložiť záznam“ alebo „doplniť odpovede“.</p><p class="fine">Záznam sa neodosiela e-mailom. Bude dostupný lekárovi po zadaní PIN-u.</p></section></main>` +
    footer();
  bindHeader();
  $("#back").onclick = () => {
    stopVoice();
    chat();
  };
  $("#mic").onclick = () => {
    if (!voiceConsent) return toast("Hlas povoľte najprv v rozhovore.");
    listen();
  };
  $("#confirm").onclick = async () => {
    const b = $("#confirm");
    b.disabled = true;
    try {
      await api("confirm", "POST");
      success();
      if (voice)
        speak(
          "Ďakujeme, záznam je uložený pre lekára. Prosím, počkajte na pozvanie do ambulancie.",
        );
    } catch (e) {
      toast(e.message);
      b.disabled = false;
    }
  };
}
function success() {
  stopVoice();
  app.innerHTML =
    header() +
    `<main class="layout">${sidebar(3)}<section class="card success"><div class="avatar">✓</div><div class="eyebrow">ZÁZNAM JE ULOŽENÝ</div><h1>Ďakujeme.<br>Teraz je čas na vás.</h1><p class="lead">Vaše odpovede sú pripravené pre lekára na tomto počítači. Prosím, počkajte na pozvanie do ambulancie.</p><button class="secondary" id="new">Nový ukážkový rozhovor →</button></section></main>` +
    footer();
  bindHeader();
  $("#new").onclick = home;
}
function stopVoice() {
  voiceRevision++;
  if (recognition) {
    recognition.onend = null;
    recognition.abort();
    recognition = null;
  }
  listening = false;
  speaking = false;
  window.speechSynthesis?.cancel();
  $("#mic")?.classList.remove("listening");
}
async function speak(text) {
  if (!voiceConsent || !window.speechSynthesis) return;
  stopVoice();
  const revision = voiceRevision;
  const slovakVoice = await loadSlovakVoice(speechSynthesis);
  if (revision !== voiceRevision || !voiceConsent) return;
  if (!slovakVoice) {
    voice = false;
    handsfree = false;
    if ($("#voice")) $("#voice").textContent = "◎ Zapnúť hlas";
    if ($("#handsfree")) $("#handsfree").checked = false;
    const message =
      "Slovenský hlas nie je dostupný. Pridajte si slovenský hlas v nastaveniach reči systému alebo použite prehliadač, ktorý ho ponúka. Odpovedať môžete aj písaním.";
    if ($("#chat-status")) $("#chat-status").textContent = message;
    toast(message);
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.voice = slovakVoice;
  u.lang = "sk-SK";
  u.rate = 0.95;
  speaking = true;
  u.onend = () => {
    speaking = false;
    if (handsfree && !busy && !state?.urgent && $("#mic")) listen();
  };
  u.onerror = () => {
    speaking = false;
    toast("Hlas sa nepodarilo prehrať. Odpoveď si môžete prečítať.");
  };
  speechSynthesis.speak(u);
}
function listen() {
  if (!SpeechRecognition || !voiceConsent || busy || speaking) return;
  recognition?.abort();
  recognition = new SpeechRecognition();
  recognition.lang = "sk-SK";
  recognition.interimResults = true;
  recognition.continuous = false;
  let final = "";
  recognition.onstart = () => {
    listening = true;
    $("#mic")?.classList.add("listening");
    if ($("#chat-status")) $("#chat-status").textContent = "Počúvam vás…";
  };
  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if ($("#message")) $("#message").value = final + interim;
  };
  recognition.onerror = (e) => {
    handsfree = false;
    if ($("#handsfree")) $("#handsfree").checked = false;
    toast(
      e.error === "not-allowed"
        ? "Povoľte mikrofón v prehliadači. Môžete aj písať."
        : "Rozpoznávanie reči nie je dostupné. Skúste Chrome alebo píšte.",
    );
  };
  recognition.onend = () => {
    listening = false;
    $("#mic")?.classList.remove("listening");
    if (final.trim() && (handsfree || $("#confirm"))) submit(final);
    else if ($("#chat-status"))
      $("#chat-status").textContent = final
        ? "Skontrolujte text a odošlite ho šípkou."
        : "Nahrávanie sa skončilo. Mikrofón spustíte znova tlačidlom.";
  };
  try {
    recognition.start();
  } catch {
    toast("Mikrofón nie je dostupný.");
  }
}
async function loadAdmin() {
  stopVoice();
  adminData = await api("admin");
  renderAdmin();
}
function renderAdmin() {
  app.innerHTML =
    header(true) +
    `<main class="admin"><div class="admin-top"><div><div class="eyebrow">PRACOVISKO LEKÁRA</div><h1>Dobrá návšteva začína počúvaním.</h1></div><div class="actions"><button class="primary" id="patient-mode">Prejsť do režimu pacienta →</button></div></div><div class="tabs"><button data-tab="history" class="${tab === "history" ? "selected" : ""}">Ukážkový pacient</button><button data-tab="protocol" class="${tab === "protocol" ? "selected" : ""}">Otázky a protokol</button><button data-tab="reports" class="${tab === "reports" ? "selected" : ""}">Záznamy (${adminData.reports.length})</button><button data-tab="settings" class="${tab === "settings" ? "selected" : ""}">Prístup</button></div><section class="card panel" id="admin-panel"></section></main>` +
    footer();
  bindHeader(true);
  $("#patient-mode").onclick = async () => {
    await api("lock", "POST");
    adminData = null;
    home();
  };
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        renderAdmin();
      }),
  );
  const p = $("#admin-panel");
  if (tab === "history") {
    const x = adminData.patient;
    p.innerHTML = `<span class="pill">FIKTÍVNY PACIENT · ${esc(x.id)}</span><h2>${esc(x.name)}</h2><p>Rok narodenia: ${x.birthYear}</p>${x.history.map((h) => `<div class="history"><time>${esc(h.date)}</time><p>${esc(h.note)}</p></div>`).join("")}<h3>Liečba v dokumentácii</h3><p>${x.medications.map(esc).join("<br>")}</p><h3>Alergie</h3><p>${x.allergies.map(esc).join(", ")}</p><div class="notice">Asistent tieto informácie pozná. V rozhovore overuje ich aktuálnosť. Zdrojové dáta: data/patient.json (iba lokálne).</div>`;
  }
  if (tab === "reports") {
    p.innerHTML =
      '<h3>Záznamy pripravené na kontrolu</h3><div class="notice">Všetky záznamy sú návrhy AI, bez klinického overenia. Uložené iba na tomto disku.</div>' +
      (!adminData.reports.length
        ? '<div class="empty">Zatiaľ žiadny potvrdený rozhovor.</div>'
        : adminData.reports
            .map(
              (r, i) =>
                `<details class="record"><summary>${esc(r.patient)} · ${esc(new Date(r.createdAt).toLocaleString("sk-SK"))}${r.urgent ? " · ⚠ VÝSTRAHA" : ""}</summary><small>${esc(r.protocol)} · ${r.coverage.answered}/${r.coverage.total} okruhov · NEOVERENÉ LEKÁROM</small><div class="report">${esc(r.text)}</div>${r.coverage.missing.length ? `<p class="error">Chýba: ${esc(r.coverage.missing.join("; "))}</p>` : ""}<details><summary>Citácie odpovedí pacienta</summary>${r.answers.map((a) => `<p><strong>${esc(a.id)}</strong>: ${esc(a.value)} — „${esc(a.evidence)}“</p>`).join("")}</details><div class="actions"><button class="secondary" data-export="${i}">Stiahnuť text</button><button class="secondary" data-copy="${i}">Kopírovať protokol</button></div></details>`,
            )
            .join(""));
    document.querySelectorAll("[data-export]").forEach(
      (b) =>
        (b.onclick = () => {
          const r = adminData.reports[b.dataset.export];
          const blob = new Blob([reportText(r)], {
              type: "text/plain;charset=utf-8",
            }),
            a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `ambulant-${r.id}.txt`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }),
    );
    document.querySelectorAll("[data-copy]").forEach(
      (b) =>
        (b.onclick = () =>
          navigator.clipboard
            .writeText(reportText(adminData.reports[b.dataset.copy]))
            .then(() => toast("Protokol skopírovaný."))
            .catch(() =>
              toast(
                "Prehliadač nepovolil kopírovanie. Použite stiahnutie textu.",
              ),
            )),
    );
  }
  if (tab === "protocol") protocolEditor(p);
  if (tab === "settings") {
    p.innerHTML =
      '<h3>Zmena PIN-u</h3><p>PIN chráni časť lekára v tejto aplikácii. Nezamyká operačný systém ani prehliadač; pre tablet v ambulancii je potrebný kiosk režim zariadenia.</p><form id="pin-form"><label class="field" for="new-pin">Nový PIN (6 až 12 číslic)</label><input id="new-pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" required><button class="primary">Uložiť nový PIN</button></form><p class="fine">Prístup lekára vyprší po 30 minútach. Pri prechode k pacientovi sa okamžite uzamkne. Rozpracované rozhovory sa ukladajú na disk; po reštarte servera začnite nový rozhovor.</p>';
    $("#pin-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("pin", "PUT", { pin: $("#new-pin").value });
        adminData = null;
        home();
        toast("PIN zmenený. Prihláste sa novým PIN-om.");
      } catch (e) {
        toast(e.message);
      }
    };
  }
}
function reportText(r) {
  return `AMBULANT — NÁVRH AI NA KONTROLU LEKÁROM\n${r.patient}\n${r.createdAt}\n${r.protocol}\n\n${r.text}\n\nNezodpovedané okruhy: ${r.coverage.missing.join("; ") || "žiadne"}\n`;
}
function protocolEditor(panel) {
  const p = adminData.protocol;
  panel.innerHTML = `<h3>Váš spôsob rozhovoru</h3><p class="fine">Otázky určujú obsah rozhovoru aj výsledného protokolu. Zmeny platia pre nové rozhovory.</p><form id="protocol-form"><label class="field" for="protocol-title">Názov protokolu</label><input class="full" id="protocol-title" value="${esc(p.title)}" required><label class="field" for="instructions">Pokyny pre asistenta</label><textarea class="full" id="instructions">${esc(p.instructions)}</textarea><label class="field" for="sections">Sekcie odborného protokolu (každá na samostatnom riadku)</label><textarea class="full" id="sections">${esc(p.reportSections.join("\n"))}</textarea><h3>Otázky a vetvenie</h3><div id="question-list"></div><div class="actions"><button type="button" class="secondary" id="add-question">+ Pridať otázku</button><button class="primary" type="submit">Uložiť protokol</button></div></form>`;
  let rows = structuredClone(p.questions);
  function sync() {
    rows = [...document.querySelectorAll(".qrow")].map((el) => ({
      id: el.querySelector("[data-field=id]").value,
      label: el.querySelector("[data-field=label]").value,
      choices: el
        .querySelector("[data-field=choices]")
        .value.split("|")
        .map((x) => x.trim())
        .filter(Boolean),
      when: el.querySelector("[data-field=when]").value
        ? {
            id: el.querySelector("[data-field=when]").value,
            equals: el.querySelector("[data-field=equals]").value,
          }
        : null,
    }));
  }
  function draw() {
    $("#question-list").innerHTML = rows
      .map(
        (q, i) =>
          `<div class="qrow"><div class="eyebrow">OTÁZKA ${i + 1}</div><div class="qgrid"><div><label>ID otázky</label><input aria-label="ID otázky ${i + 1}" data-field="id" value="${esc(q.id)}" required pattern="[a-z][a-z0-9_]{0,40}"></div><div><label>Text otázky</label><input aria-label="Text otázky ${i + 1}" data-field="label" value="${esc(q.label)}" required></div></div><label>Možnosti oddelené znakom | (prázdne = voľný text)</label><input aria-label="Možnosti otázky ${i + 1}" data-field="choices" value="${esc(q.choices.join(" | "))}"><div class="qgrid"><div><label>Len po otázke</label><select aria-label="Podmienka otázky ${i + 1}" data-field="when"><option value="">Vždy</option>${rows
            .slice(0, i)
            .map(
              (prev) =>
                `<option value="${esc(prev.id)}" ${q.when?.id === prev.id ? "selected" : ""}>${esc(prev.id)}</option>`,
            )
            .join(
              "",
            )}</select></div><div><label>Ak odpoveď je</label><select aria-label="Hodnota podmienky ${i + 1}" data-field="equals">${[
            ["yes", "Áno"],
            ["no", "Nie"],
            ["text", "Textová odpoveď"],
            ["deferred", "Prebrať osobne"],
          ]
            .map(
              ([v, t]) =>
                `<option value="${v}" ${q.when?.equals === v ? "selected" : ""}>${t}</option>`,
            )
            .join(
              "",
            )}</select></div></div><button type="button" class="delete" data-remove="${i}">Odstrániť otázku</button></div>`,
      )
      .join("");
    document.querySelectorAll("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          sync();
          rows.splice(Number(b.dataset.remove), 1);
          draw();
        }),
    );
  }
  draw();
  $("#add-question").onclick = () => {
    sync();
    let i = rows.length + 1;
    while (rows.some((q) => q.id === "question_" + i)) i++;
    rows.push({ id: "question_" + i, label: "", choices: [], when: null });
    draw();
  };
  $("#protocol-form").onsubmit = async (e) => {
    e.preventDefault();
    sync();
    const next = {
      title: $("#protocol-title").value,
      instructions: $("#instructions").value,
      reportSections: $("#sections")
        .value.split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      questions: rows,
    };
    try {
      await api("protocol", "PUT", next);
      adminData.protocol = next;
      toast("Protokol uložený. Použije sa pri novom rozhovore.");
    } catch (e) {
      toast(e.message);
    }
  };
}
$("#close-login").onclick = () => $("#login").close();
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("login", "POST", { pin: $("#pin").value });
    await loadAdmin();
    $("#login").close();
  } catch (e) {
    $("#login-error").textContent = e.message;
  }
};
// Restore only the patient session represented by this browser's HttpOnly cookie.
async function init() {
  try {
    const status = await api("status");
    if (status.admin) {
      await loadAdmin();
      return;
    }
    const restored = await api("session");
    state = restored;
    if (state.saved) success();
    else if (state.report) review();
    else chat();
  } catch {
    home();
  }
}
init();
