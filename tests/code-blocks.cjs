// Fenced code blocks: hidden fences in rich mode, unchanged Markdown, typing shortcuts.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const original='Intro\n```js\nfunction check(part) {\n  return part.ok;\n}\n```\nAfter';
 await p.evaluate(text=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const n=createItem(db,'Note');n.title='Code';n.content=text;render();edit(n.id);window.nid=n.id},original);
 // Fences are hidden but kept, so saving produces the same Markdown.
 const shown=await p.locator('#richEditor [data-mdblock="code"]').innerText();
 assert(!shown.includes('```'),'fence lines are hidden in rich mode: '+shown);
 assert.match(shown,/function check\(part\)/);
 await p.evaluate(()=>syncModelFromRich());
 assert.equal(await p.evaluate(()=>itemById(db,nid).content),original);
 // Typing ``` and Enter starts a code block; Enter on an empty last line leaves it.
 await p.locator('#richEditor').click();
 await p.evaluate(()=>{const last=$('richEditor').lastElementChild;const r=document.createRange();r.selectNodeContents(last);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)});
 await p.keyboard.press('Enter');await p.keyboard.type('```');await p.keyboard.press('Enter');
 assert.equal(await p.evaluate(()=>$('richEditor').lastElementChild.dataset.mdblock),'code');
 await p.keyboard.type('line one');await p.keyboard.press('Enter');await p.keyboard.type('line two');
 await p.keyboard.press('Enter');await p.keyboard.press('Enter');await p.keyboard.type('Plain text');
 const md=await p.evaluate(()=>itemById(db,nid).content);
 assert(md.endsWith('After\n```\nline one\nline two\n```\nPlain text'),JSON.stringify(md));
 // Backspace at the start of an empty code block turns it back into a paragraph instead of exposing a fence.
 await p.keyboard.press('Enter');await p.keyboard.type('```');await p.keyboard.press('Enter');await p.keyboard.press('Backspace');
 assert.equal(await p.evaluate(()=>$('richEditor').lastElementChild.dataset.mdblock),'p');
 assert(!(await p.evaluate(()=>itemById(db,nid).content)).endsWith('```'));
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS code blocks hide fences, keep Markdown and support typing shortcuts');
})().catch(e=>{console.error(e);process.exit(1)});
