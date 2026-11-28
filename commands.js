"use strict";
// Quick Open commands: typing '>' in Quick Open lists commands and settings.
// Menu commands use the same ids as the macOS menu bar (key:/click:/text:/fn:), so they run
// exactly like their shortcut or ☰ entry. Simple settings change the Settings dialog's own
// control, so they apply and save through the same code as the dialog.
function quickOpenCommands(){
 const mod=IS_MAC?'⌘':'Ctrl+',opt=IS_MAC?'⌥':'Alt+',shift=IS_MAC?'⇧':'Shift+';
 const k=s=>s.replace('Mod+',mod).replace('Alt+',opt).replace('Shift+',shift);
 const menu=(title,id,keys)=>({title,run:id,keys:keys?k(keys):''});
 const setControl=(tab,id,value,label)=>({title:label,settings:true,run:()=>{
   openSettings();const el=$(id);if(!el){closeModalShell();return}
   if(el.type==='checkbox')el.checked=value;else el.value=value;
   el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
   closeModalShell();toast(label)}});
 const openTab=(tab,id,label)=>({title:label+'…',settings:true,run:()=>{openSettings();$('settingsTab-'+tab)?.click();
   // The dialog places its own focus right after opening; move it to the setting afterwards.
   setTimeout(()=>$(id)?.focus(),30)}});
 const onOff=(tab,id,name)=>[setControl(tab,id,true,name+': On'),setControl(tab,id,false,name+': Off')];
 const weekends=on=>({title:'Show weekends: '+(on?'On':'Off'),run:()=>{const box=$('showWeekends');if(!box)return;box.checked=on;box.dispatchEvent(new Event('change',{bubbles:true}));toast('Weekends '+(on?'shown':'hidden'))}});
 // Commands for the selected item, shown first while an item is selected.
 const item=selected&&itemById(db,selected),itemCommands=item&&!item.archived?[
  {title:'Item: Show in Outline',run:()=>selectAndReveal(item.id)},
  ...(relevantCalendarDate(item)?[{title:'Item: Show in Calendar',run:()=>showItemInCalendar(item),keys:k('Mod+Enter')}]:[]),
  ...(item.type==='Todo'?TODO_STATUSES.filter(s=>s!==item.status).map(s=>({title:'Item: Mark '+s,run:()=>applyTodoStatus(item,s)})):[]),
  {title:'Item: Move to…',run:()=>moveItemTo(item.id)},
  {title:'Item: Also place under…',run:()=>{selected=item.id;chooseCloneParent()},keys:k('Mod+Shift+C')},
  {title:'Item: '+(pinnedIds().includes(item.id)?'Unpin':'Pin to top'),run:()=>{const ids=pinnedIds(),pinned=ids.includes(item.id);savePins(pinned?ids.filter(x=>x!==item.id):[...ids,item.id])}},
  {title:'Item: Copy link',run:()=>copyPlainText(`[[${refToken(item.id)}]]`)},
  {title:'Item: History…',run:()=>openItemHistory(item.id)},
  {title:'Item: Zoom into branch',run:()=>{selected=item.id;zoomIntoBranch()},keys:k('Mod+Right')},
  {title:'Item: Archive…',run:()=>{selected=item.id;$('archive')?.click()}},
  {title:'Item: Delete…',run:()=>{selected=item.id;$('delete')?.click()}},
 ]:[];
 return [
  ...itemCommands,
  menu('New Note','key:Mod+N','Mod+N'),menu('New Todo','key:Mod+T','Mod+T'),
  menu('Open Library…','click:openFile','Mod+O'),menu('New Library…','click:newFile'),menu('Save','click:saveFile','Mod+S'),
  menu('Back Up Library…','click:exportFile'),menu('Restore Earlier Version…','text:Restore Earlier Version…'),menu('Recover Unsaved Copy…','text:Recover Unsaved Copy…'),menu('Export as JSON…','click:exportJson'),menu('Automatic Backups…','click:backupLocation'),menu('Forget This Library on This Computer…','click:forgetLibrary'),
  menu('Archive…','click:archiveBrowser'),{title:'Archive Completed…',run:()=>{$('archiveBrowser')?.click();setTimeout(()=>$('archiveCompleted')?.click(),0)}},
  menu('Import Outlook Calendar…','text:Import Outlook Calendar…'),menu('Reimport Outlook Calendar…','text:Reimport Outlook Calendar…'),
  menu('Import Markdown Folder…','click:importMarkdownFolder'),
  menu('Show Outline','key:Mod+1','Mod+1'),menu('Show Editor','key:Mod+2','Mod+2'),menu('Show Calendar','key:Mod+3','Mod+3'),menu('Show Targets','key:Mod+4','Mod+4'),
  menu('Toggle Daily Planner','key:Mod+Shift+D','Mod+Shift+D'),menu('Toggle Side Panel','key:Mod+Backslash'),menu('Focus Mode',IS_MAC?'key:Ctrl+Mod+F':'key:F11',IS_MAC?'Ctrl+Mod+F':'F11'),
  menu('Search the Outline','key:Mod+Shift+F','Mod+Shift+F'),menu('Jump to Date…','key:Mod+Alt+D','Mod+Alt+D'),menu('Today','key:Alt+Shift+T','Alt+Shift+T'),
  menu('Show or Hide Inactive Items','key:Alt+Shift+D','Alt+Shift+D'),menu('Show or Hide Notes','key:Alt+Shift+N','Alt+Shift+N'),menu('Show or Hide Recurring Items','key:Alt+Shift+R','Alt+Shift+R'),
  menu('Clear All Filters','key:Alt+Shift+C','Alt+Shift+C'),weekends(true),weekends(false),
  ...(db?[['','Off'],['created','Created date'],['modified','Modified date']].map(([mode,label])=>({title:'Calendar Notes by date: '+label,run:()=>{setCalendarNoteDates(mode);toast(mode?'Calendar shows Notes by '+label.toLowerCase():'Calendar shows scheduled items only')}})):[]),
  menu('Find in Document','key:Mod+F','Mod+F'),
  ...(editorIsOpen()&&!sourceMode()?[{title:'Fold Section',run:toggleFoldAtCaret,keys:k('Mod+.')},{title:'Fold All Headings',run:()=>setAllEditorFolds(true)},{title:'Unfold All Headings',run:()=>setAllEditorFolds(false)}]:[]),menu('Find and Replace',IS_MAC?'key:Mod+Alt+F':'key:Mod+H',IS_MAC?'Mod+Alt+F':'Mod+H'),
  {title:'Larger Text',run:()=>stepAppearanceSize(1),keys:k('Mod+Plus')},{title:'Smaller Text',run:()=>stepAppearanceSize(-1),keys:k('Mod+Minus')},{title:'Default Text Size',run:()=>stepAppearanceSize(0),keys:k('Mod+0')},
  menu('Settings…','fn:settings'),menu('Help','fn:help'),menu('Open the Tour','fn:tour'),menu('About YTNH','click:aboutBtn'),
  ...Object.entries(APP_THEMES).map(([value,label])=>setControl('appearance','settingsTheme',value,'Theme: '+label)),
  setControl('general','settingsDefaultView','calendar','Default view: Calendar first'),setControl('general','settingsDefaultView','editor','Default view: Editor first'),
  ...onOff('editor','settingsSpellcheck','Spell checking'),...onOff('editor','settingsLimitWidth','Limit editor width'),
  ...onOff('editor','settingsScrollPastEnd','Scroll past end'),...onOff('general','settingsCompletionSound','Completion sound'),...onOff('general','settingsAnimations','Animations'),...onOff('appearance','settingsOutlineTags','Show tags under items'),
  openTab('appearance','settingsFont','Settings: Font'),openTab('appearance','settingsInterfaceSize','Settings: Interface size'),
  openTab('editor','settingsEditorSize','Settings: Editor size'),openTab('editor','settingsLanguage','Settings: Spell-check language'),
  openTab('calendar','plannerStart','Settings: Daily Planner hours'),openTab('general','settingsGlobalQuickOpen','Settings: Global Quick Open shortcut'),
 ];
}
function quickOpenRenderCommands(query){
 const terms=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
 const list=quickOpenCommands().filter(c=>terms.every(t=>fuzzyTextMatch(t,c.title.toLowerCase())));
 $('refResults').innerHTML=list.length?list.map((c,i)=>`<button type="button" class="refResult commandResult" data-command="${i}"><span class="commandIcon" aria-hidden="true">${c.settings?'⚙':'›'}</span><span>${esc(commandTitleCase(c.title))}</span>${c.keys?`<kbd class="commandKeys">${esc(c.keys)}</kbd>`:''}</button>`).join(''):'<div class="empty">No matching commands.</div>';
 $('refResults').querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>{
   const c=list[Number(b.dataset.command)];modalAfterClose=null;closeModalShell();
   if(typeof c.run==='function')c.run();else window.dispatchEvent(new CustomEvent('ytnh-menu',{detail:c.run}));
 });
}

// Quick Open commands read as command names: Title Case, keeping status names ("Waiting for") and
// short joining words lower case ("Show or Hide", "Pin to Top").
function commandTitleCase(title){
 const small=new Set(['a','an','and','as','at','by','for','in','into','of','on','or','the','to','with']);
 const [prefix,rest]=/^(Item: Mark )(.*)$/.exec(title)?.slice(1)||['',title];
 if(prefix)return prefix+rest;
 return rest.replace(/[\p{L}][\p{L}'’-]*/gu,(word,offset,all)=>{
   const lower=word.toLowerCase(),first=offset===0||/[:(]\s*$/.test(all.slice(0,offset)),last=!/[\p{L}]/u.test(all.slice(offset+word.length));
   if(word!==lower&&word!==word[0]+word.slice(1).toLowerCase())return word; // YTNH, PDF
   if(!first&&!last&&small.has(lower))return lower;
   return word[0].toUpperCase()+word.slice(1);
 });
}
