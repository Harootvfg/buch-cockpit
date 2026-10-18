# Buch-Cockpit – Das große Buch über die Êzîden

Übersicht über das Buchprojekt: Kapitelstand, Aufgaben von Claude und ChatGPT,
Nachrichten zwischen beiden und zuletzt geänderte Dateien – direkt aus Google Drive.

- Läuft in Safari und als App auf dem iPhone-Home-Bildschirm
- Liest Google Drive **nur** (ändert nichts)
- Zugriff nur für die in Google eingetragenen Testnutzer
- In diesem Repository stehen keine Buchinhalte, keine Datei-IDs, keine Dateinamen und keine Kontodaten.
  Der Projektordner wird beim ersten Start in der App verknüpft und nur auf dem Gerät gespeichert.

**Demo ohne Anmeldung:** `…/?demo`

## Wie die App die Daten findet

Nach dem Einfügen des Ordner-Links durchsucht die App den Ordner samt Unterordnern:

| Bereich in der App | Gesucht wird … |
|---|---|
| Kapitel | eine Tabelle mit „Kapitel“ im Namen, darin das Blatt mit „Kapitel“ im Namen |
| Aufgaben / Protokoll | eine Tabelle mit „Aufgaben“, „Aufträge“ oder „Board“ im Namen; Blätter „Aufträge“ und „Protokoll“ |
| Nachrichten | Ordner, deren Name Claude und ChatGPT nennt; der Empfänger steht nach „an“ (z. B. „an ChatGPT von Claude“) |
| Fortsetzungspunkt | ein Dokument mit „Fortsetz…“ im Namen |

Spalten werden über ihre Überschrift gefunden (Nr., Status, Letzter Arbeitsschritt, …) – neue Spalten stören nicht.
Abgabedatum und Kapitelzahl stehen in `config.js`.

## Einrichtung (einmalig, ca. 10 Minuten)

### 1. GitHub Pages einschalten
Repository → **Settings** → **Pages** → *Source: Deploy from a branch* → Branch `main`, Ordner `/ (root)` → **Save**.
Nach 1–2 Minuten ist die App erreichbar unter
`https://harootvfg.github.io/buch-cockpit/`

### 2. Google-Zugang anlegen
Mit dem **Google-Konto, dem das Buchprojekt gehört**, auf <https://console.cloud.google.com> anmelden.

1. Oben **Projekt auswählen → Neues Projekt** → Name z. B. `Buch-Cockpit` → Erstellen.
2. **APIs & Dienste → Bibliothek**: **Google Drive API** aktivieren, danach **Google Sheets API** aktivieren.
3. **APIs & Dienste → OAuth-Zustimmungsbildschirm** (bzw. *Google Auth Platform*):
   - Nutzertyp **Extern**, App-Name `Buch-Cockpit`, Support-E-Mail = dein Konto.
   - **Testnutzer / Zielgruppe**: das Projektkonto hinzufügen.
   - Die App im Status **Testen** lassen – dann kann sich niemand außer den Testnutzern anmelden.
4. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**:
   - Anwendungstyp: **Webanwendung**
   - Autorisierte JavaScript-Quellen: `https://harootvfg.github.io`
   - Autorisierte Weiterleitungs-URIs: `https://harootvfg.github.io/buch-cockpit/`
   - Erstellen → die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`).

### 3. App öffnen
App-Adresse in Safari öffnen → Client-ID einfügen → **Mit Google anmelden** →
Link zum Projektordner aus Google Drive einfügen → **Ordner verbinden**.
Google zeigt beim ersten Mal den Hinweis „Google hat diese App nicht überprüft“ –
das ist bei privaten Apps normal: **Erweitert → Zu Buch-Cockpit wechseln** → Zugriff erlauben.

### 4. Aufs iPhone legen
In Safari: **Teilen** → **Zum Home-Bildschirm**.

> Google meldet die App aus Sicherheitsgründen nach etwa einer Stunde ab.
> Beim nächsten Öffnen leitet sie automatisch zur Google-Anmeldung und zurück.

## Lokal ansehen
`python3 -m http.server` im Ordner starten und `http://localhost:8000/?demo` öffnen.
