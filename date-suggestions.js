"use strict";
// Date suggestions while typing @dates in titles and the editor.
// Declarations only; loaded before the main script.
let dateCompletion=null,dateChoice=0;
function closeDateSuggestions(){if(dateCompletion){const el=dateCompletion.el;el.removeAttribute('aria-controls');el.removeAttribute('aria-expanded');el.removeAttribute('aria-activedescendant')}dateCompletion=null;dateSuggestions.classList.add('hidden')}
function titleCaretRect(el){
 if(el===$("richEditor")){const r=getSelection()?.rangeCount?getSelection().getRangeAt(0).getBoundingClientRect():el.getBoundingClientRect();return {left:r.left,bottom:r.bottom}}
 const box=el.getBoundingClientRect(),style=getComputedStyle(el),mirror=document.createElement('div');
 for(const key of ['font','letterSpacing','lineHeight','padding','border','boxSizing','wordBreak','overflowWrap'])mirror.style[key]=style[key];
 Object.assign(mirror.style,{position:'fixed',visibility:'hidden',whiteSpace:el.tagName==='INPUT'?'pre':'pre-wrap',width:box.width+'px',left:box.left+'px',top:box.top+'px'});
 mirror.textContent=el.value.slice(0,el.selectionStart);const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker);document.body.append(mirror);const r=marker.getBoundingClientRect();mirror.remove();return {left:r.left-el.scrollLeft,bottom:r.bottom-el.scrollTop};
}
function updateDateSuggestions(el){
 closeDateSuggestions();if(!db||editorComposing)return;const token=titleDateToken(el);if(!token)return;
 const date=parseTitleDate(token.expression),dates=token.expression===''?[today()]:date?[date]:['today','tomorrow','next monday','next friday','bugün','yarın','haftaya pazartesi','haftaya cuma'].filter(x=>foldDateText(x).startsWith(foldDateText(token.expression))).map(x=>parseTitleDate(x)).filter((d,i,a)=>d&&a.indexOf(d)===i);
 if(!dates.length)return;closeTagSuggestions();dateCompletion={...token,dates,calendar:token.expression===''};dateChoice=0;dateSuggestions.replaceChildren();
 dates.forEach((d,index)=>{const b=document.createElement('button');b.type='button';b.id='dateSuggestion'+index;b.textContent=(token.expression===''?(index?'Tomorrow · ':'Today · '):'Schedule · ')+d.split('-').reverse().join('/');b.setAttribute('role','option');b.onmousedown=e=>e.preventDefault();b.onclick=()=>acceptDateSuggestion(index);dateSuggestions.append(b)});
 el.setAttribute('aria-controls',dateSuggestions.id);el.setAttribute('aria-expanded','true');dateSuggestions.classList.remove('hidden');const r=titleCaretRect(el);dateSuggestions.style.left=Math.max(8,Math.min(r.left,innerWidth-dateSuggestions.offsetWidth-8))+'px';dateSuggestions.style.top=Math.max(8,Math.min(r.bottom+5,innerHeight-dateSuggestions.offsetHeight-8))+'px';if(dateCompletion.calendar)renderTitleCalendar();else paintDateChoice();positionDateSuggestions(el)
}
function positionDateSuggestions(el){const r=titleCaretRect(el);dateSuggestions.style.left=Math.max(8,Math.min(r.left,innerWidth-dateSuggestions.offsetWidth-8))+'px';dateSuggestions.style.top=Math.max(8,Math.min(r.bottom+5,innerHeight-dateSuggestions.offsetHeight-8))+'px'}
function moveTitleCalendar(days){const d=new Date(dateCompletion.dates[0]+'T12:00:00');d.setDate(d.getDate()+days);const value=iso(d);if(value<'2026-01-01'||value>'2150-12-31')return;dateCompletion.dates=[value];renderTitleCalendar();positionDateSuggestions(dateCompletion.el)}
function monthPickerHTML(value,weeks=true){
 const selectedDate=new Date(value+'T12:00:00'),start=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1,12);start.setDate(start.getDate()-(start.getDay()+6)%7);
 return '<div class="titleCalHead"><button type="button" data-month="-1" aria-label="Previous month">‹</button><strong>'+selectedDate.toLocaleDateString('en-GB',{month:'long',year:'numeric'})+'</strong><button type="button" data-month="1" aria-label="Next month">›</button></div><div class="titleCalGrid'+(weeks?' withWeeks':'')+'">'+(weeks?'<small>Wk</small>':'')+['Mo','Tu','We','Th','Fr','Sa','Su'].map(x=>'<small>'+x+'</small>').join('')+Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const date=iso(d);return (weeks&&i%7===0?'<small class="weekLabel">'+isoWeek(d)+'</small>':'')+`<button type="button" role="option" id="titleCal${date}" data-pick-date="${date}" aria-label="${date}" aria-selected="${date===value}" class="${date===value?'active ':''}${date===today()?'today ':''}${d.getMonth()!==selectedDate.getMonth()?'outside':''}" ${date<'2026-01-01'||date>'2150-12-31'?'disabled':''}>${d.getDate()}</button>`}).join('')+'</div>';
}
function renderTitleCalendar(){const value=dateCompletion.dates[0],selectedDate=new Date(value+'T12:00:00');dateSuggestions.innerHTML=monthPickerHTML(value);
 dateCompletion.el.setAttribute('aria-activedescendant','titleCal'+value);
 dateSuggestions.querySelectorAll('button').forEach(b=>b.onmousedown=e=>e.preventDefault());
 dateSuggestions.querySelectorAll('[data-pick-date]').forEach(b=>b.onclick=()=>{dateCompletion.dates=[b.dataset.pickDate];acceptDateSuggestion(0)});
 dateSuggestions.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{const d=new Date(selectedDate.getFullYear(),selectedDate.getMonth()+Number(b.dataset.month),1,12);moveTitleCalendar(Math.round((d-selectedDate)/86400000))});
}
function paintDateChoice(){[...dateSuggestions.children].forEach((b,i)=>{b.classList.toggle('active',i===dateChoice);b.setAttribute('aria-selected',String(i===dateChoice))});dateSuggestions.children[dateChoice]?.scrollIntoView({block:'nearest'}); /* #54 */dateCompletion?.el.setAttribute('aria-activedescendant','dateSuggestion'+dateChoice)}
function acceptDateSuggestion(index=dateChoice){
 const token=dateCompletion;if(!token)return;if(token.inline)return acceptInlineDate(token,index);const el=token.el,item=itemById(db,el.dataset.itemId||selected),current=titleDateToken(el);if(!item||!current||current.start!==token.start||current.end!==token.end)return closeDateSuggestions();
 closeDateSuggestions();item.title=el.value;checkpoint();resetEditorHistoryGroup();
 el.setRangeText('',token.start,token.end,'start');const caret=el.selectionStart;item.title=el.value;addExplicitScheduledDate(item,token.dates[index]);touch(db,item);
 const inline=el.classList.contains('inlineEdit'),scroll=$('tree').scrollTop;el.dateRefreshing=true;el.dateScheduled=true;
 // Reuse all normal rendering and date-chip handlers, then restore the live title control.
 if(editorIsOpen())edit(item.id);else renderTree();renderCalendar();
 if(inline){let title=$('tree').querySelector(`.row[data-id="${item.id}"] .title`);if(!title){revealOutlineItem(item.id);title=$('tree').querySelector(`.row[data-id="${item.id}"] .title`)}if(title)title.replaceWith(el)}
 $('tree').scrollTop=scroll;el.dateRefreshing=false;el.focus({preventScroll:true});el.setSelectionRange(caret,caret);resizeDocumentTitle();rememberEditorLocation();
}
function bindDateAutocomplete(el){
 el.addEventListener('input',()=>{updateDateSuggestions(el);if(el!==$("richEditor"))titleParentTrigger(el)});el.addEventListener('click',()=>updateDateSuggestions(el));
 el.addEventListener('keydown',e=>{if(e.isComposing)return;
 if(el.classList.contains('inlineEdit')&&el.dateScheduled&&(e.ctrlKey||e.metaKey)&&!e.altKey&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();if(e.key.toLowerCase()==='y'||e.shiftKey)redo();else undo();return}
 if(dateCompletion?.el!==el)return;
 if(dateCompletion.calendar&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();moveTitleCalendar({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key]);return}

 if(['Enter','Escape','ArrowDown','ArrowUp'].includes(e.key)&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')closeDateSuggestions();else if(e.key==='Enter'){if(!e.repeat)acceptDateSuggestion()}else{dateChoice=(dateChoice+(e.key==='ArrowDown'?1:-1)+dateCompletion.dates.length)%dateCompletion.dates.length;paintDateChoice()}}
 else if(['ArrowLeft','ArrowRight','Home','End','Tab'].includes(e.key))closeDateSuggestions();},true);
 el.addEventListener('blur',closeDateSuggestions);
}
function restoreTitleControl(el,id,position){
 if(!el.isConnected&&el.classList.contains('inlineEdit')){startInlineEdit(id);el=$('tree').querySelector('.inlineEdit')}
 if(el){el.dateRefreshing=false;el.focus({preventScroll:true});el.setSelectionRange(position,position)}return el;
}
// Typing >> in a title chooses the item's parent ([[ stays the link trigger in the body).
function titleParentTrigger(el){
 const end=el.selectionStart;if(end!==el.selectionEnd||el.value.slice(end-2,end)!=='>>'||el.value[end-3]==='>')return;
 const id=el.dataset.itemId||selected,item=itemById(db,id);if(!item)return;
 const value=el.value;el.dateRefreshing=true;closeDateSuggestions();
 chooseReference(false,(target,meta)=>{
   item.title=value;if(!meta?.created)checkpoint();const codes=codeMapBefore(activeItems(db).map(i=>i.id));moveItem(db,id,target.id);rememberChangedCodes(codes);
   item.title=value.slice(0,end-2)+value.slice(end);el.value=item.title;touch(db,item);revealOutlineItem(id);if(editorIsOpen())edit(id);renderCalendar();
   queueMicrotask(()=>restoreTitleControl(el,id,end-2));
 },{title:'Choose parent',allowCreate:true,filter:i=>i.id!==id&&!isDescendant(db,i.id,id),cancel:()=>restoreTitleControl(el,id,end)});
}
