"use strict";
// Appearance settings and the Settings dialog.
// Declarations only; loaded before the main script.
// Animations follow Settings → General → Animations; the system's Reduce motion turns them off as well (CSS).
// #50: Settings → Appearance → "Show tags under items" (on by default).
function outlineTagsShown(){try{return localStorage.getItem('ytnh-outline-tags')!=='off'}catch{return true}}
function animationsEnabled(){try{return localStorage.getItem('ytnh-animations')!=='off'}catch{return true}}
function applyMotionPreference(){document.documentElement.classList.toggle('no-motion',!animationsEnabled())}
function applyAppearance(){
 applyMotionPreference();
 const style=document.documentElement.style;
 $('editor').classList.toggle('limit-editor-width',appearance.limitEditorWidth);
 style.setProperty('--app-font',APP_FONTS[appearance.font][1]);
 style.setProperty('--interface-size',appearance.interfaceSize+'px');
 style.setProperty('--editor-size',appearance.editorSize+'px');
 for(const id of ['editorTitle','richEditor','content']){const el=$(id);el.spellcheck=appearance.spellcheck;el.lang=appearance.language||navigator.language}
 document.querySelectorAll('.inlineEdit').forEach(el=>{el.spellcheck=appearance.spellcheck;el.lang=appearance.language||navigator.language});
 resizeDocumentTitle();
}
function openSettings(){
 resetModalShell();$('appMenu').open=false;
 $('modalTitle').textContent='Settings';$('modalText').textContent='Changes apply immediately and are saved on this device.';
 $('modalExtra').innerHTML=`<div class="settingsForm"><label>Default view<select id="settingsDefaultView" class="field"><option value="calendar">Calendar first</option><option value="editor">Editor first</option></select></label><label>Theme<select id="settingsTheme" class="field">${Object.entries(APP_THEMES).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>Font<select id="settingsFont" class="field">${availableFontOptions()}</select></label><div class="fontActions"><button type="button" id="addInstalledFont">+ Add font</button><button type="button" id="removeInstalledFont" hidden>Remove font</button></div><div id="fontPicker" hidden><input id="fontPickerSearch" class="field" aria-label="Search installed fonts…" placeholder="Search installed fonts…"><div id="fontPickerResults"></div></div><div class="settingsSizes"><label>Interface size<select id="settingsInterfaceSize" class="field">${Array.from({length:11},(_,i)=>`<option value="${i+8}">${i+8} px</option>`).join('')}</select></label><label>Editor size<select id="settingsEditorSize" class="field">${Array.from({length:17},(_,i)=>`<option value="${i+8}">${i+8} px</option>`).join('')}</select></label></div><label><span><input id="settingsLimitWidth" type="checkbox"> Limit editor width</span></label><label><span><input id="settingsSpellcheck" type="checkbox"> Spell checking</span></label><label>Spell-check language<select id="settingsLanguage" class="field">${[["","System default"],["en-US","English (US)"],["en-GB","English (UK)"],["tr","Turkish"],["nl","Dutch"],["de","German"],["fr","French"],["es","Spanish"],["it","Italian"]].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><small>Spelling uses your system's dictionaries. ${IS_MAC?'Add languages in System Settings → Keyboard → Text Input → Edit…':'Add languages in Windows Settings → Time &amp; language → Language &amp; region.'}</small><div class="settingsPreview" id="settingsPreview"><strong>A little room to think</strong>Notes, plans, and the next thing to do.</div><button type="button" id="settingsDefaults" class="settingsDefaults">Restore defaults</button></div>`;
 const hours=db&&window.dailyPlanner?db.planner?.settings||{}:null;
 if(hours){const fields=document.createElement('div');fields.className='settingsSizes';fields.innerHTML='<label>Planner start<input class="field" type="text" placeholder="HH:MM" maxlength="5" id="plannerStart"></label><label>Planner end<input class="field" type="text" placeholder="HH:MM" maxlength="5" id="plannerEnd"></label><small id="plannerHoursError" class="settingsError" role="alert" hidden>Planner end must be after the start.</small>';
 $('settingsPreview').before(fields);$('plannerStart').value=DailyPlanner.clock(hours.start??420);$('plannerEnd').value=DailyPlanner.clock(hours.end??1140)}
 const fill=value=>{$('settingsLimitWidth').checked=value.limitEditorWidth===true;$('settingsDefaultView').value=value.defaultView||'calendar';$('settingsSpellcheck').checked=value.spellcheck;$('settingsLanguage').value=value.language;$('settingsTheme').value=value.theme||storedTheme();$('settingsFont').value=Object.hasOwn(LOCAL_APP_FONT_FACES,value.font)&&!availableLocalFonts.has(value.font)?'system':value.font;$('settingsInterfaceSize').value=value.interfaceSize;$('settingsEditorSize').value=value.editorSize;preview()};
 const preview=()=>{$('removeInstalledFont').hidden=!$('settingsFont').value.startsWith('local:');const el=$('settingsPreview');el.style.fontFamily=APP_FONTS[$('settingsFont').value][1];el.style.fontSize=$('settingsEditorSize').value+'px'};
 fill(appearance);
 const fontSelect=$('settingsFont');let fontEdited=false;
 fontSelect.addEventListener('change',()=>{fontEdited=true});
 localFontsReady.then(()=>{if(!fontSelect.isConnected)return;const chosen=fontEdited?fontSelect.value:appearance.font;fontSelect.innerHTML=availableFontOptions();fontSelect.value=[...fontSelect.options].some(o=>o.value===chosen)?chosen:'system';preview()});
 // Every preference applies and saves as soon as it changes; Done and Escape only close the dialog.
 let storageWarned=false;
 const applyNow=()=>{
   const next=normalizeAppearance({limitEditorWidth:$('settingsLimitWidth').checked,defaultView:$('settingsDefaultView').value,font:$('settingsFont').value,interfaceSize:Number($('settingsInterfaceSize').value),editorSize:Number($('settingsEditorSize').value),theme:$('settingsTheme').value,spellcheck:$('settingsSpellcheck').checked,language:$('settingsLanguage').value});
   const changedDefault=appearance.defaultView!==next.defaultView;
   appearance=next;applyAppearance();applyTheme();
   try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(next))}catch{if(!storageWarned){storageWarned=true;toast('Settings apply for this session only; device storage is unavailable.')}}
   if(changedDefault&&appearance.defaultView==='editor'&&editorIsOpen()&&!focusLayout){sidebarState.tab='headings';applySidebarState()}
 };
 const commitHours=()=>{
   if(!hours||!$('plannerStart'))return true;
   const start=DailyPlanner.parse($('plannerStart').value),end=DailyPlanner.parse($('plannerEnd').value),ok=end>start;
   $('plannerHoursError').hidden=ok;
   if(ok&&(start!==(hours.start??420)||end!==(hours.end??1140))){DailyPlanner.mutate(()=>Object.assign(PlannerModel.state(db).settings,{start,end}));hours.start=start;hours.end=end}
   return ok;
 };
 ['settingsDefaultView','settingsTheme','settingsInterfaceSize','settingsEditorSize','settingsLimitWidth','settingsSpellcheck','settingsLanguage'].forEach(id=>$(id).addEventListener('change',applyNow));
 if(hours)['plannerStart','plannerEnd'].forEach(id=>$(id).addEventListener('change',commitHours));
 {const row=document.createElement('label');row.innerHTML='<span><input id="settingsCompletionSound" type="checkbox"> Play a sound when completing a Todo</span>';
   $('settingsPreview').before(row);try{$('settingsCompletionSound').checked=localStorage.getItem('ytnh-completion-sound')==='on'}catch{}
   $('settingsCompletionSound').onchange=()=>{try{localStorage.setItem('ytnh-completion-sound',$('settingsCompletionSound').checked?'on':'off')}catch{}if($('settingsCompletionSound').checked)playCompletionSound()};}
 {const row=document.createElement('label');row.innerHTML='<span><input id="settingsOutlineTags" type="checkbox"> Show tags under items in the Outline</span>';
   $('settingsPreview').before(row);$('settingsOutlineTags').checked=outlineTagsShown();
   $('settingsOutlineTags').onchange=()=>{try{localStorage.setItem('ytnh-outline-tags',$('settingsOutlineTags').checked?'on':'off')}catch{}renderTree()};}
 {const row=document.createElement('label');row.innerHTML='<span><input id="settingsAnimations" type="checkbox"> Animations</span>';
   $('settingsCompletionSound').closest('label').after(row);$('settingsAnimations').checked=animationsEnabled();
   $('settingsAnimations').onchange=()=>{try{localStorage.setItem('ytnh-animations',$('settingsAnimations').checked?'on':'off')}catch{}applyMotionPreference()};}
 {const row=document.createElement('label');row.innerHTML='<span><input id="settingsScrollPastEnd" type="checkbox"> Scroll past end of the document</span>';
   $('settingsPreview').before(row);$('settingsScrollPastEnd').checked=scrollPastEndEnabled();
   $('settingsScrollPastEnd').onchange=()=>{try{localStorage.setItem(SCROLL_PAST_END_KEY,$('settingsScrollPastEnd').checked?'on':'off')}catch{}updateScrollPastEnd()};}
 if(window.notesGlobalQuickOpen){
   const row=document.createElement('label');row.innerHTML='<span><input id="settingsGlobalQuickOpen" type="checkbox"> Quick Open from any app ('+(IS_MAC?'⌃⇧Space':'Ctrl+Shift+Space')+')</span>';
   $('settingsPreview').before(row);$('settingsGlobalQuickOpen').checked=window.notesGlobalQuickOpen.enabled;
   $('settingsGlobalQuickOpen').onchange=()=>window.notesGlobalQuickOpen.set($('settingsGlobalQuickOpen').checked);
 }
 if(storage.handle?.sqlite&&window.notesDesktop?.sqlite?.imageEditing){
   const clean=document.createElement('button');clean.type='button';clean.textContent='Clean unused images…';
   clean.onclick=()=>window.notesDesktop.sqlite.cleanImages();$('modalExtra').append(clean);
 }
 $('addInstalledFont').onclick=showInstalledFontPicker;
 $('removeInstalledFont').onclick=()=>{const key=$('settingsFont').value;if(!key.startsWith('local:'))return;addedFontFamilies=addedFontFamilies.filter(name=>fontKey(name)!==key);delete APP_FONTS[key];localStorage.setItem(CUSTOM_FONTS_KEY,JSON.stringify(addedFontFamilies));if(appearance.font===key){appearance.font='system';applyAppearance();localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearance))}$('settingsFont').innerHTML=availableFontOptions();$('settingsFont').value='system';preview()};
 $('settingsFont').onchange=()=>{preview();applyNow()};$('settingsEditorSize').addEventListener('change',preview);
 $('settingsDefaults').onclick=()=>{fill({...normalizeAppearance(null),theme:'light'});applyNow()};
 // Footer stays visible while the settings list scrolls: Restore defaults on the left, Done on the right.
 document.querySelector('.modal')?.classList.add('settingsModal');
 document.querySelector('.modalactions')?.prepend($('settingsDefaults'));
 $('modalCancel').classList.add('hidden');$('modalOK').textContent='Close';
 $('modalOK').onclick=()=>{if(commitHours())closeModalShell();else $('plannerEnd').focus()};
 modalAfterClose=()=>{commitHours()};
 arrangeSettingsTabs();
 $('modalbg').classList.add('open');
}

// Ctrl/Cmd + and − step the Interface and Editor sizes together; Ctrl/Cmd+0 restores the defaults.
// One saved setting instead of a separate, forgotten window zoom.
function stepAppearanceSize(direction){
 const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
 const next=normalizeAppearance({...appearance,
   interfaceSize:direction?clamp(appearance.interfaceSize+direction,8,18):14,
   editorSize:direction?clamp(appearance.editorSize+direction,8,24):14});
 if(next.interfaceSize===appearance.interfaceSize&&next.editorSize===appearance.editorSize&&direction){toast(direction>0?'Largest size':'Smallest size');return}
 appearance=next;applyAppearance();
 try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(next))}catch{}
 for(const [id,value] of [['settingsInterfaceSize',next.interfaceSize],['settingsEditorSize',next.editorSize]])if($(id))$(id).value=value;
 toast(`Interface ${next.interfaceSize} px · Editor ${next.editorSize} px`);
}
