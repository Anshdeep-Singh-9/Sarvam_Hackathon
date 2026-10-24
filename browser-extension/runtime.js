const prepared=new Map();
const safeURL=s=>{const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Only ordinary HTTP/HTTPS URLs are allowed.');return u.href;};
export async function execute(op,a={}) {
  const tabs=await chrome.tabs.query({});
  const normal=tabs.filter(t=>!t.incognito && /^https?:/.test(t.url||''));
  if(op==='list')return {tabs:normal.map(t=>({id:t.id,title:t.title,url:t.url,index:t.index,windowId:t.windowId,active:t.active}))};
  if(op==='new') {const t=await chrome.tabs.create({url:safeURL(a.url||'https://www.google.com')});return {text:'Opened a new tab.',tabId:t.id};}
  if(op==='download_status'){const ds=await chrome.downloads.search({orderBy:['-startTime'],limit:5});return {text:ds.map(d=>`${d.state}: ${d.filename}`).join('; ')};}
  if(op==='commit'){
    const p=prepared.get(a.ticket);prepared.delete(a.ticket);
    if(!p||p.until<Date.now())throw new Error('Confirmation expired.');
    const t=await chrome.tabs.get(p.tabId);if(t.url!==p.url)throw new Error('The page changed. Ask again.');
    if(p.op==='close'){for(const old of p.targets){const now=await chrome.tabs.get(old.id);if(now.url!==old.url)throw new Error('A tab changed. Ask again.');}await chrome.tabs.remove(p.ids);return {text:`Closed ${p.ids.length} tab(s).`};}
    return pageCall(p.tabId,{...p.args,op:'commit',ticket:p.pageTicket});
  }
  let tab=a.tabId?normal.find(t=>t.id===a.tabId):null;
  if(a.tabId&&!tab)throw new Error('That tab no longer exists. List tabs again.');
  if(!tab){const win=await chrome.windows.getLastFocused();tab=normal.find(t=>t.windowId===win.id&&t.active);}
  if(!tab){const {lastPage}=await chrome.storage.session.get('lastPage');tab=normal.find(t=>t.id===lastPage);}
  if(!tab)throw new Error('Choose an ordinary webpage tab first.');
  const id=tab.id;
  if(op==='switch'){await chrome.tabs.update(id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {text:`Switched to ${tab.title}.`};}
  if(op==='close'){
    const ids=a.ids||[id];if(ids.some(x=>!normal.some(t=>t.id===x)))throw new Error('Tab is unavailable.');
    const ticket=crypto.randomUUID();prepared.set(ticket,{op,ids,targets:normal.filter(t=>ids.includes(t.id)).map(t=>({id:t.id,url:t.url})),tabId:id,url:tab.url,until:Date.now()+45000});
    return {confirmation:`Close ${ids.length} tab(s): ${normal.filter(t=>ids.includes(t.id)).map(t=>t.title).join(', ')}? Unsaved changes may be lost.`,ticket};
  }
  if(op==='open'){await chrome.tabs.update(id,{url:safeURL(a.url)});return {text:'Opened the requested page.'};}
  if(op==='reload')await chrome.tabs.reload(id);
  else if(op==='back')await chrome.tabs.goBack(id);
  else if(op==='forward')await chrome.tabs.goForward(id);
  else if(op==='duplicate')await chrome.tabs.duplicate(id);
  else if(op==='pin'||op==='unpin')await chrome.tabs.update(id,{pinned:op==='pin'});
  else if(op==='move')await chrome.tabs.move(id,{index:Math.max(0,Number(a.index)-1)});
  else if(op==='info')return {text:`${tab.title}. ${tab.url}`,url:tab.url,title:tab.title};
  else if(op==='screenshot'){
    await chrome.tabs.update(id,{active:true});
    return {text:'Captured the visible browser page.',image:await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'})};
  }else if(op==='download'){
    const url=safeURL(a.url||tab.url);
    if(!/\.pdf(?:[?#]|$)/i.test(url))throw new Error('Provide a direct PDF URL. Executable downloads are not supported.');
    const downloadId=await chrome.downloads.download({url,saveAs:false,conflictAction:'uniquify'});return {text:`PDF download started, number ${downloadId}. Ask for download status for its path.`};
  }else {
    const result=await pageCall(id,{...a,op});
    if(result.confirmation){const ticket=crypto.randomUUID();prepared.set(ticket,{op,tabId:id,url:tab.url,pageTicket:result.ticket,args:a,until:Date.now()+45000});result.ticket=ticket;}
    return result;
  }
  return {text:`Browser ${op} completed.`};
}
async function pageCall(tabId,args){
  const result=await chrome.scripting.executeScript({target:{tabId},func:pageOperation,args:[args]});
  if(result[0]?.result?.error)throw new Error(result[0].result.error);
  return result[0]?.result||{text:'Done.'};
}
export function pageOperation(a) {
  try {
    const visible=e=>!!(e.getBoundingClientRect().width&&e.getBoundingClientRect().height)&&getComputedStyle(e).visibility!=='hidden';
    const label=e=>(e.getAttribute('aria-label')||e.innerText||e.placeholder||e.getAttribute('title')||'').trim().slice(0,160);
    const secret=e=>e?.matches('input[type=password],input[autocomplete*=password],input[autocomplete*=cc-]')||/password|token|secret|api.key|credit.card/i.test(e?.name||'');
    const state=globalThis.__jBridgeState ||= {pending:new Map()};
    const fingerprint=e=>[e.tagName,label(e),e.getAttribute('href'),e.getAttribute('type'),e.form?.action].join('|');
    const pick=(selector,q)=>{
      let es=[...document.querySelectorAll(selector)].filter(visible);
      if(q==='focused')return document.activeElement;
      if(/^\d+$/.test(q||''))return es[Number(q)-1];
      const exact=es.filter(e=>label(e).toLowerCase()===String(q).toLowerCase());
      es=exact.length?exact:es.filter(e=>label(e).toLowerCase().includes(String(q||'').toLowerCase()));
      if(es.length!==1)throw new Error(es.length?`Multiple matches: ${es.slice(0,4).map(label).join(', ')}. Be more specific.`:'No visible matching element.');
      return es[0];
    };
    if(a.op==='commit'){
      const p=state.pending.get(a.ticket);state.pending.delete(a.ticket);
      if(!p||p.until<Date.now()||!p.el.isConnected||fingerprint(p.el)!==p.fingerprint||location.href!==p.url)throw new Error('The target changed. Ask again.');
      p.el.click();return {text:`Clicked ${label(p.el)}.`};
    }
    if(a.op==='scroll'){const d=a.text||'down';if(d==='top'||d==='bottom')scrollTo(0,d==='top'?0:document.documentElement.scrollHeight);else scrollBy(0,(d==='up'?-1:1)*innerHeight*.8);return {text:`Scrolled ${d}.`};}
    if(a.op==='find'){const found=window.find(String(a.text),false,false,true);return {text:found?`Found ${a.text} on this page.`:'That text is not on this page.'};}
    if(a.op==='text'){
      const root=document.querySelector('main,article,[role=main]')||document.body;const clone=root.cloneNode(true);
      clone.querySelectorAll('input,textarea,[contenteditable],script,style,nav,footer').forEach(e=>e.remove());
      return {text:clone.textContent.replace(/\s+/g,' ').trim().slice(0,5000)||'No readable main content.'};
    }
    if(a.op==='links'||a.op==='results'){
      let es=[...document.querySelectorAll(a.op==='results'?'a:has(h3)':'a[href]')].filter(visible);
      return {links:es.filter(e=>/^https?:/.test(e.href)).slice(0,30).map(e=>({title:label(e),url:e.href})),text:`Found ${es.length} links.`};
    }
    if(a.op==='selection')return {text:getSelection()?.toString()||'No text is selected.'};
    if(a.op==='last_response'){const es=[...document.querySelectorAll('[data-message-author-role="assistant"]')];if(!es.length)throw new Error('No ChatGPT assistant response found on this page.');return {text:es.at(-1).innerText.slice(0,10000)};}
    if(a.op==='click'||a.op==='focus'){
      const el=pick(a.op==='click'?'button,a,input[type=submit],[role=button]':'input,textarea,[contenteditable=true],button,a',a.text);
      if(!el||secret(el))throw new Error('Private fields cannot be controlled by J.');
      el.scrollIntoView({block:'center'});
      if(a.op==='focus'){el.focus();return {text:`Focused ${label(el)}.`};}
      // All arbitrary clicks require approval: labels alone cannot prove a button harmless.
      const ticket=crypto.randomUUID();state.pending.set(ticket,{el,fingerprint:fingerprint(el),url:location.href,until:Date.now()+45000});
      return {confirmation:`Click ${label(el)} on ${document.title}? This may change or submit data.`,ticket};
    }
    if(a.op==='type'){
      const el=pick('input,textarea,[contenteditable=true]',a.target||'focused');
      if(!el||secret(el)||!el.matches('input,textarea,[contenteditable=true]'))throw new Error('Focus a non-private text field first.');
      el.focus();if(el.isContentEditable)el.textContent=a.text;else {const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,a.text);}
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return {text:'Filled the text field. Nothing was submitted.'};
    }
    if(a.op==='key'){
      const el=document.activeElement;if(secret(el))throw new Error('Private field is focused.');
      if(a.text==='SelectAll'){if(el?.select)el.select();else{const r=document.createRange();r.selectNodeContents(document.body);const s=getSelection();s.removeAllRanges();s.addRange(r);}return {text:'Selected all.'};}
      if(a.text==='Enter')throw new Error('Enter may submit a form. Ask J to click the named submit or search button, then confirm.');
      if(a.text!=='Escape'&&a.text!=='Tab')throw new Error('Only Escape, Tab and SelectAll are supported here.');
      if(a.text==='Tab'){const es=[...document.querySelectorAll('input,button,a,textarea,[tabindex]')].filter(visible);es[(es.indexOf(el)+1)%es.length]?.focus();}
      else el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return {text:`Sent ${a.text}. Some websites require a physical keypress.`};
    }
    throw new Error('Unsupported browser operation.');
  }catch(e){return {error:e.message};}
}
