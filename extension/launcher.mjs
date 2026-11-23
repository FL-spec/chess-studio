import { supported } from "./detect.mjs";

const element = id => document.getElementById(id);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const page = await chrome.tabs.getCurrent();
const active = page && page.id === tab?.id
  ? (await chrome.tabs.query({ currentWindow: true }))
      .filter(candidate => candidate.id !== page.id && candidate.url && supported(candidate.url))
      .sort((a, b) => b.lastAccessed - a.lastAccessed)[0] || tab
  : tab;
const source = active?.url && supported(active.url) ? active.id : undefined;

function launch(id, action) {
  element(id).onclick = () => {
    const status = element("launch-status");
    status.hidden = true;
    action().then(() => window.close()).catch(() => {
      status.textContent = "This view couldn’t open. Try again.";
      status.hidden = false;
    });
  };
}

launch("pop-out", () => {
  const params = new URLSearchParams({ window: "1" });
  if (source) params.set("source", source);
  else if (active?.id && /^https?:/.test(active.url || "")) params.set("tab", active.id);
  return chrome.windows.create({
    url: chrome.runtime.getURL("panel.html") + "?" + params,
    type: "popup",
    width: 460,
    height: 760,
  });
});

const pin = element("pin");
pin.disabled = !active?.windowId || !chrome.sidePanel?.open;
launch("pin", () => chrome.sidePanel.open({ windowId: active.windowId }));

launch("open", async () => {
  if (source) {
    return chrome.tabs.create({
      url: chrome.runtime.getURL("website.html") + "?" + new URLSearchParams({ source }),
    });
  }
  const home = chrome.runtime.getURL("index.html");
  const { activeWorkspace } = await chrome.storage.local.get("activeWorkspace");
  if (activeWorkspace?.url?.startsWith(home + "?")) {
    try {
      const existing = await chrome.tabs.get(activeWorkspace.tabId);
      if (existing.url === activeWorkspace.url || existing.pendingUrl === activeWorkspace.url) {
        await chrome.tabs.update(existing.id, { active: true });
        return chrome.windows.update(existing.windowId, { focused: true });
      }
    } catch {
      // The saved workspace tab has closed.
    }
  }
  return chrome.tabs.create({ url: home });
});
