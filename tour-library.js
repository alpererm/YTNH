"use strict";
// The YTNH Tour: a practice library that walks a new user through the app with small exercises.
// It is generated when opened, so its example dates sit in the current week. Libraries move between
// computers, so every shortcut is written for both systems: "Mac / Windows" (e.g. ⌘O / Ctrl+O).
// YTNHTour.build fills an empty database; YTNHTour.open creates a new library.
const YTNHTour=(()=>{
 const MAC={Mod:'⌘',Ctrl:'⌃',Shift:'⇧',Alt:'⌥',Backslash:'\\',Enter:'↩'},WIN={Mod:'Ctrl',Backslash:'\\'};
 const mac=spec=>spec.split('+').map(k=>MAC[k]??k).join('');
 const win=spec=>spec.split('+').map(k=>WIN[k]??k).join('+');
 // key('Mod+O') → "⌘O / Ctrl+O"; key(macSpec,winSpec) when the two systems use different keys.
 const key=(spec,winSpec=spec)=>{const a=mac(spec),b=win(winSpec);return a===b?a:a+' / '+b};
 function addDays(ds,n){const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}

 function build(database,{date=today(),minutes=null}={}){
   const made=[];
   // Show weekends here, so the examples for today stay visible when the tour is opened on a weekend.
   database.settings={...(database.settings||{}),hideWeekends:false};
   const add=(type,title,parent=null,extra={})=>{const i=createItem(database,type,parent?.id??null);i.title=title;i.content='';Object.assign(i,extra);made.push(i);return i};
   const note=(title,content,parent,extra)=>add('Note',title,parent,{content,...extra});
   const todo=(title,content,parent,extra)=>add('Todo',title,parent,{content:content||'',...extra});
   const link=i=>'[['+refToken(i.id)+']]';

   // Start here
   const start=note('Start here',
`Welcome to **YTNH**: notes, todos and long-term plans together, in a library file you own.

This is a **practice library**. Everything in it is yours to change, move, complete or delete. Your own libraries are not affected.

## How the tour works

Work through the numbered chapters in the Outline on the left, from top to bottom. Each Todo is a small exercise: do what it says, then mark it done. Most exercises take a few seconds.

- **Select** an item with a click or the arrow keys.
- **Open** it in the editor with a double-click or ${key('Shift+Enter')}.
- **Come back** to the Outline with Esc or ${key('Mod+1')}.

Shortcuts are written as **Mac / Windows**: ${key('Mod+O')} means ⌘O on a Mac and Ctrl+O on Windows. Keys such as Space, Enter, Esc, F2 and the arrow keys are the same on both. On a Mac, every command is also in the menu bar at the top of the screen.

## When you're done

Open your own library with ☰ → Open Library… (${key('Mod+O')}) or ☰ → Open Recent. You can reopen a fresh copy of this tour at any time from ☰ → Open the Tour.`);

   // 1 · Find your way around
   const ch1=todo('1 · Find your way around','The Outline holds everything. These exercises use the keyboard, but the mouse works too.');
   todo('Press Down to select the next item, and Up to come back',null,ch1);
   todo('Press Space to mark this Todo done (press it again to undo)','You can also click the circle on the left. Finished items stay visible for a moment, then leave the list. Show them again with '+key('Alt+Shift+D')+'.',ch1);
   todo('Press Enter (or F2) to rename this item, type a new name, then Enter',null,ch1);
   todo('Press '+key('Shift+Enter')+' to open this item in the editor',
`You're in the editor. Everything you type here is saved automatically.

Press **Esc** to go back to the Outline, then mark this Todo done.`,ch1);
   const nest=todo('Press Right to expand this item, Left to collapse it',null,ch1,{collapsed:true});
   note('Items can be nested as deep as you like','Use '+key('Shift+Right')+' and '+key('Shift+Left')+' to demote or promote the selected item.',nest);
   todo('Press N for a new Note or T for a new Todo at this level',key('Alt+N')+' and '+key('Alt+T')+' create a child instead. Anywhere in the app, '+key('Mod+N')+' and '+key('Mod+T')+' do the same.',ch1);
   note('Drop here','Drag the Todo below onto the middle of this row to make it a child.',ch1);
   todo('Drag me onto “Drop here”','Drop on the top or bottom edge of a row to place an item before or after it instead. '+key('Shift+Up')+' and '+key('Shift+Down')+' reorder with the keyboard.',ch1);

   // 2 · Organise a project
   const ch2=todo('2 · Organise a project','A project is any Todo with children. Headings divide a project into sections without adding another level.');
   note('Preparation','',ch2,{heading:true});
   todo('Click the arrow beside “Preparation” to fold this section',null,ch2);
   todo('Right-click this circle to see the other statuses','Todos can be Todo, Done, Waiting for, On hold or Cancelled. A middle-click cancels.',ch2);
   todo('Waiting for: a reply from the printer',null,ch2,{status:'Waiting for'});
   note('Delivery','',ch2,{heading:true});
   todo('Select a Todo in this project and press H to add a heading below it','Headings are labels only: they have no status or dates. Right-click a heading to rename it or turn it into a real parent.',ch2);
   todo('Open the side panel (Properties) and add the tag “home” to this Todo','Press '+key('Mod+Backslash')+' to show or hide the side panel. Tags you add to a parent are inherited by everything inside it.',ch2);

   // 3 · Write in the editor
   const ch3=note('3 · Write in the editor','');
   const target=note('A note to link to','This note exists so you can link to it. Open it and look at **Backlinks** in the side panel: it lists every item that links here.',ch3);
   ch3.content=(
`The editor is rich text with Markdown underneath. Type these at the **start of a line**:

- \`- \` for a bullet, \`1. \` for a numbered list (start with any number, such as \`5. \`)
- \`[] \` for a checklist
- \`> \` for a quote, \`# \` to \`### \` for headings
- \`---\` for a divider, three backticks and Enter for a code block

## Or use the slash menu

Type \`/\` at the start of an empty line to choose a heading, list, checklist, quote, code block, divider, table, image or link from a menu. Keep typing to filter, for example \`/che\` for a checklist, and press Enter.

## Try it here

- [ ] Click at the end of this line and press Enter to add another checklist item
- [ ] Tick this box with a click or ${key('Mod+Shift+Enter')}
- [x] Already done

> Quotes look like this. Select some words: a small toolbar appears for **bold**, *italic*, underline, code and links. ${key('Mod+B')} and ${key('Mod+I')} work too.

## Links between items

This links to ${link(target)}. Type \`[[\` anywhere and suggestions appear as you type: pick an item with the arrow keys and Enter, or create a new Note or Todo. Links keep working when you rename or move the item.

## Look around

- **Source** in the formatting menu shows the Markdown behind the page.
- The **document outline** in the side panel (${key('Mod+Shift+2')}) lists this note's headings.
- **Focus Mode** (${key('Ctrl+Mod+F','F11')}, or F11 on both) hides everything except your writing. Esc brings it back.

\`\`\`
Code blocks keep text exactly as typed.
\`\`\``);
   const inline=note('Todos inside your writing',
`Meeting notes and plans are full of things to do. Write them where they come up: YTNH turns them into real Todos without leaving the sentence.

## Create one

Type the task between angle brackets, anywhere in a sentence:

> After the meeting I need to \`<send the summary to the team>\`.

When you type the closing \`>\`, the words become a **Todo** (a child of this note) and stay in the sentence as a coloured link. It appears in the Outline, on the Calendar and in search like any other Todo.

## Set it up while you type

Inside the brackets, before typing \`>\`:

- **A date:** type \`@\` followed by a day: \`<send the summary @tomorrow>\`. Pick a suggestion such as *today*, *tomorrow* or *next monday*, or type a date. The Todo is scheduled on that day.
- **Another parent:** type \`[\` to choose where the Todo should live, for example under a project instead of this note. A small label below the text shows the chosen parent; click it to change it, or × to go back to this note.
- **A status or kind:** put a letter right before \`<\`:
  - \`d<…>\` Done, \`w<…>\` Waiting for, \`h<…>\` On hold, \`c<…>\` Cancelled
  - \`t<…>\` a Target for this month, \`m<…>\` a Milestone for this week

## Point to a Todo that already exists

Type \`!<\` to pick an existing Todo. It's shown in the sentence the same way, and it stays one Todo: completing it anywhere updates every place that mentions it.

## Work with it later

- The colour shows its status at a glance.
- **Right-click** it to change the status, open the Todo, or turn it back into plain text.
- **${key('Mod+Click','Ctrl+Click')}** opens the Todo itself.
- Hover over it to see its status and, if it lives elsewhere, its parent.

Angle brackets that look like code, web addresses or comparisons (such as \`a < b\`) are left alone.`,ch3);
   todo('Open “Todos inside your writing” and create an inline Todo',`Try: \`<buy stamps @tomorrow>\`, then right-click the result to mark it done.`,ch3);

   // 4 · Plan your time
   const ch4=todo('4 · Plan your time','Items appear on the Calendar on their scheduled dates. Show the Calendar with '+key('Mod+3')+'.');
   todo('Find this Todo on today’s Calendar','Selecting an item highlights it on the Calendar. Click the small calendar icon at the right of its row to jump there.',ch4,{scheduledDates:[date]});
   todo('Drag my Calendar chip to another day',null,ch4,{scheduledDates:[addDays(date,1)]});
   todo('Water the plants','This Todo repeats every week; the repeat icon on the right shows its next date. Completing it finishes only this week’s occurrence. A Todo whose dates have all passed gets a red calendar icon, so overdue work stands out.',ch4,{recurrence:{frequency:'weekly',interval:1,startDate:date}});
   const planned=todo('Open the Daily Planner to see when this is planned','Press '+key('Mod+Shift+D')+' or use the panel button beside Targets. Click an empty time slot to plan something new, or drag an item from the Outline onto the timeline. The clock icon on this row jumps to the session.',ch4);
   todo('Click an empty part of a day in the Calendar','The Outline then shows only that day’s items. Press Esc to show everything again.',ch4);
   // A session later today (or tomorrow morning if it's late).
   const clock=minutes??(new Date().getHours()*60+new Date().getMinutes());
   let day=date,startAt=Math.ceil((clock+1)/60)*60;
   if(startAt<8*60)startAt=9*60;if(startAt>21*60){day=addDays(date,1);startAt=9*60}
   try{PlannerModel.session(database,planned,day,startAt,45)}catch{planned.scheduledDates=[day]}

   // 5 · Think long-term
   const month=date.slice(0,7),later=addDays(date,120).slice(0,7);
   const ch5=todo('5 · Think long-term','Targets show work that spans months; Milestones mark a week. Open Targets with '+key('Mod+4')+'.');
   const goal=todo('Finish the tour (a Target)','A Target is a Todo with a start and end month, shown as a bar in Targets. Items under it count towards it.',ch5,{target:{startMonth:month,endMonth:later}});
   todo('Try every chapter (a Milestone)','A Milestone is a Todo planned for a week. Mark it done and watch the count on the Target bar change.',goal,{milestone:{targetWeek:isoWeekKey(date)}});
   todo('Open Targets and find the bar for “Finish the tour”',null,ch5);

   // 6 · Find things
   const ch6=todo('6 · Find things','');
   todo('Press / and search for “plants”','Search is forgiving about typos and lists title matches first. Try `#home` for the tag you added, or `status:Done` for finished Todos. Esc clears it.',ch6);
   todo('Open Filters ('+key('Alt+Shift+F')+') and show only Notes','Chips beside the filter button show what’s active; Clear all ('+key('Alt+Shift+C')+') resets them.',ch6);
   todo('Group the Outline by type ('+key('Alt+Shift+G')+')','Group by shows items by date, type, tag or status. Choose None to go back.',ch6);
   todo('Press '+key('Ctrl+Shift+Space')+' to open any item quickly','Quick Open works even when YTNH is in the background. You can turn it off in Settings.',ch6);

   // 7 · Your data and next steps
   note('7 · Your data and next steps',
`## Your library

A library is one \`.ytnh\` file in a folder you choose, such as a OneDrive folder. Changes save automatically while you work; **Save** (${key('Mod+S')}) and closing the app update the file. Keep a copy with ☰ → Back Up Library….

YTNH has no account and sends nothing anywhere.

## Bring things in

- **☰ → Import Markdown Folder…** turns a folder of Markdown files into Notes, keeping subfolders, tags, images and links.
- **☰ → Import Outlook Calendar…** brings in meetings from an exported .ics file.

## Make it yours

- **Settings** (${key('Mod+,')}), in four tabs: General (whether the app opens on the Calendar or the editor), Appearance (theme, font, sizes), Editor (width, spelling, scroll past end) and Calendar (Daily Planner hours, weekends).
- **Help** (?): every feature and keyboard shortcut, with search.

You've reached the end of the tour. Open your own library with ☰ → Open Library…, or start a new one with ☰ → New Library….`);

   database.updatedAt=now();
   return {start,chapters:[ch1,ch2,ch3,ch4,ch5,ch6],inline,items:made};
 }

 // A fresh tour library. On the desktop it is saved as a new .ytnh file; in a browser it opens unsaved.
 async function open(){
   const model=createEmptyDatabase();const previous=db;
   const r=build(model);
   if(window.notesDesktop?.sqlite?.newLibrary){await window.notesDesktop.sqlite.newLibrary(model,'YTNH Tour.ytnh');}
   else{if(previous&&dirty&&!await appConfirm('Open the Tour?','Unsaved changes in the current library will be lost.','Open the Tour'))return;installDatabase(model);}
   const start=db?.items.find(i=>!i.parentId&&i.title==='Start here'&&!i.archived);if(!start||db.items.length!==r.items.length)return;
   selected=start.id;render();edit(start.id);
 }
 return {build,open,key};
})();
