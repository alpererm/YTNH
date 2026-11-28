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
   <input id="helpSearch" class="field helpSearch" type="search" placeholder="Search help…" aria-label="Search help…">
   <details open><summary>Getting started</summary><p>Your notes, todos and plans live in a <strong>library</strong>, a single .ytnh file you choose. Use <strong>☰ → New Library…</strong> or <strong>Open Library…</strong> to start. New to YTNH? <strong>☰ → Open the Tour</strong> creates a practice library that walks you through everything. The <strong>Outline</strong> on the left holds everything; the right side shows the <strong>Calendar</strong>, <strong>Targets</strong> or the <strong>editor</strong> for the selected item.</p><p>Press <strong>N</strong> or <strong>T</strong> in the Outline (or ${esc(shortcutText('Mod+N'))} / ${esc(shortcutText('Mod+T'))} anywhere) to add a Note or a Todo; with the editor open you type its title straight away in the editor (Esc before typing removes it again). Double-click an item to write in it.</p></details>
   <details><summary>Outline and items</summary><p><strong>Notes</strong> hold writing; <strong>Todos</strong> have a status: Todo, Done, Waiting for, On hold or Cancelled. Click a Todo's marker to mark it done; right-click it for the other statuses. Only the marker changes status. Type <code>&gt;&gt;</code> in a title to choose the item’s parent.</p><p><strong>Clicking items:</strong> everywhere (Outline, Calendar, Targets, milestones, Daily Planner) a click on an item's title selects it and shows it in the Outline, and switches the editor to it when the editor is open; a double-click opens it in the editor. Right-click any item for the same menu everywhere: Open, Show in Outline, its statuses, dates, Move to…, Pin to top, Copy link, Archive… and Delete…, plus anything that view adds. With the keyboard, Enter (or Shift+Enter in the Outline) opens the item and the menu key or Shift+F10 shows its menu.</p><p>Drag a row to move it: drop on the top quarter of another row to place it before, the middle to make it a child, the bottom quarter to place it after. Drop on empty space to make it a top-level item. Use Group by to see items by date, type or tag.</p><p><strong>Headings</strong> divide a project into sections: select an item and press <strong>H</strong>. Click a heading’s arrow to fold its section; right-click it to rename it or turn it into a real parent.</p><p><strong>Archive</strong> hides a branch but keeps it under its parent; restore it later from <strong>☰ → Archive…</strong>, where archived items are listed under their parent. <strong>Archive completed…</strong> there archives every branch that is finished all the way down, optionally only ones unchanged for 7, 30 or 90 days; finished items with unfinished children stay active, and one Undo reverses it. <strong>Cold archive</strong> moves archived branches into a separate file to keep the library small. Deleting asks whether to delete the children too or keep them; deleted items go to <strong>Recently deleted</strong> in the same dialog, where you can restore them under their parent for 30 days. Items linked in several places go there too when you choose <strong>Delete item everywhere</strong>; restoring puts their links back where those places still exist.</p><p><strong>History…</strong> in an item’s Details lists its earlier versions from this computer’s automatic backups; choose one to read it and <strong>Restore this version</strong> (Undo reverses it).</p><p><strong>Quick Open</strong> (Ctrl/Cmd+P, or Ctrl+Shift+Space from any app) finds items and shows each one’s parent path. Enter opens the item, Shift+Enter shows it in the Outline, and when nothing matches you can create a Note or Todo from what you typed. Type <strong>&gt;</strong> first to run a command or change a setting, for example “&gt; archive completed” or “&gt; theme graphite”; <em>Item:</em> commands act on the selected item (Move to…, Copy link, History… and more).</p><p><strong>Backups</strong> are taken automatically while you work. YTNH keeps every copy from the last day, then one per day for a month, one per week for six months and one per month after that. To go back to one, use <strong>☰ → Restore Earlier Version…</strong>; your current state is backed up first. If a library file couldn't be saved, or YTNH stopped before saving it, <strong>☰ → Recover Unsaved Copy…</strong> opens the copy YTNH kept on this computer.</p><p><strong>Privacy:</strong> while a library is open, YTNH works on a copy of it on this computer. Once everything is saved to the library file, that copy is removed when you close the library or open another one, so nothing of a library kept in an encrypted folder stays outside it. Copies with work that isn't in the file yet are kept until you recover them; to remove one you don't need, select it in Recover Unsaved Copy and choose <strong>Discard…</strong>. If a library file is missing because you deleted it, the <strong>Library file unavailable</strong> message offers <strong>Forget on This Computer</strong>. <strong>☰ → Automatic Backups…</strong> chooses where this library's backups go on this computer: in YTNH's folder, next to the library file (in a hidden folder, locked along with an encrypted folder; skipped while it's locked) or nowhere. <strong>☰ → Forget This Library on This Computer…</strong> removes its copies, its backups in YTNH's folder and its place in Open Recent; the library file is not touched.</p></details>
   <details><summary>Writing</summary><p>The editor is rich text with Markdown underneath; switch to Source to see the Markdown. Type at the start of a line: <code>-</code> for a bullet, <code>1.</code> for a numbered list, <code>[]</code> for a checklist, <code>&gt;</code> for a quote, <code>#</code> to <code>###</code> for headings, <code>---</code> for a divider and three backticks then Enter for a code block. A numbered list starts at the number you type, such as <code>5.</code> or <code>1)</code>. Type a header row like <code>| Name | Date |</code> and press Enter to start a table.</p><p><strong>Markdown as you type:</strong> <code>**bold**</code>, <code>*italic*</code>, <code>&#96;code&#96;</code>, <code>~~strikethrough~~</code>, <code>==highlight==</code> and <code>[text](https://…)</code> turn into formatting as soon as you type the closing mark, and a web address becomes a link when you type a space after it. A line like <code>![description](https://…/picture.png)</code> imports that image into the library. Characters you type that aren't formatting stay exactly as typed. Brackets close themselves; selecting text and typing a bracket, quote, <code>*</code>, <code>&#96;</code>, <code>~</code> or <code>=</code> wraps or formats it. Pasting a web address over selected words makes them a link.</p><p><strong>Folding:</strong> hover over a heading and click the chevron to its left to fold everything under it, up to the next heading of the same level; Ctrl/Cmd+. folds or unfolds the section you are in, and the command palette has Fold All Headings and Unfold All Headings. Folds are remembered for each item on this computer and never change the note. Find, the document outline and Enter on a folded heading unfold it.</p><p><strong>Slash menu:</strong> type <code>/</code> at the start of a line to pick a heading, list, checklist, quote, code block, divider, table, image, link or inline Todo. Keep typing to filter; Enter chooses, Esc keeps the text.</p><p><strong>Formatting a selection:</strong> select text and a small toolbar appears for bold, italic, underline, code and links.</p><p>Type <code>[[</code> (or <code>![[</code> to embed) to link another item: suggestions appear as you type, best title matches first, with options to create a new Note or Todo. Links show as green text; embeds keep their box. Ctrl/Cmd+click or double-click a link to open it; a plain click places the cursor. Links survive renaming and moving; the side panel lists backlinks, which open with a single click.</p><p><strong>Inline Todos:</strong> type <code>&lt;call the supplier&gt;</code> inside a sentence to create a child Todo. Inside the brackets, <code>@tomorrow</code> schedules it and <code>[</code> chooses another parent. Start with d, w, h or c for Done, Waiting for, On hold or Cancelled; t or m for a Target or Milestone. <code>!&lt;</code> points to an existing Todo. Right-click one to change its status or choose <strong>Show in Outline</strong>; Ctrl/Cmd+click opens it.</p><p><strong>Images:</strong> paste or drop an image into a note. YTNH keeps a copy inside your library, so it still shows on another computer.</p><p><strong>Find and replace:</strong> Ctrl/Cmd+F opens a small panel at the top right of the editor; Ctrl/Cmd+H (⌘⌥F on a Mac) opens it with Replace. Enter and Shift+Enter move between matches, Tab jumps to Replace, Enter there replaces and moves on, and Ctrl/Cmd+Enter replaces all. Matching ignores case.</p></details>
   <details><summary>Calendar</summary><p>Drag an item onto a day to schedule it; drag a chip to another day to move it. An item can have several dates. Todos can repeat daily, on weekdays, weekly on chosen days or monthly; each occurrence keeps its own status.</p><p>Click an empty part of a day to select it (a thin outline marks it); double-click it, or press Enter, to show only that day's items in the Outline. While that filter is on it follows the day you select; Escape clears it. Click the month title to jump to a date. Weekends are hidden by default; show them under Filters → More. There, or in Settings → Calendar, <strong>Notes in Calendar by</strong> also lists unscheduled Notes on the day they were created or last modified, greyed out below the scheduled items, for each library. They open, select and show in the Outline like any item; drag one onto a day to schedule it. With a day selected, press Tab to move into its items: Up and Down select them (and show them in the Outline), Space marks a Todo done, Enter opens one and Escape goes back to the day. A day shows up to 5 items; click <strong>+N</strong> under a day, or + beside the week number, to see the whole week.</p><p><strong>Icons in the Outline:</strong> a calendar icon marks scheduled items, a repeat icon repeating Todos and a clock items planned in the Daily Planner. Hover to see the dates; click to go there. The calendar icon turns red when an unfinished Todo's dates have all passed.</p><p><strong>Colours:</strong> a Todo's circle shows its status everywhere: graphite for open, filled for Done, amber for Waiting for, violet for On hold and grey for Cancelled. Meetings are teal.</p><p><strong>Animations:</strong> views, panels and dialogs fade or slide in briefly; switching items and days stays instant. Turn them off under Settings → General → Animations, or with your system’s Reduce motion setting.</p><p>To remove an item from a day, middle-click it, select it and press Delete, or right-click it and choose Remove this date.</p></details>
   <details><summary>Daily Planner</summary><p>Open it with the panel button beside Targets or ${esc(shortcutText('Mod+Shift+D'))}. Click an empty time slot (or press Enter on it) to plan a Note, Todo or meeting, or drag an item from the Outline onto the timeline. Planning an unscheduled item also schedules it for that day.</p><p>Click a planned item to show it in the Outline; double-click to open it. Double-click a meeting to write in its document. The red line shows the current time. The pin keeps the planner on one day while you browse the Calendar.</p></details>
   <details><summary>Targets and milestones</summary><p>A <strong>Target</strong> is a Todo with a start and end month, shown as a bar in Targets. A <strong>Milestone</strong> is a Todo planned for a week. Choose one or the other under <strong>Plan as</strong> in Properties; an item can't be both. Items under a target count towards it; the number on a bar shows milestones done out of the total.</p><p>Notes have no status of their own: a Note under a finished Todo, Target or Milestone is hidden with it, and appears dimmed when you show inactive items.</p><p>In Targets the ‹ › arrows move one year; Page Up and Page Down move five.</p></details>
   <details><summary>Search and filters</summary><p>Press / or click the magnifier to search the Outline; the × in the field clears it. Search is forgiving about typos. Use <code>#tag</code> for tags (it also finds nested tags such as <code>#tag/sub</code>, and <code>#sub</code> finds them too), <code>status:Done</code>, <code>created:&gt;=2026-01-01</code> or <code>scheduled:&lt;=2026-12-31</code>. Filters narrow by type, status, recurrence and dates; chips beside Filters show what's active, and Clear all (Alt+Shift+C, ⌥⇧C on a Mac) resets them.</p><p><strong>Tags</strong> come from the Tags field and from <code>#tags</code> typed in the text; both count as the item's own tags, and children inherit them. Turn tags under items in the Outline on or off under Settings → Appearance.</p></details>
   <details><summary>Files, saving and syncing</summary><p>Changes save automatically to a working copy on this computer. <strong>Save</strong> (and closing the app) updates your library file. Once everything is in the library file, that working copy is removed when you close the library or open another one. If saving fails, your local work is kept and YTNH offers to retry or Save As.</p><p>Keep a backup with <strong>Back Up Library…</strong>: it saves a complete copy as a separate .ytnh file, which you can open with Open Library. <strong>Export as JSON…</strong> saves an open-format copy (the library as JSON, plus images and cold archives) for use outside YTNH. If you use OneDrive or another sync service, let it finish before opening the library on another computer, and don't edit the same library on two computers at once. If another computer saved the library while you had unsaved changes here, <strong>Keep Both</strong> copies the items it changed into a “Conflicting changes from another computer” branch and then saves everything, so nothing is lost.</p></details>
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
 const childCount=childrenOf(db,i.id).length;
 const explicit=normalizeTagList(i.explicitTags||[]);
 const inherited=inheritedTags(db,i);
 const dates=(i.scheduledDates||[]);
 const recurrenceLabels={daily:"Daily",weekdays:"Weekdays (Mon–Fri)",weekly:"Weekly",monthly:"Monthly"};
 const recurrence=i.type==="Todo"&&i.recurrence?.frequency
   ?`${recurrenceLabels[i.recurrence.frequency]||i.recurrence.frequency} · every ${Math.max(1,Number(i.recurrence.interval)||1)} · from ${i.recurrence.startDate?displayDate(i.recurrence.startDate):"not set"}`
   :"None";
 const nextOccurrence=i.type==="Todo"&&i.recurrence?.frequency
   ?(occurrenceDates(i,today(),iso(new Date(new Date().getFullYear()+2,new Date().getMonth(),new Date().getDate(),12)))[0]||"None in next 2 years")
   :"—";
 const linkRef=`[[${refToken(i.id)}]]`,embedRef=`![[${refToken(i.id)}]]`;
 // The same kind names as the markers and menus; Targets and Milestones are Todos underneath, Headings are Notes.
 const kind=i.heading?'Heading':i.target?'Target':isMilestone(i)?'Milestone':isRecurringTodo(i)?'Repeating Todo':i.type;
 const repeats=i.type==="Todo"&&!!i.recurrence?.frequency;
 const own=ownTags(i),fromParents=inherited.filter(t=>!own.includes(t));
 const chips=list=>list.map(t=>`<span class="detailChip">#${esc(t)}</span>`).join("");
 host.innerHTML=`
   <div class="detailsGrid"><div><span>Type</span><strong>${esc(kind)}</strong></div>
     <div><span>Status</span><strong>${esc(i.type==="Todo"?(i.status||"Todo"):"—")}</strong></div>
     <div><span>Created</span><strong>${esc(new Date(i.createdAt).toLocaleString('en-GB',{hourCycle:'h23'}))}</strong></div>
     <div><span>Updated</span><strong>${esc(new Date(i.updatedAt).toLocaleString('en-GB',{hourCycle:'h23'}))} <button type="button" class="itemHistoryButton" data-item-history="${esc(i.id)}">History…</button></strong></div>
     <div><span>Parent</span><strong>${parent?esc(parent.title||"(untitled)"):"Root"}</strong></div>
     <div><span>Direct children</span><strong>${childCount}</strong></div>
     <div><span>Backlinks</span><strong>${backlinksFor(i.id).length}</strong></div>
     ${repeats?`<div><span>Repeats</span><strong>${esc(recurrence)}</strong></div><div><span>Next occurrence</span><strong>${esc(/^\d{4}-\d\d-\d\d$/.test(nextOccurrence)?displayDate(nextOccurrence):nextOccurrence)}</strong></div>`:''}
   </div>
   <div class="detailsSection"><strong>Scheduled dates</strong><div>${dates.length?dates.map(d=>`<span class="detailChip">${esc(displayDate(d))}</span>`).join(""):'<span class="muted">None</span>'}</div></div>
   <div class="detailsSection"><strong>Tags</strong><div>${own.length?chips(own):'<span class="muted">None</span>'}</div></div>
   ${fromParents.length?`<div class="detailsSection"><strong>Inherited tags</strong><div>${chips(fromParents)}</div></div>`:''}
   <div class="detailsSection"><strong>ID</strong><div class="copyRow detailIdRow"><input id="detailUuid" class="field mono-code detailUuid" readonly value="${esc(i.id)}" aria-label="Item ID"></div>
     <div class="detailCopyButtons"><span class="muted">Copy:</span><button type="button" data-copy-ref="uuid" title="Copy the ID">ID</button><button type="button" data-copy-ref="link" title="Copy a link to paste in a note">Link</button><button type="button" data-copy-ref="embed" title="Copy an embed to paste in a note">Embed</button></div></div>`;
 host.querySelector('[data-copy-ref="uuid"]').onclick=()=>copyPlainText(i.id);
 host.querySelector('[data-copy-ref="link"]').onclick=()=>copyPlainText(linkRef);
 host.querySelector('[data-copy-ref="embed"]').onclick=()=>copyPlainText(embedRef);
 host.querySelectorAll("[data-item-history]").forEach(b=>b.onclick=()=>openItemHistory(b.dataset.itemHistory));
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

// Item history: earlier versions of one item from this computer's automatic backups.
async function openItemHistory(id){
 const item=itemById(db,id);if(!item)return;
 const reader=window.notesDesktop?.sqlite?.itemHistory;
 if(!reader){toast('Version history comes from the automatic backups of the desktop app.');return}
 let versions;try{versions=await reader(id)}catch(e){toast('Could not read version history: '+e.message);return}
 const same=v=>v.title===item.title&&v.content===item.content&&(item.type!=='Todo'||v.status===item.status);
 versions=(versions||[]).filter(v=>!same(v));
 const when=v=>new Date(v.savedAt).toLocaleString('en-GB',{hourCycle:'h23',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(/\bSept\b/,'Sep');
 resetModalShell();$('modalTitle').textContent='History';
 $('modalText').textContent=versions.length?`${versions.length} earlier version${versions.length===1?'':'s'} of “${item.title||'(untitled)'}” from this computer’s automatic backups. Versions saved on your other computers appear only there.`:`No earlier versions of “${item.title||'(untitled)'}” in this computer’s backups yet. Backups are made while you work, and each computer keeps its own.`;
 $('modalExtra').innerHTML=versions.length?`<div class="historyPicker"><div class="historyList" role="listbox" aria-label="Versions">${versions.map((v,n)=>`<button type="button" role="option" data-version="${n}"><strong>${esc(when(v))}</strong><small>${esc(v.title||'(untitled)')}${item.type==='Todo'?' · '+esc(v.status):''}${v.archived?' · archived':''}</small></button>`).join('')}</div><div class="historyPreview"><h4 id="historyTitle"></h4><pre id="historyText"></pre><button type="button" id="historyRestore" class="primary">Restore this version</button></div></div>`:'';
 $('modalOK').textContent='Close';$('modalOK').onclick=closeModalShell;$('modalCancel').classList.add('hidden');$('modalbg').classList.add('open');
 if(!versions.length)return;
 let current=0;
 const show=n=>{current=n;const v=versions[n];$('modalExtra').querySelectorAll('[data-version]').forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.version)===n)));$('historyTitle').textContent=v.title||'(untitled)';$('historyText').textContent=v.content||'(empty)'};
 $('modalExtra').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>show(Number(b.dataset.version)));
 $('historyRestore').onclick=()=>{
   const v=versions[current],target=itemById(db,id);if(!target)return;
   checkpoint();target.title=v.title;target.content=v.content;if(target.type==='Todo'&&TODO_STATUSES.includes(v.status))target.status=v.status;touch(db,target);
   closeModalShell();render();if(editorIsOpen()&&selected===id)edit(id);toast('Restored the version from '+when(v)+'. Undo reverses it.');
 };
 show(0);
}
