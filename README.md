# Grand RP DC Checker — Installation (GitHub Pages, kostenlos)

Diese Version braucht **kein Node.js und keine Konsole** auf deinem PC.
GitHub baut die Website automatisch.

## Schritt 1 — Dateien ins Repo hochladen

Auf https://github.com/Felixsp2003/POV-Checker klicken:

> „uploading an existing file"

Dann alle Dateien **aus dem Projekt** hochladen (nicht nur `dist`, es gibt hier nichts
zu bauen). Es müssen enthalten sein:

```
.github/workflows/deploy.yml
src/                  (ganzer Ordner)
public/               (ganzer Ordner, inkl. ACP-Browser-Extension)
index.html
package.json
tsconfig.json
vite.config.ts
README.md
.gitignore
```

**Nicht** hochladen, falls vorhanden: `node_modules/`, `dist/`.

Danach unten **„Commit changes"** klicken.

## Schritt 2 — GitHub Pages aktivieren

1. Repo → **Settings** (oben im Menü).
2. Links **Pages** wählen.
3. Bei „Source" auf **GitHub Actions** stellen.
4. Zurück auf **Code** → oben auf **Actions** klicken.
5. Die Meldung bestätigen, falls GitHub nachfragt.

Der Build läuft jetzt automatisch. Nach etwa einer Minute ist die Seite online:

**https://felixsp2003.github.io/POV-Checker/**

## Schritt 3 — Anmelden

- Benutzer: `Adam`
- Passwort: `Admin`

Danach zwingt dich die App, ein eigenes Passwort zu setzen (min. 8 Zeichen,
Buchstaben und Zahlen). Dieses Passwort ist gleichzeitig der Schlüssel für den
verschlüsselten Cloud-Tresor. Sicher notieren — es gibt keine Wiederherstellung.

## Schritt 4 — Browser-Extension (nur für den SC-Abruf aus dem ACP)

1. Im Repo den Ordner `public/ACP-Browser-Extension` herunterladen
   (auf den Ordner → Download-ZIP rechts oben) und entpacken.
2. Chrome/Edge: `chrome://extensions` öffnen.
3. **Entwicklermodus** einschalten.
4. **Entpackte Erweiterung laden** → den Ordner `ACP-Browser-Extension` wählen.
5. Ordner dauerhaft liegen lassen, nicht verschieben.

Die Extension läuft auf `github.io` — für deine Adresse ist das bereits korrekt
konfiguriert. Ohne sie läuft die App trotzdem, nur der automatische SC-Abruf fehlt.

## Schritt 5 — Tresor für einen zweiten PC

In der App: **Einstellungen → Tresor / anderer PC**

- Variante A: Google Drive verbinden
- Variante B: GitHub Gist (Token mit Recht `gist`, Gist-ID auf beiden PCs gleich)

Beide Varianten sichern **AES-256-verschlüsselt**. Ohne dein Passwort sind die
Backups unlesbar. Auf dem zweiten PC: anmelden → „Auf diesem PC wiederherstellen".

## Alternative: lokal bauen

Falls du Node.js installieren möchtest:

```bash
npm install
npm run build
```

Danach liegt die fertige Seite im Ordner `dist/`. Deren Inhalt kannst du ebenso
direkt ins Repo hochladen (dann `Settings → Pages → Deploy from a branch`).

## Wichtig

- **Adresse nie ändern.** Browser-Daten sind pro Adresse gespeichert.
  Neue Adresse = leeres Archiv (Tresor wiederherstellen).
- **Repo ist Public.** Das ist für kostenlose GitHub Pages normal. Deine POV-Daten
  liegen **nicht** im Repo, sondern im Browser und verschlüsselt im Tresor.
- Jeder Push auf `main` startet automatisch einen neuen Build.
