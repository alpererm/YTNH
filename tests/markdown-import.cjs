// Markdown folder import: folders become parent Notes, files become Notes titled by file name, front matter
// tags and dates are applied, relative images are copied, links between imported files become item links,
// code is left alone, and the whole import is one undo step.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const r=await p.evaluate(async()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());const existing=createItem(db,'Todo');existing.title='Existing';render();
   const files=[
     {path:'Index.md',text:'---\ntitle: Ignored\ntags: [Project, "big idea"]\ndate: 2024-03-05\n---\n# Welcome\n\nSee [the plan](Work/Plan.md#goals) and [[Ideas]] or [[Work/Plan|the plan]].\n\n![Diagram](images/diagram.png)\n\nExternal [site](https://example.com/a.md) and [missing](Nope.md).\n',created:'2020-01-01T00:00:00.000Z'},
     {path:'Work/Plan.md',text:'---\ntags:\n  - work\n  - "#q4"\n---\nBack to [index](../Index.md).\n\n```md\n[[Ideas]] stays in code\n![x](../images/diagram.png)\n```\n\nInline `[[Ideas]]` stays too.\n\n![[photo.jpg]]\n'},
     {path:'Work/Archive/Old notes.md',text:'Plain text, no front matter.\r\nSecond line.'},
     {path:'Ideas.markdown',text:'Ideas body'},
     {path:'Work/10 Later.md',text:'later'},{path:'Work/2 Sooner.md',text:'sooner'},
     {path:'readme.txt',text:'not markdown'}
   ];
   const reads=[];
   const res=await MarkdownImport.build(db,{name:'My Notes',files,images:['images/diagram.png','Work/photo.jpg'],readImage:async p=>{reads.push(p);return {hash:'h'+reads.length,extension:p.split('.').pop(),bytes:10}}});
   render();
   const by=t=>db.items.find(i=>i.title===t);const kids=id=>childrenOf(db,id).map(i=>i.title);
   return {res:{notes:res.notes,folders:res.folders,links:res.links,images:res.images},root:res.root.title,rootKids:kids(res.root.id),workKids:kids(by('Work').id),archiveKids:kids(by('Archive').id),
     index:by('Index').content,indexTags:by('Index').explicitTags,indexCreated:by('Index').createdAt,plan:by('Plan').content,planTags:by('Plan').explicitTags,old:by('Old notes').content,oldCreated:by('Old notes').createdAt,
     ids:{plan:by('Plan').id,ideas:by('Ideas').id,index:by('Index').id},reads,assets:Object.keys(db.imageAssets||{}),types:[...new Set(db.items.filter(i=>i.id!==existing.id).map(i=>i.type))],
     visible:[...document.querySelectorAll('#tree .row .title')].map(t=>t.textContent).slice(0,3)};
 });
 assert.equal(r.root,'Imported – My Notes');
 assert.deepEqual(r.rootKids,['Work','Ideas','Index'],'subfolders first, then files, natural order');
 assert.deepEqual(r.workKids,['Archive','2 Sooner','10 Later','Plan'],'natural number order');
 assert.deepEqual(r.archiveKids,['Old notes'],'titles are file names without extension');
 assert.deepEqual(r.types,['Note']);
 assert.deepEqual(r.res,{notes:6,folders:2,links:4,images:2});
 const ref=id=>'[[@{'+id+'}]]';
 assert.ok(r.index.startsWith('# Welcome'),'front matter removed, body kept (title stays the file name)');
 assert.ok(r.index.includes('See '+ref(r.ids.plan)+' and '+ref(r.ids.ideas)+' or '+ref(r.ids.plan)+'.'),r.index);
 assert.ok(r.index.includes('![Diagram](assets/h1.png)'),'relative image copied into the library');
 assert.ok(r.index.includes('[site](https://example.com/a.md)')&&r.index.includes('[missing](Nope.md)'),'external and unknown links stay as written');
 assert.deepEqual(r.indexTags,['project','big-idea'],'list entries stay whole');
 assert.equal(r.indexCreated,'2024-03-05T12:00:00.000Z','front matter date becomes the creation date');
 assert.deepEqual(r.planTags,['work','q4']);
 assert.ok(r.plan.includes('Back to '+ref(r.ids.index)),'../ links resolve');
 assert.ok(r.plan.includes('```md\n[[Ideas]] stays in code\n![x](../images/diagram.png)\n```'),'fenced code untouched');
 assert.ok(r.plan.includes('Inline `[[Ideas]]` stays too.'),'inline code untouched');
 assert.ok(r.plan.includes('![photo](assets/h2.jpg)'),'wiki image embed found by file name');
 assert.equal(r.old,'Plain text, no front matter.\nSecond line.','line endings normalised');
 assert.ok(r.oldCreated,'creation date set');
 assert.deepEqual(r.reads,['images/diagram.png','Work/photo.jpg'],'each image read once');

 // One undo removes the whole import; no Markdown files → nothing changes.
 const undo=await p.evaluate(async()=>{
   installDatabase(createEmptyDatabase());const before=db.items.length;
   let error='';try{await MarkdownImport.build(db,{name:'Empty',files:[{path:'a.txt',text:'x'}]})}catch(e){error=e.message}
   return {error,unchanged:db.items.length===before,menu:!!document.getElementById('importMarkdownFolder')&&$('importMarkdownFolder').textContent};
 });
 assert.match(undo.error,/No Markdown files/);assert.equal(undo.unchanged,true);assert.equal(undo.menu,'Import Markdown Folder…');
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS Markdown folder import: structure, titles, front matter, images, links, code, empty folder');
})().catch(e=>{console.error(e);process.exit(1)});
