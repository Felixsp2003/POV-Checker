// website-bridge.js — läuft auf dem ACP und schickt Daten an den DC Checker.
// Drei Wege gleichzeitig, damit es auch bei Weiterleitungen funktioniert:
//   1) window.opener.postMessage  (direkt, braucht keinen Hintergrunddienst)
//   2) chrome.runtime.sendMessage → background → alle Checker-Tabs
//   3) window.postMessage         (falls der Checker im selben Tab läuft)
(function () {
  const BRIDGE = "GRANDRP_ACP_BRIDGE";
  const TOKEN_KEY = "dc_bridge_token";

  // Token merken: URL → sessionStorage → localStorage.
  // Das ACP leitet oft weiter und verliert dabei den URL-Parameter.
  function readToken() {
    let t = "";
    try { t = new URL(location.href).searchParams.get("dc_bridge") || ""; } catch (e) { /* egal */ }
    if (t) {
      try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { /* egal */ }
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* egal */ }
      return t;
    }
    try { t = sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { /* egal */ }
    if (t) return t;
    try { t = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { /* egal */ }
    return t;
  }
  readToken();

  window.__DC_TOKEN = readToken;

  window.__DC_SEND = function (payload) {
    const token = readToken();
    if (!token) return false; // ohne Token wird nichts gesendet
    const msg = Object.assign({ source: BRIDGE, bridgeToken: token }, payload);
    let sent = false;
    try { if (window.opener && !window.opener.closed) { window.opener.postMessage(msg, "*"); sent = true; } } catch (e) { /* egal */ }
    try { chrome.runtime.sendMessage(msg).then(function () { }).catch(function () { }); sent = true; } catch (e) { /* egal */ }
    try { window.postMessage(msg, "*"); } catch (e) { /* egal */ }
    return sent;
  };
})();
