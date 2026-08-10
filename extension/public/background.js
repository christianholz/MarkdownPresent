chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "meeting-present:asset") {
    if (!Number.isInteger(message.sourceTabId)) {
      sendResponse({ ok: false, error: "The source GitHub tab is unavailable." });
      return false;
    }
    chrome.tabs.sendMessage(message.sourceTabId, {
      type: "meeting-present:fetch-asset",
      source: message.source,
      path: message.path,
    }).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "meeting-present:open") {
    const senderUrl = sender.tab?.url || "";
    if (!senderUrl.startsWith("https://github.com/eth-siplab-team/")) {
      sendResponse({ ok: false, error: "Unexpected source page." });
      return false;
    }

    const sourceId = crypto.randomUUID();
    const storageKey = `meeting-present:${sourceId}`;
    const payload = { ...message.payload, sourceTabId: sender.tab.id };
    chrome.storage.local.set({ [storageKey]: payload })
      .then(() => chrome.tabs.create({ url: chrome.runtime.getURL(`present.html#source=${sourceId}`) }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
