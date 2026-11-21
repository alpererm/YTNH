// Portable desktop file pickers and explicit legacy transition. The editor still uses its existing model and save queue.
function createDesktopLibraries(call) {
  const action = (op, args = {}) => call('library_action', { op, args });
  const cancel = () => new DOMException('Cancelled', 'AbortError');
  let busy = false;

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
  const portableDetail='Changes autosave to local SQLite. Save and normal Close update the portable master. Cloud synchronization is handled by your storage provider.';
  async function openPortable(handle){
    for(;;){
      try{return await action('portable_reopen',{id:handle.id})}
      catch(error){
        const reply=await question('Portable master unavailable',error.message+' Your local working copy is retained.',[['retry','Retry'],['recover','Recover local work'],['cancel','Cancel']]);
        if(reply.choice==='retry')continue;
        if(reply.choice!=='recover')throw cancel();
        const record=await action('portable_recover',{id:handle.id});
        handle.masterIssue=error.message;return record;
      }
    }
  }
  async function savePortable(handle,{closing=false,saveAs=false}={}){
    let asNew=saveAs;
    for(;;){
      try{
        // Retry must also retry a failed local write. Never discard the in-memory model.
        if(saveBlocked)saveBlocked=false;
        await flush();
        syncState(handle,'Saving master…',portableDetail);
        const record=await action(asNew?'portable_save_as':'portable_publish',{id:handle.id,revision:handle.revision});
        if(!record){syncState(handle,'Saved locally — master pending',portableDetail);return false}
        handle.name=record.name;handle.unpublished=record.unpublished;handle.masterIssue=null;
        if(storage.handle===handle){storage.name=record.name;await rememberLastFile()}
        syncState(handle,record.unpublished?'Saved locally — master pending':'Master saved',portableDetail);
        return true;
      }catch(error){
        handle.masterIssue=error.message;
        syncState(handle,/conflict|changed|divergent/i.test(error.message)?'Conflict detected':'Save failed',error.message+' '+portableDetail);
        const reply=await question('Master was not saved',error.message+(dirty?' Pending edits remain in the application. Retry the local save or cancel.':' Your local work is retained.'),[['retry','Retry'],...(!dirty?[['saveas','Save As…']]:[]),['cancel',closing?'Cancel Close':'Cancel']]);
        if(reply.choice==='cancel')return false;
        asNew=reply.choice==='saveas';
      }
    }
  }
  async function beforeSwitch(){
    if(storage.handle?.portable)return savePortable(storage.handle);
    return allowDatabaseSwitch();
  }
  async function activateRecord(record){
    if(!record)throw cancel();
    const handle=new LibraryHandle(record);handle.checked=true;
    if(handle.portable)syncState(handle,record.unpublished?'Saved locally — master pending':'Master saved',portableDetail);
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
        this.syncLabel=this.portable?(this.masterIssue?'Saved locally — master unavailable':this.unpublished?'Saved locally — master pending':'Master saved'):info.syncLabel;
        this.checked=true;
      }
      const r=await action('read',{id:this.id});
      this.revision=r.revision;
      return new File([JSON.stringify(r.model)],this.name,{type:'application/json'});
    }
    async reverify(){
      if(!this.portable)throw new Error('Convert the registered local library before editing.');
      await action('portable_recover',{id:this.id});this.checked=true;
    }
    async saveModel(model){
      if(!this.revision)throw new Error('Verify and open this local library before saving.');
      if(!this.checked)await this.reverify();
      const r=await action('save',{id:this.id,revision:this.revision,model});
      const changed=this.revision!==r.revision;this.revision=r.revision;
      if(changed&&this.portable){this.unpublished=true;syncState(this,'Saved locally — master pending',this.masterIssue?this.masterIssue+' '+portableDetail:portableDetail)}
      return {mode:'direct',name:this.name};
    }
  }

  async function activate(handle){
    const file=await handle.getFile();
    const text=await file.text(),model=migrateDatabase(JSON.parse(text));
    storage.handle=handle;storage.name=handle.name;storage.lastLoadedText=text;
    installDatabase(model,!!model.__migratedFromSchema);
    await rememberLastFile();
  }
  async function flush(){
    flushPendingInputs();if(savePromise)await savePromise;
    if(dirty&&(!await requestDatabaseSave({manual:true})||dirty))throw new Error('Local save did not finish. Your pending edits are still here.');
  }
  function addMenu(label,run){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    document.getElementById('databaseMenu').append(b);
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
    if(!summary.count){toast('No unused image files to clean');return}
    const answer=await question('Clean unused images',summary.count+' files · '+(summary.bytes/1048576).toFixed(2)+' MB recoverable.',[['cancel','Cancel'],['clean','Delete files']]);
    if(answer.choice==='clean'){await action('clean_images',{...args,confirm:summary.token});toast('Unused images cleaned')}
  }
  async function exportDocument(){
    const handle=storage.handle,id=selected;if(!handle?.sqlite||!id)throw Error('Select a Note or Todo in a SQLite library.');
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
    if(window.notesDesktop.sqlite.imageEditing)addMenu('Export document as Markdown…',exportDocument);

    const restore=addMenu('Restore SQLite backup…',async()=>{
      const handle=storage.handle;if(!handle?.sqlite)return;await flush();
      const backups=await action('backups',{id:handle.id});
      if(!backups.length){toast('No local backups are available yet.');return;}
      const answer=await question('Restore local backup','Choose a backup to restore as a new revision. The current state will be backed up first.',[...backups.map(name=>[name,(name.startsWith('legacy-')?'Previous library · ':'')+new Date(Number(name.replace(/^legacy-/, '').split('-')[0])).toLocaleString('en-GB',{hourCycle:'h23'})]),['cancel','Cancel']]);
      if(answer.choice==='cancel')return;
      const r=await action('restore_backup',{id:handle.id,revision:handle.revision,backup:answer.choice});
      if(r)await activate(new LibraryHandle(handle));
    });
    const archive=addMenu('Restore managed cold archive…',async()=>{
      const handle=storage.handle;if(!handle?.sqlite)return;await flush();
      const files=new Map(db.archiveIndex.map(e=>[e.archiveId||e.archiveFile,e.archiveFile]));
      const result=await question('Cold archives','Choose an archive to restore.',[...files.entries(),['cancel','Cancel']]);
      if(result.choice==='cancel')return;
      const text=await action('read_archive',{id:handle.id,archive:result.choice});
      if(await restoreColdArchiveFile(new File([text],files.get(result.choice)))){render();await flush();}
    });
    $('appMenu').addEventListener('toggle',()=>{
      restore.hidden=!storage.handle?.sqlite;saveAs.hidden=!storage.handle?.portable;
      archive.hidden=!storage.handle?.sqlite||!db?.archiveIndex?.length;
    });
    $('openFile').onclick=()=>exclusive(async()=>{if(!await beforeSwitch())return;await activateRecord(await action('portable_open'))}).catch(report);
    $('newFile').onclick=()=>exclusive(async()=>{if(!await beforeSwitch())return;await activateRecord(await action('portable_new',{model:createEmptyDatabase()}))}).catch(report);
    $('saveFile').onclick=()=>storage.handle?.portable?exclusive(()=>savePortable(storage.handle)).catch(report):requestDatabaseSave({manual:true});
    const saveAs=addMenu('Save master as…',()=>savePortable(storage.handle,{saveAs:true}));
    addMenu('Recover local portable library…',async()=>{
      if(!await beforeSwitch())return;
      const report=await action('portable_recovery_list'),copies=report.copies;
      const warnings=report.issues.map(i=>i.copy+': '+i.error).join('\n');
      if(!copies.length&&!warnings){toast('No local portable recovery copies are available.');return}
      const message='Choose a verified retained copy explicitly. No copy is selected automatically. Saving still checks the connected master for conflicts.'+(warnings?'\n\nSome recovery records could not be verified. Their original bytes are retained when you explicitly recover a verified copy:\n'+warnings:'');
      const reply=await question('Local recovery copies',message,[...copies.map(c=>[c.copy,c.name+' · '+String(c.revision||'').slice(0,8)+(c.unpublished?' · local edits':'')]),['cancel','Cancel']]);
      if(reply.choice==='cancel')return;
      await activateRecord(await action('portable_adopt',{copy:reply.choice}));
    });
  }
  return {
    setup,get busy(){return busy},
    openRecent:record=>exclusive(async()=>{if(!await beforeSwitch())return;if(record.handle.portable)record.handle.checked=false;await activate(record.handle)}).catch(report),
    manualSave:()=>exclusive(()=>savePortable(storage.handle)).catch(report),
    async last(){const id=await action('last');return id?new LibraryHandle(await action('status',{id})):null},
    async recent(){return (await action('list')).map(r=>({name:r.name,handle:new LibraryHandle(r)}))},
    remember:id=>action('remember',{id}),
    exportModel,cleanImages:()=>exclusive(cleanImages).catch(report),
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
        return savePortable(h,{closing:true});
      });
    }
  };
}
