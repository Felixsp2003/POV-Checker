// website-bridge.js — läuft auf dem ACP und schickt Daten an den DC Checker.
// Sicherheit: jede Nachricht enthält den bridgeToken aus der URL (dc_bridge).
(function () {
  const BRIDGE = "GRANDRP_ACP_BRIDGE";

  function readToken() {
    try {
      const u = new URL(location.href);
      const t = u.searchParams.get("dc_bridge");
      if (t) { sessionStorage.setItem("dc_bridge", t); return t; }
      return sessionStorage.getItem("dc_bridge") || "";
    } catch (e) { return ""; }
  }
  readToken();

  window.__DC_SEND = function (payload) {
    const token = readToken();
    if (!token) return false; // ohne Token wird nichts gesendet
    const msg = Object.assign({ source: BRIDGE, bridgeToken: token }, payload);
    try { chrome.runtime.sendMessage(msg).catch(function () {}); } catch (e) {}
    try { if (window.opener) window.opener.postMessage(msg, "*"); } catch (e) {}
    return true;
  };
})();
