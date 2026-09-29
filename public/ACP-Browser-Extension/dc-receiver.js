// dc-receiver.js — läuft auf der DC-Checker-Seite (GitHub Pages / localhost).
// Reicht Nachrichten der Extension an die Seite weiter und meldet, dass die
// Extension installiert ist (dafür wird kein Token gebraucht — es werden keine Daten übertragen).
(function () {
  const BRIDGE = "GRANDRP_ACP_BRIDGE";

  function announce() {
    try { window.postMessage({ source: BRIDGE + "_PRESENT", version: "1.6.0" }, "*"); } catch (e) { /* egal */ }
  }
  announce();
  document.addEventListener("DOMContentLoaded", announce);
  window.addEventListener("load", announce);
  setTimeout(announce, 1500);
  setTimeout(announce, 4000);

  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || msg.source !== BRIDGE || !msg.bridgeToken) return;
      try { window.postMessage(msg, "*"); } catch (e) { /* egal */ }
    });
  } catch (e) { /* egal */ }
})();
