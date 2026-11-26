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

const SITE = 'https://www.pagesignal.studio';
// A PageSignal tab can complete pairing only for a user-initiated, five-minute
// challenge created in this extension. No third-party site can send credentials.
chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
 let senderUrl;
 try{senderUrl=new URL(sender.url)}catch{return false}
 if(senderUrl.origin!==SITE || senderUrl.pathname!=='/extension-connect' ||
    message?.type!=='pagesignal:pair' || typeof message.challenge!=='string' ||
    !/^[a-f0-9]{64}$/.test(message.challenge) ||
    typeof message.token!=='string'||message.token.length>2048 ||
    typeof message.refreshToken!=='string'||message.refreshToken.length>2048 ||
    !Number.isFinite(message.expiresAt)||!Number.isFinite(message.refreshExpiresAt))return false;
 (async()=>{
  const {pagesignalPair}=await chrome.storage.session.get('pagesignalPair');
  if(!pagesignalPair||pagesignalPair.challenge!==message.challenge||
     pagesignalPair.expiresAt<Date.now()||message.expiresAt<=Date.now()||
     message.expiresAt>Date.now()+960000||message.refreshExpiresAt<=Date.now()||
     message.refreshExpiresAt>Date.now()+605000000)return {ok:false,error:'Pairing expired. Start again from PageSignal.'};
  await chrome.storage.local.set({pagesignalAuth:{
   token:message.token,expiresAt:message.expiresAt,
   refreshToken:message.refreshToken,refreshExpiresAt:message.refreshExpiresAt
  }});
  await chrome.storage.session.remove('pagesignalPair');
  return {ok:true};
 })().then(reply).catch(()=>reply({ok:false,error:'Could not save the connection.'}));
 return true;
});
