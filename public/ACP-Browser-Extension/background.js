// GrandRP ACP Bridge — background.js (Manifest V3)
// Leitet Nachrichten vom ACP-Tab an alle anderen Tabs weiter (dort lauscht dc-receiver.js).
const BRIDGE = "GRANDRP_ACP_BRIDGE";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.source !== BRIDGE || !msg.bridgeToken) return false;
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (!t.id || (sender.tab && t.id === sender.tab.id)) continue;
      // Tabs ohne Empfänger werfen einen Fehler — bewusst ignorieren
      chrome.tabs.sendMessage(t.id, msg).catch(() => {});
    }
  });
  sendResponse({ ok: true });
  return true;
});
