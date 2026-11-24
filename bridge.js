(() => {
  'use strict';
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;
  // Serialize native updates so rapid theme changes cannot finish out of order.
  let nativeThemeQueue=Promise.resolve(),requestedNativeTheme=null;
  function syncNativeTheme(theme=document.body?.dataset.theme){
    const nativeTheme=theme==='dark'?'dark':'light';
    if(nativeTheme===requestedNativeTheme)return;
    requestedNativeTheme=nativeTheme;
    nativeThemeQueue=nativeThemeQueue.then(async()=>{
      try { await window.__TAURI__.window.getCurrentWindow().setTheme(nativeTheme); }
      catch(error){if(requestedNativeTheme===nativeTheme)requestedNativeTheme=null;console.error('Native window theme could not be applied',error);}
    });
  }
  window.addEventListener('notes-theme-changed',e=>syncNativeTheme(e.detail));
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',()=>syncNativeTheme(),{once:true});
  else syncNativeTheme();
  window.addEventListener('notes-capture',e=>{if(!fileOperationBusy&&!window.notesDesktop?.sqlite?.busy&&!document.querySelector('.libraryDialog[open]')){if(e.detail==='QuickOpen')openQuickOpen();else desktopCapture(e.detail)}});
  let lastCaptureError='';
  async function reportCaptureStatus(){
    try{const status=await call('capture_status');window.notesCaptureStatus=status;const error=status.errors.join(' ');if(error&&error!==lastCaptureError)toast('Global shortcut unavailable: '+error);lastCaptureError=error}catch(error){console.error(error)}
  }
  // The system-wide Quick Open shortcut (Ctrl+Shift+Space) can be turned off in Settings (review 38).
  async function applyCapturePreference(){let on=true;try{on=localStorage.getItem('ytnh-global-quick-open')!=='off'}catch{}try{window.notesCaptureStatus=await call('set_capture_enabled',{enabled:on})}catch(error){console.error(error)}}
  window.notesGlobalQuickOpen={get enabled(){try{return localStorage.getItem('ytnh-global-quick-open')!=='off'}catch{return true}},async set(on){try{localStorage.setItem('ytnh-global-quick-open',on?'on':'off')}catch{}await applyCapturePreference();await reportCaptureStatus()}};
  window.addEventListener('DOMContentLoaded',()=>applyCapturePreference().then(reportCaptureStatus));
  window.addEventListener('focus',reportCaptureStatus);
  // Ctrl/Cmd +/−/0 change the saved Interface and Editor sizes (see stepAppearanceSize); window zoom stays at 100%.
  window.addEventListener('DOMContentLoaded',()=>{
    if(!/win/i.test(navigator.userAgentData?.platform||navigator.platform))return;
    document.body.classList.add('windows-desktop');const timers=new WeakMap();
    document.addEventListener('scroll',e=>{const el=e.target;if(!(el instanceof Element))return;el.classList.add('is-scrolling');clearTimeout(timers.get(el));timers.set(el,setTimeout(()=>el.classList.remove('is-scrolling'),800))},true);
  });
  const call = async (command, args = {}) => {
    try { return await invoke(command, args); }
    catch (error) { throw new Error(String(error)); }
  };
  class NativeFileHandle {
    constructor(record) { Object.assign(this, record); this.kind = 'file'; }
    async createWritable() {
      const handle = this, expected = this.revision ?? null;
      let text = null, closed = false;
      return {
        async write(value) {
          if (closed) throw new Error('This write is already closed.');
          if (typeof value !== 'string') throw new Error('Only JSON text is supported.');
          text = value;
        },
        async close() {
          if (closed || text === null) throw new Error('No pending JSON write.');
          handle.revision = await call('write_json', { id: handle.id, text, expected });
          closed = true;
        },
        async abort() { closed = true; text = null; }
      };
    }
  }
  async function pick(options = {}) {
    const record = await call('pick_json', { name: options.suggestedName || 'productivity-data.json' });
    if (!record) throw new DOMException('File selection cancelled.', 'AbortError');
    return new NativeFileHandle(record);
  }
  const sqlite=createDesktopLibraries(call);
  window.notesDesktop = Object.freeze({
    installedFonts: () => call("installed_font_families"),
    sqlite,
    async lastFileRecord(value) {
      if(value!==undefined){await sqlite.remember(value.handle?.sqlite?value.handle.id:'');return;}
      const library=await sqlite.last();
      return library?{handle:library,name:library.name}:null;
    },
    async recentFiles() { return sqlite.recent(); },
    async exportText(name, text) {
      const handle = await pick({ suggestedName: name });
      const stream = await handle.createWritable(); await stream.write(text); await stream.close();
    },
    async openLink(href) { await call('open_link', { href }); }
  });
  window.addEventListener('DOMContentLoaded',()=>sqlite.setup());
  window.addEventListener('keydown',event=>{if(document.querySelector('.planDialog[open],.outlookPreview[open]'))return;if(document.querySelector('.libraryDialog[open]')){if(event.key==='Escape'){event.preventDefault();document.querySelector('.libraryDialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}));}else if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();document.querySelector('.libraryDialog[open] button')?.click()}event.stopImmediatePropagation()}else if(sqlite.busy){event.preventDefault();event.stopImmediatePropagation()}},true);
  window.addEventListener('notes-desktop-close', async () => {
    if (window.notesDesktopClosing) return;
    if (sqlite.busy || document.querySelector('.libraryDialog[open]')) {
      void call('finish_close_attempt').catch(console.error);
      return;
    }
    window.notesDesktopClosing = true;
    try {
      await call('acknowledge_close');
      if ((fileOperationBusy && !savePromise) || archiveOperationBusy) { toast('Wait for the file operation to finish before closing.'); return; }
      const closingSqlite=storage.handle?.sqlite;
      if(closingSqlite)$('layout').inert=true;
      flushPendingInputs();
      if (!closingSqlite && dirty && autosaveEnabled) await requestDatabaseSave();
      if (!await sqlite.closeDecision()) return;
      if (dirty && !await call('confirm_close')) return;
      await call('close_app');
    } catch (error) { toast(error.message); }
    finally {
      if(!sqlite.busy)$('layout').inert=false;
      try { await call('finish_close_attempt'); } catch (error) { console.error(error); }
      window.notesDesktopClosing = false;
    }
  });
})();
