// #66: the editor compared with Obsidian and Typora — escaping, live Markdown, links, lists, code, tables,
// shortcuts, auto-pairs, highlight and "1)" lists.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const n=createItem(db,'Note');n.title='Audit';window.nid=n.id;render();openSelectedInFullEditor(n.id)});
 const M=await page.evaluate(()=>IS_MAC?'Meta':'Control');
 const md=()=>page.evaluate(()=>{syncModelFromRich();return itemById(db,nid).content});
 const setup=(content,text,offset)=>page.evaluate(([c,t,o])=>{const i=itemById(db,nid);i.content=c;syncRichFromModel(i);$('richEditor').focus();
   const w=document.createTreeWalker($('richEditor'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const k=n.data.indexOf(t);if(k>=0){const r=document.createRange();r.setStart(n,o==='end'?k+t.length:k+o);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);return}}throw Error('no '+t)},[content,text,offset]);
 const select=text=>page.evaluate(t=>{const w=document.createTreeWalker($('richEditor'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const k=n.data.indexOf(t);if(k>=0){const r=document.createRange();r.setStart(n,k);r.setEnd(n,k+t.length);getSelection().removeAllRanges();getSelection().addRange(r);return}}},text);
 const paste=text=>page.evaluate(t=>{const dt=new DataTransfer();dt.setData('text/plain',t);document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))},text);
 const html=()=>page.evaluate(()=>$('richEditor').firstElementChild.innerHTML.replace(/​/g,''));
 const reload=()=>page.evaluate(()=>{const i=itemById(db,nid);syncRichFromModel(i);return [...$('richEditor').children].map(b=>(b.dataset.mdblock||'p')+':'+b.textContent)});

 // 1: literal Markdown characters are saved escaped and read back as typed.
 await setup('x','x','end');await paste(' a *b* and `c` # and [d](e) ~~f~~ ==g==');
 const literal=await md();assert.equal(literal,'x a \\*b\\* and \\`c\\` # and \\[d](e) \\~\\~f\\~\\~ \\=\\=g\\=\\=');
 assert.deepEqual(await reload(),['p:x a *b* and `c` # and [d](e) ~~f~~ ==g==']);
 await setup('x','x',0);await page.keyboard.press('Backspace');await page.evaluate(()=>{const b=$('richEditor').firstElementChild;b.textContent='# not a heading';syncModelFromRich()});
 assert.equal(await md(),'\\# not a heading');assert.deepEqual(await reload(),['p:# not a heading']);
 await page.evaluate(()=>{const b=$('richEditor').firstElementChild;b.textContent='1. not a list';syncModelFromRich()});
 assert.equal(await md(),'1\\. not a list');assert.deepEqual(await reload(),['p:1. not a list']);
 // Search finds escaped text as typed.
 assert.ok(await page.evaluate(()=>descriptionSearchText('a \\*b\\*').includes('a *b*')));

 // 2 and 13: strikethrough, highlight, links and web addresses convert as you type.
 for(const [typed,expected] of [[' ~~s~~ z','p <s>s</s> z'],[' ==h== z','p <mark>h</mark> z'],[' [a](https://x.y) z','p <a href="https://x.y" rel="noopener noreferrer">a</a> z'],[' https://example.com z','p <a href="https://example.com" rel="noopener noreferrer">https://example.com</a> z']]){
   await setup('p','p','end');await page.keyboard.type(typed);assert.equal(await html(),expected,typed);
 }
 assert.equal(await md(),'p [https://example.com](https://example.com) z');
 await setup('p','p','end');await page.keyboard.type(' www.example.org');await page.keyboard.press('Enter');
 assert.equal(await md(),'p [www.example.org](https://www.example.org)\n');

 // 3 and 8: a web address pasted over selected words links them; a pasted address keeps its spaces.
 await setup('see docs here','docs',0);await select('docs');await paste('https://example.com');
 assert.equal(await md(),'see [docs](https://example.com) here');
 await setup('x','x','end');await paste(' https://example.com');assert.equal(await md(),'x [https://example.com](https://example.com)');

 // 4: Enter on an empty nested item moves it up a level before leaving the list.
 await setup('- one\n    - two','two','end');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 assert.equal(await md(),'- one\n    - two\n- ');
 await page.keyboard.press('Enter');assert.equal(await md(),'- one\n    - two\n');

 // 5: Tab and Shift+Tab in a code block indent the line and keep focus.
 await setup('```\ncode\n```','code',0);await page.keyboard.press('Tab');assert.equal(await md(),'```\n\tcode\n```');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'richEditor');
 await page.keyboard.press('Shift+Tab');assert.equal(await md(),'```\ncode\n```');

 // 6: Up anywhere on the first line goes to the title.
 await setup('abc def\n\nmore','def',1);await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'editorTitle');

 // 9: a typed header row becomes a table on Enter, with the caret in the new row.
 await setup('p','p','end');await page.keyboard.press('Enter');await page.keyboard.type('| Name | Date |');await page.keyboard.press('Enter');await page.keyboard.type('n');
 assert.equal(await md(),'p\n| Name | Date |\n|---|---|\n| n |  |\n');

 // 10, 11 and 14: strikethrough, highlight and heading shortcuts; the Highlight button.
 await setup('word here','word',0);await select('word');await page.keyboard.press(M+'+Shift+x');assert.equal(await md(),'~~word~~ here');
 await setup('word here','word',0);await select('word');await page.keyboard.press(M+'+Shift+h');assert.equal(await md(),'==word== here');
 await page.keyboard.press(M+'+Shift+h');assert.equal(await md(),'word here');
 await setup('title','title','end');await page.keyboard.press(M+'+Alt+2');assert.equal(await md(),'## title');
 await page.keyboard.press(M+'+Alt+2');assert.equal(await md(),'title');
 await page.keyboard.press(M+'+Alt+1');await page.keyboard.press(M+'+Alt+0');assert.equal(await md(),'title');
 assert.equal(await page.locator('#formatMenu [data-format="highlight"]').count(),1);
 assert.deepEqual(await page.evaluate(()=>{const i=itemById(db,nid);i.content='a ==b== c';syncRichFromModel(i);return [$('richEditor').querySelector('mark')?.textContent,(syncModelFromRich(),i.content)]}),['b','a ==b== c']);

 // 12: brackets close themselves, the closing bracket steps over, Backspace removes an empty pair,
 // and typing a bracket or formatting mark over a selection wraps it.
 await setup('p','p','end');await page.keyboard.type(' (x');assert.equal(await md(),'p (x)');
 await page.keyboard.type(') y');assert.equal(await md(),'p (x) y');
 await setup('p','p','end');await page.keyboard.type(' {');await page.keyboard.press('Backspace');assert.equal(await md(),'p ');
 await setup('word','word',0);await select('word');await page.keyboard.type('[');assert.equal(await md(),'[word]');
 await setup('word','word',0);await select('word');await page.keyboard.type('*');assert.equal(await md(),'*word*');
 await setup('word','word',0);await select('word');await page.keyboard.type('"');assert.equal(await md(),'"word"');
 await setup('ab','ab',1);await page.keyboard.type('(');assert.equal(await md(),'a(b','no pair before a letter');

 // 17: "1)" numbered lists are recognised, typed and continued.
 assert.deepEqual(await page.evaluate(()=>{const i=itemById(db,nid);i.content='1) a\n2) b';syncRichFromModel(i);return [[...$('richEditor').children].map(b=>b.dataset.mdblock+':'+b.querySelector('.md-list-marker')?.textContent),(syncModelFromRich(),i.content)]}),[['ol:1)','ol:2)'],'1) a\n2) b']);
 await setup('p','p','end');await page.keyboard.press('Enter');await page.keyboard.type('1) x');await page.keyboard.press('Enter');await page.keyboard.type('y');
 assert.equal(await md(),'p\n1) x\n2) y');

 assert.deepEqual(errors,[]);
 console.log('editor audit: ok');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
