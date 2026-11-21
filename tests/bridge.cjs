const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.probe={calls:[],files:{},pick:'recovery',failImport:true,last:null};
  window.__TAURI__={core:{invoke:async(command,args={})=>{
   probe.calls.push({command,args});
   if(['acknowledge_close','finish_close_attempt','close_app'].includes(command))return;
   if(command==='capture_status')return {errors:[]};
   if(command==='pick_json')return probe.pick?{id:probe.pick,name:probe.pick+'.json',revision:probe.files[probe.pick]??null}:null;
   if(command==='write_json'){if((probe.files[args.id]??null)!==args.expected)throw Error('External change');probe.files[args.id]=args.text;return args.text}
   if(command==='open_link'){if(args.href.includes('missing'))throw Error('The linked file was not found');return}
   if(command==='library_action'){
    const {op}=args,record={id:'recovered',name:'Recovered library',revision:'r1'};
    if(op==='last')return probe.last;
    if(op==='list')return [];
    if(op==='remember'){probe.last=args.args.id;return}
    if(op==='check_local')return;
    if(op==='inspect')return {id:record.id,advance:false,latest:{code:'verified',closed:{source:'B'}},device:'A',localHead:'r1'};
    if(op==='status'||op==='allow_local')return record;
    if(op==='read')return {model:probe.model,revision:'r1'};
    if(op==='export')throw Error('Archive unavailable');
    if(op==='archive'){if(probe.failArchive)throw Error('Archive write failed');probe.archive=JSON.parse(args.args.text);return;}
    if(op==='choose_folder')return null;
   }
   throw Error('Unexpected command '+command+' '+JSON.stringify(args));
  }}};
 });
 const root=path.resolve(__dirname,'..');
 await page.route('http://bridge-cleanup.local/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'app.html';let body=fs.readFileSync(path.join(root,name));
  if(name==='app.html')body=body.toString().replace('<script>"use strict";',()=>'<script>'+fs.readFileSync(path.join(root,'library-bridge.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'bridge.js'),'utf8')+'</script><script>"use strict";');
  return route.fulfill({body,contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});
 });
 await page.goto('http://bridge-cleanup.local/app.html');
 await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());createItem(db,'Note').title='Keep this library';dirty=false;probe.files.recovery=JSON.stringify(createEmptyDatabase());window.before=db;});
 assert.equal(await page.getByRole('button',{name:'Restore recovery export…',exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>typeof notesDesktop.pickRecovery),'undefined');
 // Install a synthetic already-open SQLite handle to exercise retained exports/archives.
 await page.evaluate(()=>{storage.handle={sqlite:true,id:'recovered'};storage.name='Synthetic library';probe.last='recovered'});
 await page.evaluate(()=>{probe.pick='emergency';window.exporting=notesDesktop.sqlite.exportModel(storage.handle,db)});
 await page.getByRole('button',{name:'Export emergency JSON…',exact:true}).click();await page.evaluate(()=>exporting);
 assert(await page.evaluate(()=>JSON.stringify(JSON.parse(probe.files.emergency))===JSON.stringify(db)));
 assert.equal(await page.evaluate(()=>probe.last),'recovered');
 assert.equal(await page.evaluate(async()=>{probe.pick=null;try{await notesDesktop.exportText('cancel.json','{}');return false}catch(e){return e.name==='AbortError'}}),true);
 await page.evaluate(()=>openEditorLink('file:///C:/Documents/Drawing.vsdx'));
 await page.waitForFunction(()=>probe.calls.some(c=>c.command==='open_link'));
 assert(await page.evaluate(()=>!probe.calls.some(c=>['last_file','recent_files','remember_file'].includes(c.command)||c.args.op==='source_state')));
 await page.evaluate(async()=>{
  const payload={archive:'synthetic'};if(await writeColdArchiveFile(payload,'archive.json')!=='archive.json'||probe.archive.archive!=='synthetic')throw Error('Archive routing failed');
  probe.failArchive=true;const before=JSON.stringify(db);let rejected=false;try{await writeColdArchiveFile(payload,'archive.json')}catch{rejected=true}if(!rejected||JSON.stringify(db)!==before)throw Error('Archive error changed current data');
  await new Promise((resolve,reject)=>{const r=indexedDB.open('yutanohe-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result,t=c.transaction('snapshots','readwrite');t.objectStore('snapshots').put([{name:'existing-recovery.json',text:'{"preserved":true}'}],'rolling');t.oncomplete=()=>{c.close();resolve()}}});
  const snapshots=await readRecoverySnapshots();if(snapshots[0].name!=='existing-recovery.json')throw Error('Existing recovery missing');
  probe.pick='old-recovery';openSaveRecovery();
 });
 await page.getByRole('button',{name:'existing-recovery.json',exact:true}).click();await page.waitForFunction(()=>!!probe.files['old-recovery']);
 assert.equal(await page.evaluate(()=>probe.files['old-recovery']),'{"preserved":true}');
 // Keep the native watchdog armed while a save/handoff decision is pending.
 await page.evaluate(()=>{
  closeModalShell();dirty=false;probe.calls=[];
  notesDesktop.sqlite.closeDecision=()=>new Promise(resolve=>window.releaseClose=resolve);
  window.dispatchEvent(new Event('notes-desktop-close'));
 });
 await page.waitForFunction(()=>!!window.releaseClose);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='acknowledge_close').length),1);
 await page.evaluate(()=>window.dispatchEvent(new Event('notes-desktop-close')));
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='finish_close_attempt').length),0);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='acknowledge_close').length),1);
 await page.evaluate(()=>releaseClose(false));await page.waitForFunction(()=>!notesDesktopClosing);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='finish_close_attempt').length),1);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='close_app').length),0);
 await page.evaluate(()=>{notesDesktop.sqlite.closeDecision=async()=>{throw Error('Injected close failure')};window.dispatchEvent(new Event('notes-desktop-close'))});
 await page.waitForFunction(()=>!notesDesktopClosing);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='finish_close_attempt').length),2);
 await page.evaluate(()=>{notesDesktop.sqlite.closeDecision=async()=>true;window.dispatchEvent(new Event('notes-desktop-close'))});
 await page.waitForFunction(()=>!notesDesktopClosing);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='close_app').length),1);
 assert.equal(await page.evaluate(()=>probe.calls.filter(c=>c.command==='finish_close_attempt').length),3);
 assert.deepEqual(errors,[]);
 console.log('PASS SQLite-only startup/recent routing, removed JSON import, retained existing data, emergency export, cancelled picker, native links');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
