chrome.action.onClicked.addListener(async () => {
  const active = (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
  if(active && /^https?:/.test(active.url||'')) await chrome.storage.session.set({lastPage:active.id});
  const url = chrome.runtime.getURL('connect.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url === url);
  if(existing) await chrome.tabs.update(existing.id,{active:true});
  else await chrome.tabs.create({url});
});
chrome.tabs.onActivated.addListener(async ({tabId}) => {
  const t=await chrome.tabs.get(tabId).catch(()=>null);
  if(t && /^https?:/.test(t.url||'') && !t.incognito)await chrome.storage.session.set({lastPage:tabId});
});
