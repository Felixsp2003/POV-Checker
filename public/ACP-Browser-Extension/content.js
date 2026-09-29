// content.js — läuft auf admin.gta5grand.com
// Stufe 1  /logs/authorization?characterid=<ID>  → SocialClub-Hash (40 hex)
// Stufe 2  /character/info/<ID>                  → roter Kasten „Reason: …“ + SocialClub-Name/ID
(function () {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const REASONS = ["PC-Check Verweigerung - Trolling", "PC-Check Verweigerung", "PC-Check Positiv 4.1 (Discord)",
    "PC-Check Positiv 4.1 (Redux)", "PC-Check Positiv - Cleaning", "PC Check Positiv (Banevading)",
    "PC Check Positiv (Covering Cheater)", "PC-Check Positiv", "Event 1.7 (NoPov in PC Check)",
    "Acc 1.4 (Twink)", "Acc 1.4 (Main)", "Cheater"];
  const flat = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  function param(n) { try { return new URL(location.href).searchParams.get(n) || ""; } catch (e) { return ""; } }
  function serverNo() { const p = location.pathname.split("/"); return /^\d+$/.test(p[2]) ? p[2] : "3"; }
  function targetId() {
    let id = param("dc_id") || param("characterid");
    if (!id) { const m = location.pathname.match(/\/character\/info\/(\d+)/); if (m) id = m[1]; }
    if (id) { try { sessionStorage.setItem("dc_target_id", id); } catch (e) { /* egal */ } return id; }
    try { return sessionStorage.getItem("dc_target_id") || ""; } catch (e) { return ""; }
  }
  const body = () => (document.body && document.body.innerText) || "";

  function findSC() {
    const b = body();
    const m = b.match(/\b([a-f0-9]{40})\b/i) || b.match(/\b([a-f0-9]{32})\b/i);
    if (m) return m[1];
    const el = document.querySelector("[data-sc], [data-socialclub]");
    return el ? (el.getAttribute("data-sc") || el.getAttribute("data-socialclub") || "") : "";
  }
  // Roter Kasten: „Account has been banned for 60 days / Administrator: … / Reason: … / Date: …“
  function findBan() {
    const b = body();
    const raw = (b.match(/Reason\s*:\s*([^\n\r]+)/i) || [])[1] || "";
    let best = "";
    if (raw) { const f = flat(raw); for (const r of REASONS) if (f.indexOf(flat(r)) !== -1 && r.length > best.length) best = r; }
    return {
      raw: raw.trim(), reason: best || raw.trim(),
      admin: ((b.match(/Administrator\s*:\s*([^\n\r]+)/i) || [])[1] || "").trim(),
      banDate: ((b.match(/Date\s*:\s*(\d{4}-\d{2}-\d{2})/i) || [])[1] || "").trim(),
      socialName: ((b.match(/SocialClub\s*\n?\s*([A-Za-z0-9_.-]{3,40})/i) || [])[1] || "").trim(),
      socialId: ((b.match(/SocialClub\s*ID\s*\n?\s*(\d{4,15})/i) || [])[1] || "").trim(),
    };
  }

  let box;
  function panel(text, tone) {
    if (!document.body) return;
    if (!box) {
      box = document.createElement("div");
      box.id = "dc-acp-panel";
      box.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:340px;background:#0d1424;color:#e6ecf7;" +
        "border:1px solid #2a3a5c;border-left:5px solid #f59e0b;padding:12px 14px;border-radius:12px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)";
      document.body.appendChild(box);
    }
    box.style.borderLeftColor = tone === "ok" ? "#22c55e" : tone === "err" ? "#ef4444" : "#f59e0b";
    box.innerHTML = "<b>DC Checker Bridge</b><br>" + text;
  }

  function token() { return window.__DC_TOKEN ? window.__DC_TOKEN() : ""; }
  function send(payload) { return !!(token() && window.__DC_SEND && window.__DC_SEND(payload)); }

  const isInfo = /\/character\/info\/\d+/.test(location.pathname);
  const isAuth = /\/logs\/authorization/.test(location.pathname);

  async function runAuth() {
    const id = targetId();
    panel("Suche SocialClub für ID <b>" + (id || "?") + "</b> …", "info");
    for (let i = 0; i < 30; i++) {
      if (i === 2) await sleep(2500);                    // Ladezeit der Tabelle abwarten
      const sc = findSC();
      if (sc) {
        const ok = send({ type: "SC_RESULT", targetId: id, sc: sc });
        panel((ok ? "SC gesendet ✓" : "SC gefunden, Senden fehlgeschlagen") +
          "<br><code style='font-size:11px;word-break:break-all'>" + sc + "</code>" +
          (id ? "<br>Öffne Character-Info für den BannGrund …" : ""), ok ? "ok" : "err");
        if (id) { await sleep(1200); location.href = "/de/" + serverNo() + "/character/info/" + id + "?dc_id=" + id + "&dc_stage=info"; }
        return;
      }
      await sleep(1000);
    }
    panel("Keine SocialClub-ID gefunden.<br>Prüfe, ob der Filter <b>Character ID</b> Treffer liefert, dann <b>🔎 Senden</b> klicken.", "err");
  }

  async function runInfo() {
    const id = targetId();
    panel("Lese BannGrund für ID <b>" + (id || "?") + "</b> …", "info");
    await sleep(2500);                                    // roter Kasten braucht Ladezeit
    for (let i = 0; i < 20; i++) {
      const b = findBan();
      if (b.raw) {
        const ok = send({ type: "REASON_RESULT", targetId: id, reason: b.reason, rawReason: b.raw, admin: b.admin, banDate: b.banDate, socialName: b.socialName, socialId: b.socialId });
        panel((ok ? "BannGrund gesendet ✓" : "Gefunden, Senden fehlgeschlagen") + "<br><b>" + b.reason + "</b>" +
          (b.admin ? "<br><span style='color:#93a0b8'>Admin: " + b.admin + "</span>" : ""), ok ? "ok" : "err");
        return;
      }
      await sleep(1000);
    }
    panel("Kein BannGrund gefunden (Account evtl. nicht gebannt).", "err");
  }

  function addButton() {
    if (document.getElementById("dc-sc-btn") || !document.body) return;
    const btn = document.createElement("button");
    btn.id = "dc-sc-btn";
    btn.textContent = "🔎 Senden";
    btn.style.cssText = "position:fixed;top:80px;right:16px;z-index:2147483647;background:#ec4899;color:#fff;border:0;padding:10px 16px;" +
      "border-radius:10px;font-weight:800;cursor:pointer;font-family:system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)";
    btn.onclick = function () {
      const id = targetId();
      const b = findBan();
      if (isInfo && b.raw) { send({ type: "REASON_RESULT", targetId: id, reason: b.reason, rawReason: b.raw, admin: b.admin, banDate: b.banDate, socialName: b.socialName, socialId: b.socialId }); panel("BannGrund gesendet ✓<br><b>" + b.reason + "</b>", "ok"); return; }
      const sc = findSC() || window.prompt("SocialClub nicht gefunden — bitte einfügen:", "");
      if (sc) { const ok = send({ type: "SC_RESULT", targetId: id, sc: sc }); panel(ok ? "SC gesendet ✓" : "Senden fehlgeschlagen (Checker-Tab offen?)", ok ? "ok" : "err"); }
    };
    document.body.appendChild(btn);
  }

  function boot() {
    addButton();
    if (!token()) { panel("Bereit. Dieses Tab wurde nicht aus dem DC Checker geöffnet — es wird nichts automatisch gesendet.", "info"); return; }
    if (isInfo) void runInfo(); else if (isAuth) void runAuth();
    else panel("Bereit. Öffne die Authorization-Logs oder eine Character-Info.", "info");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  setTimeout(addButton, 2000);
})();
