// #40: headings fold their sections in the editor (chevron, Mod+., Fold all), remembered per item on this computer.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const content='Intro\n# One\nalpha\n## Sub\nbeta\n# Two\ngamma';
 await page.evaluate(c=>{localStorage.removeItem('ytnh-editor-folds');autosaveEnabled=false;installDatabase(createEmptyDatabase());const n=createItem(db,'Note');n.title='Folding';n.content=c;const m=createItem(db,'Note');m.title='Other';window.nid=n.id;window.other=m.id;render();openSelectedInFullEditor(n.id)},content);
 const M=await page.evaluate(()=>IS_MAC?'Meta':'Control');
 const visible=()=>page.evaluate(()=>[...$('richEditor').children].filter(b=>getComputedStyle(b).display!=='none').map(b=>b.textContent.replace(/​/g,'')));
 const heading=text=>page.locator('#richEditor > [data-mdblock^="h"]',{hasText:text}).first();
 const saved=()=>page.evaluate(()=>itemById(db,nid).content);
 // Only headings with something under them get a chevron.
 assert.deepEqual(await page.evaluate(()=>[...$('richEditor').querySelectorAll('.foldable')].map(b=>b.textContent)),['One','Sub','Two']);
 // Clicking the chevron (left of the heading) folds the section up to the next heading of the same level.
 const box=await heading('One').boundingBox();
 await page.mouse.move(box.x+30,box.y+box.height/2);
 await page.mouse.click(box.x-8,box.y+box.height/2);
 assert.deepEqual(await visible(),['Intro','One','Two','gamma']);
 assert.equal(await saved(),content,'folding never changes the note');
 assert.equal(await page.evaluate(()=>getComputedStyle($('richEditor').querySelector('.folded'),'::after').content),'" …"');
 // Clicking it again unfolds.
 await page.mouse.click(box.x-8,box.y+box.height/2);
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','beta','Two','gamma']);
 // Mod+. folds the section holding the caret: in "beta" that's "Sub"; the caret moves to the heading.
 await page.locator('#richEditor > *',{hasText:'beta'}).click();
 await page.keyboard.press(M+'+Period');
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','Two','gamma']);
 assert.equal(await page.evaluate(()=>bodyBlock(getSelection().getRangeAt(0).startContainer).textContent),'Sub');
 // Enter at the end of a folded heading unfolds it, so the new line is never hidden.
 await page.keyboard.press('Enter');await page.keyboard.type('after');
 assert.equal(await saved(),'Intro\n# One\nalpha\n## Sub\nafter\nbeta\n# Two\ngamma');
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','after','beta','Two','gamma']);
 await page.evaluate(c=>{const i=itemById(db,nid);i.content=c;syncRichFromModel(i)},content);
 // Remembered per item on this computer: reopening shows the same folds.
 await page.locator('#richEditor > *',{hasText:'alpha'}).click();await page.keyboard.press(M+'+Period');
 assert.deepEqual(await visible(),['Intro','One','Two','gamma']);
 await page.evaluate(()=>openSelectedInFullEditor(other));await page.evaluate(()=>openSelectedInFullEditor(nid));
 assert.deepEqual(await visible(),['Intro','One','Two','gamma']);
 assert.match(await page.evaluate(()=>localStorage.getItem('ytnh-editor-folds')),/1\|One\|0/);
 // Find unfolds the section holding a match.
 await page.keyboard.press(M+'+f');await page.keyboard.type('beta');await page.keyboard.press('Enter');
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','beta','Two','gamma']);
 await page.keyboard.press('Escape');
 // Fold all and Unfold all; the document outline unfolds what it jumps to.
 await page.evaluate(()=>setAllEditorFolds(true));
 assert.deepEqual(await visible(),['Intro','One','Two']);
 await page.evaluate(()=>selectSidebarTab('headings'));
 await page.locator('#sidebar-headings button[data-heading-index="1"]').click();
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','Two']);
 await page.evaluate(()=>setAllEditorFolds(false));
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','beta','Two','gamma']);
 assert.equal(await page.evaluate(()=>localStorage.getItem('ytnh-editor-folds')),'{}');
 // Turning a folded heading into text shows its section again.
 await page.locator('#richEditor > *',{hasText:'alpha'}).click();await page.keyboard.press(M+'+Period');
 await page.evaluate(()=>{const h=$('richEditor').querySelector('.folded');setBodyBlock(h,'p');$('richEditor').dispatchEvent(new InputEvent('input',{bubbles:true}))});
 assert.deepEqual(await visible(),['Intro','One','alpha','Sub','beta','Two','gamma']);
 assert.deepEqual(errors,[]);
 console.log('editor folding: ok');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
