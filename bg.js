// Deslop: the toolbar button injects the page script; the rewriting is done by the Deslop server on this machine.
const SERVER = "http://localhost:5055";

async function start(tab) {
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (e) { console.warn("Deslop cannot run on this page:", e.message); }
}
chrome.action.onClicked.addListener(start);

// The page script cannot call localhost from an https page, so the request goes through here.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "deslop") return;
  fetch(SERVER + "/api/deslop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg.text, level: msg.level, bin: msg.bin }) })
    .then(async (r) => { const j = await r.json().catch(() => ({})); reply(r.ok ? { ok: true, edits: j.edits || [], fraction: j.fraction || 0, rewrite: j.rewrite || null } : { ok: false, error: j.error || "The Deslop server answered " + r.status }); })
    .catch(() => reply({ ok: false, error: "The Deslop server is not running. Start it with: node server/server.js" }));
  return true; // keep the channel open for the async reply
});
