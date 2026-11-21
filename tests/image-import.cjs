const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium)
    .launch(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname, '../app.html')).href);
    await page.evaluate(()=>{
      const images=new Map();
      window.notesDesktop={sqlite:{imageEditing:true,
        async importImage(id,data){const key='a'.repeat(64);images.set(key,data);return {hash:key,extension:'gif',bytes:atob(data).length}},
        async importReference(id,src){window.recordedRefs=(window.recordedRefs||[]).concat(src);return {hash:'a'.repeat(64),extension:'gif',bytes:34,name:'Pixel.gif'}},
        async readImage(id,key){return {extension:"gif",data:images.get(key)}}
      }};
      initManagedImageImports();
      installDatabase(createEmptyDatabase());
      const i=createItem(db,'Note');i.content='beforeafter';edit(i.id);focusBodyStart();
      storage.handle={sqlite:true,id:'test'};
      const range=document.createRange();range.setStart($('richEditor').firstChild.firstChild,6);range.collapse(true);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      const transfer=new DataTransfer();
      const gif=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),c=>c.charCodeAt(0));
      transfer.items.add(new File([gif],'Pixel.gif',{type:'image/gif'}));
      const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:transfer});
      $('richEditor').dispatchEvent(event);
    });
    await page.waitForFunction(()=>!!document.querySelector('#richEditor [data-mdblock=image] img')?.naturalWidth);
    const content=await page.evaluate(()=>itemById(db,selected).content);
    assert.equal(content,'before\n![Pixel](assets/'+'a'.repeat(64)+'.gif)\nafter');
    await page.evaluate(()=>undo());
    assert.equal(await page.evaluate(()=>itemById(db,selected).content),'beforeafter');
    await page.evaluate(()=>{
      $('sourceToggle').click();
      $('content').value='Start\n![Custom alt](C:/Pictures/Pixel.gif)\nEnd';
      syncModelFromSource();$('sourceToggle').click();
    });
    await page.waitForFunction(()=>!sourceMode());
    assert.equal(await page.evaluate(()=>itemById(db,selected).content),'Start\n![Custom alt](assets/'+'a'.repeat(64)+'.gif)\nEnd');
    await page.evaluate(()=>{$('sourceToggle').click();$('sourceToggle').click()});
    assert.deepEqual(await page.evaluate(()=>window.recordedRefs),['C:/Pictures/Pixel.gif']);
    await page.evaluate(()=>{
      focusBodyStart();
      const transfer=new DataTransfer();transfer.setData('text/html','<p>Hello</p><img alt="Inline" src="https://example.com/x.gif"><p>world</p>');
      const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:transfer});$('richEditor').dispatchEvent(event);
    });
    await page.waitForFunction(()=>itemById(db,selected).content.includes('![Inline]'));
    const mixed=await page.evaluate(()=>itemById(db,selected).content);
    assert.ok(mixed.indexOf('Hello')<mixed.indexOf('![Inline]')&&mixed.indexOf('![Inline]')<mixed.indexOf('world'));
    console.log('PASS clipboard image insertion at caret, display, surrounding text and undo');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
