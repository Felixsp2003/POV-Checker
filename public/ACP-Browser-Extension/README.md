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
DC Checker → „SC aus ACP holen“ → ACP-Tab öffnet sich (mit `dc_id` + `dc_bridge`) →
Extension liest SocialClub und BannGrund → sendet beides mit Token zurück → Tab schließt sich.

## Stört die normale Adminarbeit nicht
Die Extension ist **nur in dem einen Tab aktiv**, der aus dem DC Checker geöffnet wurde.
Der Token liegt in `sessionStorage` und gilt damit ausschließlich für diesen Tab.
Dieser Tab trägt im Titel ein `🔎 DC ·`.

In allen anderen ACP-Tabs passiert **nichts**: kein Info-Fenster, kein Button, kein automatisches
Schließen, kein Auslesen. Du kannst das Adminpanel dort ganz normal benutzen.

## Sicherheit
Nachrichten ohne gültigen `bridgeToken` (Einstellungen → ACP) werden von der App verworfen.
