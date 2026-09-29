// dc-receiver.js — läuft auf der DC-Checker-Seite (GitHub Pages / localhost)
// und reicht Nachrichten der Extension per window.postMessage an die App weiter.
// Die App verwirft alles ohne gültigen bridgeToken.
(function () {
  const BRIDGE = "GRANDRP_ACP_BRIDGE";
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.source !== BRIDGE || !msg.bridgeToken) return;
    window.postMessage(msg, window.location.origin);
  });
})();
