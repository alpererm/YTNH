const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const b=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await b.newPage({viewport:{width:1400,height:900},reducedMotion:'reduce'});
 await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{installDatabase(createEmptyDatabase());const n=createItem(db,'Note');n.content='## **Heading**';window.parentItem=n.id;createItem(db,'Todo',n.id);selected=n.id;render();focusOutlineItem(n.id)});
 const marker=p.locator('#tree .paneMarker');assert.equal(await marker.count(),1);
 const opacity=locator=>locator.evaluate(e=>getComputedStyle(e,'::before').opacity);
 assert.equal(await opacity(marker),'1');assert.equal(await marker.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
 await p.keyboard.press('Alt+n');await p.locator('.inlineEdit').fill('Cancel child');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>db.items.length),2);
 await p.keyboard.press('Alt+2');const head=p.locator('#layout .mainpanel');assert.equal(await opacity(head),'1');assert.equal(await opacity(marker),'0');
 await p.keyboard.press('Control+Shift+9');assert.equal(await p.evaluate(()=>itemById(db,selected).content),'- [ ] ## **Heading**');
 await p.evaluate(()=>{edit(selected);focusBodyStart()});assert.equal(await p.evaluate(()=>documentHeadings()[0].level),2);
 await p.keyboard.press('Control+Shift+9');assert.equal(await p.evaluate(()=>itemById(db,selected).content),'## **Heading**');
 const position=()=>head.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el,'::before');return [r.left+parseFloat(s.left),r.top+parseFloat(s.top),s.width,s.height]});
 // An absolutely positioned marker uses the nearest positioned ancestor.
 assert(await head.evaluate(el=>{
   const probe=document.createElement('span');probe.style.position='absolute';el.append(probe);
   const anchored=probe.offsetParent===el;probe.remove();return anchored;
 }));
 const editorPosition=await position();
 for(const key of ['Alt+3','Alt+4']){await p.keyboard.press(key);assert.equal(await opacity(head),'1');assert.equal(await opacity(marker),'0');assert.deepEqual(await position(),editorPosition)}
 await b.close();console.log('PASS focused root, pane markers, child draft cancellation and heading checklist round trip');
})().catch(e=>{console.error(e);process.exit(1)});
