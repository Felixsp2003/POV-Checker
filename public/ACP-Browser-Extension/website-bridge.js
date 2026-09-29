// website-bridge.js — läuft auf dem ACP, ist aber NUR in dem einen Tab aktiv,
// der aus dem DC Checker geöffnet wurde.
//
// Der Token liegt ausschließlich in sessionStorage:
//   • sessionStorage gilt pro TAB → andere ACP-Tabs bleiben unberührt
//   • er überlebt Weiterleitungen und Seitenwechsel innerhalb dieses Tabs
// localStorage wäre falsch: das gilt für alle Tabs gleichzeitig.
(function () {
  const BRIDGE = "GRANDRP_ACP_BRIDGE";
  const TOKEN_KEY = "dc_bridge_token";

  // Altlast aus früheren Versionen entfernen, sonst gelten fremde Tabs als Bridge-Tab
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* egal */ }

  function readToken() {
    let t = "";
    try { t = new URL(location.href).searchParams.get("dc_bridge") || ""; } catch (e) { /* egal */ }
    if (t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { /* egal */ } return t; }
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  readToken();

  window.__DC_TOKEN = readToken;
  window.__DC_ACTIVE = function () { return !!readToken(); };

  window.__DC_SEND = function (payload) {
    const token = readToken();
    if (!token) return false;                       // fremder Tab → niemals senden
    const msg = Object.assign({ source: BRIDGE, bridgeToken: token }, payload);
    let sent = false;
    try { if (window.opener && !window.opener.closed) { window.opener.postMessage(msg, "*"); sent = true; } } catch (e) { /* egal */ }
    try { chrome.runtime.sendMessage(msg).then(function () { }).catch(function () { }); sent = true; } catch (e) { /* egal */ }
    try { window.postMessage(msg, "*"); } catch (e) { /* egal */ }
    return sent;
  };
})();
