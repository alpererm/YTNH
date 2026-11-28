// #60: clicking below the text and pasting puts the text at the end, not at the beginning.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const n=createItem(db,'Note');n.title='Paste test';n.content='First line\n\nSecond line\n\nLast line';window.noteId=n.id;render();openSelectedInFullEditor(n.id);selectSidebarTab('details')});
 const paste=text=>page.evaluate(text=>{const dt=new DataTransfer();dt.setData('text/plain',text);document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))},text);
 const lines=()=>page.evaluate(()=>[...$('richEditor').children].map(b=>b.textContent).filter(Boolean));
 // The steps from the report: Copy link in Details, then click below the text and paste.
 await page.locator('[data-copy-ref="link"]').click();
 const last=await page.locator('#richEditor > *').last().boundingBox();
 await page.mouse.click(last.x+200,last.y+last.height+12);
 await paste('PASTED');
 assert.deepEqual(await lines(),['First line','Second line','Last linePASTED']);
 // Pasting with the cursor inside a line still pastes there.
 await page.locator('#richEditor > *').first().click({position:{x:2,y:5}});
 await page.keyboard.press(await page.evaluate(()=>IS_MAC?'Meta+ArrowRight':'End'));
 await paste('!');
 assert.equal((await lines())[0],'First line!');
 // #64: clipboard HTML with line breaks or space markers around the text adds no spaces; copied spaces stay.
 for(const [html,plain,expected] of [
   ['<span>beta</span>','beta','Insert here: betaX'],
   ['<meta charset="utf-8">\n<span>beta</span>\n','beta','Insert here: betaX'],
   ['<meta charset="utf-8"><span class="Apple-converted-space">&nbsp;</span><span>beta</span><span class="Apple-converted-space">&nbsp;</span>','beta','Insert here: betaX'],
   ['<html><body>\n<!--StartFragment--><span>beta</span><!--EndFragment-->\n</body></html>','beta','Insert here: betaX'],
   ['<span> beta </span>',' beta ','Insert here:  beta X'],
 ]){
   const line=await page.evaluate(([html,plain])=>{const n=itemById(db,noteId);n.content='Insert here: X';syncRichFromModel(n);
     const blk=$('richEditor').children[0],w=document.createTreeWalker(blk,NodeFilter.SHOW_TEXT);let t;while(w.nextNode())if(w.currentNode.data.includes('X'))t=w.currentNode;
     const r=document.createRange();r.setStart(t,t.data.indexOf('X'));r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);$('richEditor').focus();
     const dt=new DataTransfer();dt.setData('text/plain',plain);dt.setData('text/html',html);$('richEditor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
     return itemById(db,noteId).content},[html,plain]);
   assert.equal(line,expected,html);
 }
 // #61: pasted Copy link / Copy embed text becomes a link or an embed straight away, keeping text around it.
 for(const [kind,make] of [['link',id=>`[[@{${id}}]]`],['embed',id=>`![[@{${id}}]]`]]){
   const result=await page.evaluate(([kind,src])=>{const t=createItem(db,'Todo');t.title='Linked todo';const n=itemById(db,noteId);n.content='See: ';syncRichFromModel(n);
     const blk=$('richEditor').children[0],r=document.createRange();r.selectNodeContents(blk);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);$('richEditor').focus();
     const text=new Function('id','return '+src)(t.id)+' and more';
     const dt=new DataTransfer();dt.setData('text/plain',text);$('richEditor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
     return {ref:!!$('richEditor').querySelector(kind==='embed'?'.embedref':'.mdref'),saved:itemById(db,noteId).content,id:t.id}},[kind,make.toString().replace(/^id=>/,'')]);
   assert.equal(result.ref,true,kind+' shows as a reference');
   assert.match(result.saved,new RegExp('^See: '+(kind==='embed'?'!':'')+'\\[\\[@\\{'+result.id+'\\}\\]\\] and more'),kind);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS paste position (#60), no added spaces (#64) and pasted references become links (#61)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
