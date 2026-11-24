"use strict";
// Outline toolbar, search, pickers and other one-time interface setup functions.
// Declarations only; loaded before the main script.
// View-only Outline chrome; reuse the original controls and their handlers.
function updateOutlineToolbarState(){
 if(!$('outlineGroupButton'))return;
 const count=$('activeFilterChips').children.length,filter=$('filtersToggle'),group=$('outlineGroupButton'),select=$('groupBySelect');
 filter.dataset.active=String(count>0);filter.title=`Filters (${count} active) · Alt/Option+Shift+F`;filter.setAttribute('aria-label',`Filters: ${count} active`);
 const label=select.selectedOptions[0]?.textContent||'None';group.dataset.active=String(!!select.value);group.disabled=select.disabled;
 group.title=`Group by: ${label} · Alt/Option+Shift+G`;group.setAttribute('aria-label',`Group by: ${label}`);
}
let searchReturn=null;
function rememberSearchOrigin(){
 if(!editorIsOpen()||!['richEditor','editorTitle','content'].includes(document.activeElement?.id))return;
 searchReturn={owner:db,caret:captureEditorSelection(),controlScroll:document.activeElement.scrollTop,view:$('layout').dataset.view,focusMode:$('layout').classList.contains('editor-focus'),scroll:document.querySelector('.documentScroll').scrollTop};
}
function openOutlineSearch(){
 if(!searchReturn)rememberSearchOrigin();
 $('outlineSearchSlot').classList.add('search-expanded');$('outlineSearchButton').setAttribute('aria-expanded','true');$('search').tabIndex=0;
 $('search').focus({preventScroll:true});
 if(document.activeElement!==$('search'))requestAnimationFrame(()=>{if($('outlineSearchSlot').classList.contains('search-expanded'))$('search').focus({preventScroll:true})});
}
function closeOutlineSearch(restoreFocus=true,calendarDelay=0){
 const field=$('search');
 $('outlineSearchSlot').classList.remove('search-expanded');
 $('outlineSearchButton').setAttribute('aria-expanded','false');
 field.tabIndex=-1;
 if(field.value){
   field.value='';outlineRevealId=null;renderTree();
   if(calendarDelay)setTimeout(()=>{if(!editorIsOpen())renderCalendar()},calendarDelay);
   else renderCalendar();
 }
 const origin=searchReturn;searchReturn=null;
 if(!restoreFocus)return;
 if(origin&&origin.owner===db&&itemById(db,origin.caret?.id)&&editorIsOpen()){
   if(editorDisplayedId!==origin.caret.id)edit(origin.caret.id);else selected=origin.caret.id;
   $('layout').dataset.view=origin.view;
   setEditorFocus(origin.focusMode);
   restoreEditorSelection(origin.caret);
   document.querySelector('.documentScroll').scrollTop=origin.scroll;
   $(origin.caret.control).scrollTop=origin.controlScroll;
 }else $('outlineSearchButton').focus({preventScroll:true});
}
function initSearchHandoff(){
 const panel=document.querySelector('.mainpanel');
 let pointerInPanel=false;
 const dismiss=delay=>{
   if($('outlineSearchSlot').classList.contains('search-expanded')||$('search').value)closeOutlineSearch(false,delay);
 };
 panel.addEventListener('pointerdown',()=>{pointerInPanel=true},true);
 window.addEventListener('pointerup',event=>{
   if(!pointerInPanel)return;
   // Keep the clicked item alive for the existing double-click editor action.
   const delay=event.target.closest?.('.chip,.targetBar')?280:0;
   setTimeout(()=>{pointerInPanel=false;dismiss(delay)},0);
 },true);
 window.addEventListener('pointercancel',()=>{pointerInPanel=false},true);
 panel.addEventListener('focusin',()=>queueMicrotask(()=>{
   if(!pointerInPanel&&panel.contains(document.activeElement))dismiss(0);
 }));
}
function positionOutlineGroup(){
 const popup=$('groupByBox');if(popup.hidden)return;
 const anchor=$('outlineGroupButton').getBoundingClientRect();popup.style.left=Math.max(6,Math.min(anchor.right-popup.offsetWidth,innerWidth-popup.offsetWidth-6))+'px';popup.style.top=Math.max(6,Math.min(anchor.bottom+5,innerHeight-popup.offsetHeight-6))+'px';
}
function closeOutlineGroup(focus=false){
 $('groupByBox').hidden=true;$('outlineGroupButton').setAttribute('aria-expanded','false');$('groupBySelect').value=currentGroupBy();updateOutlineToolbarState();if(focus)$('outlineGroupButton').focus({preventScroll:true});
}
function toggleOutlineGroup(){
 if($('groupBySelect').disabled)return;
 if(!$('groupByBox').hidden){closeOutlineGroup(true);return}
 $('groupBySelect').value=currentGroupBy();$('groupByBox').hidden=false;$('outlineGroupButton').setAttribute('aria-expanded','true');positionOutlineGroup();renderOutlineGroupChoices();
}
function renderOutlineGroupChoices(){
 const choices=$('outlineGroupChoices');if(!choices)return;choices.replaceChildren();
 for(const option of $('groupBySelect').options){const b=document.createElement('button');b.type='button';b.textContent=option.textContent;b.dataset.groupValue=option.value;b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.selected));b.tabIndex=option.selected?0:-1;b.onclick=()=>{$('groupBySelect').value=option.value;$('groupBySelect').dispatchEvent(new Event('change'))};choices.append(b)}
 positionOutlineGroup();choices.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
}
function initOutlineToolbar(){
 const header=document.querySelector('.outlineHeaderLeft'),slot=$('outlineSearchSlot');
 const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
 const search=document.createElement('button');search.type='button';search.id='outlineSearchButton';search.className='outlineSearchButton';search.title='Search (/)';search.setAttribute('aria-label','Search');search.setAttribute('aria-expanded','false');search.setAttribute('aria-controls','search');search.innerHTML=icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>');slot.append(search);search.addEventListener('pointerdown',rememberSearchOrigin);search.onclick=openOutlineSearch;
 const actions=$('outlineIconActions');
 $('filtersToggle').insertAdjacentHTML('afterbegin',icon('<path d="M3 6h18M6 12h12M10 18h4"/>'));
 const group=document.createElement('button');group.type='button';group.id='outlineGroupButton';group.setAttribute('aria-haspopup','listbox');group.setAttribute('aria-controls','outlineGroupChoices');group.setAttribute('aria-expanded','false');group.innerHTML=icon('<path d="M4 3v14a3 3 0 0 0 3 3h3M4 6h6M14 6h7M14 13h7M14 20h7M4 13h6"/>');actions.append(group);group.onclick=toggleOutlineGroup;
 for(const button of [search,$('filtersToggle'),group,$('inactiveFilterLabel')]){button.addEventListener('mouseenter',()=>{showFormatTooltip(button)});button.addEventListener('mouseleave',hideFormatTooltip);button.addEventListener('focus',()=>{showFormatTooltip(button,0)});button.addEventListener('blur',hideFormatTooltip);button.addEventListener('click',hideFormatTooltip)}
 const choices=document.createElement('div');choices.id='outlineGroupChoices';choices.setAttribute('role','listbox');choices.setAttribute('aria-label','Group by');$('groupByBox').append(choices);
 choices.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  const buttons=[...choices.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);let next;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)));buttons[next]?.focus();return}
  if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();buttons[index]?.click();return}
  if(e.key==='Tab')closeOutlineGroup(true);
 });
 $('groupBySelect').addEventListener('change',()=>{closeOutlineGroup(true)});
 document.addEventListener('pointerdown',e=>{if(!$('groupByBox').hidden&&!e.target.closest('#groupByBox,#outlineGroupButton'))closeOutlineGroup()});
 window.addEventListener('resize',positionOutlineGroup);new ResizeObserver(positionOutlineGroup).observe(header);
 window.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&!e.altKey&&e.code==='KeyF'){
   e.preventDefault();e.stopImmediatePropagation();
   if(e.repeat)return;
   const focusSearch=()=>{
     rememberSearchOrigin();
     setEditorFocus(false);
     $('layout').dataset.view='outline';
     $('appMenu').open=false;
     $('formatMenu').open=false;
     closeOutlineGroup();
     openOutlineSearch();
   };
   if($('modalbg').classList.contains('open')){
     closeModalShell();
     setTimeout(focusSearch,0);
   }else focusSearch();
   return;
  }
  if($('modalbg').classList.contains('open'))return;
  if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&['KeyF','KeyG'].includes(e.code)){
   e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
   if(e.code==='KeyF'){$('filtersToggle').click();$('filtersToggle').focus({preventScroll:true})}else toggleOutlineGroup();return;
  }
  if(e.key!=='Escape')return;
  if(!$('groupByBox').hidden){e.preventDefault();e.stopImmediatePropagation();closeOutlineGroup(true);return}
  if($('outlineSearchSlot').classList.contains('search-expanded')&&(e.target===$('search')||!isTextEntry(e.target))){e.preventDefault();e.stopImmediatePropagation();closeOutlineSearch()}
 },true);
 updateOutlineToolbarState();
}
function displayDay(isoDate){return validDate(isoDate)?isoDate.split('-').reverse().join('/'):''}
// Keep the native date control as the ISO-valued model and picker. The visible
// text field has an explicit day-first format independent of the system locale.
function toolbarDatePicker(input,text){
 document.querySelector('.toolbarDatePopup')?.dismiss?.();
 const popup=document.createElement('div');popup.className='tagSuggestions toolbarDatePopup';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Choose date');
 let value=input.value||today();
 function close(){popup.remove();document.removeEventListener('pointerdown',outside,true)}
 function outside(e){if(!popup.contains(e.target))close()}
 popup.dismiss=close;
 function paint(){popup.innerHTML=monthPickerHTML(value,true);const box=text.getBoundingClientRect();popup.style.left=Math.max(4,Math.min(box.left,innerWidth-popup.offsetWidth-4))+'px';popup.style.top=Math.min(box.bottom+3,innerHeight-popup.offsetHeight-4)+'px';popup.querySelector('[aria-selected=true]')?.focus({preventScroll:true})}
 function move(n,months=false){const d=new Date(value+'T12:00:00');if(months){d.setDate(1);d.setMonth(d.getMonth()+n)}else d.setDate(d.getDate()+n);const next=iso(d);if(next>='2026-01-01'&&next<='2150-12-31'){value=next;paint()}}
 popup.onpointerdown=e=>{if(e.target.closest('button'))e.preventDefault()};
 popup.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.month)return move(Number(b.dataset.month),true);if(b.dataset.pickDate){close();input.value=b.dataset.pickDate;input.dispatchEvent(new Event('pointerdown'));input.dispatchEvent(new Event('change',{bubbles:true}));text.focus({preventScroll:true})}};
 popup.onkeydown=e=>{e.stopPropagation();const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta){e.preventDefault();move(delta)}else if(e.key==='Escape'){close();text.focus()}else if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();move(e.key==='PageUp'?-1:1,true)}};
 popup.addEventListener('focusout',()=>queueMicrotask(()=>{if(!popup.contains(document.activeElement))close()}));document.body.append(popup);document.addEventListener('pointerdown',outside,true);paint();
}
function dayFirstField(input){
 if(input.closest('.dayFirstField'))return;
 const wrap=document.createElement('span'),text=document.createElement('input'),icon=document.createElement('span');
 wrap.className='dayFirstField';input.before(wrap);wrap.append(input,text,icon);
 text.type='text';text.className=input.className+' dayFirstText';text.placeholder='DD/MM/YYYY';text.maxLength=10;
 text.setAttribute('aria-label',(input.getAttribute('aria-label')||input.labels?.[0]?.textContent?.trim()||'Date')+' (DD/MM/YYYY)');
 icon.className='dayPickerGlyph';icon.innerHTML=sidebarIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>');
 const toolbar=input.id==='jumpDate'||input.closest('#dailyPlanner header');
 if(toolbar){input.style.pointerEvents='none';icon.style.pointerEvents='auto';icon.setAttribute('role','button');icon.tabIndex=0;icon.setAttribute('aria-label','Choose date');icon.onclick=()=>toolbarDatePicker(input,text);icon.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();icon.click()}}}
 input.tabIndex=-1;input.lang='en-GB';
 const native=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 function sync(){text.value=displayDay(native.get.call(input));text.setCustomValidity('')}
 Object.defineProperty(input,'value',{configurable:true,get(){return native.get.call(input)},set(v){native.set.call(input,v);sync()}});
 function read(){const value=text.value.trim(),date=value.split('/').reverse().join('-');
   const ok=!value||(validDate(date)&&(!input.min||date>=input.min)&&(!input.max||date<=input.max));
   text.setCustomValidity(ok?'':'Enter a valid date as DD/MM/YYYY.');native.set.call(input,ok?date:'');return ok;
 }
 sync();input.addEventListener('input',sync);input.addEventListener('change',sync,true);
 text.oninput=e=>{e.stopPropagation();if(read())input.dispatchEvent(new Event('input',{bubbles:true}))};
 text.onchange=e=>{e.stopPropagation();if(read())input.dispatchEvent(new Event('change',{bubbles:true}))};
 text.onfocus=()=>input.onfocus?.();text.onpaste=()=>input.onpaste?.();
 text.onkeydown=e=>{
   if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();if(toolbar)toolbarDatePicker(input,text);else input.showPicker?.();return}
   if(e.key==='Enter'&&!read()){e.preventDefault();e.stopPropagation();text.reportValidity();return}
   input.onkeydown?.(e);
 };
 input.addEventListener('click',()=>{try{input.showPicker?.()}catch{}});
}
function initThemedSelects(){
 let popup,control;
 function close(restore=false){
   if(!popup)return;
   popup.remove();popup=null;
   control.removeAttribute('aria-expanded');control.removeAttribute('aria-controls');
   if(restore&&control.isConnected)control.focus({preventScroll:true});
 }
 function eligible(el){
   return el instanceof HTMLSelectElement && !el.disabled && !el.multiple && el.size<=1 &&
     document.body.dataset.theme==='dark';
 }
 function open(select){
   close();control=select;popup=document.createElement('div');
   popup.className='selectPopover';popup.id='activeSelectOptions';popup.setAttribute('role','listbox');
   popup.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.firstChild?.textContent?.trim()||'Options');
   select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',popup.id);
   for(const option of select.options){
     const button=document.createElement('button');
     button.type='button';button.textContent=option.text;button.disabled=option.disabled;
     button.tabIndex=-1;button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.selected));
     button.onclick=()=>{
       const changed=select.selectedIndex!==option.index;
       select.selectedIndex=option.index;close(true);
       if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}))}
     };
     popup.append(button);
   }
   (select.closest('dialog[open],.modal')||document.body).append(popup);
   const box=select.getBoundingClientRect();
   popup.style.minWidth=Math.min(box.width,innerWidth-12)+'px';popup.style.maxWidth='calc(100vw - 12px)';
   popup.style.maxHeight=Math.min(320,Math.max(innerHeight-box.bottom,box.top)-12)+'px';
   popup.style.left=Math.max(6,Math.min(box.left,innerWidth-popup.offsetWidth-6))+'px';
   popup.style.top=(box.bottom+popup.offsetHeight+5<=innerHeight?box.bottom+3:Math.max(6,box.top-popup.offsetHeight-3))+'px';
   (popup.querySelector('[aria-selected="true"]:enabled')||popup.querySelector(':enabled'))?.focus({preventScroll:true});
 }
 document.addEventListener('pointerdown',e=>{
   if(e.button===0&&eligible(e.target)){e.preventDefault();if(popup&&control===e.target)close(true);else open(e.target);return}
   if(popup&&!popup.contains(e.target))close();
 },true);
 window.addEventListener('keydown',e=>{
   if(e.isComposing)return;
   if(!popup){
     if(eligible(e.target)&&!e.metaKey&&!e.ctrlKey&&['Enter',' ','ArrowDown','ArrowUp','F4'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();open(e.target)}
     return;
   }
   if(!popup.contains(e.target)){close();return}
   if(e.key==='Tab'){close(true);return}
   if(e.metaKey||e.ctrlKey||e.altKey){close(true);return}
   e.stopImmediatePropagation();
   const buttons=[...popup.querySelectorAll('button:enabled')],index=buttons.indexOf(e.target);
   if(e.key==='Escape'){e.preventDefault();close(true);return}
   if(e.key==='Enter'||e.key===' '){e.preventDefault();buttons[index]?.click();return}
   const next={Home:0,End:buttons.length-1,ArrowDown:Math.min(index+1,buttons.length-1),ArrowUp:Math.max(0,index-1)}[e.key];
   if(next!==undefined){e.preventDefault();buttons[next]?.focus();return}
   if(e.key.length===1){e.preventDefault();buttons.slice(index+1).concat(buttons.slice(0,index+1)).find(b=>b.textContent.toLowerCase().startsWith(e.key.toLowerCase()))?.focus()}
 },true);
 window.addEventListener('resize',()=>close());
 document.addEventListener('focusin',e=>{if(popup&&!popup.contains(e.target)&&e.target!==control)close()});
}
function initDocumentFind(){
 const editor=$('editor'),rich=$('richEditor'),source=$('content');
 const button=document.createElement('button');button.className='editorIconButton';button.title=button.ariaLabel='Find in document';button.id='documentFindButton';
 button.innerHTML=sidebarIcon('<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>');$('formatMenu').after(button);
 const bar=document.createElement('div');bar.id='documentFindBar';bar.hidden=true;editor.querySelector('.writingArea').prepend(bar);
 bar.innerHTML='<div><button aria-label="Show replacement" aria-expanded="false">▸</button><input aria-label="Find text" placeholder="Find"><span class="findActions"><output aria-live="polite"></output><button aria-label="Previous match">↑</button><button aria-label="Next match">↓</button><button title="Match case" aria-label="Match case" aria-pressed="false">Aa</button><button title="Whole word" aria-label="Whole word" aria-pressed="false">W</button><button aria-label="Close find">×</button></span></div><div hidden><input aria-label="Replace with" placeholder="Replace with"><span class="findActions"><button>Replace</button><button>Replace All</button></span></div>';
 const [expand,prev,next,matchCase,word,close,replace,all]=bar.querySelectorAll('button'),[query,value]=bar.querySelectorAll('input'),count=bar.querySelector('output');
 const mirror=document.createElement('div');mirror.className='sourceFindMirror';mirror.ariaHidden='true';source.before(mirror);
 let index=0,matches=[],origin=null,frame=0;
 function clearHighlights(){for(const name of ['doc-matches','doc-current'])globalThis.CSS?.highlights?.delete(name);mirror.replaceChildren();mirror.hidden=true}
 function collect(){
   const term=query.value;if(!term)return [];
   const escaped=Array.from(term,c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
   const boundary='[\\p{L}\\p{M}\\p{N}_]',pattern=new RegExp(word.ariaPressed==='true'?'(?<!'+boundary+')'+escaped+'(?!'+boundary+')':escaped,matchCase.ariaPressed==='true'?'gu':'giu');
   const found=[];
   function scan(text,nodes,protectedText=false){
     for(const m of text.matchAll(pattern)){
       const start=m.index,end=start+m[0].length;
       if(!nodes){found.push({start,end});continue}
       const first=nodes.find(n=>n.end>start),last=nodes.find(n=>n.end>=end);
       const range=document.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);found.push({range,protectedText});
     }
   }
   if(sourceMode())scan(source.value,null);
   else {
     // A cell, paragraph, link boundary or protected chip must survive replacement.
     function visit(root){
       let text='',nodes=[],protectedText=false;
       function flush(){scan(text,nodes,protectedText);text='';nodes=[]}
       function walk(node){
         if(node.nodeType===3){if(node.length){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data}return}
         if(node.matches('.mdref')){flush();protectedText=true;for(const child of node.childNodes)walk(child);flush();protectedText=false;return}
         if(node.matches('[contenteditable=false],.md-list-marker,input,button,br,[hidden]')){flush();return}
         if(node.tagName==='A'||node.matches('.inlineTodo')){flush();for(const child of node.childNodes)walk(child);flush();return}
         for(const child of node.childNodes)walk(child);
       }
       walk(root);flush();
     }
     for(const block of rich.children){if(block.dataset.mdblock==='image'){const caption=block.querySelector('figcaption');if(caption)visit(caption)}else if(block.dataset.mdblock==='table')block.querySelectorAll('td,th').forEach(visit);else visit(block)}
   }
   return found;
 }
 function drawSource(scroll){
   if(!matches.length)return;
   const style=getComputedStyle(source),box=source.getBoundingClientRect();
   for(const key of ['font','lineHeight','letterSpacing','padding','borderWidth','boxSizing','tabSize','textAlign','wordBreak','overflowWrap'])mirror.style[key]=style[key];
   mirror.hidden=false;
   const base=mirror.offsetParent.getBoundingClientRect();
   Object.assign(mirror.style,{left:(box.left-base.left)+'px',top:(box.top-base.top)+'px',width:source.clientWidth+'px',height:source.clientHeight+'px'});
   let offset=0,active;
   matches.forEach(({start,end},i)=>{const mark=document.createElement('mark');mark.classList.toggle('current',i===index);mark.textContent=source.value.slice(start,end);mirror.append(document.createTextNode(source.value.slice(offset,start)),mark);offset=end;if(i===index)active=mark});
   mirror.append(document.createTextNode(source.value.slice(offset)));mirror.scrollTop=source.scrollTop;mirror.scrollLeft=source.scrollLeft;
   if(scroll&&active){const delta=active.getBoundingClientRect().top-box.top;if(delta<0||delta>box.height-24)source.scrollTop+=delta-box.height/2;mirror.scrollTop=source.scrollTop}
 }
 function paint(scroll=false){
   clearHighlights();count.textContent=matches.length?(index+1)+'/'+matches.length:'0/0';
   prev.disabled=next.disabled=!matches.length;replace.disabled=!matches.length||!!matches[index].protectedText;all.disabled=!matches.some(m=>!m.protectedText);
   if(sourceMode()){drawSource(scroll);return}
   if(!matches.length)return;
   if(globalThis.Highlight&&CSS.highlights){const other=new Highlight();for(const m of matches)other.add(m.range);CSS.highlights.set('doc-matches',other);CSS.highlights.set('doc-current',new Highlight(matches[index].range))}
   if(scroll){const pane=rich.closest('.documentScroll'),box=pane.getBoundingClientRect(),r=matches[index].range.getBoundingClientRect();if(r.top<box.top||r.bottom>box.bottom)pane.scrollTop+=r.top-box.top-box.height/2}
 }
 function refresh(scroll=false){if(bar.hidden)return;matches=collect();index=Math.max(0,Math.min(index,matches.length-1));paint(scroll)}
 function schedule(){if(!bar.hidden&&!frame)frame=requestAnimationFrame(()=>{frame=0;refresh()})}
 function setExpanded(on){bar.lastElementChild.hidden=!on;expand.ariaExpanded=String(on);expand.textContent=on?'▾':'▸'}
 function open(expanded=false){if(bar.hidden){origin=captureEditorSelection();bar.hidden=false;setExpanded(expanded)}else if(expanded)setExpanded(true);query.focus();query.select();refresh(true)}
 function hide(restore){if(bar.hidden)return;bar.hidden=true;query.value=value.value='';index=0;matches=[];clearHighlights();if(restore){const pane=rich.closest('.documentScroll'),top=pane.scrollTop,sourceTop=source.scrollTop;if(origin)restoreEditorSelection(origin);else (sourceMode()?source:rich).focus({preventScroll:true});pane.scrollTop=top;source.scrollTop=sourceTop}origin=null}
 function step(delta){if(matches.length){index=(index+delta+matches.length)%matches.length;paint(true)}}
 function change(every){
   refresh();const list=(every?matches:matches.slice(index,index+1)).filter(m=>!m.protectedText);if(!list.length)return;forceRichHistoryCheckpoint();
   if(sourceMode()){let text=source.value;for(const {start,end} of list.slice().reverse())text=text.slice(0,start)+value.value+text.slice(end);source.value=text;syncModelFromSource()}
   else {for(const {range} of list.slice().reverse()){
     // Keep the first character's inline style, including its link wrapper.
     const start=range.startContainer,offset=range.startOffset;range.deleteContents();start.insertData(offset,value.value);
   }syncModelFromRich()}
   refresh(true);
 }
 bar.addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});
 button.onclick=()=>bar.hidden?open():hide(true);close.onclick=()=>hide(true);expand.onclick=()=>setExpanded(bar.lastElementChild.hidden);
 replace.onclick=()=>change(false);all.onclick=()=>change(true);prev.onclick=()=>step(-1);next.onclick=()=>step(1);
 query.oninput=()=>{index=0;refresh(true)};
 for(const toggle of [matchCase,word])toggle.onclick=()=>{toggle.ariaPressed=String(toggle.ariaPressed!=='true');index=0;refresh(true)};
 bar.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide(true)}else if(e.key==='Enter'&&e.target===query){e.preventDefault();step(e.shiftKey?-1:1)}};
 window.addEventListener('keydown',e=>{
   if(e.isComposing||!editorIsOpen()||(!editor.contains(e.target)&&(bar.hidden||e.target!==document.body||activePane==='outline'))||$('modalbg').classList.contains('open'))return;
   const mod=e.metaKey||e.ctrlKey,find=mod&&!e.altKey&&!e.shiftKey&&e.code==='KeyF',repl=mod&&!e.shiftKey&&((!e.altKey&&e.code==='KeyH')||(e.metaKey&&e.altKey&&e.code==='KeyF'));
   if(find||repl){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){if(bar.hidden)open(repl);else hide(true)}}
 },true);
 source.addEventListener('scroll',()=>{mirror.scrollTop=source.scrollTop;mirror.scrollLeft=source.scrollLeft});
 editor.addEventListener('input',e=>{if(e.target===source||rich.contains(e.target))schedule()});
 new MutationObserver(schedule).observe(rich,{childList:true,subtree:true,characterData:true});
 new ResizeObserver(schedule).observe(source);
 return {hide,schedule};
}
function initManagedImageImports(){
 const api=window.notesDesktop?.sqlite;
 if(!api?.imageEditing)return;
 const root=$('richEditor'),menu=$('formatMenu'),picker=document.createElement('input');
 picker.type='file';picker.multiple=true;picker.accept='image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.heic,.heif';
 const button=document.createElement('button');button.type='button';button.ariaLabel='Insert image';button.title='Insert image';
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 4-6 5 7"/></svg>';
 menu.querySelector('.formatCommands').append(button);
 const available=()=>storage.handle?.sqlite&&!sourceMode()&&editorIsOpen();
 menu.addEventListener('toggle',()=>{button.hidden=!available()});
 function destination(range){
   if(!available()||!range||!rangeBelongsToRichEditor(range)||activeTableCell())return null;
   return {model:db,id:selected,lib:storage.handle.id,range:range.cloneRange(),content:editorDocument().content};
 }
 const here=()=>{const sel=getSelection();return destination(sel.rangeCount?sel.getRangeAt(0):null)};
 function valid(dest){return available()&&db===dest.model&&selected===dest.id&&storage.handle.id===dest.lib&&dest.content===editorDocument().content&&rangeBelongsToRichEditor(dest.range)}
 async function readFileAsset(file,lib){
       const large=file.size>25*1024*1024;
       if(large&&!await appConfirm('Import a large file?','Import '+file.name+' ('+(file.size/1048576).toFixed(1)+' MB)? Large files make the library bigger and slower to save.','Import'))return;
       const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(file)});
       return api.importImage(lib,data,large);
 }
 async function importFiles(files,dest){
   if(!dest)return;
   try{
     const imported=[];
     for(const file of files){
       const original=await readFileAsset(file,dest.lib);if(!original)return;
       imported.push({original,name:file.name});
     }
     if(!valid(dest))throw Error('The document changed during import. Place the caret and retry.');
     if(!imported.length)return;
     forceRichHistoryCheckpoint();
     db.imageAssets??={};
     const lines=[];
     for(const {original,name} of imported){
       track(original,name);
       lines.push(managedImageMarkdown(name.replace(/\.[^.]+$/,''),original.hash,original.extension));
     }
     // A final paragraph holds the caret and any text following the insertion.
     const current=bodyBlock(dest.range.startContainer),following=current?.nextElementSibling;
     insertFormattedPaste(lines.join('\n')+'\n',dest.range);
     if(following?.isConnected&&following.dataset.mdblock==='p'){
       const exit=following.previousElementSibling;
       if(exit?.dataset.mdblock==='p'&&!richBlockPlainText(exit)&&exit.previousElementSibling?.dataset.mdblock==='image'){exit.remove();placeCaretAtBodyStart(following);syncModelFromRich()}
     }
   }catch(error){toast(error.message)}
 }
 function track(original,name){
   db.imageAssets??={};
   db.imageAssets[original.hash]??={extension:original.extension,bytes:original.bytes,name};
 }
 async function reference(lib,src){
   if(/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(src)){
     const data=src.slice(src.indexOf(',')+1),length=Math.floor(data.length*3/4);
     const large=length>25*1024*1024;
     if(large&&!await appConfirm('Import large image?','The image on the clipboard is '+(length/1048576).toFixed(1)+' MB. Importing it makes your library larger.','Import'))throw new DOMException('Cancelled','AbortError');
     return {...await api.importImage(lib,data,large),name:'Clipboard image'};
   }
   if(/^[a-z][a-z+.-]*:/i.test(src)&&!/^https:\/\/|^file:|^[a-z]:[/\\]/i.test(src))throw Error('Choose a local file or a public HTTPS image.');
   const image=await api.importReference(lib,src);
   if(!image)throw new DOMException('Cancelled','AbortError');
   return image;
 }
 function openImageHit(e){
   const hit=e.target.closest('.imageSearchHit');if(!hit||(e.type==='pointerdown'&&e.button!==0))return;
   e.preventDefault();e.stopImmediatePropagation();const index=Number(hit.dataset.imageIndex),id=hit.closest('[data-id]').dataset.id;
   completeSearchAction(id);openSelectedInFullEditor(id);
   requestAnimationFrame(()=>{const block=root.querySelectorAll('[data-mdblock=image]')[index];if(block){
     block.scrollIntoView({block:'center'});block.classList.add('imageSearchCurrent');setTimeout(()=>block.classList.remove('imageSearchCurrent'),1400);
   }});
 }
 $('tree').addEventListener('pointerdown',openImageHit,true);$('tree').addEventListener('click',openImageHit,true);
 const context=document.createElement('div');context.className='tagSuggestions hidden';context.setAttribute('role','menu');document.body.append(context);
 let chosen=null,dragged=null,dropTarget=null;
 function select(block){chosen?.classList.remove('imageSelected');chosen=block;block?.classList.add('imageSelected')}
 function info(block){
   const image=managedImageLine(block.dataset.imageSource),cap=block.querySelector('figcaption');
   if(cap)image.caption=cap.textContent;
   return image;
 }
 function change(block,props,checkpoint=true){
   if(checkpoint)forceRichHistoryCheckpoint();
   const image={...info(block),...props},line=imageSource(image),template=document.createElement('template');
   template.innerHTML=managedImageBlock(line);const updated=template.content.firstElementChild;
   block.replaceWith(updated);restoreManagedImageWidths();select(updated);syncModelFromRich();return updated;
 }
 function remove(block){
   forceRichHistoryCheckpoint();
   if(root.children.length===1){root.innerHTML='<div data-mdblock="p"><br></div>';placeCaretAtBodyStart(root.firstElementChild)}
   else{const after=block.nextElementSibling,before=block.previousElementSibling;block.remove();if(after)placeCaretAtBodyStart(after);else if(before)placeCaretAtEnd(before)}
   root.focus({preventScroll:true});
   select(null);syncModelFromRich();
 }
 function chooseRange(block){const r=document.createRange();r.selectNode(block);const sel=getSelection();sel.removeAllRanges();sel.addRange(r)}
 root.addEventListener('pointerdown',e=>{
   const block=e.target.closest('[data-mdblock=image]');select(block);
   const corner=e.target.closest('[data-corner]');if(!corner||!block)return;
   e.preventDefault();const fig=block.querySelector('figure'),width=fig.getBoundingClientRect().width,x=e.clientX,y=e.clientY;
   const sign=corner.dataset.corner.endsWith('w')?-1:1,vertical=corner.dataset.corner.startsWith('n')?-1:1;
   const ratio=width/Math.max(1,block.querySelector('.imageSurface').offsetHeight);
   const owner=db,ownerId=editorDisplayedId;
   let nextWidth=Math.round(width),checkpointed=false;
   function move(event){
     if(event.pointerId!==e.pointerId)return;
     if(db!==owner||selected!==ownerId||editorDisplayedId!==ownerId||!block.isConnected){finish(event);return}
     const dx=sign*(event.clientX-x),dy=vertical*(event.clientY-y)*ratio;
     const delta=Math.abs(dx)>Math.abs(dy)?dx:dy;
     const requested=Math.round(Math.max(16,Math.min(block.clientWidth,width+delta)));
     if(requested===nextWidth)return;
     if(!checkpointed){forceRichHistoryCheckpoint();checkpointed=true}
     nextWidth=requested;
     fig.style.width=nextWidth+'px';
     block.dataset.imageSource=imageSource({...info(block),width:nextWidth});
     const pixels=block.querySelector('.imagePixels img');if(pixels)pixels.width=nextWidth;
     // Keep the visible size in the model throughout the gesture. WKWebView can
     // lose pointer capture before pointerup, or navigation can detach the handle.
     syncModelFromRich();
   }
   function finish(event){
     if(event.pointerId!==e.pointerId)return;
     window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
     corner.removeEventListener('lostpointercapture',finish);
     if(corner.hasPointerCapture(e.pointerId))corner.releasePointerCapture(e.pointerId);
     resetEditorHistoryGroup();
   }
   corner.setPointerCapture(e.pointerId);
   corner.addEventListener('lostpointercapture',finish);
   window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
 });
 root.addEventListener('click',e=>{
   const block=e.target.closest('[data-mdblock=image]');
   if(block&&!e.target.closest('figcaption,.imageCorner,.imageGrip')){root.focus({preventScroll:true});const r=document.createRange();r.setStartAfter(block);r.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(r)}
 });
 root.addEventListener('keydown',e=>{
   if(e.target.closest('figcaption')&&e.key==='Enter'){e.preventDefault();root.focus();return}
   if(e.target!==root)return;
   const sel=getSelection(),r=sel.rangeCount&&sel.getRangeAt(0),b=r&&bodyBlock(r.startContainer);
   if(['Delete','Backspace'].includes(e.key)&&r?.collapsed){
     const adjacent=e.key==='Backspace'&&b&&atBodyBlockStart(b,r)?b.previousElementSibling:null;
     if(adjacent?.dataset.mdblock==='image'&&b.dataset.mdblock==='p'&&!richBlockPlainText(b)){
       e.preventDefault();e.stopImmediatePropagation();forceRichHistoryCheckpoint();b.remove();select(null);
       const tail=document.createRange();tail.setStartAfter(adjacent);tail.collapse(true);sel.removeAllRanges();sel.addRange(tail);syncModelFromRich();rememberRichSelection();return;
     }
     const image=chosen?.isConnected?chosen:adjacent?.dataset.mdblock==='image'?adjacent:null;
     if(image){e.preventDefault();e.stopImmediatePropagation();remove(image);return}
   }
   if(!e.metaKey&&!e.ctrlKey&&!e.altKey)select(null);
 },true);
 function clearDrop(){if(dropTarget)delete dropTarget.dataset.imageDrop;dropTarget=null}
 root.addEventListener('dragstart',e=>{if(!e.target.closest('.imageGrip'))return;dragged=e.target.closest('[data-mdblock=image]');e.dataTransfer.setData('application/x-yutanohe-image-move','1');e.dataTransfer.effectAllowed='move'});
 root.addEventListener('dragover',e=>{
   if(!dragged)return;clearDrop();const target=bodyBlock(e.target);
   if(!target||target===dragged)return;e.preventDefault();dropTarget=target;
   const box=target.getBoundingClientRect();target.dataset.imageDrop=e.clientY<box.top+box.height/2?'before':'after';
 });
 root.addEventListener('drop',e=>{
   if(!dragged)return;e.preventDefault();e.stopImmediatePropagation();
   if(dropTarget&&dragged.isConnected){
     forceRichHistoryCheckpoint();dropTarget[dropTarget.dataset.imageDrop](dragged);syncModelFromRich();
   }
   clearDrop();dragged=null;
 },true);
 root.addEventListener('dragend',()=>{clearDrop();dragged=null});
 const replacePicker=document.createElement('input');replacePicker.type='file';replacePicker.accept=picker.accept;
 let replaceTarget=null;
 replacePicker.onchange=async()=>{
   const block=replaceTarget,file=replacePicker.files[0],lib=storage.handle?.id;
   if(!file||!block?.isConnected||!lib)return;
   try{
     const asset=await readFileAsset(file,lib);
     if(!asset||!block.isConnected||storage.handle?.id!==lib)return;
     forceRichHistoryCheckpoint();track(asset,file.name);
     change(block,{hash:asset.hash,ext:asset.extension},false);toast('Image replaced. Review the caption and Alt text.');
   }catch(error){toast(error.message)}
 };
 function action(block,key){
   const data=info(block);
   switch(key){
   case 'left':case 'center':change(block,{align:key});break;
   case 'caption':{const updated=data.caption==null?change(block,{caption:''}):block;updated.querySelector('figcaption').focus();break}
   case 'no-caption':change(block,{caption:null});break;
   case 'alt':{
     resetModalShell();$('modalTitle').textContent='Edit Alt Text';const input=document.createElement('input');input.className='field';input.value=data.alt;
     $('modalExtra').replaceChildren(input);$('modalOK').onclick=()=>{closeModalShell();if(block.isConnected)change(block,{alt:input.value})};$('modalbg').classList.add('open');input.focus();input.select();break;
   }
   case 'replace':replaceTarget=block;replacePicker.value='';replacePicker.click();break;
   case 'open':api.openImage(storage.handle.id,data.hash,db.imageAssets[data.hash]).catch(error=>toast(error.message));break;
   case 'remove':remove(block);break;
   case 'copy':case 'cut':chooseRange(block);document.execCommand(key);break;
   }
 }
 root.addEventListener('contextmenu',e=>{
   const block=e.target.closest('[data-mdblock=image]');if(!block)return;
   e.preventDefault();e.stopImmediatePropagation();select(block);context.replaceChildren();
   const caption=info(block).caption!=null;
   for(const [id,label] of [['left','Align left'],['center','Align center'],['caption',caption?'Edit caption':'Add caption'],...(caption?[['no-caption','Remove caption']]:[]),['alt','Edit alt text'],['replace','Replace image'],['copy','Copy'],['cut','Cut'],['open','Open original externally'],['remove','Remove from note']]){
     const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','menuitem');
     b.onclick=()=>{context.classList.add('hidden');action(block,id)};context.append(b);
   }
   context.classList.remove('hidden');context.style.left=Math.max(4,Math.min(e.clientX,innerWidth-context.offsetWidth-4))+'px';
   context.style.top=Math.max(4,Math.min(e.clientY,innerHeight-context.offsetHeight-4))+'px';
 },true);
 document.addEventListener('pointerdown',e=>{if(!context.contains(e.target))context.classList.add('hidden');if(!root.contains(e.target)&&!context.contains(e.target))select(null)});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!context.classList.contains('hidden')){e.preventDefault();e.stopImmediatePropagation();context.classList.add('hidden');root.focus()}},true);
 for(const type of ['copy','cut'])root.addEventListener(type,e=>{
   const sel=getSelection();if(!sel?.rangeCount)return;const single=sel.isCollapsed&&chosen?.isConnected;if(sel.isCollapsed&&!single)return;
   const holder=document.createElement('div');holder.append(single?chosen.cloneNode(true):sel.getRangeAt(0).cloneContents());
   const blocks=[...holder.querySelectorAll('[data-mdblock=image]')];if(!blocks.length)return;
   const markdown=clipboardHTMLToMarkdown(holder.innerHTML);
   e.preventDefault();e.stopImmediatePropagation();
   e.clipboardData.setData('application/x-yutanohe-images',JSON.stringify({lib:storage.handle.id,markdown}));
   for(const b of blocks){
     const image=info(b),fig=document.createElement('figure'),img=b.querySelector('img')?.cloneNode();
     if(img){img.alt=image.alt;if(image.width)img.width=image.width;fig.append(img)}else fig.append(document.createTextNode(image.alt||'Image'));
     if(image.align==='center')fig.style.textAlign='center';
     if(image.caption!=null){const cap=document.createElement('figcaption');cap.textContent=image.caption;fig.append(cap)}
     b.replaceWith(fig);
   }
   e.clipboardData.setData('text/html',holder.innerHTML);e.clipboardData.setData('text/plain',markdown);
   if(type==='cut'){if(single)remove(chosen);else{forceRichHistoryCheckpoint();sel.deleteFromDocument();syncModelFromRich();select(null)}}
 },true);
 root.addEventListener('paste',e=>{
   const raw=e.clipboardData?.getData('application/x-yutanohe-images');if(!raw)return;
   let copy;try{copy=JSON.parse(raw)}catch{return}
   if(copy.lib!==storage.handle?.id||typeof copy.markdown!=='string')return;
   const dest=here();if(!dest)return;
   e.preventDefault();e.stopImmediatePropagation();forceRichHistoryCheckpoint();
   const md=copy.markdown;insertFormattedPaste(managedImageLine(md.split('\n').at(-1))?md+'\n':md,dest.range);
 },true);

 let importingSource=false;
 $('sourceToggle').addEventListener('click',async e=>{
   if(!storage.handle?.sqlite||!sourceMode())return;
   const source=$('content'),before=source.value,refs=externalDocumentImages(before);
   if(!refs.length)return;
   e.preventDefault();e.stopImmediatePropagation();if(importingSource)return;
   importingSource=true;
   const lib=storage.handle.id,id=selected,model=db,lines=before.split('\n'),pending=new Map();
   try{
     for(const ref of refs){
       if(!pending.has(ref.src))pending.set(ref.src,await reference(lib,ref.src));
       const asset=pending.get(ref.src);
       lines[ref.index]=imageSource({...ref,hash:asset.hash,ext:asset.extension});
     }
     if(!sourceMode()||db!==model||selected!==id||storage.handle?.id!==lib||source.value!==before)throw Error('The source changed during import. Retry.');
     forceRichHistoryCheckpoint();for(const asset of pending.values())track(asset,asset.name);
     source.value=lines.join('\n');syncModelFromSource();$('sourceToggle').click();
   }catch(error){if(error.name!=='AbortError')toast(error.message)}
   finally{importingSource=false}
 },true);
 root.addEventListener('paste',async e=>{
   if(!available()||e.clipboardData?.types.includes('application/x-yutanohe-inline'))return;
   const html=e.clipboardData?.getData('text/html');if(!html||!/<img\b/i.test(html))return;
   const template=document.createElement('template');template.innerHTML=html;
   const images=[...template.content.querySelectorAll('img')];if(!images.length)return;
   const dest=here();if(!dest)return;
   e.preventDefault();e.stopImmediatePropagation();
   const pending=[],key=uuid();
   try{
     for(const img of images){
       const src=img.getAttribute('src')||'';
       if(!/^https:\/\/|^data:image\//i.test(src))throw Error('This pasted image has no importable address. Insert its local file instead.');
       const asset=await reference(dest.lib,src),alt=img.getAttribute('alt')??asset.name;
       const marker=key+'-'+pending.length;pending.push({asset,marker,alt});
       img.replaceWith(document.createTextNode(marker));
     }
     let md=clipboardHTMLToMarkdown(template.innerHTML);
     for(const {asset,marker,alt} of pending){
       if(!md.includes(marker))throw Error('Unable to preserve this image in the pasted selection.');
       md=md.replace(marker,()=>'\n'+managedImageMarkdown(alt,asset.hash,asset.extension)+'\n');
     }
     if(!valid(dest))throw Error('The document changed during import. Retry.');
     forceRichHistoryCheckpoint();for(const {asset} of pending)track(asset,asset.name);
     insertFormattedPaste(md,dest.range);
   }catch(error){if(error.name!=='AbortError')toast(error.message)}
 },true);

 let pickerDest;
 preserveRichToolbarSelection(button);
 button.onclick=()=>{restoreRichSelection();pickerDest=here();if(pickerDest){picker.value='';picker.click()}};
 picker.onchange=()=>importFiles(Array.from(picker.files),pickerDest);
 root.addEventListener('paste',e=>{
   const files=Array.from(e.clipboardData?.files||[]);if(!available()||!files.length||e.clipboardData.types.includes('text/html'))return;
   const dest=here();if(!dest)return;e.preventDefault();e.stopImmediatePropagation();importFiles(files,dest);
 },true);
 root.addEventListener('dragover',e=>{if(available()&&e.dataTransfer.types.includes('Files'))e.preventDefault()});
 root.addEventListener('drop',e=>{
   if(!available()||!e.dataTransfer.files.length)return;
   e.preventDefault();e.stopImmediatePropagation();
   let range=document.caretRangeFromPoint?.(e.clientX,e.clientY);
   if(!range){const point=document.caretPositionFromPoint?.(e.clientX,e.clientY);if(point){range=document.createRange();range.setStart(point.offsetNode,point.offset);range.collapse(true)}}
   importFiles(Array.from(e.dataTransfer.files),destination(range));
 },true);
 root.addEventListener('dblclick',e=>{
   const block=e.target.closest('[data-mdblock=image]');if(!block||!available())return;
   const ref=managedImageLine(block.dataset.imageSource),metadata=db.imageAssets?.[ref?.hash];
   if(metadata){e.preventDefault();api.openImage(storage.handle.id,ref.hash,metadata).catch(error=>toast(error.message))}
 });
 const attempted=new WeakSet();
 async function show(block){
   if(attempted.has(block))return;
   attempted.add(block);
   const ref=managedImageLine(block.dataset.imageSource),meta=db?.imageAssets?.[ref?.hash],lib=storage.handle?.id;
   if(!meta||!lib||meta.extension!==ref.ext)return;
   function retry(){setTimeout(()=>{if(block.isConnected){attempted.delete(block);near.observe(block)}},15000)}
   try{
     const bytes=await api.readImage(lib,ref.hash,meta);
     if(!block.isConnected||storage.handle?.id!==lib)return;
     if(!bytes){block.querySelector('.imagePixels').textContent='Image not yet available';retry();return}
     const pixels=block.querySelector('.imagePixels');if(!pixels)return;
     if(bytes.unavailable){pixels.textContent=(meta.name||'Image')+' · Preview unavailable';return}
     const types={jpg:'jpeg',svg:'svg+xml'};
     const image=new Image();image.draggable=false;image.alt=ref.alt;const current=managedImageLine(block.dataset.imageSource);if(current?.width)image.width=current.width;image.decoding='async';image.loading='lazy';
     image.onerror=()=>{if(block.contains(image))image.replaceWith(document.createTextNode('Preview unavailable'))};
     // SVG stays in the browser's restricted image context.
     image.src='data:image/'+(types[bytes.extension]||bytes.extension)+';base64,'+bytes.data;
     pixels.replaceChildren(image);
   }catch(error){if(block.isConnected){block.querySelector('.imagePixels').textContent='Image could not be verified';retry()}}
 }
 const near=new IntersectionObserver(entries=>{
   for(const {target,isIntersecting} of entries)if(isIntersecting){near.unobserve(target);show(target)}
 },{root:root.closest('.documentScroll'),rootMargin:'320px'});
 function refresh(){restoreManagedImageWidths(root);for(const block of root.querySelectorAll('[data-mdblock=image]'))if(!attempted.has(block))near.observe(block)}
 // Native WebView resize handles change the image itself, bypassing our corner handler.
 // Persist explicit pixel dimensions through the same occurrence-local Markdown codec.
 new MutationObserver(records=>{
   if(!editorIsOpen()||sourceMode()||selected!==editorDisplayedId)return;
   const images=new Set(records.map(record=>record.target));
   for(const image of images){
     if(!image.matches('img')||!root.contains(image))continue;
     const block=image.closest('[data-mdblock=image]');if(!block)continue;
     const prior=info(block),figure=block.querySelector('figure');
     const styled=/^([0-9]+(?:\.[0-9]+)?)px$/.exec(image.style.width);
     const width=Math.round(styled?Number(styled[1]):Number(image.getAttribute('width')));
     if(!Number.isFinite(width)||width<16||width===prior.width)continue;
     forceRichHistoryCheckpoint();
     figure.style.width=width+'px';image.width=width;
     image.style.removeProperty('width');image.style.removeProperty('height');image.removeAttribute('height');
     block.dataset.imageSource=imageSource({...prior,width});
     syncModelFromRich();
   }
 }).observe(root,{subtree:true,attributes:true,attributeFilter:['style','width']});
 new MutationObserver(refresh).observe(root,{childList:true,subtree:true});
}
