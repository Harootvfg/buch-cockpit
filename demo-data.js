// Beispieldaten für den Demo-Modus (?demo) – keine echten Projektinhalte.
(() => {
  const now = Date.now();
  const ago = h => new Date(now - h * 3600e3).toISOString();
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const status = n => n <= 3 ? "Entwurf" : n === 4 ? "Quellenprüfung" : n === 5 ? "Recherche" : "Offen";
  const chapters = Array.from({ length: 46 }, (_, i) => {
    const nr = i + 1, s = status(nr);
    return {
      nr, title: `Beispielkapitel ${nr}`, workTitle: "", status: s,
      statusKey: { Entwurf: "draft", "Quellenprüfung": "review", Recherche: "research", Offen: "open" }[s],
      lastStep: s === "Offen" ? "" : `Beispiel: ${s} gespeichert`, updated: s === "Offen" ? "" : today,
      bookLink: nr <= 3 ? "https://docs.google.com/document/d/beispiel" : "", dossierLink: "",
      sourcesChecked: nr <= 4 ? "Teilweise" : "Nein", quality: "E – ungeprüft",
      need: "Fachquellen kapitelweise abgleichen.", priority: "", notes: "", pages: String(3 + (nr % 5)),
      goal: "Beispiel-Lernziel für Leser", minContent: "Inhalt A; Inhalt B; Inhalt C", overlap: ""
    };
  });
  const T = (id, chapter, pkg, owner, key, label, color, order, next) =>
    ({ id, chapter, pkg, owner, status: { key, label, color, order }, prio: "HOCH", created: "", lastCheck: "", result: "", reviewer: "", review: "", depends: "", next, note: "", approval: "" });
  const tasks = [
    T("A-4", "4", "Kapitel 4 schreiben", "Claude", "IN_ARBEIT", "In Arbeit", "var(--st-research)", 0, "Erstentwurf fertigstellen"),
    T("A-3", "3", "Kapitel 3 Erstentwurf", "Claude", "ZUR_PRUEFUNG", "Zur Prüfung", "var(--st-review)", 2, "ChatGPT prüft Quellen"),
    T("P-3", "3", "Quellenprüfung Kapitel 3", "ChatGPT", "OFFEN", "Offen", "var(--st-draft)", 3, "Prüfung beginnen"),
    T("R-5", "5", "Recherche Kapitel 5", "ChatGPT", "WARTET", "Wartet", "var(--st-wait)", 5, "Auf Originalquelle warten")
  ];
  const msg = (id, from, name, h) => ({ id, from, name, createdTime: ago(h), modifiedTime: ago(h), webViewLink: "https://docs.google.com/document/d/beispiel" });
  window.DEMO_DATA = {
    chapters, tasks,
    log: [
      { time: today, agent: "Claude", id: "A-3", event: "Kapitel 3 Erstentwurf abgegeben", after: "ZUR_PRUEFUNG", proof: "", next: "ChatGPT prüft" },
      { time: today, agent: "ChatGPT", id: "K-1", event: "Aufgaben abgeglichen", after: "", proof: "", next: "" }
    ],
    messages: [
      msg("m1", "chatgpt", "Rückfragen zu Kapitel 3", 0.5),
      msg("m2", "claude", "Dringend: Kapitel 3 zur Prüfung", 2),
      msg("m3", "claude", "Kapitel 2 fertig", 20),
      msg("m4", "chatgpt", "Startauftrag", 30)
    ],
    messageTexts: {
      m1: "Hallo Claude,\n\nzu Kapitel 3 habe ich zwei Rückfragen zu den Quellen …\n\n(Beispieltext)",
      m2: "Kapitel 3 liegt zur Prüfung bereit. Bitte Quellen gegenprüfen.\n\n(Beispieltext)"
    },
    recent: [
      { id: "f1", name: "Kapitel 3 – Entwurf (Claude)", parents: [], modifiedTime: ago(2), webViewLink: "#" },
      { id: "f2", name: "Kapitel 2 – Quellenprüfung (ChatGPT)", parents: [], modifiedTime: ago(5), webViewLink: "#" },
      { id: "f3", name: "Kapitelübersicht", parents: [], modifiedTime: ago(6), webViewLink: "#" }
    ],
    fortsetzung: "Arbeitsstand (Beispiel)\n\nAktueller Stand: Kapitel 1–3 im Entwurf. Nächster Schritt: Kapitel 4 schreiben, Kapitel 3 prüfen lassen.\n\nOffene Fragen: …"
  };
})();
