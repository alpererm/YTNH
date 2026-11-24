"use strict";
// Rich editor <-> Markdown conversion, references, embeds and editor locations.
// Declarations only; loaded before the main script.
const caretAnchors=new WeakSet();
function serializeInline(node){
  if(node.nodeType===Node.TEXT_NODE)return caretAnchors.has(node)?(node.nodeValue||"").replace("\u200b",""):(node.nodeValue||"");
  if(node.nodeType!==Node.ELEMENT_NODE)return "";
  if(node.hasAttribute?.('data-inline-todo'))return serializeInlineTodo(node);
  if(node.classList?.contains("mdref"))return node.dataset.md||node.dataset.brokenMd||node.textContent||"";
  const tag=node.tagName,inner=[...node.childNodes].map(serializeInline).join("");
  if(tag==='SPAN'&&Number(node.dataset.textSize)>=8&&Number(node.dataset.textSize)<=96)return `<span data-text-size="${Number(node.dataset.textSize)}">${inner}</span>`;
  if(tag==="STRONG"||tag==="B")return `**${inner}**`;
  if(tag==="EM"||tag==="I")return `*${inner}*`;
  if(tag==='U'||node.style?.textDecorationLine?.includes('underline'))return `<u>${inner}</u>`;
  if(['S','STRIKE','DEL'].includes(tag)||node.style?.textDecorationLine?.includes('line-through'))return `~~${inner}~~`;
  if(tag==='A'&&safeEditorURL(node.getAttribute('href')))return `[${inner}](${node.getAttribute('href').replace(/\)/g,'%29')})`;
  if(tag==="CODE")return `\`${inner}\``;
  if(tag==="BR")return "\n";
  return inner;
}
function editorHTMLToMarkdown(e=$("richEditor")){
  const parts=[];
  const nodes=[...e.childNodes];
  for(let idx=0;idx<nodes.length;idx++){
    const n=nodes[idx];
    if(n.nodeType===Node.TEXT_NODE){parts.push(n.nodeValue||"");continue}
    const block=n.dataset?.mdblock||"p";
    if(block==="image" && managedImageLine(n.dataset.imageSource||'')){const image=managedImageLine(n.dataset.imageSource),caption=n.querySelector("figcaption"),width=parseFloat(n.querySelector("figure")?.style.width)||image.width;parts.push(width!==image.width||caption&&caption.textContent!==image.caption?imageSource({...image,width,caption:caption?.textContent??image.caption}):n.dataset.imageSource);continue}
    if(block==="code"){parts.push(n.textContent.replace(/\u200b/g,""));continue}
    if(block==="table"){parts.push(tableMarkdown(n));continue}
    if(block==="hr"){parts.push("---");continue}
    let children=[...n.childNodes].filter(x=>!(x.nodeType===Node.ELEMENT_NODE&&(x.classList?.contains("md-check")||x.classList?.contains("md-list-marker"))));
    let inner=children.map(serializeInline).join("").replace(/\n$/,"");
    let prefix="";
    if(/^h[1-6]$/.test(block))prefix="#".repeat(Number(block[1]))+" ";
    else if(block==="li"||block==="ul")prefix="- ";
    else if(block==="ol")prefix=`${n.dataset.mdnum||"1"}. `;
    else if(block==="quote")prefix="> ";
    else if(block==="check")prefix=`- [${n.querySelector(".md-check")?.checked?"x":" "}] `;
    parts.push((isEditorList(n)?n.dataset.mdindent||"":"")+prefix+(block==="check"&&n.dataset.checkHeading?(n.dataset.checkHeading==="quote"?"> ":"#".repeat(Number(n.dataset.checkHeading[1]))+" "):"")+inner);
  }
  return parts.join("\n");
}

function editEmbeddedSource(id){
 resetModalShell();
 const target=itemById(db,id);if(!target)return toast("Embedded source no longer exists.");
 $("modalTitle").textContent="Edit Embedded Source";
 $("modalText").innerHTML=`${itemMarker(target,{passive:true})} ${esc(target.title||"(untitled)")}`;
 $("modalExtra").innerHTML=`<div class="embedEdit"><input id="embedTitle" class="field" value="${esc(target.title||"")}"><textarea id="embedBody" class="field content">${esc(target.content||"")}</textarea></div>`;
 $("modalOK").textContent="Save source";$("modalCancel").classList.remove("hidden");$("modalbg").classList.add("open");
 $("modalCancel").onclick=()=>{$("modalbg").classList.remove("open")};
 $("modalOK").onclick=()=>{
   checkpoint();target.title=$("embedTitle").value.trim()||target.title;target.content=canonicalizeReferences($("embedBody").value);touch(db,target);
   $("modalbg").classList.remove("open");const parent=itemById(db,selected);if(parent)syncRichFromModel(parent);renderTree();toast("Embedded source updated");
 };
}
function repairBrokenReference(el){
 const raw=el?.dataset?.brokenMd||"";if(!raw)return;
 const embed=raw.startsWith("!");
 chooseReference(embed,target=>{
   checkpoint();el.replaceWith(makeReferenceElement(target,embed));
   syncModelFromRich();toast("Reference repaired");
 });
}

function openRichReference(el){
 const id=el?.dataset?.refId;if(!id)return;
 syncModelFromRich();
 const target=itemById(db,id);if(!target)return toast("Referenced item no longer exists.");
 rememberEditorLocation();selected=id;
 edit(id);setView("editor");revealOutlineItem(id);
}


function isEditorList(block){return ['ul','li','ol','check'].includes(block?.dataset?.mdblock)}
function editorListDepth(block){return Math.max(0,Number(block?.dataset?.mddepth)||0)}
function emptyEditorBlock(block){return !isEditorList(block)&&(block.dataset.mdblock||'p')==='p'&&!block.textContent.trim()}
// List blocks are preorder records. Explicit depth plus ordered nodes define parent,
// siblings and complete subtrees; CSS indentation is only a view of that structure.
function editorStructure(){
 const blocks=[...$('richEditor').children],records=new Map(),top=[];let stack=[],run=null;
 for(const block of blocks){
   if(emptyEditorBlock(block)){stack=[];run=null;continue;}
   if(!isEditorList(block)){const entry={block,parent:null,children:[],depth:0,run:null};records.set(block,entry);top.push(entry);stack=[];run=null;continue}
   // A new list starts at the number written on its first item ("5." stays 5); items that follow it continue in sequence.
   if(!run)run={roots:[],base:/^\d{1,9}$/.test(block.dataset.mdnum||'')?Number(block.dataset.mdnum):1};
   const rawDepth=editorListDepth(block);while(stack.length&&stack.at(-1).rawDepth>=rawDepth)stack.pop();
   const depth=stack.length,parent=stack[depth-1]||null,entry={block,parent,children:[],depth,rawDepth,run};
   (parent?parent.children:run.roots).push(entry);if(!parent)top.push(entry);
   records.set(block,entry);stack.push(entry);
 }
 return {blocks,records,top};
}
function editorSubtree(entry){
 const out=[entry.block];for(const child of entry.children)out.push(...editorSubtree(child));return out;
}
function setEditorDepth(block,depth){block.dataset.mddepth=String(depth);block.dataset.mdindent='    '.repeat(depth)}
function normalizeEditorLists(){
 const {records}=editorStructure();
 for(const entry of records.values()){
   const b=entry.block;if(!isEditorList(b)){b.style.removeProperty('margin-left');b.style.removeProperty('padding-left');continue}
   if(editorListDepth(b)!==entry.depth)setEditorDepth(b,entry.depth);
   const siblings=entry.parent?entry.parent.children:entry.run.roots,index=siblings.indexOf(entry);
   let first=index;while(first>0&&siblings[first-1].block.dataset.mdblock===b.dataset.mdblock)first--;
   const n=index-first+1+(entry.parent||first>0?0:entry.run.base-1);
   entry.path=entry.parent?[...entry.parent.path,n]:[n];
   b.style.marginLeft=(entry.depth*1.8)+'em';
   if(b.dataset.mdblock==='ol'){
     b.dataset.mdnum=String(n);
     let marker=b.querySelector(':scope > .md-list-marker');
     if(!marker){marker=document.createElement('span');marker.className='md-list-marker';marker.contentEditable='false';b.prepend(marker)}
     const label=entry.path.join('.')+(entry.depth?'':'.');if(marker.textContent!==label)marker.textContent=label;
     b.style.paddingLeft=Math.max(1.7,label.length*.68+.6)+'em';
   }else b.style.removeProperty('padding-left');
 }
}
function swapEditorSubtrees(a,b){
 const left=document.createComment('move'),right=document.createComment('move');a[0].before(left);b[0].before(right);
 for(const node of b)left.before(node);for(const node of a)right.before(node);left.remove();right.remove();
}
function editorStructuralPlan(block,direction){
 const tree=editorStructure();let entry=tree.records.get(block);
 if(!entry&&emptyEditorBlock(block)&&['up','down'].includes(direction)){const other=direction==='up'?block.previousElementSibling:block.nextElementSibling;return other?()=>swapEditorSubtrees([block],tree.records.has(other)?editorSubtree(tree.records.get(other)):[other]):null}
 if(!entry)return null;
 const nodes=editorSubtree(entry);
 if(direction==='left'||direction==='right'){
   if(!['ul','li','ol','check'].includes(block.dataset.mdblock))return null;
   if(direction==='right'){
     const siblings=entry.parent?entry.parent.children:entry.run.roots,previous=siblings[siblings.indexOf(entry)-1];
     if(!previous)return null;
     return ()=>nodes.forEach(b=>setEditorDepth(b,editorListDepth(b)+1));
   }
   if(!entry.parent)return null;
   const parentNodes=editorSubtree(entry.parent),tail=parentNodes.at(-1);
   return ()=>{if(!nodes.includes(tail)){let after=tail;for(const b of nodes){after.after(b);after=b}}nodes.forEach(b=>setEditorDepth(b,editorListDepth(b)-1))};
 }
 const siblings=entry.parent?entry.parent.children:tree.top,index=siblings.indexOf(entry),other=siblings[index+(direction==='up'?-1:1)];
 if(!other)return null;
 return ()=>swapEditorSubtrees(nodes,editorSubtree(other));
}
// Reset only the lists involved in an operation; unrelated Markdown start values stay intact.
function resetMovedListNumbers(block,direction){
 const tree=editorStructure(),entry=tree.records.get(block);if(!entry)return;
 const runs=new Set([entry.run]);
 if(direction==='up'||direction==='down'){
   const siblings=entry.parent?entry.parent.children:tree.top;
   runs.add(siblings[siblings.indexOf(entry)+(direction==='up'?-1:1)]?.run);
 }
 for(const run of runs)if(run)for(const root of run.roots)if(root.block.dataset.mdblock==='ol')root.block.dataset.mdnum='1';
}
function selectedBodyBlocks(range=window.getSelection()?.rangeCount?window.getSelection().getRangeAt(0):null){
 if(!range||!rangeBelongsToRichEditor(range))return [];
 if(range.collapsed)return [bodyBlock(range.startContainer)].filter(Boolean);
 return [...$('richEditor').children].filter(b=>range.intersectsNode(b)&&!(range.endOffset===0&&(range.endContainer===b||bodyBlock(range.endContainer)===b)));
}
function handleEditorStructuralKey(e){
 if(e.isComposing||document.activeElement!==$('richEditor'))return false;
 const mac=IS_MAC,vertical=e.shiftKey&&!e.ctrlKey&&(mac?e.metaKey&&!e.altKey:e.altKey&&!e.metaKey);
 const direction=e.key==='Tab'&&!e.ctrlKey&&!e.metaKey&&!e.altKey?(e.shiftKey?'left':'right'):vertical?(e.key==='ArrowUp'?'up':e.key==='ArrowDown'?'down':null):null;if(!direction)return false;
 const sel=window.getSelection();if(!sel?.rangeCount)return false;
 const range=sel.getRangeAt(0),blocks=selectedBodyBlocks(range);if(!blocks.length)return false;
 if(['left','right'].includes(direction)&&blocks.some(b=>!isEditorList(b)))return false;
 e.preventDefault();e.stopPropagation();
 const tree=editorStructure(),roots=blocks.filter(b=>!blocks.some(other=>other!==b&&tree.records.has(other)&&editorSubtree(tree.records.get(other)).includes(b)));
 const nodes=[...new Set(roots.flatMap(b=>tree.records.has(b)?editorSubtree(tree.records.get(b)):[b]))];
 let plan;
 if(roots.length===1)plan=editorStructuralPlan(roots[0],direction);
 else if(['up','down'].includes(direction)){
   const first=tree.records.get(roots[0]),last=tree.records.get(roots.at(-1));
   if(first&&last&&roots.every(b=>tree.records.get(b)?.parent===first.parent)){
     const siblings=first.parent?first.parent.children:tree.top,other=siblings[siblings.indexOf(direction==='up'?first:last)+(direction==='up'?-1:1)];
     if(other)plan=()=>{const otherNodes=editorSubtree(other);if(direction==='up')for(const b of nodes)otherNodes[0].before(b);else{let tail=otherNodes.at(-1);for(const b of nodes){tail.after(b);tail=b}}};
   }else{const other=direction==='up'?nodes[0].previousElementSibling:nodes.at(-1).nextElementSibling;if(other&&!nodes.includes(other))plan=()=>{if(direction==='up')for(const b of nodes)other.before(b);else{let tail=other;for(const b of nodes){tail.after(b);tail=b}}}}
 }else{
   const entries=roots.map(b=>tree.records.get(b)),first=entries[0];
   if(entries.every(x=>x&&x.parent===first.parent)){
     const siblings=first.parent?first.parent.children:first.run.roots;
     if(direction==='right'&&siblings.indexOf(first)>0)plan=()=>nodes.forEach(b=>setEditorDepth(b,editorListDepth(b)+1));
     if(direction==='left'&&first.parent)plan=()=>{let tail=editorSubtree(first.parent).at(-1);if(!nodes.includes(tail))for(const b of nodes){tail.after(b);tail=b}nodes.forEach(b=>setEditorDepth(b,editorListDepth(b)-1))};
   }
 }
 if(!plan)return true;
 const a=range.startContainer,ao=range.startOffset,b=range.endContainer,bo=range.endOffset;
 forceRichHistoryCheckpoint();roots.forEach(block=>resetMovedListNumbers(block,direction));plan();normalizeEditorLists();$('richEditor').focus({preventScroll:true});
 if(a.isConnected&&b.isConnected){const r=document.createRange();r.setStart(a,Math.min(ao,a.nodeType===3?a.length:a.childNodes.length));r.setEnd(b,Math.min(bo,b.nodeType===3?b.length:b.childNodes.length));sel.removeAllRanges();sel.addRange(r)}
 syncModelFromRich();rememberRichSelection();nodes[0].scrollIntoView({block:'nearest'});return true;
}

function richBlockPlainText(block){
 return [...block.childNodes]
   .filter(n=>!(n.nodeType===Node.ELEMENT_NODE&&(n.classList?.contains("md-check")||n.classList?.contains("md-list-marker"))))
   .map(n=>n.textContent||"").join("").replace(/\u200b/g,"").trim();
}
function placeCaretAtStart(el){
 const r=document.createRange(),s=window.getSelection();
 r.selectNodeContents(el);r.collapse(true);s.removeAllRanges();s.addRange(r)
}
function placeCaretAtEnd(el){
 const r=document.createRange(),s=window.getSelection();
 r.selectNodeContents(el);r.collapse(false);s.removeAllRanges();s.addRange(r)
}
function rangeAtBlockEnd(block,range){
 if(!block||!range||!range.collapsed)return false;
 const r=range.cloneRange();r.selectNodeContents(block);r.setStart(range.endContainer,range.endOffset);
 return r.toString()==="";
}
function protectTitleBodyBoundary(e){
 const sel=window.getSelection(),root=$("richEditor");
 if(!sel?.rangeCount||!sel.isCollapsed||e.ctrlKey||e.metaKey||e.altKey)return false;
 const r=sel.getRangeAt(0),block=bodyBlock(r.startContainer);
 if(!block||!atBodyBlockStart(block,r))return false;
 if(block.dataset.mdblock==="code")return false;
 if(e.key==="ArrowUp"&&block===root.firstElementChild){
   e.preventDefault();focusDocumentTitle();return true;
 }
 if(e.key!=="Backspace")return false;
 e.preventDefault();forceRichHistoryCheckpoint();
 if(isEditorList(block)&&editorListDepth(block)>0&&block.dataset.mdblock!=="check"){
   resetMovedListNumbers(block,'left');editorStructuralPlan(block,'left')?.();normalizeEditorLists();placeCaretAtBodyStart(block);
 }else if((block.dataset.mdblock||"p")!=="p"){
   setBodyBlock(block,"p");placeCaretAtStart(block);
 }else if(block===root.firstElementChild){focusDocumentTitle();return true}
 else{
   const prev=block.previousElementSibling;
   if(prev.lastChild?.nodeName==="BR")prev.lastChild.remove();
   const marker=document.createTextNode("");prev.append(marker);
   block.querySelectorAll(".md-list-marker,.md-check").forEach(n=>n.remove());
   prev.append(...block.childNodes);block.remove();
   const range=document.createRange();range.setStartAfter(marker);range.collapse(true);
   sel.removeAllRanges();sel.addRange(range);marker.remove();
 }
 syncModelFromRich();rememberRichSelection();return true;
}
function bodyBlock(node){
 const root=$("richEditor");let n=node?.nodeType===3?node.parentElement:node;
 while(n&&n.parentElement!==root)n=n.parentElement;
 return n?.parentElement===root?n:null;
}
function atBodyBlockStart(block,range){
 const r=range.cloneRange();r.selectNodeContents(block);r.setEnd(range.startContainer,range.startOffset);
 const f=r.cloneContents();f.querySelectorAll?.(".md-list-marker,.md-check").forEach(n=>n.remove());
 return !f.textContent.replace(/\u200b/g,"");
}
function focusDocumentTitle(){const t=$("editorTitle");t.focus();t.setSelectionRange(t.value.length,t.value.length)}
function focusBodyStart(){
 normalizeRichTitleLine();$("richEditor").focus();
 const first=$("richEditor").firstElementChild;placeCaretAtBodyStart(first);rememberRichSelection();
}
function codeFenceSpan(text){return `<span class="md-fence" contenteditable="false">${esc(text)}</span>`}
// Caret position inside a code block's body (between the hidden fences).
function codeBlockCaret(block,range){
 const fences=[...block.children].filter(n=>n.classList.contains('md-fence'));
 const open=fences[0]===block.firstChild?fences[0]:null,close=fences.at(-1)===block.lastChild&&fences.at(-1)!==open?fences.at(-1):null;
 const before=document.createRange();if(open)before.setStartAfter(open);else before.setStart(block,0);before.setEnd(range.startContainer,range.startOffset);
 const after=document.createRange();after.setStart(range.endContainer,range.endOffset);if(close)after.setEndBefore(close);else after.setEnd(block,block.childNodes.length);
 return {before:before.toString().replace(/\u200b/g,''),after:after.toString().replace(/\u200b/g,''),open,close};
}
// Enter and Backspace inside code blocks: Enter on an empty last line leaves the block; Backspace never removes a hidden fence.
function handleCodeBlockKey(e){
 if(!['Enter','Backspace'].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return false;
 const sel=window.getSelection();if(!sel?.rangeCount||!sel.isCollapsed)return false;
 const range=sel.getRangeAt(0),block=bodyBlock(range.startContainer);if(!block||block.dataset.mdblock!=='code'||!block.querySelector('.md-fence'))return false;
 const caret=codeBlockCaret(block,range);
 if(e.key==='Backspace'){
   if(caret.before)return false;
   e.preventDefault();
   if(!caret.after){forceRichHistoryCheckpoint();block.dataset.mdblock='p';block.className='md-p';block.innerHTML='<br>';placeCaretAtBodyStart(block);rememberRichSelection();syncModelFromRich()}
   return true;
 }
 e.preventDefault();forceRichHistoryCheckpoint();
 if(!e.shiftKey&&!caret.after&&caret.before.endsWith('\n')){
   // Enter on an empty last line: drop that line and continue in a new paragraph below.
   const bodyNodes=[...block.childNodes].filter(n=>!(n.nodeType===1&&n.classList.contains('md-fence')));
   const text=bodyNodes.map(n=>n.textContent).join('').replace(/\u200b/g,'').replace(/\n$/,'');
   bodyNodes.forEach(n=>n.remove());
   const body=document.createTextNode(text);if(caret.open)caret.open.after(body);else block.prepend(body);
   const next=document.createElement('div');next.dataset.mdblock='p';next.innerHTML='<br>';block.after(next);placeCaretAtBodyStart(next);
 }else{
   // A new line inside the block. At the very end, an anchor keeps the empty line visible and holds the caret.
   const inserted=document.createTextNode(caret.after?'\n':'\n\u200b');if(!caret.after)caretAnchors.add(inserted);
   range.deleteContents();range.insertNode(inserted);
   const r=document.createRange();r.setStart(inserted,inserted.length);r.collapse(true);sel.removeAllRanges();sel.addRange(r);
 }
 rememberRichSelection();syncModelFromRich();return true;
}
function insertTextAtRange(range,text){
 range.deleteContents();const n=document.createTextNode(text);range.insertNode(n);
 range.setStartAfter(n);range.collapse(true);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
}
function textBeforeCaretInBlock(block,range){
 const r=range.cloneRange();
 r.selectNodeContents(block);
 r.setEnd(range.endContainer,range.endOffset);
 return r.toString().replace(/\u200b/g,"");
}
function applyMarkdownTypingShortcut(e){
 if(![" ","Enter"].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return false;
 const sel=window.getSelection();if(!sel?.rangeCount||!sel.isCollapsed)return false;
 const range=sel.getRangeAt(0),block=bodyBlock(range.startContainer);if(!block)return false;
 const before=textBeforeCaretInBlock(block,range),type=block.dataset.mdblock||"p";
 if(type==='p'&&before==='---'){
   e.preventDefault();forceRichHistoryCheckpoint();const tail=range.cloneRange();tail.setEnd(block,block.childNodes.length);const rest=tail.extractContents();block.dataset.mdblock='hr';block.innerHTML='<hr contenteditable="false">';
   const next=document.createElement('div');next.dataset.mdblock='p';next.append(rest);if(!next.childNodes.length)next.innerHTML='<br>';block.after(next);placeCaretAtBodyStart(next);syncModelFromRich();rememberRichSelection();return true;
 }
 const fenceStart=type==='p'&&e.key==='Enter'&&/^(`{3,}|~{3,})[\w.+#-]*$/.exec(before);
 if(fenceStart&&!richBlockPlainText(block).replace(/\u200b/g,'').slice(before.length).trim()){
   e.preventDefault();forceRichHistoryCheckpoint();
   block.dataset.mdblock='code';block.className='md-code';block.innerHTML=codeFenceSpan(before+'\n')+codeFenceSpan('\n'+fenceStart[1]);
   const body=document.createTextNode('\u200b');caretAnchors.add(body);block.firstChild.after(body);
   const r=document.createRange();r.setStart(body,1);r.collapse(true);sel.removeAllRanges();sel.addRange(r);
   rememberRichSelection();syncModelFromRich();return true;
 }
 if(e.key!==' ')return false;
 let next=null,checked=false,num=1;
 if((type==="ul"||/^h[1-6]$/.test(type))&&/^\[[ xX]?\]$/.test(before)){next="check";checked=/x/i.test(before)}
 if(type==="p"){
   if(/^[-*+]$/.test(before))next="ul";
   else if(/^\d+\.$/.test(before)){next="ol";num=parseInt(before)}
   else if(before===">")next="quote";
   else if(/^#{1,6}$/.test(before))next="h"+before.length;
   else if(/^(?:- )?\[[ xX]?\]$/.test(before)){next="check";checked=/x/i.test(before)}
 }
 if(!next)return false;
 e.preventDefault();forceRichHistoryCheckpoint();
 const prefix=range.cloneRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);prefix.deleteContents();
 setBodyBlock(block,next,num,checked);placeCaretAtBodyStart(block);rememberRichSelection();syncModelFromRich();return true;
}
function setBodyBlock(block,type,num=1,checked=false){
 if(block.dataset.mdblock==='table')return;
 if(isEditorList(block)&&!['ul','li','ol','check'].includes(type)){
   const entry=editorStructure().records.get(block);
   if(entry)for(const child of editorSubtree(entry).slice(1))setEditorDepth(child,Math.max(0,editorListDepth(child)-1));
   delete block.dataset.mddepth;delete block.dataset.mdindent;
 }

 block.querySelectorAll(".md-check,.md-list-marker").forEach(n=>n.remove());
 if(type==='check'&&/^(h[1-6]|quote)$/.test(block.dataset.mdblock))block.dataset.checkHeading=block.dataset.mdblock;
 if(type!=='check')delete block.dataset.checkHeading;
 block.dataset.mdblock=type;block.className=type==="check"?"md-check-block":"md-"+type;delete block.dataset.mdnum;
 if(type==="ol"){
   block.dataset.mdnum=String(num);const marker=document.createElement("span");marker.className="md-list-marker";
   marker.contentEditable="false";marker.textContent=num+".";block.prepend(marker);
 }
 if(type==="check"){
   const c=document.createElement("input");c.type="checkbox";c.className="md-check";c.contentEditable="false";c.checked=checked;c.setAttribute("aria-label",checkLabel(block.textContent));block.prepend(c);
 }
 if(!block.childNodes.length)block.append(document.createElement("br"));
}
function placeCaretAtBodyStart(block){
 const r=document.createRange(),sel=window.getSelection();
 const marker=block.querySelector(':scope > .md-list-marker,:scope > .md-check');
 let text=marker?marker.nextSibling:block.firstChild;
 // A real text position after the marker avoids browser caret affinity to a checkbox.
 if(!text||text.nodeType!==Node.TEXT_NODE){
   const n=document.createTextNode("\u200b");caretAnchors.add(n);
   if(marker)marker.after(n);else block.prepend(n);text=n;
 }
 if(!text.nodeValue){text.nodeValue="\u200b";caretAnchors.add(text)}
 r.setStart(text,text.nodeValue.startsWith("\u200b")?1:0);
 r.collapse(true);sel.removeAllRanges();sel.addRange(r);
}
function deleteBodySelection(range){
 const block=bodyBlock(range.startContainer),endBlock=bodyBlock(range.endContainer),startNode=range.startContainer,startOffset=range.startOffset;
 range.deleteContents();
 if(block&&endBlock&&endBlock!==block&&endBlock.isConnected){
   endBlock.querySelectorAll('.md-list-marker,.md-check').forEach(n=>n.remove());block.append(...endBlock.childNodes);endBlock.remove();
 }
 if(startNode.isConnected){range.setStart(startNode,Math.min(startOffset,startNode.nodeType===3?startNode.length:startNode.childNodes.length));range.collapse(true)}
 const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
 return bodyBlock(range.startContainer)||block;
}
function continueRichBlock(e){
 if(e.key!=="Enter"||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return false;
 const sel=window.getSelection();if(!sel?.rangeCount)return false;
 let range=sel.getRangeAt(0),block=bodyBlock(range.startContainer);if(!block)return false;
 e.preventDefault();forceRichHistoryCheckpoint();
 if(!range.collapsed)block=deleteBodySelection(range)||block;
 const type=block.dataset.mdblock||"p";
 if(type==="code"){insertTextAtRange(range,"\n")}else if(e.shiftKey){
   const br=document.createElement("br");range.insertNode(br);range.setStartAfter(br);range.collapse(true);
   if(!br.nextSibling)br.after(document.createElement("br"));sel.removeAllRanges();sel.addRange(range);
 }else if(isEditorList(block)&&richBlockPlainText(block)&&atBodyBlockStart(block,range)){
   const empty=document.createElement('div');setBodyBlock(empty,type);
   empty.dataset.mddepth=String(editorListDepth(block));empty.dataset.mdindent=block.dataset.mdindent||'';
   if(type==='check'){
     const anchor=document.createTextNode('\u200b');caretAnchors.add(anchor);empty.append(anchor,document.createElement('br'));
   }
   block.before(empty);normalizeEditorLists();placeCaretAtBodyStart(block);
 }else if(range.collapsed&&atBodyBlockStart(block,range)&&richBlockPlainText(block)){
   const empty=document.createElement('div');empty.dataset.mdblock='p';empty.innerHTML='<br>';block.before(empty);placeCaretAtBodyStart(block);
 }else if(["ul","ol","check","quote"].includes(type)&&!richBlockPlainText(block)){
   setBodyBlock(block,"p");block.innerHTML="<br>";placeCaretAtStart(block);
 }else{
   const tail=range.cloneRange();tail.setEnd(block,block.childNodes.length);const rest=tail.extractContents();
   const next=document.createElement("div");next.append(rest);
   const nextType=["ul","ol","check","quote"].includes(type)?type:"p";
   setBodyBlock(next,nextType,(Number(block.dataset.mdnum)||1)+1);
   if(isEditorList(block)){next.dataset.mddepth=String(editorListDepth(block));next.dataset.mdindent=block.dataset.mdindent||"";}
   if(!richBlockPlainText(block)&&!block.querySelector("br"))block.append(document.createElement("br"));
   const entry=editorStructure().records.get(block),subtreeTail=entry?editorSubtree(entry).at(-1):block;
   subtreeTail.after(next);
   placeCaretAtBodyStart(next);
 }
 rememberRichSelection();syncModelFromRich();return true;
}

// The title is a separate plain-text control; the body never contains title metadata.
function normalizeRichTitleLine(){
 const root=$("richEditor");if(!root)return;
 if(!root.childNodes.length)root.innerHTML='<div data-mdblock="p"><br></div>';
 // Moving a text node resets live Range endpoints to its old parent. Keep the
 // actual nodes/offsets so subsequent input stays in the same paragraph.
 const sel=window.getSelection(),inside=sel?.rangeCount&&rangeBelongsToRichEditor(sel.getRangeAt(0));
 const caret=inside?{anchor:sel.anchorNode,anchorOffset:sel.anchorOffset,focus:sel.focusNode,focusOffset:sel.focusOffset}:null;
 let moved=false;
 for(const n of [...root.childNodes]){
   if(n.nodeType===3||n.nodeName==="BR"){
     const div=document.createElement("div");div.dataset.mdblock="p";n.replaceWith(div);div.append(n);moved=true;
   }
 }
 if(moved&&caret&&root.contains(caret.anchor)&&root.contains(caret.focus))sel.setBaseAndExtent(caret.anchor,caret.anchorOffset,caret.focus,caret.focusOffset);
}
function resizeDocumentTitle(){
 const title=$("editorTitle");if(!title||!title.offsetWidth)return;
 const scroll=title.closest('.documentScroll'),top=scroll?.scrollTop;
 title.style.height='0px';title.style.height=(title.scrollHeight+1)+'px';
 if(scroll)scroll.scrollTop=top;
}
function updateFormatButtons(){
 const sel=window.getSelection(),menu=$('formatMenu'),focus=document.activeElement;
 let range=sel?.rangeCount&&rangeBelongsToRichEditor(sel.getRangeAt(0))?sel.getRangeAt(0):null;
 if(menu?.contains(focus)&&rangeBelongsToRichEditor(savedRichRange))range=savedRichRange;
 if(sourceMode()||!(focus===$('richEditor')||menu?.contains(focus)))range=null;
 const elements=[];
 if(range&&!range.collapsed){
   const walker=document.createTreeWalker($('richEditor'),NodeFilter.SHOW_TEXT);let n;
   while(n=walker.nextNode()){
     if(!n.length||n.parentElement.closest('.md-list-marker,.embed,[contenteditable="false"]')||!range.intersectsNode(n))continue;
     const start=n===range.startContainer?range.startOffset:0,end=n===range.endContainer?range.endOffset:n.length;
     if(end>start)elements.push(n.parentElement);
   }
 }
 const formatted=(el,command)=>{
   const style=getComputedStyle(el);
   if(command==='bold')return Number(style.fontWeight)>=600||style.fontWeight==='bold';
   if(command==='italic')return ['italic','oblique'].includes(style.fontStyle);
   if(command==='code')return !!el.closest('code');
   const decoration=command==='underline'?'underline':'line-through';
   for(let n=el;n&&n!==$('richEditor');n=n.parentElement)if(getComputedStyle(n).textDecorationLine.includes(decoration))return true;
   return false;
 };
 for(const command of ['bold','italic','underline','strikeThrough','code']){
   let active=false;
   if(range){if(!range.collapsed)active=elements.length>0&&elements.every(el=>formatted(el,command));
     else if(command==='code'){const n=range.startContainer;active=!!(n.nodeType===3?n.parentElement:n).closest?.('code')}
     else active=document.queryCommandState(command);}
   document.querySelector(`[data-format="${command}"]`)?.setAttribute('aria-pressed',String(active));
 }
 const blocks=range?selectedBodyBlocks(range):[];
 document.querySelectorAll('[data-block]').forEach(button=>button.setAttribute('aria-pressed',String(blocks.length>0&&blocks.every(b=>b.dataset.mdblock===button.dataset.block))));
}

function combinedEditorSource(item){return String(item?.content||"")}
function syncSourceFromModel(item){$("content").value=combinedEditorSource(item)}
function restoreManagedImageWidths(root=$('richEditor')){
 for(const block of root.querySelectorAll('[data-mdblock=image]')){
   const width=managedImageLine(block.dataset.imageSource||'')?.width;
   if(width)block.querySelector('figure').style.width=width+'px';
 }
}
function syncRichFromModel(item){
 $("editorTitle").value=item?.title||"";resizeDocumentTitle();
 $("richEditor").innerHTML=markdownToEditorHTML(item?.content||"");restoreManagedImageWidths();ensureInlineTodoExits();
 savedRichRange=null;resetEditorHistoryGroup();normalizeRichTitleLine();normalizeEditorLists();
}
function paintItemTitle(item){
 for(const row of document.querySelectorAll('#tree .row[data-id],#pinnedOutline .row[data-id]')){
   if(row.dataset.id!==item.id)continue;
   const label=row.querySelector('.title');if(label)label.textContent=item.title||"(untitled)";
 }
}
function syncVisibleTitle(item){
 if(editorIsOpen()&&selected===item.id){$("editorTitle").value=item.title;resizeDocumentTitle()}
}
function editorDocument(){return db?.planner?.meetings?.[selected] || (db && itemById(db,selected))}
function updateEditorModel(content){
 const i=editorDocument();if(!i)return;
 const title=$("editorTitle").value,changed=title!==i.title||content!==i.content;
 if(!changed)return;
 const titleChanged=title!==i.title;i.title=title;i.content=content;touch(db,i);
 if(titleChanged)paintItemTitle(i);$("updated").textContent=new Date(i.updatedAt).toLocaleString('en-GB',{hourCycle:'h23'});
}
function syncModelFromSource({canonicalize=false}={}){
 const text=$("content").value;updateEditorModel(canonicalize?canonicalizeReferences(text):text);
}
function syncModelFromRich(){
 if(sourceMode()){syncModelFromSource();return}
 ensureInlineTodoExits();normalizeEditorLists();updateEditorModel(editorHTMLToMarkdown());syncSourceFromModel(editorDocument());
}

let savedRichRange=null;
function rangeBelongsToRichEditor(range){
 if(!range)return false;
 const root=$("richEditor");
 const node=range.commonAncestorContainer?.nodeType===Node.TEXT_NODE
   ?range.commonAncestorContainer.parentElement
   :range.commonAncestorContainer;
 return !!(node&&(node===root||root.contains(node)));
}

function rangeTouchesEditorTitleLine(){return false}
function richSelectionTouchesTitleLine(){return document.activeElement===$("editorTitle")}
function rejectTitleFormatting(){toast("Formatting applies to the body. The title is plain text.")}
let editorHistoryAt=0,editorHistoryOwner=null;
function resetEditorHistoryGroup(){editorHistoryAt=0;editorHistoryOwner=null}
function ensureRichHistoryCheckpoint(){
 const owner=selected+":"+(document.activeElement?.id||"body"),time=Date.now();
 const fresh=owner!==editorHistoryOwner||time-editorHistoryAt>900;
 if(fresh)checkpoint();editorHistoryAt=time;editorHistoryOwner=owner;return fresh;
}
function forceRichHistoryCheckpoint(){checkpoint();resetEditorHistoryGroup()}
function ensureSourceHistoryCheckpoint(){return ensureRichHistoryCheckpoint()}

function rememberRichSelection(){
 const sel=window.getSelection();
 if(sel?.rangeCount&&rangeBelongsToRichEditor(sel.getRangeAt(0)))savedRichRange=sel.getRangeAt(0).cloneRange();
 updateFormatButtons();
}
function restoreRichSelection(){
 const root=$("richEditor");
 root.focus({preventScroll:true});
 if(!savedRichRange||!rangeBelongsToRichEditor(savedRichRange))return false;
 const sel=window.getSelection();
 sel.removeAllRanges();
 sel.addRange(savedRichRange.cloneRange());
 return true;
}
function preserveRichToolbarSelection(button){
 button.addEventListener('click',e=>{if(button.editorFromTitle){e.preventDefault();e.stopImmediatePropagation();rejectTitleFormatting();button.editorFromTitle=false}},true);
 button.onmousedown=e=>{
   button.editorFromTitle=document.activeElement===$("editorTitle");
   rememberRichSelection();
   e.preventDefault(); // keep the caret/range inside the rich editor
 };
}

function setBlock(type){
 restoreRichSelection();if(activeTableCell())return;const sel=window.getSelection();if(!sel?.rangeCount)return;
 const range=sel.getRangeAt(0),collapsed=range.collapsed,blocks=[...$("richEditor").children].filter(b=>range.intersectsNode(b));
 const anchor=range.startContainer,offset=range.startOffset;
 for(const block of blocks)setBodyBlock(block,type==="p"&&block.dataset.checkHeading?block.dataset.checkHeading:type);
 if(collapsed&&blocks.length){
   if(anchor.nodeType===3&&anchor.isConnected){range.setStart(anchor,Math.min(offset,anchor.length));range.collapse(true);sel.removeAllRanges();sel.addRange(range)}
   else placeCaretAtBodyStart(blocks[0]);
 }
 rememberRichSelection();syncModelFromRich();
}
function applyInlineMarkdown(){
 if(activeTableCell())return;
 const sel=window.getSelection();if(!sel?.isCollapsed||!sel.rangeCount)return;
 const range=sel.getRangeAt(0),node=range.startContainer;if(node.nodeType!==3)return;
 if(node.parentElement.closest('code,.mdref,.inlineTodo,[data-mdblock=code]')||inlineDraftToken())return;
 const text=node.nodeValue.slice(0,range.startOffset);
 const match=/(\*\*([^*\n]+)\*\*|(?<!\*)\*([^*\n]+)\*|`([^`\n]+)`)$/.exec(text);
 if(!match)return;
 const tag=match[2]?'strong':match[3]?'em':'code',value=match[2]||match[3]||match[4];
 const r=document.createRange();r.setStart(node,match.index);r.setEnd(node,range.startOffset);r.deleteContents();
 const el=document.createElement(tag);el.textContent=value;r.insertNode(el);
 const exit=document.createTextNode("\u200b");caretAnchors.add(exit);el.after(exit);r.setStart(exit,1);r.collapse(true);sel.removeAllRanges();sel.addRange(r);
}
function formatInlineCode(){
 const sel=window.getSelection();if(!sel?.rangeCount)return;
 const range=sel.getRangeAt(0);if(!rangeBelongsToRichEditor(range))return;
 let node=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer;
 const existing=node.closest('code');
 if(existing){const contents=[...existing.childNodes];existing.replaceWith(...contents);return}
 if(range.collapsed){toast('Select text to format as code. You can also type `code`.');return}
 const code=document.createElement('code');code.textContent=range.toString();range.deleteContents();range.insertNode(code);
 range.selectNodeContents(code);sel.removeAllRanges();sel.addRange(range);
}
function clipboardHTMLToMarkdown(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 doc.querySelectorAll('script,style,iframe,object,embed,svg,math,template,link,meta').forEach(n=>n.remove());
 const inline=node=>{
   if(node.nodeType===3)return node.parentElement?.closest('pre')?node.nodeValue:node.nodeValue.replace(/\s+/g,' ');if(node.nodeType!==1)return '';
   if(node.hasAttribute('data-inline-todo'))return serializeInlineTodo(node);
   const tag=node.tagName;let text=[...node.childNodes].map(inline).join('');
   if(tag==='BR')return '\n';if(tag==='IMG')return node.getAttribute('alt')||'';
   if(tag==='A'){const href=node.getAttribute('href');return safeEditorURL(href)?`[${text}](${href.replace(/\)/g,'%29')})`:text}
   if(tag==='CODE')return '`'+node.textContent+'`';
   if(['B','STRONG'].includes(tag)||Number(node.style.fontWeight)>=600||node.style.fontWeight==='bold')text='**'+text+'**';
   if(['I','EM'].includes(tag)||node.style.fontStyle==='italic')text='*'+text+'*';
   if(tag==='U'||node.style.textDecoration.includes('underline'))text='<u>'+text+'</u>';
   if(['S','STRIKE','DEL'].includes(tag)||node.style.textDecoration.includes('line-through'))text='~~'+text+'~~';
   return text;
 };
 const lines=[];
 function blocks(parent,depth=0){let pending='';const flush=()=>{if(pending.trim())lines.push(pending);pending=''};
   for(const node of parent.childNodes){
     if(node.nodeType!==1){pending+=inline(node);continue}
     const tag=node.tagName;
     if(tag==='TABLE'){flush();const holder=doc.createElement('div');const table=node.cloneNode(true);table.dataset.header=String(!!table.rows[0]?.querySelector('th'));holder.append(table);lines.push(tableMarkdown(holder));continue}
     if(node.hasAttribute('data-mdblock')){flush();const holder=doc.createElement('div');holder.append(node.cloneNode(true));lines.push(editorHTMLToMarkdown(holder));continue}
     if(tag==='UL'||tag==='OL'){
       flush();let index=Number(node.getAttribute('start'))||1;
       for(const li of node.children){if(li.tagName!=='LI')continue;
         const text=[...li.childNodes].filter(n=>!['UL','OL'].includes(n.nodeName)).map(inline).join('');
         lines.push('    '.repeat(depth)+(tag==='OL'?index+++'. ':'- ')+text);
         for(const nested of li.children)if(['UL','OL'].includes(nested.tagName)){const holder=doc.createElement('div');holder.append(nested.cloneNode(true));blocks(holder,depth+1)}
       }
     }else if(tag==='HR'){flush();lines.push('---')}
     else if(tag==='PRE'){flush();lines.push('```\n'+node.textContent+'\n```')}
     else if(/^(P|DIV|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|TR|TABLE|TBODY)$/.test(tag)){
       flush();if(node.querySelector('p,div,ul,ol,pre,table'))blocks(node,depth);
       else lines.push((/^H/.test(tag)?'#'.repeat(Math.min(6,Number(tag[1])))+' ':tag==='BLOCKQUOTE'?'> ':'')+inline(node));
     }else pending+=inline(node);
   }flush();
 }blocks(doc.body);while(lines.length&&!lines[0].trim())lines.shift();while(lines.length&&!lines.at(-1).trim())lines.pop();return lines.join('\n');
}
function insertFormattedPaste(markdown,range){
 let block=deleteBodySelection(range);if(!block)return;
 const holder=document.createElement('div');holder.innerHTML=markdownToEditorHTML(markdown);const incoming=[...holder.children];if(!incoming.length)return;
 const tail=range.cloneRange();tail.setEnd(block,block.childNodes.length);const rest=tail.extractContents();
 const first=incoming.shift();let previous=block;
 if(first.dataset.mdblock==='p'){range.insertNode(document.createTextNode(''));const fragment=document.createDocumentFragment();fragment.append(...first.childNodes);range.insertNode(fragment)}
 else if(!richBlockPlainText(block)){block.replaceWith(first);previous=first}
 else{block.after(first);previous=first}
 for(const next of incoming){previous.after(next);previous=next}
 if(previous.previousElementSibling?.dataset.mdblock==='image'&&rest.textContent&&previous.childNodes.length===1&&previous.firstChild.nodeName==='BR')previous.replaceChildren();
 const marker=document.createTextNode('');previous.append(marker,rest);const sel=window.getSelection(),caret=document.createRange();caret.setStartBefore(marker);caret.collapse(true);sel.removeAllRanges();sel.addRange(caret);marker.remove();
 normalizeRichTitleLine();normalizeEditorLists();rememberRichSelection();syncModelFromRich();
}
function keepRichCaretVisible(){
 requestAnimationFrame(()=>{
   const sel=window.getSelection();if(!sel?.rangeCount||!sel.isCollapsed||!rangeBelongsToRichEditor(sel.getRangeAt(0)))return;
   const range=sel.getRangeAt(0),pane=document.querySelector('.documentScroll');
   const rect=[...range.getClientRects()].at(-1)||bodyBlock(range.startContainer)?.getBoundingClientRect();if(!rect)return;
   const bounds=pane.getBoundingClientRect(),padding=12;
   if(rect.bottom>bounds.bottom-padding)pane.scrollTop+=rect.bottom-bounds.bottom+padding;
   else if(rect.top<bounds.top+padding)pane.scrollTop-=bounds.top+padding-rect.top;
 });
}
function constrainChecklistCaret(){
 if(editorComposing)return;
 const sel=window.getSelection();if(!sel?.rangeCount||!sel.isCollapsed)return;
 const range=sel.getRangeAt(0);if(!rangeBelongsToRichEditor(range))return;
 const root=$('richEditor'),block=bodyBlock(range.startContainer)||(range.startContainer===root?root.childNodes[range.startOffset]:null),marker=block?.querySelector?.(':scope > .md-check,:scope > .md-list-marker');if(!marker)return;
 const boundary=document.createRange();boundary.setStartAfter(marker);boundary.collapse(true);
 if(range.compareBoundaryPoints(Range.START_TO_START,boundary)<=0){placeCaretAtBodyStart(block);rememberRichSelection()}
}
function pasteBodyText(e){
 e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'',html=e.clipboardData?.getData('text/html')||'';
 if(!text&&!html)return;forceRichHistoryCheckpoint();keepRichCaretVisible();
 if(activeTableCell()){const source=html?clipboardHTMLToMarkdown(html):text;document.execCommand('insertHTML',false,tableCellHTML(source.replace(/\r?\n/g,'<br>')));syncModelFromRich();return}
 const sel=window.getSelection();if(!sel?.rangeCount)return;
 const range=sel.getRangeAt(0);if(!rangeBelongsToRichEditor(range))return;
 const fileURL=pastedFileURL(text);
 if(fileURL&&bodyBlock(range.startContainer)?.dataset.mdblock!=='code'){
   insertFormattedPaste(`[${fileURL}](${fileURL})`,range);return;
 }
 if(bodyBlock(range.startContainer)?.dataset.mdblock!=='code'&&(html||safeEditorURL(text.trim()))){
   const markdown=html?clipboardHTMLToMarkdown(html):`[${text.trim()}](${text.trim().replace(/\)/g,'%29')})`;
   if(markdown){insertFormattedPaste(markdown,range);return}
 }
 let block=deleteBodySelection(range);
 if(!block){normalizeRichTitleLine();block=$('richEditor').firstElementChild;range.setStart(block,0);range.collapse(true)}
 const lines=text.replace(/\r\n?/g,'\n').split('\n');
 if(lines.length===1){insertTextAtRange(range,lines[0])}
 else{
   const tail=range.cloneRange();tail.setEnd(block,block.childNodes.length);const rest=tail.extractContents();
   insertTextAtRange(range,lines.shift());
   let previous=block;
   for(const line of lines){
     const holder=document.createElement('div');holder.innerHTML=markdownToEditorHTML(line);
     const next=holder.firstElementChild;previous.after(next);previous=next;
   }
   if(previous.lastChild?.nodeName==='BR')previous.lastChild.remove();
   if(previous.previousElementSibling?.dataset.mdblock==='image'&&rest.textContent&&previous.childNodes.length===1&&previous.firstChild.nodeName==='BR')previous.replaceChildren();
 const marker=document.createTextNode('');previous.append(marker,rest);
   const r=document.createRange();r.setStartBefore(marker);r.collapse(true);sel.removeAllRanges();sel.addRange(r);marker.remove();
 }
 normalizeRichTitleLine();rememberRichSelection();syncModelFromRich();
}
const editorSnapshotSelections=new Map();
function captureEditorSelection(){
 const active=document.activeElement;if(!editorIsOpen())return null;
 const state={id:selected,mode:sourceMode(),control:active?.id};
 if(active===$('editorTitle')||active===$('content'))return {...state,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection};
 const sel=window.getSelection();if(!sel?.rangeCount||!rangeBelongsToRichEditor(sel.getRangeAt(0)))return state;
 const path=node=>{const out=[];while(node&&node!==$('richEditor')){out.unshift([...node.parentNode.childNodes].indexOf(node));node=node.parentNode}return out};
 const r=sel.getRangeAt(0);return {...state,control:'richEditor',startPath:path(r.startContainer),start:r.startOffset,endPath:path(r.endContainer),end:r.endOffset,backward:!r.collapsed&&sel.focusNode===r.startContainer&&sel.focusOffset===r.startOffset};
}
function restoreEditorSelection(state){
 if(!state||state.id!==selected)return;
 setSourceMode(state.mode);const control=$(state.control);if(!control)return;
 control.focus({preventScroll:true});
 if(state.control==='content'||state.control==='editorTitle'){control.setSelectionRange(state.start||0,state.end||0,state.direction||'none');return}
 if(!state.startPath)return;
 const resolve=path=>path.reduce((n,i)=>n?.childNodes[i],$('richEditor'));
 const a=resolve(state.startPath),b=resolve(state.endPath);if(!a||!b)return;
 const limit=n=>n.nodeType===3?n.length:n.childNodes.length;
 const r=document.createRange();r.setStart(a,Math.min(state.start,limit(a)));r.setEnd(b,Math.min(state.end,limit(b)));
 const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);if(state.backward)sel.setBaseAndExtent(r.endContainer,r.endOffset,r.startContainer,r.startOffset);rememberRichSelection();
}

// Primary locations are projected from the existing item hierarchy. Extra locations
// contain only structural fields. No document bodies are copied into this index.
class OutlineLocations{
 constructor(database){
   this.db=database;this.nodes=new Map();this.byItem=new Map();this.children=new Map();
   const primary=new Map(database.items.map(i=>[i.id,i.locationId||i.id]));
   for(const i of database.items)this.add({id:primary.get(i.id),item:i,parent:i.locationParent||primary.get(i.parentId)||null,order:i.order,rootId:i.rootId,collapsed:i.collapsed,primary:true});
   for(const [id,p] of Object.entries(database.locations||{})){
     const item=this.byItem.get(p.item)?.[0]?.item;if(!item)throw Error('Location refers to a missing item.');
     this.add({id,item,parent:p.parent,order:p.order,rootId:p.rootId,collapsed:p.collapsed,primary:false});
   }
   this.index();
 }
 add(p){if(this.nodes.has(p.id))throw Error('Duplicate placement ID.');this.nodes.set(p.id,p);if(!this.byItem.has(p.item.id))this.byItem.set(p.item.id,[]);this.byItem.get(p.item.id).push(p)}
 index(){this.children.clear();for(const p of this.nodes.values()){if(!this.children.has(p.parent))this.children.set(p.parent,[]);this.children.get(p.parent).push(p)}for(const list of this.children.values())list.sort((a,b)=>a.order-b.order)}
 siblings(parent){return (this.children.get(parent)||[]).filter(p=>!p.item.archived)}
 primary(item){return this.byItem.get(item.id)?.find(p=>p.primary)}
 selected(item){const p=this.nodes.get(selectedLocation);return p?.item.id===item?.id?p:item&&this.primary(item)}
 chain(p){const path=[];while(p){if(path.length>=256||path.includes(p))throw Error('Invalid location hierarchy.');path.unshift(p);p=this.nodes.get(p.parent)}return path}
 code(p){return this.chain(p).map((n,i)=>i?n.order:n.rootId).join('.')}
 path(p){return this.chain(p).map(n=>n.item.title).join(' › ')}
 subtree(p){const out=[p];for(let i=0;i<out.length;i++)out.push(...this.siblings(out[i].id));return out}
 validate(checkPrimaryParents=false){
   const slots=new Set(),pairs=new Set(),roots=new Set(),edges=new Map();
   for(const p of this.nodes.values()){
     if(!/^[a-zA-Z0-9_-]{1,160}$/.test(p.id)||!Number.isSafeInteger(p.order)||p.order<1||typeof p.collapsed!=='boolean')throw Error('Invalid location.');
     const parent=this.nodes.get(p.parent);
     if(p.parent!==null&&(!parent||p.rootId!==null)||p.parent===null&&(!validateRootId(p.rootId)||roots.has(p.rootId)))throw Error('Invalid location parent or root code.');
     if(checkPrimaryParents&&p.primary&&(parent?.item.id||null)!==(p.item.parentId||null))throw Error('Primary location parent mismatch.');
     if(!parent)roots.add(p.rootId);
     if(parent){if(parent.item.archived&&!p.item.archived)throw Error('Active location below archived item.');if(!edges.has(p.item.id))edges.set(p.item.id,new Set());edges.get(p.item.id).add(parent.item.id)}
     if(!p.item.archived){const slot=JSON.stringify([p.parent,p.order]),pair=JSON.stringify([p.parent,p.item.id]);if(slots.has(slot)||pairs.has(pair))throw Error('A sibling position or item already exists at that location.');slots.add(slot);pairs.add(pair)}
   }
   const depth=new Map(),visiting=new Set();
   function visit(id,level){
     if(level>256||visiting.has(id))throw Error('This would create a circular or excessively deep hierarchy.');
     if(depth.has(id))return depth.get(id);visiting.add(id);
     let height=1;for(const parent of edges.get(id)||[])height=Math.max(height,1+visit(parent,level+1));
     if(height>256)throw Error('Hierarchy exceeds 256 levels.');visiting.delete(id);depth.set(id,height);return height;
   }
   for(const id of this.byItem.keys())visit(id,1);
 }
 appendOrder(parent){return (this.siblings(parent).at(-1)?.order||0)+1}
 clone(source,dest,visible=null){
   const originals=[source],copies=new Map();
   for(let n=0;n<originals.length;n++)for(const child of this.siblings(originals[n].id))if(!visible||visible.has(child.id))originals.push(child);
   for(const p of originals){
     const copy={...p,id:uuid(),parent:p===source?dest.id:copies.get(p.parent),order:p===source?this.appendOrder(dest.id):p.order,rootId:null,primary:false};
     copies.set(p.id,copy.id);this.add(copy);
   }
   dest.collapsed=false;this.index();return copies.get(source.id);
 }
 move(p,parent,at){
   const siblings=this.siblings(parent).filter(n=>n!==p);
   siblings.splice(at==null?siblings.length:at,0,p);siblings.forEach((n,i)=>n.order=i+1);
   p.parent=parent;if(parent)p.rootId=null;else if(!p.rootId)p.rootId=this.newRoot();
   if(parent)this.nodes.get(parent).collapsed=false;this.index();
 }
 newRoot(){const occupied=reservedRootOrdinals(this.db);for(const p of this.nodes.values())if(p.rootId)occupied.add(rootOrdinalFromId(p.rootId));
   const trial={nextRootOrdinal:this.db.nextRootOrdinal,reusableRootOrdinals:[...this.db.reusableRootOrdinals]};return rootIdFromOrdinal(takeRootOrdinal(trial,occupied))}
 remove(ids,erase){
   // Surviving children of a removed location move to the root. Their UUIDs
   // and subtrees survive even when they have no second location.
   // Items deleted everywhere remember their links to places that stay, so Restore can relink them.
   this.removedLinks=new Map();
   if(erase)for(const p of this.nodes.values())if(erase.has(p.item.id)&&!p.primary&&p.parent&&!ids.has(p.parent)&&!erase.has(this.nodes.get(p.parent)?.item.id)){
     if(!this.removedLinks.has(p.item.id))this.removedLinks.set(p.item.id,[]);this.removedLinks.get(p.item.id).push({parent:p.parent})}
   for(const id of ids)this.nodes.delete(id);
   for(const p of this.nodes.values())if(p.parent&&!this.nodes.has(p.parent)){p.parent=null;p.rootId=this.newRoot();p.order=this.appendOrder(null);this.index()}
   this.byItem.clear();for(const p of this.nodes.values()){if(!this.byItem.has(p.item.id))this.byItem.set(p.item.id,[]);this.byItem.get(p.item.id).push(p)}
   for(const list of this.byItem.values())if(!list.some(n=>n.primary))list[0].primary=true;
   this.index();this.deleted=erase;
 }
 commit(withCheckpoint=true){
   this.validate();if(withCheckpoint)checkpoint();stabilizeReferences(this.db);
   const aliases=new OutlineLocations(this.db);locationIndex=null;
   this.db.schemaVersion=11;const extra=Object.create(null);
   for(const p of this.nodes.values()){
     const i=p.item,parent=this.nodes.get(p.parent);
     if(p.primary){
       if(p.id!==i.id)i.locationId=p.id;else delete i.locationId;
       if(parent&&!parent.primary)i.locationParent=parent.id;else delete i.locationParent;
       i.parentId=parent?.item.id||null;i.order=p.order;i.rootId=p.rootId;i.collapsed=p.collapsed;
     }else extra[p.id]={item:i.id,parent:p.parent,order:p.order,rootId:p.rootId,collapsed:p.collapsed};
   }
   this.db.locations=extra;locationIndex=null;if(this.deleted){forgetPins(this.db,this.deleted);trashDeletedEverywhere(this.db,this.deleted,this.removedLinks)}
   for(const p of aliases.nodes.values()){const current=this.nodes.get(p.id);if((current&&aliases.code(p)!==this.code(current))||(!current&&this.byItem.has(p.item.id)))rememberCodeAlias(p.item,aliases.code(p))}
   reconcileAllocator(this.db);this.db.updatedAt=now();markDirty();
 }
}
let locationIndex=null;
function locationsForRead(database){if(locationIndex?.db!==database)locationIndex=new OutlineLocations(database);return locationIndex}
let selectedLocation=null,dragLocation=null,locationAnchor=null,locationGroup=null;
const multiLocations=new Set();
function paintLocationRange(hit,event){
 const rows=[...$('tree').querySelectorAll('.row[data-location]')],ids=rows.map(r=>r.dataset.location),id=hit.dataset.location;
 if(event.shiftKey){
   const start=Math.max(0,ids.indexOf(locationAnchor||selectedLocation||id)),end=ids.indexOf(id);
   multiLocations.clear();for(const key of ids.slice(Math.min(start,end),Math.max(start,end)+1))multiLocations.add(key);
 }else{
   if(!multiLocations.size&&selectedLocation)multiLocations.add(selectedLocation);
   if(multiLocations.has(id))multiLocations.delete(id);else multiLocations.add(id);locationAnchor=id;
 }
 selectedLocation=multiLocations.has(id)?id:([...multiLocations].at(-1)||id);
 const g=new OutlineLocations(db);selected=g.nodes.get(selectedLocation).item.id;multiSelected=new Set([...multiLocations].map(k=>g.nodes.get(k).item.id));
 paintOutlineSelection();focusOutlineItem(selected);
}
function locationChange(action){try{const g=new OutlineLocations(db),id=action(g);g.commit();jumpLocation(id);return true}catch(e){toast(e.message);return false}}
function locationRow(id=selected){
 const rows=[...$('tree').querySelectorAll('.row[data-id]')].filter(r=>r.dataset.id===id);
 return rows.find(r=>r.dataset.location===selectedLocation&&r.closest('[data-group-key]')?.dataset.groupKey===locationGroup)||rows.find(r=>r.dataset.location===selectedLocation)||rows[0];
}
function jumpLocation(id){
 const g=new OutlineLocations(db),p=g.nodes.get(id);
 if(!p){selected=selectedLocation=null;if(appearance.defaultView==='editor')showEditorAfterDeletion(null);else showCalendar();render();return}
 if(branchZoomRoot&&!g.chain(p).some(n=>n.id===branchZoomLocation)){branchZoomRoot=branchZoomLocation=null;branchZoomHistory=[]}
 if($('search').value)closeOutlineSearch(false);
 const old=selected,opening=g.chain(p).slice(0,-1).some(n=>n.collapsed);selected=p.item.id;selectedLocation=locationAnchor=id;multiLocations.clear();multiSelected.clear();
 outlineRevealId=selected;for(const ancestor of g.chain(p).slice(0,-1)){if(ancestor.primary)ancestor.item.collapsed=false;else db.locations[ancestor.id].collapsed=false;filterDisclosure.set(ancestor.id,false)}
 const mode=currentGroupBy();for(const group of outlineGroups([p.item],mode))collapsedOutlineGroups.delete(mode+'|'+group.key);if(mode==='target')for(const a of g.chain(p))collapsedOutlineGroups.delete('target|target:'+a.id);
 if(opening)markDirty();render();if(editorIsOpen()||appearance.defaultView==='editor'){if(old!==selected||!editorIsOpen())edit(selected);else $('editCode').innerHTML=itemMarker(p.item);if(appearance.defaultView==='editor')$('layout').dataset.view='editor'}focusOutlineItem(selected);
}
function chooseCloneParent(){
 const g=new OutlineLocations(db),source=g.selected(itemById(db,selected));if(!source)return;
 const descendantsByItem=new Map();
 for(const p of g.nodes.values())if(p.parent){const owner=g.nodes.get(p.parent).item.id;if(!descendantsByItem.has(owner))descendantsByItem.set(owner,new Set());descendantsByItem.get(owner).add(p.item.id)}
 const forbidden=new Set([source.item.id]);for(const id of forbidden)for(const child of descendantsByItem.get(id)||[])forbidden.add(child);
 const choices=[...g.nodes.values()].filter(p=>!p.item.archived&&!forbidden.has(p.item.id)&&!g.siblings(p.id).some(child=>child.item.id===source.item.id)).map(p=>({id:p.id,type:p.item.type,title:p.item.title,content:g.path(p),code:g.code(p),markerItem:p.item}));
 const visible=new Set([...$('tree').querySelectorAll('.row[data-location]')].map(r=>r.dataset.location));
 chooseReference(false,dest=>locationChange(tree=>tree.clone(tree.nodes.get(source.id),tree.nodes.get(dest.id),visible)),{
   title:'Link under parent',prompt:'Choose the destination location.',items:()=>choices,describe:i=>i.content,code:i=>i.code,resolve:id=>choices.find(i=>i.id===id),cancel:()=>focusOutlineItem(selected)
 });
}
function removeLocation(p,all=false,items=new Set([p.item.id]),placementIds=[p.id]){
 const graph=new OutlineLocations(db),ids=all?new Set([...graph.nodes.values()].filter(n=>items.has(n.item.id)).map(n=>n.id)):new Set(placementIds);
 if(!all&&[...items].some(id=>graph.byItem.get(id).every(n=>ids.has(n.id))))return toast('Removing every location requires Delete item everywhere.');
 // Remove redundant descendant occurrences. Preserve the final location of
 // every unselected item, along with its descendants, by relocating it.
 const remaining=new Map([...graph.byItem].map(([id,list])=>[id,list.filter(n=>!ids.has(n.id)).length]));
 const queue=[...ids];
 for(let j=0;j<queue.length;j++)for(const child of graph.children.get(queue[j])||[]){
   if(ids.has(child.id)||remaining.get(child.item.id)<=1)continue;
   remaining.set(child.item.id,remaining.get(child.item.id)-1);ids.add(child.id);queue.push(child.id);
 }
 const children=[...graph.nodes.values()].filter(n=>ids.has(n.parent)&&!ids.has(n.id));
 const label=all?'Delete item everywhere':'Remove from this location';
 modal(label+'?',(all?`Move the selected item(s) to Recently deleted and remove all their locations? You can restore them for ${TRASH_DAYS} days from ☰ → Archive…; links are put back where those places still exist.`:'Remove this occurrence? Other locations keep the item.')+(children.length?' The remaining '+children.length+' child location(s) will move to the Outline root with their subtrees.':''),all?'Delete everywhere':'Remove location',()=>locationChange(g=>{
   g.remove(ids,all?items:null);return (g.byItem.get(p.item.id)||[])[0]?.id||g.nodes.values().next().value?.id;
 }));
}
function showLocations(button){
 const g=new OutlineLocations(db),p=g.nodes.get(button.closest('.row').dataset.location);if(!p)return;
 document.getElementById('locationMenu')?.dismiss?.();
 const menu=document.createElement('div');menu.id='locationMenu';menu.className='linkContextMenu';menu.setAttribute('role','dialog');menu.ariaLabel='Locations';
 const close=()=>{menu.remove();document.removeEventListener('pointerdown',outside,true)};
 menu.dismiss=close;const outside=e=>{if(!menu.contains(e.target)&&!button.contains(e.target))close()};
 const add=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=()=>{close();fn()};menu.append(b);return b};
 for(const other of g.byItem.get(p.item.id)){
   const parent=g.nodes.get(other.parent),path=parent?g.path(parent):'Outline root';
   const b=add(path,()=>jumpLocation(other.id));if(other.id===p.id)b.setAttribute('aria-current','location');
 }
 add('Remove from this location',()=>removeLocation(p));add('Delete item everywhere',()=>removeLocation(p,true));
 document.body.append(menu);const box=button.getBoundingClientRect();menu.style.left=Math.max(0,Math.min(box.left,innerWidth-menu.offsetWidth))+'px';menu.style.top=Math.max(0,Math.min(box.bottom,innerHeight-menu.offsetHeight))+'px';
 document.addEventListener('pointerdown',outside,true);
 menu.onkeydown=e=>{
   e.stopPropagation();
   const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
   if(e.key==='Escape'){e.preventDefault();close();button.focus({preventScroll:true});return}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
     e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
   }
 };
 menu.addEventListener('focusout',e=>{if(e.relatedTarget&&!menu.contains(e.relatedTarget))close()});
 menu.firstChild.focus();
}
function moveLocationByKey(direction,toRoot){
 if(branchZoomRoot===selected)return false;
 const g=new OutlineLocations(db),p=g.selected(itemById(db,selected));
 const rows=[...$('tree').querySelectorAll('.row[data-location]')],visible=new Set(rows.map(r=>r.dataset.location));
 if(!p||!visible.has(p.id))return false;
 const shownParent=n=>g.chain(n).slice(0,-1).reverse().find(a=>visible.has(a.id));
 const parent=shownParent(p),peers=rows.map(r=>g.nodes.get(r.dataset.location)).filter(n=>n&&shownParent(n)===parent);
 const index=peers.indexOf(p),other=peers[index+(direction==='down'?1:-1)];
 let destination,anchor,insertBefore=false;
 if(direction==='left'){
   anchor=parent||g.nodes.get(p.parent);if(!anchor)return false;
   if(toRoot)while(anchor.parent)anchor=g.nodes.get(anchor.parent);
   destination=anchor.parent;
 }else{
   if(!other)return false;
   if(direction==='right'){destination=other.id}
   else{destination=other.parent;anchor=other;insertBefore=direction==='up'}
 }
 try{
   if(anchor&&p.parent===anchor.parent&&direction!=='left'){
     [p.order,anchor.order]=[anchor.order,p.order];
   }else{
     const siblings=g.siblings(destination).filter(n=>n!==p&&visible.has(n.id));
     const all=g.siblings(destination).filter(n=>n!==p),slots=siblings.map(n=>n.order);
     slots.push((all.at(-1)?.order||0)+1);
     const at=anchor?siblings.filter(n=>insertBefore?n.order<anchor.order:n.order<=anchor.order).length:siblings.length;
     siblings.splice(at,0,p);siblings.forEach((n,i)=>n.order=slots[i]);p.parent=destination;
     if(destination){p.rootId=null;g.nodes.get(destination).collapsed=false}else if(!p.rootId)p.rootId=g.newRoot();
   }
   g.index();g.validate();
   if(db.locations){g.commit();selectedLocation=p.id}
   else{
     const plans=new Map(g.siblings(p.parent).map(n=>[n.id,n.order]));
     checkpoint();moveItem(db,p.item.id,p.parent,null,plans);
   }
   if(direction==='right'){if(other.primary)setOutlineCollapsed(other.item,false);filterDisclosure.set(other.id,false)}
   renderTree();renderStatus();focusOutlineItem(p.item.id);return true;
 }catch(error){toast(error.message);return false}
}

function chooseReference(embed=false,onChoose=null,options={}){
 if(!db)return;
 const returnState=captureEditorSelection();
 if(returnState?.control==='richEditor'&&returnState.endPath){returnState.startPath=returnState.endPath;returnState.start=returnState.end;}
 resetModalShell();modalAfterClose=options.cancel||(()=>restoreEditorSelection(returnState));
 const all=options.code?[]:activeItems(db).filter(options.filter||(()=>true)).slice().sort((a,b)=>itemCode(db,a).localeCompare(itemCode(db,b)));
 $("modalTitle").textContent=options.title||(embed?"Embed item":"Link item");
 $("modalText").textContent=options.prompt||(embed?"Choose an item to embed.":"Choose an item to link.");
 $("modalExtra").innerHTML='<div class="refPicker"><input id="refSearch" class="field" placeholder="Search titles…"><div id="refResults"></div></div>';
 $("modalOK").textContent="Cancel";$("modalCancel").classList.add("hidden");$("modalbg").classList.add("open");
 $("modalOK").onclick=()=>{$("modalbg").classList.remove("open");$("modalCancel").classList.remove("hidden")};
 let choice=0;
 const paint=()=>{const buttons=[...$("refResults").querySelectorAll("button")];buttons.forEach((b,i)=>b.classList.toggle("active",i===choice));buttons[choice]?.scrollIntoView({block:"nearest"})};
 const renderResults=()=>{
   choice=0;const raw=String($("refSearch").value||"");
   if(options.commands&&raw.trimStart().startsWith('>')){quickOpenRenderCommands(raw.trimStart().slice(1));paint();return}
   const q=raw.trim().toLowerCase();
   // Finished items stay findable but rank last and look dimmed. Without a search, recently edited items come first.
   const target=i=>i.markerItem||(options.resolve?options.resolve(i.id):i)||i;
   let matches=(options.items?options.items():all).filter(i=>{const item=options.resolve?options.resolve(i.id):i;return item&&!item.archived});
   if(q)matches=rankItems(matches,q,{codes:i=>options.code?.(i)||itemSearchCodes(db,i),body:i=>options.describe?i.content:descriptionSearchText(i.content),item:target});
   else if(!options.items)matches=matches.slice().sort((a,b)=>inactiveRank(a)-inactiveRank(b)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
   matches=matches.slice(0,options.limit?options.limit():80);
   $("refResults").innerHTML=matches.length?matches.map(i=>`<button type="button" class="refResult${inactiveRank(target(i))>0?' inactiveResult':''}" data-ref-pick="${esc(i.id)}">${itemMarker(i.markerItem||i)}<span>${esc(i.title||"(untitled)")}${options.describe?.(i)?`<small class="refLocationDescription">${esc(options.describe(i))}</small>`:itemPathText(target(i))?`<small class="refLocationDescription refPath">${esc(itemPathText(target(i)))}</small>`:""}</span></button>`).join(""):'<div class="empty">No matching items.</div>';
   $("refResults").querySelectorAll("[data-ref-pick]").forEach((b,index)=>{b.onclick=e=>{
     const target=options.resolve?options.resolve(b.dataset.refPick):itemById(db,b.dataset.refPick);if(!target)return;
     $("modalbg").classList.remove("open");$("modalCancel").classList.remove("hidden");
     modalAfterClose=null;if(e?.shiftKey&&options.onShiftChoose)options.onShiftChoose(target);else if(onChoose)onChoose(target);
   };
   // The pointer and the keyboard share one highlight, so Enter picks the row under the mouse.
   b.onmousemove=()=>{if(choice!==index){choice=index;paint()}}});
   if(options.allowCreate&&q&&!all.some(i=>String(i.title||'').trim().toLowerCase()===q)){
     for(const type of ['Note','Todo']){const button=document.createElement('button');button.type='button';button.className='refResult';button.dataset.createReference=type;button.textContent=`Create ${type}: “${$('refSearch').value.trim()}”`;
       button.onclick=()=>{const title=$('refSearch').value.trim();if(!title)return;const original=snapshot(),previousUndo=undoStack.slice(),previousRedo=redoStack.slice();checkpoint();resetEditorHistoryGroup();
         try{const target=createItem(db,type);target.title=title;touch(db,target);modalAfterClose=null;$('modalbg').classList.remove('open');$('modalCancel').classList.remove('hidden');onChoose?.(target,{created:true});renderTree();renderStatus()}
         catch(error){db=migrateDatabase(JSON.parse(original));undoStack=previousUndo;redoStack=previousRedo;renderTree();renderStatus();toast(error.message)}
       };$('refResults').append(button)
     }
   }
   paint();
 };
 $("refSearch").oninput=renderResults;
 // Up/Down move one row, Page Up/Down ten, Mod+Up/Down to the first or last; Enter picks, Shift+Enter picks the
 // alternative action where the picker has one (Quick Open: show in the Outline).
 $('modalExtra').onkeydown=e=>{if(!['ArrowDown','ArrowUp','PageDown','PageUp','Enter','Escape'].includes(e.key))return;e.preventDefault();e.stopPropagation();const buttons=[...$('refResults').querySelectorAll('button')];
   if(e.key==='Escape')closeModalShell();
   else if(e.key==='Enter'){const direct=e.target.closest?.('button');if(direct&&!$('refResults').contains(direct))direct.click();else{const b=buttons[choice];if(!b)return;if(e.shiftKey&&b.dataset.refPick)b.onclick({shiftKey:true});else b.click()}}
   else if(buttons.length){const mod=e.ctrlKey||e.metaKey,down=e.key==='ArrowDown'||e.key==='PageDown';
     if(mod)choice=down?buttons.length-1:0;
     else if(e.key.startsWith('Page'))choice=Math.max(0,Math.min(buttons.length-1,choice+(down?10:-10)));
     else choice=(choice+(down?1:-1)+buttons.length)%buttons.length;paint()}};
  // Right after the picker opens, focus can briefly sit on Close; forward picker keys so a quick Enter still chooses the highlighted result.
  $('modalOK').onkeydown=e=>{if(!$('refResults'))return;if(e.key==='Enter'){const pick=$('refResults').querySelector('.active')||$('refResults').querySelector('button');if(pick){e.preventDefault();e.stopPropagation();pick.click()}}else if(['ArrowDown','ArrowUp'].includes(e.key)){$('modalExtra').onkeydown(e);$('refSearch')?.focus()}};

 options.setup?.(renderResults);renderResults();setTimeout(()=>{if($("modalbg").classList.contains("open"))$("refSearch")?.focus()},0);
}
function makeReferenceElement(target,embed=false){
 const span=document.createElement("span");
 span.className=`mdref ${embed?"embedref":""}`;
 span.contentEditable="false";
 span.dataset.md=`${embed?"!":""}[[${refToken(target.id)}]]`;
 span.dataset.refId=target.id;
 if(embed){
   const snippet=String(target.content||"").replace(/\s+/g," ").trim().slice(0,180);
   span.innerHTML=`<span class="embedtitle">↳ ${itemMarker(target,{passive:true})} ${esc(target.title||"(untitled)")}</span><span class="embedsnippet">${esc(snippet||"Empty embedded item")}</span><button type="button" class="embedEditBtn" data-edit-embed="${esc(target.id)}">Edit source</button>`;
 }else span.innerHTML=`${itemMarker(target,{passive:true})} ${esc(target.title)}`;
 return span;
}

const editorLocations=new Map();let editorDisplayedId=null,restoringEditorLocation=false;
function rememberEditorLocation(){
 if(restoringEditorLocation||!editorDisplayedId||!editorIsOpen())return;
 const active=document.activeElement;
 if(!['richEditor','editorTitle','content'].includes(active?.id))return;
 const state=captureEditorSelection();if(!state)return;
 state.id=editorDisplayedId;state.scrollTop=document.querySelector('.documentScroll').scrollTop;
 state.controlScrollTop=active.scrollTop;editorLocations.delete(state.id);editorLocations.set(state.id,state);
 while(editorLocations.size>30)editorLocations.delete(editorLocations.keys().next().value);
}
function restoreItemEditorLocation(id,focus=true){
 const state=editorLocations.get(id);if(!state||id!==selected)return;
 const active=document.activeElement;restoringEditorLocation=true;
 try{restoreEditorSelection(state);document.querySelector('.documentScroll').scrollTop=state.scrollTop||0;const control=$(state.control);if(control)control.scrollTop=state.controlScrollTop||0;if(!focus&&active?.isConnected)active.focus({preventScroll:true})}finally{restoringEditorLocation=false}
}
function typedReferenceTrigger(){
 if(activeTableCell())return;
 const sel=window.getSelection();if(!sel?.isCollapsed||!sel.rangeCount||editorComposing)return;
 const range=sel.getRangeAt(0),node=range.startContainer;if(node.nodeType!==Node.TEXT_NODE||!rangeBelongsToRichEditor(range))return;
 const block=bodyBlock(node);if(block?.dataset.mdblock==='code'||node.parentElement.closest('code,a,.mdref,.inlineTodo'))return;
 const text=node.data.slice(0,range.startOffset),match=/(!?\[\[)$/.exec(text);if(!match)return;
 // [[ and ![[ open item suggestions right at the caret; the toolbar's Link/Embed buttons keep the dialog.
 openCaretPopover('reference',node,range.startOffset-match[1].length,match[1].length,{embed:match[1].startsWith('!')});return true;
}
