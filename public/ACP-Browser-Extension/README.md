# GrandRP ACP Bridge (kostenlos)

Verbindet das Grand RP Admin Panel mit dem DC Checker.

## Installation (Chrome / Edge / Brave)
1. `chrome://extensions` öffnen (Edge: `edge://extensions`).
2. **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** → diesen Ordner `ACP-Browser-Extension` wählen.
4. Falls dein DC Checker NICHT auf `*.github.io`, `localhost` oder `127.0.0.1` läuft:
   in `manifest.json` bei dem zweiten `content_scripts`-Eintrag deine Adresse unter `matches` ergänzen
   (z. B. `"https://meine-domain.de/*"`), dann die Erweiterung neu laden.

## Ablauf
DC Checker → „ACP/SC“ klicken → ACP-Tab öffnet sich (mit `dc_id` + `dc_bridge`) → Extension liest den SocialClub →
sendet ihn mit Token zurück → der DC Checker trägt ihn ein.

## Sicherheit
Nachrichten ohne gültigen `bridgeToken` (Einstellungen → ACP / Extension) werden von der App verworfen.
