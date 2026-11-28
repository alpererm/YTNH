// Portable desktop file pickers and explicit legacy transition. The editor still uses its existing model and save queue.
function createDesktopLibraries(call) {
  const action = (op, args = {}) => call('library_action', { op, args });
  const cancel = () => new DOMException('Cancelled', 'AbortError');
  let busy = false;

  // #46: a dialog that lists many choices (backups, recovery copies, archives) shows them in a dropdown with one
  // action button and Cancel, instead of a row of buttons that runs off the edge.
  function chooseFrom(title, message, choices, actionLabel, selected, extra) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');dialog.className = 'libraryDialog';
      const heading = document.createElement('h3');heading.textContent = title;
      const text = document.createElement('p');text.textContent = message;
      const select = document.createElement('select');select.className = 'field libraryChoice';select.setAttribute('aria-label', title);
      for (const [value, label] of choices) { const option = document.createElement('option');option.value = value;option.textContent = label;select.append(option); }
      const actions = document.createElement('div');actions.className = 'modalactions';
      const finish = (choice, value = '') => { dialog.close(); dialog.remove(); resolve({choice, value}); };
      const go = document.createElement('button');go.className = 'primary';go.textContent = actionLabel;go.onclick = () => finish(select.value);
      const cancel = document.createElement('button');cancel.textContent = 'Cancel';cancel.onclick = () => finish('cancel');
      // With nothing valid to choose (for example only damaged recovery copies), offer just Cancel.
      // An optional second action (for example Discard) works on the selected choice.
      const more = extra && choices.length ? Object.assign(document.createElement('button'), {textContent: extra[1], onclick: () => finish(extra[0], select.value)}) : null;
      if (choices.length) { actions.append(...(more ? [more] : []), cancel, go);dialog.append(heading, text, select, actions); } else { actions.append(cancel);dialog.append(heading, text, actions); }
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish('cancel'); });
      dialog.onkeydown = event => { event.stopPropagation(); if (event.key === 'Enter' && event.target === select) { event.preventDefault(); finish(select.value); } };
      if (selected !== undefined) select.value = selected;
      document.body.append(dialog); dialog.showModal(); (choices.length ? select : cancel).focus();
    });
  }
  function question(title, message, buttons, field) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'libraryDialog';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const text = document.createElement('p');
      text.textContent = message;
      dialog.append(heading, text);
      let input;
      if (field) {
        const label = document.createElement('label');
        label.textContent = field;
        input = document.createElement('input');
        input.className = 'field';
        input.autocomplete = 'off';
        label.append(input);
        dialog.append(label);
      }
      const actions = document.createElement('div');
      actions.className = 'modalactions';
      function finish(choice) {
        const value = input?.value.trim() || '';
        dialog.close(); dialog.remove();
        resolve({choice, value});
      }
      for (const [choice, caption] of buttons) {
        const button = document.createElement('button');
        button.textContent = caption;
        button.onclick = () => finish(choice);
        actions.append(button);
      }
      dialog.append(actions);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish('cancel'); });
      dialog.onkeydown = event => {
        event.stopPropagation();
        if (event.target === input && event.key === 'Enter') {
          event.preventDefault(); finish(buttons[0][0]);
        }
      };
      document.body.append(dialog); dialog.showModal();
      (input || actions.firstElementChild).focus();
    });
  }

  async function exclusive(task) {
    if (busy) throw new Error('Finish the current library operation first.');
    busy = true;
    const layout = document.getElementById('layout');
    const owner=db,selection=captureEditorSelection(),scroll=document.querySelector('.documentScroll')?.scrollTop;
    const wasInert=layout.inert;layout.inert = true;
    try { return await task(); } finally {
      layout.inert = wasInert; busy = false;
      if(!wasInert&&db===owner&&selection&&editorIsOpen()){restoreEditorSelection(selection);const scroller=document.querySelector('.documentScroll');if(scroller)scroller.scrollTop=scroll||0}
    }
  }
  const report = error => { if (error.name !== 'AbortError') toast(error.message); };
  async function exportModel(handle,model){
    try{
      const dest=await action('export',{id:handle.id,model});
      if(!dest)throw cancel();
      return dest;
    }catch(error){
      if(error.name==='AbortError')throw error;
      const reply=await question('Complete recovery export failed',error.message+'\nYou can still save the current notes and todos as emergency JSON. Keep the original archive files for recovery.',[['json','Export emergency JSON…'],['cancel','Cancel']]);
      if(reply.choice!=='json')throw cancel();
      await window.notesDesktop.exportText('emergency-recovery.json',JSON.stringify(model,null,2));
    }
  }
  function syncState(handle,label,detail='Changes are saved locally; cloud synchronization is handled by your storage provider.'){
    handle.syncLabel=label;handle.syncDetail=detail;
    if(storage.handle===handle)paintSaveState();
  }
  async function transitionLegacy(handle){
    if(storage.handle===handle&&dirty)await flush();
    for(;;){
      try{
        const info=await action('legacy_review',{id:handle.id});
        const message='Convert the verified local copy of “'+info.name+'” to a new portable file. This does not check another computer or fetch handoffs. Confirm that this is the copy you want to continue using.'+
          (info.paused?' This library was paused for a handoff; another computer may have newer work.':'')+
          (info.unpublished?' This local copy has unpublished changes; they will be included.':'')+
          ' Original files and backups will be retained. Continue using the new file after conversion.';
        const reply=await question('Convert registered library',message,[['convert','Convert this local copy…'],['export','Export local recovery…'],['cancel','Cancel']]);
        if(reply.choice==='cancel')throw cancel();
        if(reply.choice==='export'){await action('export',{id:handle.id});continue}
        const record=await action('portable_transition',{id:handle.id,revision:info.revision});
        if(!record)throw cancel();
        handle.portable=true;
        return record;
      }catch(error){
        if(error.name==='AbortError')throw error;
        const reply=await question('Library conversion did not finish',error.message+' The original local library is retained.',[['retry','Retry'],['export','Export local recovery…'],['cancel','Cancel']]);
        if(reply.choice==='cancel')throw cancel();
        if(reply.choice==='export')await action('export',{id:handle.id});
      }
    }
  }
  const portableDetail='Changes autosave locally. Saving, and closing the app, update your library file. Cloud sync is handled by your storage provider.';
  async function openPortable(handle){
    for(;;){
      try{return await action('portable_reopen',{id:handle.id})}
      catch(error){
        const reply=await question('Library file unavailable',error.message+' Your local working copy is retained. If you deleted the library file on purpose, Forget on This Computer removes what YTNH kept of it here.',[['retry','Retry'],['recover','Recover local work'],['forget','Forget on This Computer'],['cancel','Cancel']]);
        if(reply.choice==='retry')continue;
        if(reply.choice==='forget'){await forgetLibrary(handle.id,handle.name);throw cancel()}
        if(reply.choice!=='recover')throw cancel();
        const record=await action('portable_recover',{id:handle.id});
        handle.masterIssue=error.message;return record;
      }
    }
  }
  // Removes everything YTNH keeps about a library on this computer. Unsaved local edits are only
  // discarded after a second, explicit confirmation. Returns false when cancelled.
  async function forgetLibrary(id,name){
    const reply=await question('Forget “'+name+'” on this computer?','YTNH removes its local copies, its automatic backups in YTNH’s folder and its place in Open Recent from this computer. The library file itself, and any backups next to it, are not touched; open it again with Open Library….',[['cancel','Cancel'],['forget','Forget']]);
    if(reply.choice!=='forget')return false;
    try{await action('portable_forget',{id})}
    catch(error){
      const again=await question('Local edits aren’t in the library file',error.message,[['cancel','Cancel'],['discard','Discard and Forget']]);
      if(again.choice!=='discard')return false;
      await action('portable_forget',{id,discard:true});
    }
    toast('“'+name+'” is forgotten on this computer');
    return true;
  }
  async function savePortable(handle,{closing=false,saveAs=false}={}){
    let asNew=saveAs;
    for(;;){
      try{
        // Retry must also retry a failed local write. Never discard the in-memory model.
        if(saveBlocked)saveBlocked=false;
        await flush();
        syncState(handle,'Saving library…',portableDetail);
        const record=await action(asNew?'portable_save_as':'portable_publish',{id:handle.id,revision:handle.revision});
        if(!record){syncState(handle,'Saved locally — library file pending',portableDetail);return false}
        handle.name=record.name;handle.unpublished=record.unpublished;handle.masterIssue=null;
        if(storage.handle===handle){storage.name=record.name;await rememberLastFile()}
        syncState(handle,record.unpublished?'Saved locally — library file pending':'Saved',portableDetail);
        return true;
      }catch(error){
        handle.masterIssue=error.message;
        syncState(handle,/conflict|changed|divergent/i.test(error.message)?'Conflict detected':'Save failed',error.message+' '+portableDetail);
        const changedElsewhere=!asNew&&/changed outside YTNH/.test(error.message);
        const reply=changedElsewhere
          ?await question('Library changed on another computer','Another computer saved this library after you opened it here. Keep Both copies the items it changed into a “Conflicting changes” branch, then saves everything to the library file. Save As… keeps the two files apart.',[['keepboth','Keep Both'],['saveas','Save As…'],['cancel',closing?'Cancel Close':'Cancel']])
          :await question('Library file was not saved',error.message+(dirty?' Pending edits remain in the application. Retry the local save or cancel.':' Your local work is retained.'),[['retry','Retry'],...(!dirty?[['saveas','Save As…']]:[]),['cancel',closing?'Cancel Close':'Cancel']]);
        if(reply.choice==='cancel')return false;
        if(reply.choice==='keepboth'){
          try{await keepBoth(handle)}catch(failure){if(failure.name==='AbortError')return false;toast(failure.message)}
          continue;
        }
        asNew=reply.choice==='saveas';
      }
    }
  }
  // Merge the other computer's changed items into this copy, save it locally, then let the next
  // save replace the library file. The local save comes first, so a failure never loses either side.
  async function keepBoth(handle){
    syncState(handle,'Copying the other computer’s changes…',portableDetail);
    const other=await action('portable_conflict_read',{id:handle.id});
    if(storage.handle!==handle)throw cancel();
    const copied=mergeConflictingCopy(db,other.model,other.changed,other.fingerprint.sha256);
    if(copied)render();
    await flush();
    await action('portable_conflict_adopt',{id:handle.id,fingerprint:other.fingerprint});
    toast(copied?`Copied ${copied} item${copied===1?'':'s'} changed on the other computer into “Conflicting changes from another computer”.`:'The other computer’s changes are already here.');
  }
  async function beforeSwitch(){
    if(storage.handle?.portable)return savePortable(storage.handle);
    return allowDatabaseSwitch();
  }
  async function activateRecord(record){
    if(!record)throw cancel();
    const handle=new LibraryHandle(record);handle.checked=true;
    if(handle.portable)syncState(handle,record.unpublished?'Saved locally — library file pending':'Saved',portableDetail);
    await activate(handle);
  }
  class LibraryHandle {
    constructor(record) {
      this.id=record.id; this.name=record.name; this.kind='file'; this.sqlite=true;
      this.checked=false; this.revision=null;this.syncLabel='Saved locally';this.portable=!!record.portable;this.unpublished=!!record.unpublished;if(this.portable)this.syncDetail=portableDetail;
    }
    async queryPermission(){return 'granted';}
    async requestPermission(){return 'granted';}
    async getFile(){
      if (!this.checked) {
        const info=this.portable?await openPortable(this):await transitionLegacy(this);
        this.name=info.name||this.name;this.unpublished=!!info.unpublished;
        if(this.portable)this.syncDetail=portableDetail;
        this.syncLabel=this.portable?(this.masterIssue?'Saved locally — library file unavailable':this.unpublished?'Saved locally — library file pending':'Saved'):info.syncLabel;
        this.checked=true;
      }
      const r=await action('read',{id:this.id});
      this.revision=r.revision;
      return new File([JSON.stringify(r.model)],this.name,{type:'application/json'});
    }
    async reverify(){
      if(!this.portable)throw new Error('Convert the registered local library before editing.');
      // A library whose local copy was removed after a clean save opens again from its file.
      await action(this.closed?'portable_reopen':'portable_recover',{id:this.id});this.closed=false;this.checked=true;
    }
    async saveModel(model){
      if(!this.revision)throw new Error('Verify and open this local library before saving.');
      if(!this.checked)await this.reverify();
      const r=await action('save',{id:this.id,revision:this.revision,model});
      const changed=this.revision!==r.revision;this.revision=r.revision;
      if(changed&&this.portable){this.unpublished=true;syncState(this,'Saved locally — library file pending',this.masterIssue?this.masterIssue+' '+portableDetail:portableDetail)}
      return {mode:'direct',name:this.name};
    }
  }

  async function activate(handle){
    const previous=storage.handle;
    const file=await handle.getFile();
    const text=await file.text(),model=migrateDatabase(JSON.parse(text));
    storage.handle=handle;storage.name=handle.name;storage.lastLoadedText=text;
    installDatabase(model,!!model.__migratedFromSchema);
    await rememberLastFile();
    // The library we switched away from was saved first: keep nothing of it on this computer.
    if(previous?.portable&&previous.id!==handle.id)await closeLocalCopy(previous);
  }
  // Removes a library's local working copy once everything in it is in the library file. The copy
  // stays (for Recover Unsaved Copy) whenever something isn't saved to the file yet.
  async function closeLocalCopy(handle){
    try{const result=await action('portable_close',{id:handle.id});if(result?.closed){handle.closed=true;handle.checked=false}}
    catch(error){console.warn('The local copy was kept',error)}
  }
  async function flush(){
    flushPendingInputs();if(savePromise)await savePromise;
    if(dirty&&(!await requestDatabaseSave({manual:true})||dirty))throw new Error('Local save did not finish. Your pending edits are still here.');
  }
  // Desktop items go into fixed slots of the flat application menu (review 16).
  function addMenu(label,run,id,slot='libraryToolsMenu'){
    const b=document.createElement('button');b.type='button';b.textContent=label;if(id)b.id=id;
    const anchor=slot==='afterSave'?document.getElementById('saveFile'):null;
    if(anchor)anchor.after(b);else document.getElementById(slot).append(b);
    b.onclick=()=>{$('appMenu').open=false;exclusive(run).catch(report);};
    return b;
  }
  async function cleanImages(){
    const handle=storage.handle;if(!handle?.sqlite)return;
    await flush();
    const hashes=new Set();
    for(const snapshot of [...undoStack,...redoStack]){
      for(const m of snapshot.matchAll(/assets\/([a-f0-9]{64})\./g))hashes.add(m[1]);
    }
    const args={id:handle.id,undo:[...hashes]};
    const summary=await action('clean_images',args);
    if(!summary.count){toast('No unused images to clean up.');return}
    const answer=await question('Clean unused images',summary.count+' files · '+(summary.bytes/1048576).toFixed(2)+' MB recoverable.',[['cancel','Cancel'],['clean','Delete files']]);
    if(answer.choice==='clean'){await action('clean_images',{...args,confirm:summary.token});toast('Unused images cleaned')}
  }
  async function exportDocument(){
    const handle=storage.handle,id=selected;if(!handle?.sqlite||!id)throw Error('Select a Note or Todo first.');
    await flush();
    for(;;){
      try{
        if(externalDocumentImages(itemById(db,id)?.content||'').length)throw Error('This document contains an external image. Switch from Source to Rich Text to finish importing it, then export again.');
        const path=await action('export_markdown',{id:handle.id,item:id});
        if(path)toast('Markdown package saved to '+path);
        return;
      }catch(error){
        const reply=await question('Markdown package unavailable',error.message,[['retry','Retry'],['cancel','Cancel']]);
        if(reply.choice!=='retry')return;
      }
    }
  }
  function setup(){
    if(window.notesDesktop.sqlite.imageEditing)addMenu('Export Note as Markdown…',exportDocument,'exportMarkdown');
    // #45: the open-format export stays available beside the .ytnh backup.
    addMenu('Export as JSON…',async()=>{await flush();const dest=await exportModel(storage.handle,db);if(dest)toast('JSON export saved')},'exportJson');

    const restore=addMenu('Restore Earlier Version…',async()=>{
      const handle=storage.handle;if(!handle?.sqlite)return;await flush();
      const backups=await action('backups',{id:handle.id});
      if(!backups.length){toast('No local backups are available yet.');return;}
      const when=name=>Number(name.replace(/^legacy-/, '').split('-')[0]);
      const answer=await chooseFrom('Restore Earlier Version','Go back to an earlier state of this library, from the automatic backups YTNH keeps on this computer. Your current state is backed up first, so you can return to it.',[...backups].sort((a,b)=>when(b)-when(a)).map(name=>[name,(name.startsWith('legacy-')?'Previous library · ':'')+new Date(when(name)).toLocaleString('en-GB',{hourCycle:'h23'})]),'Restore');
      if(answer.choice==='cancel')return;
      const r=await action('restore_backup',{id:handle.id,revision:handle.revision,backup:answer.choice});
      if(r)await activate(new LibraryHandle(handle));
    },'restoreBackup');
    const archive=addMenu('Restore Cold Archive…',async()=>{
      const handle=storage.handle;if(!handle?.sqlite)return;await flush();
      const files=new Map(db.archiveIndex.map(e=>[e.archiveId||e.archiveFile,e.archiveFile]));
      const result=await chooseFrom('Restore Cold Archive','Choose an archive to restore.',[...files.entries()],'Restore');
      if(result.choice==='cancel')return;
      const text=await action('read_archive',{id:handle.id,archive:result.choice});
      if(await restoreColdArchiveFile(new File([text],files.get(result.choice)))){render();await flush();}
    },'restoreColdArchive');
    $('appMenu').addEventListener('toggle',()=>{
      restore.hidden=!storage.handle?.sqlite;saveAs.hidden=!storage.handle?.portable;
      archive.hidden=!storage.handle?.sqlite||!db?.archiveIndex?.length;
    });
    $('openFile').onclick=()=>exclusive(async()=>{if(!await beforeSwitch())return;await activateRecord(await action('portable_open'))}).catch(report);
    $('newFile').onclick=()=>exclusive(async()=>{if(!await beforeSwitch())return;await activateRecord(await action('portable_new',{model:createEmptyDatabase()}))}).catch(report);
    $('saveFile').onclick=()=>storage.handle?.portable?exclusive(()=>savePortable(storage.handle)).catch(report):requestDatabaseSave({manual:true});
    const saveAs=addMenu('Save As…',()=>savePortable(storage.handle,{saveAs:true}),'saveAsFile','afterSave');
    addMenu('Recover Unsaved Copy…',async()=>{
      if(!await beforeSwitch())return;
      const report=await action('portable_recovery_list'),copies=report.copies;
      const warnings=report.issues.map(i=>i.copy+': '+i.error).join('\n');
      if(!copies.length&&!warnings){toast('No unsaved copies are kept on this computer.');return}
      const message='Open a copy that YTNH kept on this computer because its work wasn’t saved to the library file yet, for example after a crash or when the file couldn’t be saved. Copies are removed from this computer once their work is in the library file. Saving checks the library file for conflicts.'+(warnings?'\n\nSome recovery records could not be verified. Their original bytes are retained when you explicitly recover a verified copy:\n'+warnings:'');
      const reply=await chooseFrom('Recover Unsaved Copy',message,copies.map(c=>[c.copy,c.name+' · '+String(c.revision||'').slice(0,8)+(c.unpublished?' · local edits':'')]),'Open',undefined,['discard','Discard…']);
      if(reply.choice==='cancel')return;
      if(reply.choice==='discard'){
        const copy=copies.find(c=>c.copy===reply.value);if(!copy)return;
        if(!await appConfirm('Discard this copy?','The copy of “'+copy.name+'” kept on this computer is deleted'+(copy.unpublished?', including its edits that aren’t in a library file':'')+'. This can’t be undone. The library file itself is not touched.','Discard'))return;
        await action('portable_discard_copy',{copy:copy.copy,open:storage.handle?.id||''});
        toast('Copy discarded');return;
      }
      await activateRecord(await action('portable_adopt',{copy:reply.choice}));
    },'recoverLibrary');
    // Privacy: where this library's automatic backups go on this computer.
    addMenu('Automatic Backups…',async()=>{
      const handle=storage.handle;if(!handle?.portable){toast('Open a library file first.');return}
      const current=(await action('status',{id:handle.id})).backups||'app';
      const reply=await chooseFrom('Automatic Backups','YTNH keeps automatic backups of “'+storage.name+'” for Restore Earlier Version and item History. For a library kept in an encrypted or private folder, keep them next to the library file (in a hidden folder, locked with it) or turn them off. This choice applies on this computer.',
        [['app','In YTNH’s folder on this computer'],['beside','Next to the library file'],['off','Don’t keep automatic backups']],'Apply',current);
      if(reply.choice==='cancel'||reply.choice===current)return;
      if(reply.choice==='off'&&!await appConfirm('Delete automatic backups?','The automatic backups of this library in YTNH’s folder are deleted, and Restore Earlier Version and History will have nothing to show.','Delete Backups'))return;
      await action('backup_location',{id:handle.id,mode:reply.choice});
      toast(reply.choice==='beside'?'Backups are kept next to the library file':reply.choice==='off'?'Automatic backups are off for this library':'Backups are kept in YTNH’s folder');
    },'backupLocation');
    // Privacy: remove everything YTNH keeps about this library on this computer.
    addMenu('Forget This Library on This Computer…',async()=>{
      const handle=storage.handle;if(!handle?.portable){toast('Open a library file first.');return}
      // Save first, so nothing is lost when the library file is available.
      if(!handle.masterIssue&&!await savePortable(handle))return;
      if(!await forgetLibrary(handle.id,storage.name))return;
      storage.handle=null;markClean();location.reload();
    },'forgetLibrary');
  }
  return {
    setup,get busy(){return busy},
    openRecent:record=>exclusive(async()=>{if(!await beforeSwitch())return;if(record.handle.portable)record.handle.checked=false;await activate(record.handle)}).catch(report),
    manualSave:()=>exclusive(()=>savePortable(storage.handle)).catch(report),
    async last(){const id=await action('last');return id?new LibraryHandle(await action('status',{id})):null},
    async recent(){return (await action('list')).map(r=>({name:r.name,handle:new LibraryHandle(r)}))},
    remember:id=>action('remember',{id}),
    newLibrary:(model,name)=>exclusive(async()=>{if(!await beforeSwitch())return;await activateRecord(await action('portable_new',{model,name}))}).catch(report),
    exportModel,cleanImages:()=>exclusive(cleanImages).catch(report),
    // #45: Back Up Library… saves a complete .ytnh copy that Open Library can open again.
    backupCopy:()=>exclusive(async()=>{const handle=storage.handle;if(!handle?.sqlite)return null;await flush();
      const base=String(storage.name||'Library').replace(/\.ytnh$/i,'').replace(/[\\/]/g,'-'),name=`${base} backup ${new Date().toISOString().slice(0,10)}.ytnh`;
      return action('backup_copy',{id:handle.id,model:db,name})}),
    // Earlier versions of one item from this library's automatic backups (read-only).
    itemHistory:item=>storage.handle?.sqlite?action('item_history',{id:storage.handle.id,item}):Promise.resolve([]),
    imageEditing: /* image-preview-build */ false,
    importReference:(id,reference)=>action('import_reference',{id,reference}),
    importImage:(id,data,confirmed)=>action('import_image',{id,data,confirmed}),
    openImage:(id,hash,metadata)=>action('open_image',{id,hash,bytes:metadata.bytes,extension:metadata.extension}),
    readImage:(id,hash,metadata)=>action('read_image',{id,hash,bytes:metadata.bytes,extension:metadata.extension}),
    archive:(handle,text)=>action('archive',{id:handle.id,text}),
    async closeDecision(){
      const h=storage.handle;if(!h?.sqlite)return true;
      return exclusive(async()=>{
        if(!h.portable)throw new Error('Convert the registered local library before closing with edits. Local work is retained.');
        const saved=await savePortable(h,{closing:true});
        if(saved)await closeLocalCopy(h);
        return saved;
      });
    }
  };
}
