// #65: copying from the editor gives other apps standard formatting and readable text, and YTNH the exact Markdown.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const source=await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const t=createItem(db,'Todo');t.title='Linked todo';const n=createItem(db,'Note');n.title='Copy test';
   n.content=`# Heading one\n\nPara with **bold**, *italic* and [link](https://example.com) and [[@{${t.id}}]].\n\n- bullet one\n  - nested\n- bullet two\n\n1. first\n2. second\n\n- [ ] open task\n- [x] done task\n\n> quote line\n\n| A | B |\n| --- | --- |\n| 1 | 2 |`;
   render();openSelectedInFullEditor(n.id);return n.content});
 const copy=(kind='copy')=>page.evaluate(kind=>{const dt=new DataTransfer();$('richEditor').dispatchEvent(new ClipboardEvent(kind,{clipboardData:dt,bubbles:true,cancelable:true}));return {html:dt.getData('text/html'),text:dt.getData('text/plain'),md:dt.getData('application/x-ytnh-markdown')}},kind);
 await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents($('richEditor'));getSelection().removeAllRanges();getSelection().addRange(r)});
 const all=await copy();
 for(const part of ['<h1>Heading one</h1>','<strong>bold</strong>','<em>italic</em>','<a href="https://example.com','<ul><li>bullet one<ul><li>nested</li></ul></li><li>bullet two</li></ul>','<ol><li>first</li><li>second</li></ol>','☐ open task','☑ done task','<blockquote><p>quote line</p></blockquote>','<th>A</th>'])assert(all.html.includes(part),'HTML has '+part+'\n'+all.html);
 assert(!/style="(?!border-collapse)|font-family|color:|data-mdblock|contenteditable/.test(all.html),'no app styling or editor markup: '+all.html);
 assert(all.html.includes('Linked todo')&&!all.html.includes('@{'),'item links paste as their titles');
 assert.equal(all.text.split('\n').slice(0,4).join('|'),'Heading one||Para with bold, italic and link and Linked todo.|');
 assert.match(all.text,/• bullet one\n  • nested\n• bullet two/);assert.match(all.text,/☐ open task\n☑ done task/);assert.match(all.text,/A\tB\n1\t2/);
 assert.equal(all.md.trim(),(await page.evaluate(()=>editorHTMLToMarkdown())).trim(),'YTNH gets the exact Markdown back');
 // A few words inside a line copy as inline formatting only.
 const part=await page.evaluate(()=>{const p=[...$('richEditor').children].find(b=>b.textContent.startsWith('Para'));const strong=p.querySelector('strong');const r=document.createRange();r.selectNodeContents(strong);getSelection().removeAllRanges();getSelection().addRange(r);const dt=new DataTransfer();$('richEditor').dispatchEvent(new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true}));return [dt.getData('text/html'),dt.getData('text/plain')]});
 assert.deepEqual(part,['<meta charset="utf-8">bold','bold']);
 assert.deepEqual(errors,[]);
 console.log('PASS editor copy: standard formatting, readable text and exact Markdown for YTNH (#65)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
