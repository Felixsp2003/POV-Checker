# Grand RP DC Checker — Installation

Kostenlos, ohne Server. Läuft als statische Website (z. B. GitHub Pages).

## 1. Website bauen

```bash
npm install
npm run build
```

Danach liegt alles in `dist/`:

```
dist/
├── index.html                    ← die App
├── oauth-callback.html           ← Google OAuth
├── manual.html                   ← manuelle Korrektur
└── ACP-Browser-Extension/        ← Browser-Extension
    ├── manifest.json
    ├── background.js
    ├── website-bridge.js
    ├── content.js
    ├── dc-receiver.js
    └── README.md
```

## 2. Website veröffentlichen (GitHub Pages, kostenlos)

1. Neues **privates oder öffentliches Repo** auf GitHub anlegen (z. B. `dc-checker`).
2. Alle Dateien aus `dist/` in das Repo hochladen (kein Unterordner — `index.html` muss oben liegen).
3. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch `main`, Ordner `/ (root)` → Save.
4. Nach ~1 Minute ist die Seite erreichbar:
   `https://DEINNAME.github.io/dc-checker/`

**Wichtig:** Die Adresse darf sich nicht mehr ändern. localStorage/IndexedDB sind pro Adresse gespeichert.
Bei einem Adresswechsel sieht die App leer aus — dann Tresor wiederherstellen.

### Schnell lokal testen

```bash
npm run dev
```

Dann `http://localhost:5173` öffnen. Läuft der Checker nur lokal, in der
`ACP-Browser-Extension/manifest.json` beim zweiten `matches`-Eintrag die eigene Domain ergänzen.

## 3. Browser-Extension installieren

1. `chrome://extensions` öffnen (Edge: `edge://extensions`).
2. **Entwicklermodus** einschalten (oben rechts).
3. **Entpackte Erweiterung laden** klicken.
4. Den Ordner `ACP-Browser-Extension` auswählen.
5. Prüfen: Extension „GrandRP ACP Bridge“ erscheint.

Läuft der Checker nicht auf `github.io` / `localhost`, in der `manifest.json` das zweite
`content_scripts` → `matches` um die eigene Adresse ergänzen und die Erweiterung neu laden.

## 4. Login

Erster Login:

- Benutzer: **Adam**
- Passwort: **Admin**

Direkt danach sperrt sich die App und erzwingt ein eigenes Passwort
(min. 8 Zeichen, Buchstaben und Zahlen). Erst dann ist sie nutzbar.

Im Quellcode steht **kein persönliches Passwort** mehr, nur dieser öffentliche
Standardzugang. Gespeichert wird ausschließlich ein SHA-256-Hash mit Salt.

**Wichtig:** Das Passwort ist zugleich der Schlüssel für den AES-256-Tresor.
Ohne dieses Passwort kann niemand die Cloud-Backups lesen — auch nicht Google
oder GitHub. Eine Wiederherstellung gibt es nicht. Also sicher notieren.

Passwort später ändern: Einstellungen → Benutzer → „Passwort ändern“.

## 5. Tresor für einen anderen PC

Einstellungen → **Tresor / anderer PC**

- Variante A: **Google Drive verbinden**
- Variante B: **GitHub Gist** (Token mit Recht `gist`, Gist-ID auf beiden PCs gleich)

Beide Varianten sichern **AES-256-verschlüsselt**. Ohne dein Passwort sind die Backups
unlesbar. Backup: „Jetzt alles sichern“. Zweiter PC: „Auf diesem PC wiederherstellen“.

## 6. YouTube (optional)

1. Google Cloud Console → Projekt anlegen (kostenlos).
2. **YouTube Data API v3** aktivieren.
3. OAuth-Client-ID (Webanwendung) erstellen.
4. Autorisierte JavaScript-Quelle: deine GitHub-Pages-URL.
5. Client-ID im Checker unter Einstellungen → Allgemein eintragen.
6. Einstellungen → YouTube ×3 → „Verbinden“.

Ohne Verbindung läuft der Upload als Simulation (Ablauf testbar, kein echtes Video).
