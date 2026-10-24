import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright-core';
import {pageOperation,execute} from '../../browser-extension/runtime.js';

test('real Chrome page operations and tab primitives on isolated fixtures',async()=>{
  const server=http.createServer((req,res)=>res.end('<html><head><title>J fixture '+req.url+'</title></head><body><main><h1>Pricing</h1><p>Readable fixture content</p><input aria-label="Search"><input type="password" aria-label="Password"><button onclick="document.body.dataset.clicked=\'yes\'">Submit</button><a href="/two"><h3>First result</h3></a><div style="height:3000px">Long content</div></main></body></html>')).listen(39784,'127.0.0.1');
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});const context=await browser.newContext();let next=1;const pages=new Map();let active;
  const add=async url=>{const p=await context.newPage();const id=next++;pages.set(id,p);active=id;await p.goto(url);return{id};};
  const tabs=async()=>Promise.all([...pages].map(async([id,p],index)=>({id,url:p.url(),title:await p.title(),active:id===active,index,windowId:1})));
  globalThis.chrome={
    tabs:{query:tabs,get:async id=>(await tabs()).find(t=>t.id===id),create:({url})=>add(url),update:async(id,a)=>{if(a.active)active=id;if(a.url)await pages.get(id).goto(a.url);return{id};},remove:async ids=>{for(const id of Array.isArray(ids)?ids:[ids]){await pages.get(id).close();pages.delete(id);}},reload:id=>pages.get(id).reload(),goBack:id=>pages.get(id).goBack(),goForward:id=>pages.get(id).goForward(),duplicate:id=>add(pages.get(id).url()),move:async()=>{},captureVisibleTab:async()=> 'data:image/png;base64,'+(await pages.get(active).screenshot()).toString('base64')},
    windows:{getLastFocused:async()=>({id:1}),update:async()=>{}},storage:{session:{get:async()=>({lastPage:active})}},
    scripting:{executeScript:async({target,func,args})=>[{result:await pages.get(target.tabId).evaluate(func,args[0])}]},
  };
  try{
    const url='http://127.0.0.1:39784/one';await execute('new',{url});assert.equal((await execute('list')).tabs.length,1);
    assert.match((await execute('info')).text,/fixture/);
    await execute('open',{url:'http://127.0.0.1:39784/two'});await execute('back');assert.match((await execute('info')).url,/one/);await execute('forward');await execute('reload');
    assert.match((await execute('type',{target:'Search',text:'hello'})).text,/Filled/);assert.equal(await pages.get(active).locator('input').first().inputValue(),'hello');
    await assert.rejects(()=>execute('type',{target:'Password',text:'secret'}),/private/i);
    assert.match((await execute('text')).text,/Readable fixture/);assert.equal((await execute('links')).links.length,1);assert.equal((await execute('results')).links.length,1);
    await execute('scroll',{text:'bottom'});assert.ok(await pages.get(active).evaluate(()=>scrollY)>0);await execute('scroll',{text:'top'});
    assert.match((await execute('find',{text:'Pricing'})).text,/Found/);
    const approval=await execute('click',{text:'Submit'});assert.ok(approval.confirmation);assert.equal(await pages.get(active).getAttribute('body','data-clicked'),null);
    await execute('commit',{ticket:approval.ticket});assert.equal(await pages.get(active).getAttribute('body','data-clicked'),'yes');await assert.rejects(()=>execute('commit',{ticket:approval.ticket}),/expired/);
    assert.ok((await execute('screenshot')).image.startsWith('data:image/png'));
    await execute('duplicate');assert.equal((await execute('list')).tabs.length,2);await execute('switch',{tabId:1});assert.equal(active,1);
    const close=await execute('close');await execute('commit',{ticket:close.ticket});assert.equal((await execute('list')).tabs.length,1);
    await assert.rejects(()=>execute('new',{url:'javascript:alert(1)'}),/HTTP/);
  }finally{delete globalThis.chrome;await browser.close();server.close();}
});
