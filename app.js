(() => {
  "use strict";

  const CFG = window.APP_CONFIG;
  const DEMO = new URLSearchParams(location.search).has("demo");
  const SCOPES = "openid email https://www.googleapis.com/auth/drive.readonly";
  const LS = {
    clientId: "bc_client_id",
    token: "bc_token",
    oauthState: "bc_oauth_state",
    cache: "bc_cache",
    seen: "bc_messages_seen",
    view: "bc_view",
    ids: "bc_ids",
    root: "bc_root",
    email: "bc_email"
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  let IDS = store.get(LS.ids);

  // ---------- Status-Normalisierung ----------

  const CHAPTER_STATUS = [
    { key: "open",     label: "Offen",          color: "var(--st-open)" },
    { key: "research", label: "Recherche",      color: "var(--st-research)" },
    { key: "draft",    label: "Entwurf",        color: "var(--st-draft)" },
    { key: "review",   label: "Quellenprüfung", color: "var(--st-review)" },
    { key: "done",     label: "Fertig",         color: "var(--st-done)" }
  ];
  const statusInfo = key => CHAPTER_STATUS.find(s => s.key === key) || CHAPTER_STATUS[0];

  function chapterStatusKey(raw) {
    const s = (raw || "").toLowerCase();
    if (/fertig|abgenommen|freigegeben|final/.test(s)) return "done";
    if (/prüf|pruef|review/.test(s)) return "review";
    if (/entwurf|manuskript|schreib/.test(s)) return "draft";
    if (/recherche|forschung|arbeit/.test(s)) return "research";
    return "open";
  }

  const TASK_STATUS = {
    IN_ARBEIT:    { label: "In Arbeit",   color: "var(--st-research)", order: 0 },
    RESERVIERT:   { label: "Reserviert",  color: "var(--st-research)", order: 1 },
    ZUR_PRUEFUNG: { label: "Zur Prüfung", color: "var(--st-review)",   order: 2 },
    OFFEN:        { label: "Offen",       color: "var(--st-draft)",    order: 3 },
    ANGEBOTEN:    { label: "Angeboten",   color: "var(--st-draft)",    order: 4 },
    WARTET:       { label: "Wartet",      color: "var(--st-wait)",     order: 5 },
    RUHEND:       { label: "Ruhend",      color: "var(--st-open)",     order: 6 },
    ERLEDIGT:     { label: "Erledigt",    color: "var(--st-done)",     order: 7 }
  };
  function taskStatus(raw) {
    const k = (raw || "").toUpperCase().replace(/[\s-]+/g, "_").replace("Ü", "UE");
    if (TASK_STATUS[k]) return { key: k, ...TASK_STATUS[k] };
    if (/ABGESCHLOSSEN|FERTIG|DONE/.test(k)) return { key: "ERLEDIGT", ...TASK_STATUS.ERLEDIGT };
    return { key: k || "OFFEN", label: raw || "Offen", color: "var(--st-open)", order: 8 };
  }

  function who(text) {
    const s = (text || "").toLowerCase();
    if (s.includes("claude")) return { key: "claude", label: "Claude" };
    if (s.includes("chatgpt") || s.includes("gpt")) return { key: "chatgpt", label: "ChatGPT" };
    if (s.includes("autor")) return { key: "autor", label: "Autor" };
    return { key: "", label: text || "–" };
  }

  // ---------- Hilfsfunktionen ----------

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function linkify(s) {
    return esc(s).replace(/https?:\/\/[^\s<]+/g, url => {
      const clean = url.replace(/[).,;]+$/, "");
      return `<a href="${clean}" target="_blank" rel="noopener">${docLabel(clean)}</a>${url.slice(clean.length)}`;
    });
  }
  function docLabel(url) {
    if (url.includes("docs.google.com/document")) return "📄 Dokument";
    if (url.includes("docs.google.com/spreadsheets")) return "📊 Tabelle";
    if (url.includes("drive.google.com")) return "📁 Drive";
    try { return "🔗 " + new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  }
  function firstUrl(s) {
    const m = String(s || "").match(/https?:\/\/[^\s<]+/);
    return m ? m[0].replace(/[).,;]+$/, "") : "";
  }
  const fmtDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const fmtDay = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  function relTime(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d) / 60000;
    if (diff < 1) return "gerade eben";
    if (diff < 60) return `vor ${Math.round(diff)} Min.`;
    if (diff < 60 * 24) return `vor ${Math.round(diff / 60)} Std.`;
    return fmtDate.format(d);
  }
  function prettyName(name) {
    return name.replace(/_/g, " ").replace(/\s+v\d+[a-z]?$/i, "").trim();
  }
  // Absender/Empfänger vorne im Dateinamen weglassen – steht schon im Kopf der Nachricht
  function msgTitle(name) {
    return name.replace(/^(msg|nachricht)[_\s-]+/i, "").replace(/^(claude|chatgpt|gpt)[_\s-]+an[_\s-]+(claude|chatgpt|gpt)[_\s-]+/i, "");
  }

  function fileKind(f) {
    const n = f.name.toUpperCase();
    const p = f.parents || [];
    if (p.some(x => IDS?.claudeFolders?.includes(x)) || (/CLAUDE/.test(n) && !/GPT/.test(n))) return who("claude");
    if (p.some(x => IDS?.chatgptFolders?.includes(x)) || (/GPT/.test(n) && !/CLAUDE/.test(n))) return who("chatgpt");
    return { key: "", label: "Projekt" };
  }

  // ---------- Anmeldung (OAuth-Redirect, funktioniert auch als Home-Bildschirm-App) ----------

  const redirectUri = () => location.origin + location.pathname;
  const clientId = () => CFG.clientId || store.get(LS.clientId) || "";

  function startLogin() {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set(LS.oauthState, state);
    const p = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri(),
      response_type: "token",
      scope: SCOPES,
      include_granted_scopes: "true",
      state,
      login_hint: store.get(LS.email) || ""
    });
    if (!p.get("login_hint")) p.delete("login_hint");
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  }

  function consumeRedirect() {
    if (!location.hash.includes("access_token") && !location.hash.includes("error=")) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    const expected = store.get(LS.oauthState);
    store.del(LS.oauthState);
    if (h.get("error")) throw new Error("Google-Anmeldung abgebrochen (" + h.get("error") + ").");
    if (!expected || h.get("state") !== expected) throw new Error("Anmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.");
    return { token: h.get("access_token"), exp: Date.now() + (Number(h.get("expires_in")) - 60) * 1000 };
  }

  async function emailAllowed(email) {
    const hashes = CFG.allowedEmailHashes || [];
    if (!hashes.length) return true;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    return hashes.includes(hex);
  }

  function validToken() {
    const t = store.get(LS.token);
    return t && t.exp > Date.now() ? t : null;
  }

  class AuthError extends Error {}

  async function api(url, { text = false } = {}) {
    const t = validToken();
    if (!t) throw new AuthError("Sitzung abgelaufen");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + t.token } });
    if (res.status === 401) { store.del(LS.token); throw new AuthError("Sitzung abgelaufen"); }
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try { msg = (await res.json()).error.message || msg; } catch {}
      throw new Error(msg);
    }
    return text ? res.text() : res.json();
  }

  // ---------- Daten laden ----------

  // Projektdateien im eingefügten Ordner finden. Der Ordner-Link wird nur auf dem Gerät gespeichert,
  // im öffentlichen Code stehen weder IDs noch Dateinamen.
  const SHEET = "application/vnd.google-apps.spreadsheet";
  const DOC = "application/vnd.google-apps.document";
  const FOLDER = "application/vnd.google-apps.folder";

  async function listAll(q, fields) {
    const out = [];
    let pageToken = "";
    do {
      const r = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(${fields})${pageToken ? "&pageToken=" + pageToken : ""}`);
      out.push(...(r.files || []));
      pageToken = r.nextPageToken || "";
    } while (pageToken);
    return out;
  }

  function pick(files, score) {
    return files.map(f => ({ f, s: score(f.name) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || b.f.modifiedTime.localeCompare(a.f.modifiedTime))[0]?.f;
  }

  async function sheetTabs(id) {
    const r = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`);
    return (r.sheets || []).map(x => x.properties.title);
  }

  async function discover(rootId) {
    const folders = await listAll(`mimeType = '${FOLDER}' and trashed = false`, "id,name,parents");
    const tree = [rootId];
    for (let i = 0; i < tree.length; i++) {
      folders.filter(f => (f.parents || []).includes(tree[i])).forEach(f => { if (!tree.includes(f.id)) tree.push(f.id); });
    }
    const treeFolders = folders.filter(f => tree.includes(f.id));

    const files = [];
    for (let i = 0; i < tree.length; i += 40) {
      const parents = tree.slice(i, i + 40).map(id => `'${id}' in parents`).join(" or ");
      files.push(...await listAll(`(${parents}) and trashed = false and mimeType != '${FOLDER}'`, "id,name,mimeType,modifiedTime"));
    }
    if (!files.length) throw new Error("Im angegebenen Ordner wurden keine Dateien gefunden. Stimmt der Link?");

    const sheets = files.filter(f => f.mimeType === SHEET);
    const isTasks = n => /aufgab|auftr|board|task/i.test(n);
    const register = pick(sheets, n => (/kapitel/i.test(n) ? 2 : 0) + (/register|liste|übersicht|plan/i.test(n) ? 1 : 0) - (isTasks(n) ? 5 : 0));
    const board = pick(sheets, n => isTasks(n) ? 1 : 0);
    if (!register) throw new Error("Keine Kapitel-Tabelle gefunden (Tabelle mit „Kapitel“ im Namen).");
    const fortsetzung = pick(files.filter(f => f.mimeType === DOC), n => /fortsetz/i.test(n) ? 1 : 0);

    const [regTabs, boardTabs] = await Promise.all([sheetTabs(register.id), board ? sheetTabs(board.id) : []]);
    const tab = (tabs, re, fallback = true) => tabs.find(t => re.test(t)) || (fallback ? tabs[0] : "");

    // Nachrichtenordner: Name nennt beide KIs, der Empfänger steht nach „an“
    const inbox = treeFolders.filter(f => /claude/i.test(f.name) && /gpt/i.test(f.name));
    const recipient = f => (/\ban[_\s-]*(claude|chatgpt|gpt)/i.exec(f.name)?.[1] || "").toLowerCase();
    const fromClaude = inbox.filter(f => /gpt/.test(recipient(f))).map(f => f.id);
    const fromChatgpt = inbox.filter(f => recipient(f) === "claude").map(f => f.id);
    const only = re => treeFolders.filter(f => re.test(f.name) && !inbox.includes(f)).map(f => f.id);

    return {
      root: rootId,
      projekt: tree,
      register: register.id,
      registerTab: tab(regTabs, /kapitel/i),
      board: board?.id || "",
      boardTab: tab(boardTabs, /auftr|aufgab|task/i),
      logTab: tab(boardTabs, /protokoll|log|verlauf/i, false),
      fortsetzung: fortsetzung?.id || "",
      fromClaude, fromChatgpt,
      claudeFolders: [...fromClaude, ...only(/claude/i).filter(id => !only(/gpt/i).includes(id))],
      chatgptFolders: [...fromChatgpt, ...only(/gpt/i).filter(id => !only(/claude/i).includes(id))]
    };
  }

  function folderIdFromLink(text) {
    const t = text.trim();
    const m = /\/folders\/([\w-]{10,})/.exec(t) || /[?&]id=([\w-]{10,})/.exec(t) || /^([\w-]{10,})$/.exec(t);
    return m ? m[1] : "";
  }

  async function readSheet(id, tab) {
    const r = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab)}?valueRenderOption=FORMATTED_VALUE`);
    return r.values || [];
  }

  // Spalten über die Überschrift finden, damit neue Spalten nichts kaputt machen
  function table(rows) {
    const head = (rows[0] || []).map(h => h.toLowerCase().trim());
    const idx = (...names) => {
      for (const n of names) {
        const i = head.findIndex(h => h.startsWith(n.toLowerCase()));
        if (i >= 0) return i;
      }
      return -1;
    };
    return { body: rows.slice(1), col: (row, ...names) => { const i = idx(...names); return i >= 0 ? (row[i] || "").trim() : ""; } };
  }

  function parseChapters(rows) {
    const t = table(rows);
    return t.body
      .filter(r => /^\d+$/.test((r[0] || "").trim()))
      .map(r => {
        const c = (...n) => t.col(r, ...n);
        const status = c("Status");
        return {
          nr: Number(c("Nr")),
          title: c("Original-Kapiteltitel") || c("Thema"),
          workTitle: c("Thema"),
          status, statusKey: chapterStatusKey(status),
          lastStep: c("Letzter Arbeitsschritt"),
          updated: c("Letzte Aktualisierung"),
          bookLink: firstUrl(c("Buchkapitel-Link")),
          dossierLink: firstUrl(c("Forschungsdossier-Link")),
          sourcesChecked: c("Primärquellen"),
          quality: c("Quellenqualität"),
          need: c("Fehlende Inhalte"),
          priority: c("Priorität"),
          notes: c("Redaktionsnotizen"),
          pages: c("Planseiten"),
          goal: c("Lernziel"),
          minContent: c("Mindestinhalte"),
          overlap: c("Dopplungen")
        };
      });
  }

  function parseTasks(rows) {
    const t = table(rows);
    return t.body.filter(r => (r[0] || "").trim()).map(r => {
      const c = (...n) => t.col(r, ...n);
      return {
        id: c("Auftrag-ID"), chapter: c("Kapitel"), pkg: c("Arbeitspaket"),
        owner: c("Zuständigkeit"), status: taskStatus(c("Status")), prio: c("Priorität"),
        created: c("Angelegt"), lastCheck: c("Letzte Prüfung"), result: c("Ergebnisablage"),
        reviewer: c("Gegenprüfung"), review: c("Review"), depends: c("Abhängigkeit"),
        next: c("Nächster Schritt"), note: c("Notiz"), approval: c("Autorenfreigabe")
      };
    });
  }

  function parseLog(rows) {
    const t = table(rows);
    return t.body.filter(r => (r[0] || "").trim()).map(r => {
      const c = (...n) => t.col(r, ...n);
      return { time: c("Zeit"), agent: c("Agent"), id: c("Auftrag-ID"), event: c("Ereignis"), after: c("Nachher"), proof: c("Artefakt"), next: c("Nächste Aktion") };
    }).reverse();
  }

  const FILE_FIELDS = "files(id,name,mimeType,createdTime,modifiedTime,parents,webViewLink)";

  async function listFolder(folderId, pageSize = 100) {
    if (!folderId) return [];
    const q = `'${folderId}' in parents and trashed = false`;
    const r = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=${pageSize}&fields=${FILE_FIELDS}`);
    return r.files || [];
  }

  async function listRecent() {
    const folders = new Set(IDS.projekt);
    const q = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
    const r = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=100&fields=${FILE_FIELDS}`);
    return (r.files || []).filter(f => (f.parents || []).some(p => folders.has(p))).slice(0, 15);
  }

  async function exportText(fileId) {
    return api(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, { text: true });
  }

  async function loadAll() {
    const root = store.get(LS.root);
    if (!IDS || IDS.root !== root) { IDS = await discover(root); store.set(LS.ids, IDS); }
    const listMany = async ids => (await Promise.all(ids.map(id => listFolder(id)))).flat();
    const [kap, auf, prot, fromClaude, fromChatgpt, recent, fortsetzung] = await Promise.all([
      readSheet(IDS.register, IDS.registerTab),
      IDS.board ? readSheet(IDS.board, IDS.boardTab) : [],
      IDS.board && IDS.logTab ? readSheet(IDS.board, IDS.logTab).catch(() => []) : [],
      listMany(IDS.fromClaude),
      listMany(IDS.fromChatgpt),
      listRecent().catch(() => []),
      IDS.fortsetzung ? exportText(IDS.fortsetzung).catch(() => "") : ""
    ]);
    const messages = [
      ...fromClaude.map(f => ({ ...f, from: "claude" })),
      ...fromChatgpt.map(f => ({ ...f, from: "chatgpt" }))
    ].sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    return {
      loadedAt: new Date().toISOString(),
      chapters: parseChapters(kap),
      tasks: parseTasks(auf),
      log: parseLog(prot),
      messages,
      recent,
      fortsetzung: fortsetzung.replace(/^﻿/, "").trim()
    };
  }

  // ---------- Darstellung ----------

  let data = null;
  let view = "overview";
  const ui = { chapterFilter: "all", chapterSearch: "", taskFilter: "all", msgFilter: "all", fortsetzungOpen: false };

  const TITLES = { overview: "Übersicht", chapters: "Kapitel", tasks: "Aufgaben", messages: "Nachrichten" };

  function setView(v) {
    view = v;
    store.set(LS.view, v);
    document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    document.querySelectorAll(".view").forEach(s => { s.hidden = s.id !== "view-" + v; });
    $("#view-title").textContent = TITLES[v];
    if (v === "messages" && data) {
      store.set(LS.seen, data.messages[0]?.createdTime || new Date().toISOString());
      renderBadges();
    }
    window.scrollTo(0, 0);
  }

  function render() {
    if (!data) return;
    $("#last-loaded").textContent = (DEMO ? "Demo · " : "") + "Stand " + relTime(data.loadedAt);
    renderOverview();
    renderChapters();
    renderTasks();
    renderMessages();
    renderBadges();
  }

  function unseenMessages() {
    const seen = store.get(LS.seen);
    if (!seen) return [];
    return data.messages.filter(m => m.createdTime > seen);
  }

  function renderBadges() {
    const btn = $('.tabbar button[data-view="messages"]');
    btn.querySelector(".dot")?.remove();
    const n = unseenMessages().length;
    if (n && view !== "messages") btn.insertAdjacentHTML("beforeend", `<span class="dot">${n}</span>`);
  }

  function chip(label, color, extraClass = "") {
    return `<span class="chip ${extraClass}" style="--c:${color}">${esc(label)}</span>`;
  }
  function whoChip(text) {
    const w = who(text);
    return `<span class="chip plain who-${w.key}">${esc(w.label)}</span>`;
  }

  function renderOverview() {
    const ch = data.chapters;
    const total = Math.max(CFG.totalChapters, ch.length);
    const counts = Object.fromEntries(CHAPTER_STATUS.map(s => [s.key, 0]));
    ch.forEach(c => counts[c.statusKey]++);
    counts.open += Math.max(0, total - ch.length);
    const written = counts.draft + counts.review + counts.done;

    // In Kalendertagen (deutsche Zeit) rechnen, nicht in Stunden
    const deadline = new Date(CFG.deadline + "T12:00:00Z");
    const todayBerlin = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const daysLeft = Math.round((Date.parse(CFG.deadline) - Date.parse(todayBerlin)) / 86400000);
    const countdown = daysLeft < 0 ? "abgelaufen" : daysLeft === 0 ? "heute" : daysLeft === 1 ? "1 Tag" : daysLeft + " Tage";

    const activeTasks = data.tasks.filter(t => t.status.order <= 4);
    const review = data.tasks.filter(t => t.status.key === "ZUR_PRUEFUNG");
    const byClaude = activeTasks.filter(t => who(t.owner).key === "claude").length;
    const byGpt = activeTasks.filter(t => who(t.owner).key === "chatgpt").length;

    const latestMsgs = data.messages.slice(0, 3);
    const dayValue = d => { const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(d || ""); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
    const newestDrafts = ch.filter(c => c.statusKey !== "open").sort((a, b) => dayValue(b.updated) - dayValue(a.updated) || a.nr - b.nr);

    $("#view-overview").innerHTML = `
      <div class="card">
        <div class="hero">
          <div>
            <div class="big">${written}<span> / ${total}</span></div>
            <div class="muted small">Kapitel mindestens im Entwurf · ${counts.done} fertig</div>
          </div>
          <div class="countdown ${daysLeft <= 3 ? "urgent" : ""}">
            <b>${countdown}</b>
            <span class="small muted">bis ${fmtDay.format(deadline)}</span>
          </div>
        </div>
        <div class="stackbar" role="img" aria-label="Kapitelstatus">
          ${CHAPTER_STATUS.slice().reverse().map(s => counts[s.key] ? `<div style="flex:${counts[s.key]};background:${s.color}" title="${s.label}: ${counts[s.key]}"></div>` : "").join("")}
        </div>
        <div class="legend">
          ${CHAPTER_STATUS.map(s => `<span><i style="background:${s.color}"></i>${s.label} <b>${counts[s.key]}</b></span>`).join("")}
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat"><b>${review.length}</b><span>Ergebnisse warten auf Prüfung</span></div>
        <div class="stat"><b>${unseenMessages().length}</b><span>neue Nachrichten</span></div>
        <div class="stat"><b>${byClaude}</b><span>offene Aufgaben Claude</span></div>
        <div class="stat"><b>${byGpt}</b><span>offene Aufgaben ChatGPT</span></div>
      </div>

      <div class="section-label">Zuletzt bearbeitete Kapitel</div>
      <div class="card">
        ${newestDrafts.length ? `<ul class="list">${newestDrafts.slice(0, 6).map(chapterRow).join("")}</ul>` : `<div class="empty">Noch kein Kapitel begonnen.</div>`}
      </div>

      <div class="section-label">Neueste Nachrichten</div>
      <div class="card">
        ${latestMsgs.length ? latestMsgs.map(msgRow).join("") : `<div class="empty">Keine Nachrichten.</div>`}
        <button class="link-btn" data-goto="messages">Alle Nachrichten →</button>
      </div>

      ${data.fortsetzung ? `
      <div class="section-label">Fortsetzungspunkt</div>
      <div class="card">
        <div class="excerpt ${ui.fortsetzungOpen ? "open" : ""}" id="fortsetzung">${linkify(data.fortsetzung)}</div>
        <button class="link-btn" id="toggle-fortsetzung">${ui.fortsetzungOpen ? "Weniger anzeigen" : "Ganzen Text anzeigen"}</button>
      </div>` : ""}

      <div class="section-label">Zuletzt geänderte Dateien</div>
      <div class="card">
        ${data.recent.length ? `<ul class="list">${data.recent.slice(0, 10).map(fileRow).join("")}</ul>` : `<div class="empty">Keine Dateien gefunden.</div>`}
      </div>

      ${data.log.length ? `
      <div class="section-label">Protokoll</div>
      <div class="card"><ul class="list">${data.log.slice(0, 5).map(logRow).join("")}</ul>
        <button class="link-btn" data-goto="tasks">Ganzes Protokoll →</button></div>` : ""}
    `;
  }

  function chapterRow(c) {
    const s = statusInfo(c.statusKey);
    return `<li><button class="row" data-chapter="${c.nr}">
      <span class="num">${c.nr}</span>
      <span><div class="title">${esc(c.title)}</div><div class="sub">${esc(c.lastStep || "Noch nicht begonnen")}</div></span>
      ${chip(s.label, s.color)}
    </button></li>`;
  }

  function msgRow(m) {
    const urgent = /DRINGEND|WICHTIG/i.test(m.name);
    const isNew = unseenMessages().includes(m);
    const to = m.from === "claude" ? "an ChatGPT" : "an Claude";
    return `<div class="msg ${urgent ? "urgent" : ""}" data-msg="${m.id}">
      <div class="avatar ${m.from}">${m.from === "claude" ? "Cl" : "GPT"}</div>
      <div>
        <div class="meta"><b>${m.from === "claude" ? "Claude" : "ChatGPT"}</b> ${to} · ${relTime(m.createdTime)}
          ${isNew ? chip("Neu", "var(--accent)") : ""}${urgent ? chip("Dringend", "var(--accent)", "plain") : ""}</div>
        <div class="title">${esc(prettyName(msgTitle(m.name)))}</div>
      </div>
    </div>`;
  }

  function fileRow(f) {
    const k = fileKind(f);
    return `<li><a class="row" href="${esc(f.webViewLink)}" target="_blank" rel="noopener">
      <span class="avatar-sm">${k.key ? `<span class="chip plain who-${k.key}">${k.label}</span>` : `<span class="chip plain">Projekt</span>`}</span>
      <span><div class="title">${esc(prettyName(f.name))}</div><div class="sub">geändert ${relTime(f.modifiedTime)}</div></span>
      <span class="chev">›</span>
    </a></li>`;
  }

  function logRow(l) {
    return `<li><div class="row" style="cursor:default">
      ${whoChip(l.agent)}
      <span><div class="title">${esc(l.event)}</div><div class="sub">${esc(l.time)}${l.id ? " · " + esc(l.id) : ""}${l.next ? "<br>Nächstes: " + esc(l.next) : ""}</div></span>
      <span></span>
    </div></li>`;
  }

  function renderChapters() {
    const filters = [
      ["all", "Alle"], ["open", "Offen"], ["active", "In Arbeit"], ["review", "Prüfung"], ["done", "Fertig"]
    ];
    const q = ui.chapterSearch.toLowerCase();
    const list = data.chapters.filter(c => {
      const f = ui.chapterFilter;
      if (f === "active" && !["research", "draft"].includes(c.statusKey)) return false;
      if (!["all", "active"].includes(f) && c.statusKey !== f) return false;
      return !q || `${c.nr} ${c.title} ${c.workTitle} ${c.lastStep}`.toLowerCase().includes(q);
    });
    const el = $("#view-chapters");
    const hadFocus = document.activeElement?.id === "chapter-search";
    el.innerHTML = `
      <div class="toolbar">
        <input class="search" id="chapter-search" type="search" placeholder="Kapitel suchen …" value="${esc(ui.chapterSearch)}">
        <div class="filters">${filters.map(([k, l]) => `<button data-cfilter="${k}" class="${ui.chapterFilter === k ? "active" : ""}">${l}</button>`).join("")}</div>
      </div>
      <div class="card">${list.length ? `<ul class="list">${list.map(chapterRow).join("")}</ul>` : `<div class="empty">Keine Kapitel gefunden.</div>`}</div>
    `;
    if (hadFocus) { const i = $("#chapter-search"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function taskRow(t) {
    return `<li><button class="row" data-task="${esc(t.id)}">
      ${whoChip(t.owner)}
      <span><div class="title">${esc(t.id)} · ${esc(t.pkg)}</div><div class="sub">${t.chapter ? "Kap. " + esc(t.chapter) + " · " : ""}${esc(t.next || t.lastCheck)}</div></span>
      ${chip(t.status.label, t.status.color)}
    </button></li>`;
  }

  function renderTasks() {
    const filters = [["all", "Alle"], ["claude", "Claude"], ["chatgpt", "ChatGPT"], ["review", "Zur Prüfung"]];
    const list = data.tasks.filter(t => {
      if (ui.taskFilter === "review") return t.status.key === "ZUR_PRUEFUNG";
      if (ui.taskFilter !== "all") return who(t.owner).key === ui.taskFilter;
      return true;
    }).sort((a, b) => a.status.order - b.status.order);

    const groups = [];
    list.forEach(t => {
      const g = groups.find(g => g.key === t.status.key);
      g ? g.items.push(t) : groups.push({ key: t.status.key, label: t.status.label, items: [t] });
    });

    $("#view-tasks").innerHTML = `
      <div class="toolbar"><div class="filters">${filters.map(([k, l]) => `<button data-tfilter="${k}" class="${ui.taskFilter === k ? "active" : ""}">${l}</button>`).join("")}</div></div>
      ${groups.length ? groups.map(g => `
        <div class="section-label">${esc(g.label)} · ${g.items.length}</div>
        <div class="card"><ul class="list">${g.items.map(taskRow).join("")}</ul></div>`).join("") : `<div class="card empty">Keine Aufgaben.</div>`}
      ${data.log.length ? `<div class="section-label">Protokoll</div>
        <div class="card"><ul class="list">${data.log.slice(0, 25).map(logRow).join("")}</ul></div>` : ""}
    `;
  }

  function renderMessages() {
    const filters = [["all", "Alle"], ["claude", "Von Claude"], ["chatgpt", "Von ChatGPT"]];
    const list = data.messages.filter(m => ui.msgFilter === "all" || m.from === ui.msgFilter);
    const days = [];
    list.forEach(m => {
      const d = fmtDay.format(new Date(m.createdTime));
      const g = days.find(x => x.d === d);
      g ? g.items.push(m) : days.push({ d, items: [m] });
    });
    $("#view-messages").innerHTML = `
      <div class="toolbar"><div class="filters">${filters.map(([k, l]) => `<button data-mfilter="${k}" class="${ui.msgFilter === k ? "active" : ""}">${l}</button>`).join("")}</div></div>
      ${days.length ? days.map(g => `<div class="section-label">${g.d}</div><div class="card">${g.items.map(msgRow).join("")}</div>`).join("") : `<div class="card empty">Keine Nachrichten.</div>`}
    `;
  }

  // ---------- Detailansichten ----------

  const sheet = $("#sheet");
  function openSheet(title, html) {
    $("#sheet-title").textContent = title;
    $("#sheet-body").innerHTML = html;
    sheet.showModal();
    $("#sheet-body").scrollTop = 0;
  }
  const kv = pairs => `<dl class="kv">${pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${linkify(v)}</dd>`).join("")}</dl>`;

  function showChapter(nr) {
    const c = data.chapters.find(x => x.nr === nr);
    if (!c) return;
    const s = statusInfo(c.statusKey);
    const related = data.tasks.filter(t => t.chapter.split(/[\/,;\s]+/).includes(String(nr)));
    openSheet(`Kapitel ${c.nr}: ${c.title}`, `
      <p>${chip(s.label + (c.status && c.status !== s.label ? ` (${c.status})` : ""), s.color)} ${c.updated ? `<span class="small muted">aktualisiert ${esc(c.updated)}</span>` : ""}</p>
      <div class="actions">
        ${c.bookLink ? `<a class="btn primary" href="${esc(c.bookLink)}" target="_blank" rel="noopener">Kapiteltext öffnen</a>` : ""}
        ${c.dossierLink ? `<a class="btn" href="${esc(c.dossierLink)}" target="_blank" rel="noopener">Forschungsdossier öffnen</a>` : ""}
      </div>
      ${kv([
        ["Letzter Arbeitsschritt", c.lastStep],
        ["Lernziel für Leser", c.goal],
        ["Mindestinhalte", c.minContent],
        ["Primärquellen geprüft", c.sourcesChecked],
        ["Quellenqualität", c.quality],
        ["Fehlende Inhalte / Forschungsbedarf", c.need],
        ["Geplante Seiten", c.pages],
        ["Dopplungen / Sorgfalt", c.overlap],
        ["Redaktionsnotizen", c.notes]
      ])}
      ${related.length ? `<div class="section-label">Aufgaben zu diesem Kapitel</div><ul class="list">${related.map(taskRow).join("")}</ul>` : ""}
    `);
  }

  function showTask(id) {
    const t = data.tasks.find(x => x.id === id);
    if (!t) return;
    openSheet(`${t.id}`, `
      <p>${chip(t.status.label, t.status.color)} ${whoChip(t.owner)} ${t.prio ? `<span class="chip plain">${esc(t.prio)}</span>` : ""}</p>
      <p><b>${esc(t.pkg)}</b></p>
      ${kv([
        ["Kapitel", t.chapter],
        ["Nächster Schritt", t.next],
        ["Letzte Prüfung", t.lastCheck],
        ["Ergebnis", t.result],
        ["Gegenprüfung durch", t.reviewer],
        ["Review", t.review],
        ["Abhängigkeit", t.depends],
        ["Notiz", t.note],
        ["Autorenfreigabe", t.approval],
        ["Angelegt", t.created]
      ])}
    `);
  }

  async function showMessage(id) {
    const m = data.messages.find(x => x.id === id);
    if (!m) return;
    const sender = m.from === "claude" ? "Claude → ChatGPT" : "ChatGPT → Claude";
    openSheet(prettyName(msgTitle(m.name)), `
      <p class="small muted">${sender} · ${fmtDate.format(new Date(m.createdTime))}</p>
      <div class="actions"><a class="btn" href="${esc(m.webViewLink)}" target="_blank" rel="noopener">In Google Docs öffnen</a></div>
      <div id="msg-text" style="margin-top:16px">${[1, 2, 3, 4].map(() => '<div class="skeleton"></div>').join("")}</div>
    `);
    try {
      const txt = DEMO ? (window.DEMO_DATA.messageTexts[id] || "") : await exportText(id);
      $("#msg-text").innerHTML = `<div class="excerpt open">${linkify(txt.replace(/^﻿/, "").trim() || "(leer)")}</div>`;
    } catch (e) {
      $("#msg-text").innerHTML = `<p class="error">Text konnte nicht geladen werden: ${esc(e.message)}</p>`;
    }
  }

  // ---------- Ereignisse ----------

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-view],[data-goto],[data-chapter],[data-task],[data-msg],[data-cfilter],[data-tfilter],[data-mfilter],#toggle-fortsetzung");
    if (!t) return;
    const d = t.dataset;
    if (d.view) setView(d.view);
    else if (d.goto) setView(d.goto);
    else if (d.chapter) showChapter(Number(d.chapter));
    else if (d.task) { if (sheet.open) sheet.close(); showTask(d.task); }
    else if (d.msg) showMessage(d.msg);
    else if (d.cfilter) { ui.chapterFilter = d.cfilter; renderChapters(); }
    else if (d.tfilter) { ui.taskFilter = d.tfilter; renderTasks(); }
    else if (d.mfilter) { ui.msgFilter = d.mfilter; renderMessages(); }
    else if (t.id === "toggle-fortsetzung") { ui.fortsetzungOpen = !ui.fortsetzungOpen; renderOverview(); }
  });
  document.addEventListener("input", e => {
    if (e.target.id === "chapter-search") { ui.chapterSearch = e.target.value; renderChapters(); }
  });
  $("#sheet-close").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });

  $("#refresh-btn").addEventListener("click", () => refresh());
  $("#menu-btn").addEventListener("click", () => {
    const t = store.get(LS.token);
    openSheet("Konto", `
      <p>${DEMO ? "Demo-Modus – keine echten Daten." : `Angemeldet als <b>${esc(t?.email || "–")}</b>.`}</p>
      <p class="small muted">Die App liest Google Drive nur und ändert dort nichts.</p>
      <div class="actions">
        ${DEMO ? `<a class="btn primary" href="${location.pathname}">Zur Anmeldung</a>` : `<button class="btn" id="logout-btn">Abmelden</button>`}
        ${IDS && !DEMO ? `
        <a class="btn" href="https://drive.google.com/drive/folders/${IDS.root}" target="_blank" rel="noopener">Projektordner in Drive öffnen</a>
        <a class="btn" href="https://docs.google.com/spreadsheets/d/${IDS.register}" target="_blank" rel="noopener">Kapitel-Tabelle öffnen</a>
        ${IDS.board ? `<a class="btn" href="https://docs.google.com/spreadsheets/d/${IDS.board}" target="_blank" rel="noopener">Aufgaben-Tabelle öffnen</a>` : ""}
        <button class="btn" id="change-folder-btn">Projektordner ändern</button>` : ""}
      </div>
    `);
    $("#logout-btn")?.addEventListener("click", logout);
    $("#change-folder-btn")?.addEventListener("click", () => {
      sheet.close();
      store.del(LS.root); store.del(LS.ids); store.del(LS.cache); IDS = null; data = null;
      showGate();
    });
  });

  function logout() {
    const t = store.get(LS.token);
    if (t?.token) fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t.token), { method: "POST" }).catch(() => {});
    store.del(LS.token);
    store.del(LS.cache);
    store.del(LS.ids);
    store.del(LS.root);
    location.replace(location.pathname);
  }

  // ---------- Start ----------

  function showGate(error) {
    $("#app").hidden = true;
    $("#gate").hidden = false;
    const mode = !clientId() ? "setup" : !validToken() ? "login" : "folder";
    $("#gate-setup").hidden = mode !== "setup";
    $("#gate-login").hidden = mode !== "login";
    $("#gate-folder").hidden = mode !== "folder";
    $("#gate-error").hidden = !error;
    $("#gate-error").textContent = error || "";
  }

  function showApp() {
    $("#gate").hidden = true;
    $("#app").hidden = false;
  }

  function banner(msg) {
    $("#banner").hidden = !msg;
    $("#banner").textContent = msg || "";
  }

  async function refresh() {
    if (DEMO) { data = { ...window.DEMO_DATA, loadedAt: new Date().toISOString() }; render(); return; }
    const btn = $("#refresh-btn");
    btn.classList.add("spinning");
    try {
      try {
        data = await loadAll();
      } catch (e) {
        // Dateien könnten umbenannt oder ersetzt worden sein: einmal neu suchen
        if (e instanceof AuthError || !IDS) throw e;
        IDS = null; store.del(LS.ids);
        data = await loadAll();
      }
      store.set(LS.cache, data);
      if (!store.get(LS.seen)) store.set(LS.seen, data.messages[0]?.createdTime || "");
      banner("");
      render();
    } catch (e) {
      if (e instanceof AuthError) { startLogin(); return; }
      banner("Daten konnten nicht geladen werden: " + e.message);
    } finally {
      btn.classList.remove("spinning");
    }
  }

  async function init() {
    $("#save-client-id").addEventListener("click", () => {
      const v = $("#client-id-input").value.trim();
      if (!/\.apps\.googleusercontent\.com$/.test(v)) { showGate("Das sieht nicht wie eine Client-ID aus (endet auf .apps.googleusercontent.com)."); return; }
      store.set(LS.clientId, v);
      showGate();
    });
    $("#login-btn").addEventListener("click", startLogin);
    $("#save-folder").addEventListener("click", async () => {
      const id = folderIdFromLink($("#folder-input").value);
      if (!id) { showGate("Bitte den Link zum Projektordner aus Google Drive einfügen."); return; }
      const btn = $("#save-folder");
      btn.disabled = true; btn.textContent = "Ordner wird durchsucht …";
      try {
        IDS = await discover(id);
        store.set(LS.root, id);
        store.set(LS.ids, IDS);
        showApp();
        setView("overview");
        await refresh();
      } catch (e) {
        if (e instanceof AuthError) { startLogin(); return; }
        showGate(e.message);
      } finally {
        btn.disabled = false; btn.textContent = "Ordner verbinden";
      }
    });

    if (DEMO) {
      showApp();
      store.set(LS.seen, window.DEMO_DATA.messages[2]?.createdTime);
      await refresh();
      setView("overview");
      return;
    }

    let fresh;
    try { fresh = consumeRedirect(); } catch (e) { showGate(e.message); return; }

    if (fresh) {
      try {
        store.set(LS.token, fresh);
        const me = await api("https://openidconnect.googleapis.com/v1/userinfo");
        if (!me.email || !(await emailAllowed(me.email))) {
          store.del(LS.token);
          showGate(`Das Konto ${me.email || ""} hat keinen Zugriff. Bitte mit dem Projektkonto anmelden.`);
          return;
        }
        if (store.get(LS.email) !== me.email) { store.del(LS.ids); store.del(LS.cache); store.del(LS.root); IDS = null; }
        store.set(LS.email, me.email);
        store.set(LS.token, { ...fresh, email: me.email });
      } catch (e) {
        store.del(LS.token);
        showGate("Anmeldung fehlgeschlagen: " + e.message);
        return;
      }
    }

    if (!clientId() || !validToken()) {
      // Abgelaufene Sitzung mit bekanntem Konto: direkt neu anmelden statt Startseite zeigen
      if (clientId() && store.get(LS.token)) { startLogin(); return; }
      showGate();
      return;
    }

    if (!store.get(LS.root)) { showGate(); return; }

    showApp();
    const cached = store.get(LS.cache);
    if (cached) { data = cached; render(); }
    setView(store.get(LS.view) || "overview");
    await refresh();
  }

  init();
})();
