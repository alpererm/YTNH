"use strict";
// Library storage: the active file handle, autosave queue, recent libraries and recovery.
// Loaded before the main script; everything here is declarations, so nothing runs at load
// except reading the autosave preference.
class FileStorage{
 constructor(){this.handle=null;this.name=null;this.lastLoadedText=null}
 get directWrite(){return !!this.handle?.sqlite}
 async save(db){
   if(!this.handle?.sqlite)throw new Error('Open or create a library before saving.');
   return this.handle.saveModel(db);
 }
 export(db,name=`productivity-backup-${new Date().toISOString().slice(0,10)}.json`){return this.handle?.sqlite?window.notesDesktop.sqlite.exportModel(this.handle,db):downloadText(name,JSON.stringify(db,null,2))}
}
function downloadText(name,text){if(!window.notesDesktop)throw new Error('Recovery export requires the desktop application.');return window.notesDesktop.exportText(name,text)}
async function recentFileRecords(){return window.notesDesktop?window.notesDesktop.recentFiles():[]}
async function openRecentFile(record){
 if((storage.handle?.portable||record.handle?.portable)&&window.notesDesktop?.sqlite?.openRecent)return window.notesDesktop.sqlite.openRecent(record);
 if(!allowDatabaseSwitch())return;if(!record.handle){$('openFile').click();return}
 fileOperationBusy=true;const owner=db,revision=JSON.stringify(db);
 try{const handle=record.handle;if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('File permission was not granted.');const file=await handle.getFile(),text=await file.text(),next=migrateDatabase(JSON.parse(text));if(db!==owner||JSON.stringify(db)!==revision)throw new Error('The library changed. Try again.');storage.handle=handle;storage.name=file.name;storage.lastLoadedText=text;installDatabase(next,!!next.__migratedFromSchema);await rememberLastFile();$('appMenu').open=false;toast('Opened '+file.name)}catch(e){toast('Could not open recent file: '+e.message)}finally{fileOperationBusy=false}
}
function lastFileRecord(value){return window.notesDesktop?.lastFileRecord(value)}
async function rememberLastFile(){
 try{await lastFileRecord({handle:storage.handle,name:storage.name})}catch(e){/* Saving remains available if session metadata is unavailable. */}
}
// One queue owns manual and automatic database writes; view changes never reload the editor.
let saveState='Unsaved',saveBlocked=false,savePromise=null,saveAgain=false,saveTimer=null,saveDeadline=null,changeSerial=0;
let autosaveEnabled=(()=>{try{return localStorage.getItem('yutanohe-autosave')!=='false'}catch{return true}})();
function paintSaveState(){const el=$('storageStatus');if(el&&db){el.textContent=(storage.handle?.sqlite&&['Saved','Loaded'].includes(saveState)?storage.handle.syncLabel||'Saved locally':saveState)+' · '+(storage.name||'No library open');el.title=storage.handle?.sqlite?(storage.handle.syncDetail||'Changes autosave locally. Saving, and closing the app, update your library file. Cloud sync isn’t confirmed.'):'No library open. Click for recovery options.';el.onclick=openSaveRecovery;el.tabIndex=0;el.setAttribute('role','button');el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSaveRecovery()}}}}
function scheduleAutosave(){changeSerial++;if(!savePromise&&saveState!=='Conflict detected'&&saveState!=='Save failed')saveState='Unsaved';paintSaveState();if(!autosaveEnabled||saveBlocked)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;requestDatabaseSave()},2000);if(!saveDeadline)saveDeadline=setTimeout(()=>{saveDeadline=null;requestDatabaseSave()},15000)}
function resetAutosave(){clearTimeout(saveTimer);clearTimeout(saveDeadline);saveTimer=saveDeadline=null;saveBlocked=false;saveAgain=false;saveState=dirty?'Unsaved':'Loaded';changeSerial++;if(dirty)scheduleAutosave()}
async function requestDatabaseSave({manual=false}={}){
 if(!db||(!manual&&!autosaveEnabled))return false;
 if(savePromise){saveAgain=true;await savePromise;return !dirty}
 if(saveBlocked){if(manual)openSaveRecovery();return false}
 if(fileOperationBusy||archiveOperationBusy){if(dirty&&!saveTimer)saveTimer=setTimeout(()=>{saveTimer=null;requestDatabaseSave()},1000);return false}
 if(!dirty&&storage.directWrite)return true;
 if(!manual&&!storage.directWrite){saveState='Unsaved';paintSaveState();return false}
 clearTimeout(saveTimer);clearTimeout(saveDeadline);saveTimer=saveDeadline=null;
 savePromise=(async()=>{
  do{
   saveAgain=false;const owner=db;if(manual){rememberEditorLocation();flushPendingInputs();if(editorIsOpen())restoreItemEditorLocation(selected)}const serial=changeSerial,snapshot=JSON.parse(JSON.stringify(db));fileOperationBusy=true;saveState='Saving…';paintSaveState();
   try{
    const result=await storage.save(snapshot,{interactive:manual});
    if(result.mode!=='direct'){saveState='Unsaved';paintSaveState();return false}
    if(db!==owner)return false;
    Promise.resolve(rememberLastFile()).catch(error=>console.warn("Recent file could not be recorded",error));if(changeSerial===serial){markClean();saveState='Saved'}else{saveState='Unsaved';saveAgain=true}
    paintSaveState();
   }catch(error){
    if(error.name==='AbortError'){saveState='Unsaved';paintSaveState();return false}
    saveState=/changed outside|changed while|cloud-synced|conflict/i.test(error.message)?'Conflict detected':error.name==='NotAllowedError'?'Unsaved':'Save failed';
    saveBlocked=true;paintSaveState();toast(saveState+': '+error.message+' Use Save for recovery options.');return false;
   }finally{fileOperationBusy=false}
  }while(saveAgain&&dirty&&!saveBlocked);
  return !dirty;
 })();
 try{return await savePromise}finally{savePromise=null;if(dirty&&!saveBlocked&&autosaveEnabled)scheduleAutosave()}
}
function flushAutosaveOnNavigation(){if(dirty&&autosaveEnabled)void requestDatabaseSave()}
// Retain read-only access to existing recovery snapshots; desktop backups are native.
function readRecoverySnapshots(){return new Promise((resolve,reject)=>{const req=indexedDB.open('yutanohe-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('snapshots');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const connection=req.result,tx=connection.transaction('snapshots','readonly'),op=tx.objectStore('snapshots').get('rolling');tx.oncomplete=()=>{connection.close();resolve(op.result||[])};tx.onerror=()=>{connection.close();reject(tx.error)}}})}
function openSaveRecovery(){
 if(savePromise){toast('Saving is in progress.');return}
 resetModalShell();$('modalTitle').textContent='Saving and recovery';$('modalText').textContent=saveState==='Conflict detected'?'External changes detected. Saving is stopped. Preserve your unsaved copy before reloading.':'Open a library to save. Recovery snapshots are still available below.';
 $('modalExtra').innerHTML='<label><input id="autosaveToggle" type="checkbox"> Autosave (2 seconds idle / 15 seconds while editing)</label><div class="group"><button id="recoverExport">Export unsaved copy</button><button id="recoverRetry">Retry manual Save</button><button id="recoverReload">Reload connected file</button></div><div id="recoverySnapshots"></div>';
 if(storage.handle?.sqlite)$('modalText').textContent=storage.handle.portable?'Changes autosave locally. Saving, and closing the app, update your library file. If that fails, your local work is kept.':'A registered legacy library must be explicitly converted before editing. Original files and recovery exports are retained.';
 $('autosaveToggle').checked=autosaveEnabled;$('autosaveToggle').onchange=()=>{autosaveEnabled=$('autosaveToggle').checked;try{localStorage.setItem('yutanohe-autosave',String(autosaveEnabled))}catch{toast('Autosave preference applies to this session only.')};if(autosaveEnabled&&dirty)scheduleAutosave();else{clearTimeout(saveTimer);clearTimeout(saveDeadline);saveTimer=saveDeadline=null}};
 $('recoverExport').onclick=async()=>{try{flushPendingInputs();await storage.export(db,'unsaved-recovery-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')}catch(error){if(error.name!=='AbortError')toast('Recovery export failed: '+error.message)}};
 $('recoverRetry').onclick=()=>{if(storage.handle?.portable){closeModalShell();void window.notesDesktop.sqlite.manualSave();return}if(saveState==='Conflict detected'){toast('Reload or export your unsaved copy first. External changes will not be overwritten.');return}saveBlocked=false;closeModalShell();requestDatabaseSave({manual:true})};
 $('recoverReload').disabled=!storage.handle;$('recoverReload').onclick=async()=>{if(!await appConfirm('Discard pending changes?','Reload the library and discard changes that are not saved yet. Export an unsaved copy first if you need it.','Discard and reload'))return;const owner=db,serial=changeSerial;fileOperationBusy=true;try{const file=await storage.handle.getFile(),text=await file.text(),next=migrateDatabase(JSON.parse(text));if(owner!==db||serial!==changeSerial)throw new Error('Changes occurred while reloading. Current version retained.');storage.lastLoadedText=text;closeModalShell();installDatabase(next)}catch(e){toast(e.message)}finally{fileOperationBusy=false}};
 readRecoverySnapshots().then(rows=>{const host=$('recoverySnapshots');if(!host)return;for(const row of rows.slice().reverse()){const button=document.createElement('button');button.textContent=row.name;button.onclick=()=>downloadText(row.name,row.text);host.append(button)}}).catch(()=>{});
 $('modalOK').textContent='Close';$('modalOK').onclick=closeModalShell;$('modalCancel').classList.add('hidden');$('modalbg').classList.add('open');
}
