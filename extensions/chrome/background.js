chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'pagesignal-selection', title: 'Review selected text in PageSignal', contexts: ['selection'] });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'pagesignal-selection' || !tab?.windowId) return;
  // Open synchronously within the Chrome user gesture, before asynchronous storage.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  chrome.storage.session.set({ selection: { text: String(info.selectionText || '').slice(0, 20000), capturedAt: Date.now() } }).catch(console.error);
});
