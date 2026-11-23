"use strict";
// Help, item Details, tooltips, toasts and small display helpers.
// Declarations only; loaded before the main script.
function openHelp(){
 resetModalShell();
 const modalEl=document.querySelector(".modal");
 if(modalEl)modalEl.classList.add("wideModal");
 $("modalTitle").textContent="Help";
 $("modalText").textContent="How YTNH works, and the keys that make it quicker.";
 const keys=HELP_SHORTCUTS.map(([group,rows])=>`<h4>${esc(group)}</h4><div class="helpGrid">${rows.map(([spec,desc])=>`<span class="helpKeys">${esc(spec.split(' / ').map(part=>part.split(' or ').map(k=>/^[A-Za-z?\/]$|^(Up|Down|Left|Right|Home|Escape|Space|Enter|Tab|Backspace|Delete|Page Up|Page Down|F2|F11|N|T)$/.test(k)||!/[+]/.test(k)?k:shortcutText(k)).join(' or ')).join(' / '))}</span><span>${esc(desc)}</span>`).join('')}</div>`).join('');
 $("modalExtra").innerHTML=`
 <div class="helpContent">
   <input id="helpSearch" class="field helpSearch" type="search" placeholder="Search help" aria-label="Search help">
   <details open><summary>Getting started</summary><p>Your notes, todos and plans live in a <strong>library</strong>, a single .ytnh file you choose. Use <strong>☰ → New Library…</strong> or <strong>Open Library…</strong> to start. New to YTNH? <strong>☰ → Open the Tour…</strong> creates a practice library that walks you through everything. The <strong>Outline</strong> on the left holds everything; the right side shows the <strong>Calendar</strong>, <strong>Targets</strong> or the <strong>editor</strong> for the selected item.</p><p>Press <strong>N</strong> or <strong>T</strong> in the Outline (or ${esc(shortcutText('Mod+N'))} / ${esc(shortcutText('Mod+T'))} anywhere) to add a Note or a Todo. Double-click an item to write in it.</p></details>
   <details><summary>Outline and items</summary><p><strong>Notes</strong> hold writing; <strong>Todos</strong> have a status: Todo, Done, Waiting for, On hold or Cancelled. Click a Todo's marker to mark it done; middle-click to cancel it; right-click for more.</p><p>Drag a row to move it: drop on the top quarter of another row to place it before, the middle to make it a child, the bottom quarter to place it after. Drop on empty space to make it a top-level item. Use Group by to see items by date, type or tag.</p><p><strong>Headings</strong> divide a project into sections: select an item and press <strong>H</strong>. Click a heading’s arrow to fold its section; right-click it to rename it or turn it into a real parent.</p><p><strong>Archive</strong> hides a branch but keeps it under its parent; restore it later from <strong>☰ → Archive…</strong>, where archived items are listed under their parent. <strong>Archive completed…</strong> there archives every branch that is finished all the way down, optionally only ones unchanged for 7, 30 or 90 days; finished items with unfinished children stay active, and one Undo reverses it. <strong>Cold archive</strong> moves archived branches into a separate file to keep the library small. Deleting asks whether to delete the children too or keep them.</p><p><strong>Backups</strong> are taken automatically while you work. YTNH keeps every copy from the last day, then one per day for a month, one per week for six months and one per month after that. Restore one from <strong>☰ → Restore Backup…</strong>.</p></details>
   <details><summary>Writing</summary><p>The editor is rich text with Markdown underneath; switch to Source to see the Markdown. Type at the start of a line: <code>-</code> for a bullet, <code>1.</code> for a numbered list, <code>[]</code> for a checklist, <code>&gt;</code> for a quote, <code>#</code> to <code>###</code> for headings, <code>---</code> for a divider and three backticks then Enter for a code block. A numbered list starts at the number you type, such as <code>5.</code>.</p><p><strong>Slash menu:</strong> type <code>/</code> at the start of a line to pick a heading, list, checklist, quote, code block, divider, table, image, link or inline Todo. Keep typing to filter; Enter chooses, Esc keeps the text.</p><p><strong>Formatting a selection:</strong> select text and a small toolbar appears for bold, italic, underline, code and links.</p><p>Type <code>[[</code> (or <code>![[</code> to embed) to link another item: suggestions appear as you type, best title matches first, with options to create a new Note or Todo. Links survive renaming and moving; the side panel lists backlinks.</p><p><strong>Inline Todos:</strong> type <code>&lt;call the supplier&gt;</code> inside a sentence to create a child Todo. Inside the brackets, <code>@tomorrow</code> schedules it and <code>[</code> chooses another parent. Start with d, w, h or c for Done, Waiting for, On hold or Cancelled; t or m for a Target or Milestone. <code>!&lt;</code> points to an existing Todo. Right-click one to change its status.</p><p><strong>Images:</strong> paste or drop an image into a note. YTNH keeps a copy inside your library, so it still shows on another computer.</p></details>
   <details><summary>Calendar</summary><p>Drag an item onto a day to schedule it; drag a chip to another day to move it. An item can have several dates. Todos can repeat daily, on weekdays, weekly on chosen days or monthly; each occurrence keeps its own status.</p><p>Click an empty part of a day to select it (a thin outline marks it) and show only that day's items in the Outline. Weekends are hidden by default; show them under Filters → More. Busy weeks show up to 20 items; use + on the week to see everything.</p><p><strong>Icons in the Outline:</strong> a calendar icon marks scheduled items, a repeat icon repeating Todos and a clock items planned in the Daily Planner. Hover to see the dates; click to go there. The calendar icon turns red when an unfinished Todo's dates have all passed.</p><p><strong>Colours:</strong> a Todo's circle shows its status everywhere: graphite for open, filled for Done, amber for Waiting for, violet for On hold and grey for Cancelled. Meetings are teal.</p></details>
   <details><summary>Daily Planner</summary><p>Open it with the panel button beside Targets or ${esc(shortcutText('Mod+Shift+D'))}. Click an empty time slot (or press Enter on it) to plan a Note, Todo or meeting, or drag an item from the Outline onto the timeline. Planning an unscheduled item also schedules it for that day.</p><p>Double-click a meeting to write in its document. The red line shows the current time. The pin keeps the planner on one day while you browse the Calendar.</p></details>
   <details><summary>Targets and milestones</summary><p>A <strong>Target</strong> is a Todo with a start and end month, shown as a bar in Targets. A <strong>Milestone</strong> is a Todo planned for a week. Items under a target count towards it; the number on a bar shows milestones done out of the total.</p></details>
   <details><summary>Search and filters</summary><p>Search is forgiving about typos. Use <code>#tag</code> for tags, <code>status:Done</code>, <code>created:&gt;=2026-01-01</code> or <code>scheduled:&lt;=2026-12-31</code>. Filters narrow by type, status, recurrence and dates; chips beside Filters show what's active, and Clear all (Alt+Shift+C, ⌥⇧C on a Mac) resets them.</p></details>
   <details><summary>Files, saving and syncing</summary><p>Changes save automatically to a working copy on this computer. <strong>Save</strong> (and closing the app) updates your library file. If saving fails, your local work is kept and YTNH offers to retry or Save As.</p><p>Keep a backup with <strong>Back Up Library…</strong>. If you use OneDrive or another sync service, let it finish before opening the library on another computer, and don't edit the same library on two computers at once.</p></details>
   <details><summary>Outlook calendar</summary><p>Export your Outlook calendar as an .ics file, then choose <strong>☰ → Import Outlook Calendar…</strong> and review the changes before importing. To bring in later changes, export again from Outlook into the same folder and choose Reimport: it reads the newest .ics file in that folder. Meetings in a time zone YTNH can't recognise are skipped and listed in the review.</p></details>
   <details><summary>Importing Markdown</summary><p>Choose <strong>☰ → Import Markdown Folder…</strong> and pick a folder. Each Markdown file becomes a Note named after the file, inside an <strong>Imported – folder name</strong> Note; subfolders become Notes with their files inside. Tags and dates from front matter are kept, images the files point to are copied into your library, and links between the files become item links. Hidden folders such as .obsidian are skipped. One Undo removes the whole import.</p></details>
   <details><summary>Keyboard shortcuts</summary><div class="helpShortcuts">${keys}</div></details>
 </div>`;
 const search=$('helpSearch');
 search.oninput=()=>{
   const q=search.value.trim().toLowerCase();
   $('modalExtra').querySelectorAll('.helpContent>details').forEach(d=>{
     const rows=[...d.querySelectorAll('.helpGrid')].flatMap(g=>{const cells=[...g.children];return cells.reduce((a,c,i)=>i%2?a:[...a,[c,cells[i+1]]],[])});
     if(rows.length){let any=false;rows.forEach(([k,v])=>{const hit=!q||(k.textContent+' '+v.textContent).toLowerCase().includes(q);k.hidden=v.hidden=!hit;any||=hit});d.querySelectorAll('h4').forEach(h=>{const grid=h.nextElementSibling;h.hidden=!![...grid.children].every(c=>c.hidden)});d.hidden=!any;if(q)d.open=any;return}
     const hit=!q||d.textContent.toLowerCase().includes(q);d.hidden=!hit;if(q)d.open=hit;
   });
 };
 $("modalOK").textContent="Close";
 $("modalCancel").classList.add("hidden");
 $("modalbg").classList.add("open");
 $("modalOK").onclick=closeModalShell;
 setTimeout(()=>search.focus(),0);
}
function copyPlainText(textValue){
 const fallback=()=>{
   const t=document.createElement("textarea");t.value=textValue;t.style.position="fixed";t.style.opacity="0";
   document.body.append(t);t.select();let ok=false;try{ok=document.execCommand("copy")}catch{}t.remove();
   if(ok)toast("Copied");else toast("Copy failed — select the reference manually.");
 };
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(textValue).then(()=>toast("Copied")).catch(fallback);
 else fallback();
}
function openItemDetails(){if(!selected)return;if(!editorIsOpen())edit(selected);selectSidebarTab('details')}
function renderItemDetails(host){
 const i=itemById(db,selected);if(!i)return;
 const parent=i.parentId?itemById(db,i.parentId):null;
 const siblings=activeItems(db).filter(x=>x.parentId===i.parentId).sort((a,b)=>a.order-b.order),siblingIndex=siblings.findIndex(x=>x.id===i.id);
 const canPromote=!currentGroupBy()&&!!i.parentId,canDemote=!currentGroupBy()&&!!previousSibling(i),canUp=siblingIndex>0,canDown=siblingIndex>=0&&siblingIndex<siblings.length-1;
 const childCount=childrenOf(db,i.id).length;
 const aliases=(i.codeAliases||[]).slice().reverse();
 const explicit=normalizeTagList(i.explicitTags||[]);
 const inherited=inheritedTags(db,i);
 const dates=(i.scheduledDates||[]);
 const recurrenceLabels={daily:"Daily",weekdays:"Weekdays (Mon–Fri)",weekly:"Weekly",monthly:"Monthly"};
 const recurrence=i.type==="Todo"&&i.recurrence?.frequency
   ?`${recurrenceLabels[i.recurrence.frequency]||i.recurrence.frequency} · every ${Math.max(1,Number(i.recurrence.interval)||1)} · from ${i.recurrence.startDate||"not set"}`
   :"None";
 const nextOccurrence=i.type==="Todo"&&i.recurrence?.frequency
   ?(occurrenceDates(i,today(),iso(new Date(new Date().getFullYear()+2,new Date().getMonth(),new Date().getDate(),12)))[0]||"None in next 2 years")
   :"—";
 const linkRef=`[[${refToken(i.id)}]]`,embedRef=`![[${refToken(i.id)}]]`;
 host.innerHTML=`
   <div class="detailsGrid"><div><span>Type</span><strong>${esc(i.type)}</strong></div>
     <div><span>Status</span><strong>${esc(i.type==="Todo"?(i.status||"Todo"):"—")}</strong></div>
     <div><span>Created</span><strong>${esc(new Date(i.createdAt).toLocaleString('en-GB',{hourCycle:'h23'}))}</strong></div>
     <div><span>Updated</span><strong>${esc(new Date(i.updatedAt).toLocaleString('en-GB',{hourCycle:'h23'}))}</strong></div>
     <div><span>Parent</span><strong>${parent?esc(parent.title||"(untitled)"):"Root"}</strong></div>
     <div><span>Direct children</span><strong>${childCount}</strong></div>
     <div><span>Backlinks</span><strong>${backlinksFor(i.id).length}</strong></div>
     <div><span>Recurrence</span><strong>${esc(recurrence)}</strong></div><div><span>Next occurrence</span><strong>${esc(nextOccurrence)}</strong></div>
   </div>
   <div class="detailsSection"><strong>Scheduled dates</strong><div>${dates.length?dates.map(d=>`<span class="detailChip">${esc(d)}</span>`).join(""):'<span class="muted">None</span>'}</div></div>
   <div class="detailsSection"><strong>Explicit tags</strong><div>${explicit.length?explicit.map(t=>`<span class="detailChip">#${esc(t)}</span>`).join(""):'<span class="muted">None</span>'}</div></div>
   <div class="detailsSection"><strong>Inherited/effective tags</strong><div>${inherited.length?inherited.map(t=>`<span class="detailChip">#${esc(t)}</span>`).join(""):'<span class="muted">None</span>'}</div></div>
   <div class="detailsSection"><strong>Previous visible codes</strong><div>${aliases.length?aliases.map(a=>`<span class="detailChip">${esc(a)}</span>`).join(""):'<span class="muted">None</span>'}</div></div>
   <div class="detailsSection"><strong>UUID</strong><div class="copyRow"><input id="detailUuid" class="field mono-code detailUuid" readonly value="${esc(i.id)}"><button type="button" data-copy-ref="uuid">Copy</button></div></div>
   <div class="referenceCopies">
     <label>Link reference<div class="copyRow"><input id="detailLinkRef" class="field mono-code ${i.type==="Todo"?"todo-code":"note-code"}" readonly value="${esc(linkRef)}"><button type="button" data-copy-ref="link">Copy</button></div></label>
     <label>Embed reference<div class="copyRow"><input id="detailEmbedRef" class="field mono-code ${i.type==="Todo"?"todo-code":"note-code"}" readonly value="${esc(embedRef)}"><button type="button" data-copy-ref="embed">Copy</button></div></label>
   </div>
   <div class="detailsSection detailsActions"><strong>Item actions</strong><div class="detailActionGrid">
     <button type="button" data-item-action="promote" ${canPromote?"":"disabled"}>Promote to root</button>
     <button type="button" data-item-action="demote" ${canDemote?"":"disabled"}>Demote under previous</button>
     <button type="button" data-item-action="up" ${canUp?"":"disabled"}>Move up</button>
     <button type="button" data-item-action="down" ${canDown?"":"disabled"}>Move down</button>
     <button type="button" data-item-action="archive">Archive subtree</button>
     <button type="button" data-item-action="delete" class="danger">Delete permanently</button>
   </div></div>`;
 host.querySelector('[data-copy-ref="uuid"]').onclick=()=>copyPlainText(i.id);
 host.querySelector('[data-copy-ref="link"]').onclick=()=>copyPlainText(linkRef);
 host.querySelector('[data-copy-ref="embed"]').onclick=()=>copyPlainText(embedRef);
 const actionIds={promote:"promote",demote:"demote",up:"up",down:"down",archive:"archive",delete:"delete"};
 host.querySelectorAll("[data-item-action]").forEach(b=>b.onclick=()=>{
   const id=actionIds[b.dataset.itemAction];if(!id)return;
   setTimeout(()=>$(id)?.click(),0);
 });
}
function suppressTooltipTitles(root=document){
 const nodes=[];
 if(root instanceof Element&&root.hasAttribute("title"))nodes.push(root);
 if(root.querySelectorAll)nodes.push(...root.querySelectorAll("[title]"));
 for(const el of nodes){
   if(el.classList.contains('targetBar'))continue;
   const value=el.getAttribute("title");
   if(value&&!el.getAttribute("aria-label")&&!el.textContent.trim())el.setAttribute("aria-label",value);
   el.removeAttribute("title");
 }
}
function installTooltipSuppression(){
 suppressTooltipTitles(document);
 const observer=new MutationObserver(records=>{
   for(const r of records){
     if(r.type==="attributes"&&r.target instanceof Element&&r.target.hasAttribute("title"))suppressTooltipTitles(r.target);
     for(const n of r.addedNodes)if(n instanceof Element)suppressTooltipTitles(n);
   }
 });
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["title"]});
}

function toast(s){$("toast").textContent=s;$("toast").classList.remove("hidden");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.add("hidden"),2600)}
function md(s){let x=esc(s||"");x=x.replace(/^### (.*)$/gm,"<h3>$1</h3>").replace(/^## (.*)$/gm,"<h2>$1</h2>").replace(/^# (.*)$/gm,"<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\n/g,"<br>");return x}


const APP_THEMES={light:'Paper White',dark:'Graphite Dark'};
function appearanceTheme(value){
 if(value==='midnight'||value==='amber')return 'dark';
 if(value==='sepia')return 'light';
 return Object.hasOwn(APP_THEMES,value)?value:null;
}
const APPEARANCE_KEY='local-notes-todos-appearance';
const APP_FONTS={system:['System default','system-ui,-apple-system,"Segoe UI",sans-serif'],sans:['Arial / Helvetica','Arial,Helvetica,sans-serif'],serif:['Georgia','Georgia,"Times New Roman",serif'],mono:['Monospace','ui-monospace,SFMono-Regular,Consolas,monospace'],bearSans:['Bear Sans','"Bear Sans",system-ui,sans-serif'],avenir:['Avenir','Avenir,system-ui,sans-serif'],avenirNext:['Avenir Next','"Avenir Next",Avenir,system-ui,sans-serif']};
const CUSTOM_FONTS_KEY='ytnh-added-fonts';
let addedFontFamilies=[];
