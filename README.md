# Grand RP DC Checker — Installation

Kostenlos, ohne Server. Läuft als statische Website (z. B. GitHub Pages).

## 1. Hochladen (kein Node.js nötig — GitHub baut automatisch)

1. Neues **öffentliches** Repo auf GitHub anlegen (Pages ist im Gratis-Tarif nur für öffentliche Repos;
   der Code enthält keine Geheimnisse).
2. Im leeren Repo auf **„uploading an existing file“** klicken.
3. Diese Dateien/Ordner aus dem Projekt in das Browserfenster ziehen:

   ```
   .github/   src/   public/
   index.html   package.json   tsconfig.json   vite.config.ts   README.md   .gitignore
   ```

   **Nicht** hochladen: `node_modules/` und `dist/`.
4. Grünen Button **„Commit changes“** klicken.

## 2. GitHub Pages einschalten

1. Repo → **Settings → Pages**.
2. „Build and deployment → Source“: **GitHub Actions** wählen.
3. Reiter **Actions** öffnen — der Lauf „Deploy DC Checker“ dauert ~2 Minuten. Grüner Haken = online.
   Ist der erste Lauf rot: Schritt 2 prüfen, dann **„Re-run all jobs“**.
4. Adresse: `https://DEINNAME.github.io/REPO-NAME/`

**Wichtig:** Die Adresse darf sich nicht mehr ändern. localStorage/IndexedDB sind pro Adresse gespeichert.
Bei einem Adresswechsel sieht die App leer aus — dann Tresor wiederherstellen.

Updates: geänderte Dateien erneut hochladen — GitHub baut automatisch neu.

### Alternative: selbst bauen

```bash
npm install
npm run build
```

Danach nur den Inhalt von `dist/` hochladen und bei Pages „Deploy from a branch“ (`main`, `/ (root)`) wählen.

### Lokal testen

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

## 4b. Alte Daten (App V153) übernehmen

Die neue App verwendet **dieselben Speicher-Keys und dasselbe Datenformat** wie die alte
(`grandrp_pov_meta_v42`, IndexedDB `grandrp_pov_db_v42/videos`, `grandrp_pc_checker_custom_v1`,
YouTube-Client-IDs aus `grandrp_youtube_connections_v89`).

- Läuft die neue App unter derselben Domain (`felixsp2003.github.io`), sind alle Einträge sofort da.
- Altes Drive-Backup (`"format":"grandrp-cloud-archive"`) → Einstellungen → Tresor →
  **Backup importieren**. Einträge werden vereinigt, nichts wird überschrieben; YouTube-Client-IDs
  werden mit übernommen.
- Neue Backups werden im selben Format geschrieben — die alte App könnte sie ebenfalls lesen.
- Prüfansicht, Gründe-Liste, PC-Checker, Bann-Typen, Auto-Perma-Regeln und CSV-Spalten
  (Proof · Datum · ID · SOC · RID · Discord ID · Familie · Ergebnis · Grund · Admin 1–5)
  entsprechen der alten App.

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
