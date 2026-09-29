// content.js — läuft auf https://admin.gta5grand.com/de/*
(function () {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function param(name) {
    try { return new URL(location.href).searchParams.get(name) || ""; } catch (e) { return ""; }
  }

  // BannGrund aus dem roten Adminpanel-Bereich (nur feste Liste, nie beliebiger Text)
  const REASONS = ["PC-Check Verweigerung - Trolling", "PC-Check Verweigerung", "PC-Check Positiv 4.1 (Discord)", "PC-Check Positiv 4.1 (Redux)",
    "PC-Check Positiv - Cleaning", "PC Check Positiv (Banevading)", "PC Check Positiv (Covering Cheater)", "PC-Check Positiv",
    "Event 1.7 (NoPov in PC Check)", "Acc 1.4 (Twink)", "Acc 1.4 (Main)", "Cheater"];
  function findReason() {
    const body = (document.body ? document.body.innerText : "").toLowerCase();
    for (const r of REASONS) if (body.indexOf(r.toLowerCase()) !== -1) return r;
    return "";
  }

  function findSC() {
    const body = document.body ? document.body.innerText : "";
    let m = body.match(/\b([a-f0-9]{40})\b/i) || body.match(/\b([a-f0-9]{32})\b/i);
    if (m) return m[1];
    m = body.match(/Social\s*Club\s*[:#]?\s*([A-Za-z0-9_.-]{3,40})/i);
    if (m) return m[1];
    const el = document.querySelector("[data-sc], [data-socialclub]");
    if (el) return el.getAttribute("data-sc") || el.getAttribute("data-socialclub") || "";
    return "";
  }

  function badge(text) {
    let b = document.getElementById("dc-acp-badge");
    if (!b) {
      b = document.createElement("div");
      b.id = "dc-acp-badge";
      b.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:999999;background:#f59e0b;color:#111;padding:10px 14px;border-radius:10px;font-weight:700;font-family:sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)";
      document.body.appendChild(b);
    }
    b.textContent = "DC Checker · " + text;
  }

  // SC-Auslese für eine Ziel-ID (aus dem DC Checker geöffnet)
  async function scanSC() {
    const id = param("dc_id");
    if (!id) return;
    // SC bis zu 30 Sekunden abwarten; BannGrund frühestens nach 2,5 s Ladezeit auslesen
    for (let i = 0; i < 30; i++) {
      const sc = findSC();
      if (sc && window.__DC_SEND) {
        if (i < 3) await sleep(2500 - i * 1000);
        if (window.__DC_SEND({ type: "SC_RESULT", targetId: id, sc: sc, reason: findReason() })) { badge("SC übernommen ✓"); return; }
      }
      await sleep(1000);
    }
    badge("keine SC gefunden");
  }

  // SocialClub-Checker: liest Nickname, Character ID, Logins, SOCBAN, BAN
  function scanScPage() {
    const want = param("dc_sc");
    if (!want || location.href.indexOf("socialclub") === -1) return;
    const text = document.body.innerText || "";
    const rows = document.querySelectorAll("table tbody tr");
    const nick = (text.match(/Nickname\s*[:#]?\s*(\S+)/i) || [])[1] || "";
    const charId = (text.match(/(?:Character\s*ID|Char\s*ID)\s*[:#]?\s*(\d{3,8})/i) || [])[1] || "";
    const logins = parseInt((text.match(/Total\s*Logins\s*[:#]?\s*(\d+)/i) || [])[1] || "0", 10) || rows.length;
    const socban = /SOCBAN/i.test(text);
    const ban = /\bBAN\b/i.test(text.replace(/SOCBAN/gi, ""));
    if (window.__DC_SEND) {
      window.__DC_SEND({ type: "SC_CHECK_RESULT", sc: want, nickname: nick, charId: charId, logins: logins, socban: socban, ban: ban, server: location.pathname.split("/")[2] || "3" });
      badge("SocialClub geprüft ✓");
    }
  }

  function addButton() {
    if (document.getElementById("dc-sc-btn") || !document.body) return;
    const btn = document.createElement("button");
    btn.id = "dc-sc-btn";
    btn.textContent = "🔎 SocialClub";
    btn.style.cssText = "position:fixed;top:70px;right:16px;z-index:999999;background:#f59e0b;color:#111;border:0;padding:10px 16px;border-radius:10px;font-weight:800;cursor:pointer;font-family:sans-serif;";
    btn.onclick = function () {
      const sc = findSC();
      if (sc && window.__DC_SEND && window.__DC_SEND({ type: "SC_RESULT", targetId: param("dc_id"), sc: sc })) badge("SC gesendet ✓");
      else badge("keine SC / kein Token");
    };
    document.body.appendChild(btn);
  }

  window.addEventListener("load", function () { addButton(); scanSC(); setTimeout(scanScPage, 2500); });
  setTimeout(function () { addButton(); }, 1500);
})();
