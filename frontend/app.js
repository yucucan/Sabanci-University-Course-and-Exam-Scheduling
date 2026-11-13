/* Plain JavaScript: no server, database, framework, or installation required. */
'use strict';
const STORAGE_KEY = 'defterdar-proposal-v2';
const clone = value => JSON.parse(JSON.stringify(value));
let data = clone(window.EXAMPLE_DATA);
try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved && Object.keys(data).every(k=>Array.isArray(saved[k]))) data=saved; } catch (_) {}
const main = document.querySelector('#main');
const dialog = document.querySelector('#editor');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const foldSearch = value => String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase();
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const courseIsEnabled = course => course.scheduleStatus !== 'Off';
const field = (key,label,type='text',options=null) => ({key,label,type,options});
const f = field;
const schemas = {
 campuses:[f('name','Campus name')], buildings:[f('name','Building name'),f('campus','Campus','select','campuses')],
 faculties:[f('name','Faculty name')],departments:[f('name','Department name'),f('abbreviation','Abbreviation'),f('faculty','Faculty','select','faculties')],
 buildingScores:[f('department','Department','select','departmentCodes'),f('building','Building','select','buildings'),f('score','Score','number')],
 classroomTypes:[f('name','Classroom type')],courseTypes:[f('name','Course type')],
 timeStructure:[f('day','Day','select',days),f('start','Start time','time'),f('end','End time','time')],
 campusTravel:[f('from','From campus','select','campuses'),f('to','To campus','select','campuses'),f('minutes','Minimum minutes','number')],
 buildingTravel:[f('from','From building','select','buildings'),f('to','To building','select','buildings'),f('minutes','Minimum minutes','number')],
 campusBuildingTravel:[f('from','From campus','select','campuses'),f('to','To building','select','buildings'),f('minutes','Minimum minutes','number')],
 instructors:[f('name','Name'),f('surname','Surname'),f('email','Email','email'),f('faculty','Faculty','select','faculties'),f('department','Department','select','departmentCodes'),f('min','Min working hours per day','number'),f('max','Max working hours per day','number')],
 classrooms:[f('code','Code'),f('name','Name'),f('capacity','Capacity','number'),f('type','Type','select','classroomTypes'),f('campus','Campus','select','campuses'),f('building','Building','select','buildings'),f('gap','Minimum minutes between classes','number')],
 courses:[f('code','Course code'),f('name','Course name'),f('department','Department','select','departmentCodes'),f('patterns','Patterns (comma separated)')],
 standardRules:[f('name','Rule name'),f('type','Rule type','select',['Same Time','Different Time','Same Day','Different Day']),f('elements','Course / section elements (comma separated)')],
 orderRules:[f('name','Rule name'),f('before','Before elements (comma separated)'),f('after','After elements (comma separated)')],
 sections:[
  f('name','Section name'),f('demand','Expected students','number'),
  {...f('instructor','Instructor','select','instructorNames'),optional:true,emptyLabel:'Unassigned'},
  {...f('classroom','Classroom','select','classroomCodes'),optional:true,emptyLabel:'Unassigned'},
  {...f('day','Day','select',days.map(d=>d.toUpperCase())),optional:true,emptyLabel:'Unassigned'},
  {...f('start','Start time','time'),optional:true},{...f('end','End time','time'),optional:true}
 ],
 labs:[
  f('name','Lab / recitation name'),{...f('activityType','Activity type','select',['Lab','Recitation']),optional:true,default:'Lab',emptyLabel:'Use default (Lab)'},
  {...f('linkedSection','Linked lecture section','select','courseSections'),optional:true,emptyLabel:'Entire course'},
  {...f('instructor','Instructor','select','instructorNames'),optional:true,emptyLabel:'Unassigned'},
  {...f('classroom','Classroom','select','classroomCodes'),optional:true,emptyLabel:'Unassigned'},
  f('demand','Expected students','number'),f('scheduleType','Schedule type','select',['Weekly','Biweekly']),
  {...f('pattern','Pattern'),optional:true},
  {...f('day','Day','select',days.map(d=>d.toUpperCase())),optional:true,emptyLabel:'Unassigned'},
  {...f('start','Start time','time'),optional:true},{...f('end','End time','time'),optional:true}
 ],
 exams:[
  f('course','Course','select','courseCodes'),f('type','Exam type','select',['Midterm','Final']),
  {...f('duration','Duration (minutes)','number'),min:1,default:120},f('demand','Expected students','number'),
  {...f('preferredClassroomType','Preferred classroom type','select','classroomTypes'),optional:true,emptyLabel:'No preference'},
  {...f('invigilator','Invigilator','select','staffEmails'),optional:true,emptyLabel:'Unassigned'},
  {...f('date','Assigned date','date'),optional:true},{...f('start','Assigned start','time'),optional:true},
  {...f('end','Assigned end','time'),optional:true},
  {...f('classroom','Assigned classroom','select','classroomCodes'),optional:true,emptyLabel:'Unassigned'}
 ],
 examWindows:[f('type','Exam type','select',['Midterm','Final']),f('date','Date','date'),f('start','Earliest start','time'),f('end','Latest finish','time')],
 distributions:[f('term','Term','number'),f('department','Department','select','departmentCodes'),f('percentage','Percentage','number')]
};
const titles={campuses:'Campuses',buildings:'Buildings',faculties:'Faculties',departments:'Departments',buildingScores:'Score Building',classroomTypes:'Classroom Types',courseTypes:'Course Types',timeStructure:'Time Structure',campusTravel:'Campus to Campus',buildingTravel:'Building to Building',campusBuildingTravel:'Campus to Building',instructors:'Instructors',classrooms:'Classrooms',courses:'Courses',standardRules:'Standard Rules',orderRules:'Order Rules',sections:'Sections',labs:'Labs and recitations',distributions:'Percentage Distribution of the Course by the Terms'};
let activeEdit = null;
titles.exams='Exam';
titles.examWindows='Exam window';
function notify(message){const t=document.querySelector('#toast');t.textContent=message;t.style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.style.display='none',3000);}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true;}catch(_){notify('Changes are in memory only. Export data to keep them.');return false;}}
function options(source,parent){if(Array.isArray(source))return source;if(source==='courseSections')return (data.courses[parent]?.sections||[]).map(r=>r.name);if(source==='departmentCodes')return data.departments.map(r=>r.abbreviation);if(source==='instructorNames')return data.instructors.map(r=>r.name+' '+r.surname);if(source==='classroomCodes')return data.classrooms.map(r=>r.code);if(source==='courseCodes')return data.courses.map(r=>r.code);if(source==='staffEmails')return data.instructors.map(r=>r.email);return (data[source]||[]).map(r=>r.name);}
function rowsFor(key,parent){return parent===undefined?data[key]:data.courses[parent][key];}
function table(key,parent){const fields=schemas[key],rows=rowsFor(key,parent),scope=parent===undefined?'':` data-parent="${parent}"`;return `<div class="data-table" data-key="${key}"${scope}><div class="toolbar"><input class="search" aria-label="Search ${esc(titles[key])}" placeholder="Search ${esc(titles[key]).toLowerCase()}…"><button class="primary" data-action="add" data-key="${key}"${scope}>+ Add ${esc(titles[key])}</button></div><div class="table-wrap"><table><thead><tr>${fields.map(f=>`<th scope="col" aria-sort="none"><button class="sort-button" data-sort="${f.key}">${esc(f.label)} <span aria-hidden="true">↕</span></button></th>`).join('')}<th>Actions</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-row-index="${i}">${fields.map(f=>`<td>${esc(r[f.key])}</td>`).join('')}<td><div class="actions">${['instructors','classrooms','courses'].includes(key)?`<a class="tag" href="#${key}/edit/${i}">Open</a>`:''}<button data-action="edit" data-key="${key}" data-index="${i}"${scope}>Edit</button><button class="danger" data-action="delete" data-key="${key}" data-index="${i}"${scope}>Delete</button></div></td></tr>`).join('')}</tbody></table>${rows.length?'':'<p class="empty">No records yet. Add the first one above.</p>'}</div><small class="row-count">${rows.length} records</small></div>`;}
function panel(title,content,open=false){return `<details class="panel" ${open?'open':''}><summary>${esc(title)}</summary><div class="panel-content">${content}</div></details>`;}
function heading(title,description){return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div></div>`;}
function inputMarkup(spec,value,parent){
 value=value??spec.default??'';
 let input;
 const required=spec.optional?'':'required';
 if(spec.type==='select'){
  const selected=spec.multiple?(Array.isArray(value)?value:[]):value?[value]:[];
  const opts=[...new Set([...options(spec.options,parent),...selected])];
  const helpId=`${spec.key}-selection-help`;
  input=`<select name="${spec.key}" ${required} ${spec.multiple?`multiple size="5" aria-describedby="${helpId}"`:''}>${spec.optional&&!spec.multiple?`<option value="">${esc(spec.emptyLabel||'None assigned')}</option>`:''}${opts.map(v=>`<option value="${esc(v)}" ${selected.includes(v)?'selected':''}>${esc(typeof optionLabel==='function'?optionLabel(spec.options,v):v)}</option>`).join('')}</select>${spec.multiple?`<small id="${helpId}">Optional. Use Ctrl or Command to select or clear individual names.</small>`:''}`;
 }else if(spec.type==='textarea')input=`<textarea name="${spec.key}" rows="4" ${required}>${esc(value)}</textarea>`;
 else input=`<input name="${spec.key}" type="${spec.type}" value="${esc(value)}" ${spec.type==='number'?`min="${spec.min??0}" ${spec.max===undefined?'':`max="${spec.max}"`} step="${esc(spec.step||1)}"`:''} ${required}>`;
 return `<label>${esc(spec.label)}${input}</label>`;
}
function edit(key,index,parent){const rows=rowsFor(key,parent),record=index===undefined?{}:rows[index];activeEdit={key,index,parent};document.querySelector('#dialog-title').textContent=(index===undefined?'Add · ':'Edit · ')+titles[key];document.querySelector('#fields').innerHTML=schemas[key].map(spec=>inputMarkup(spec,record[spec.key]??spec.default??(spec.type==='number'&&!spec.optional?0:''),parent)).join('');dialog.showModal();}
function availability(key,index){const record=data[key][index],use40=typeof usesSabanciBlocks==='function'?usesSabanciBlocks():data.timeStructure?.[0]?.start?.endsWith(':40');return `<p class="muted">Click a cell to cycle through Available, Preferred, and Unavailable.</p><div class="table-wrap"><table class="calendar"><thead><tr><th>Time block</th>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${Array.from({length:11},(_,i)=>i+8).map(hour=>{const label=use40?`${String(hour).padStart(2,'0')}:40–${String(hour+1).padStart(2,'0')}:30`:`${String(hour).padStart(2,'0')}:00`;return `<tr><th>${label}</th>${days.map((d,j)=>{const slot=j+'-'+hour,state=record.availability?.[slot]||'Available';return `<td><button class="${state.toLowerCase()}" data-action="availability" data-key="${key}" data-index="${index}" data-slot="${slot}" aria-label="${d} ${label} ${state}">${state}</button></td>`;}).join('')}</tr>`;}).join('')}</tbody></table></div>`;}
function detail(key,index){const r=data[key][index];if(!r){main.innerHTML=heading('Record not found','Return to the list to select another record.');return;}main.innerHTML=`<a class="back" href="#${key}">← Back to ${titles[key]}</a>`+heading(key==='instructors'?r.name+' '+r.surname:r.code+' · '+r.name,'Edit details and scheduling preferences.')+`<section class="panel"><div class="panel-content"><form id="detail-form" data-key="${key}" data-index="${index}"><div class="form-grid">${schemas[key].map(s=>inputMarkup(s,r[s.key])).join('')}</div><div class="dialog-actions"><button class="primary">Save details</button></div></form></div></section>`;
 if(key==='courses'){main.innerHTML+=['labs','distributions','sections'].map(child=>panel(titles[child],table(child,index),true)).join('');}else{main.innerHTML+=panel('Availability Calendar',availability(key,index),true);const name=r.name+' '+r.surname;const assigned=(typeof allSessions==='function'?allSessions():data.courses.filter(courseIsEnabled).flatMap(c=>[...c.sections,...c.labs])).filter(s=>key==='instructors'?s.instructor===name:s.classroom===r.code);main.innerHTML+=panel(key==='instructors'?'Assigned Sections':'Classroom Assignments',`<div class="table-wrap"><table><thead><tr><th>Section</th><th>Instructor</th><th>Classroom</th><th>Demand</th></tr></thead><tbody>${assigned.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.instructor)}</td><td>${esc(s.classroom)}</td><td>${esc(s.demand)}</td></tr>`).join('')}</tbody></table></div>${assigned.length?'':'<p>No sections assigned.</p>'}`,true);}}
function render(){const [page='dashboard',action,id]=(location.hash.slice(1)||'dashboard').split('/');document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page));document.querySelector('#sidebar').hidden=page==='login';document.querySelector('#workspace').style.marginLeft=page==='login'?'0':'';
 if(page==='login'){main.innerHTML=`<section class="login"><img src="defterdar.svg" alt=""><h1>Welcome to Defterdar</h1><p>Course and classroom scheduling for Sabancı University.</p><a class="button primary" href="#dashboard">Open scheduling workspace</a><a class="text-link" href="#help">Read the guide</a></section>`;return;}
 if(['instructors','classrooms','courses'].includes(page)){if(action==='edit'){detail(page,Number(id));return;}main.innerHTML=heading(titles[page],'Manage '+titles[page].toLowerCase()+' and open a record for its scheduling details.')+`<section class="panel"><div class="panel-content">${table(page)}</div></section>`;return;}
 if(page==='rules'){main.innerHTML=heading('Rules','Define scheduling relationships between courses and sections.')+``+panel('Standard Rules',table('standardRules'),true)+panel('Order Rules',table('orderRules'),true);return;}
 main.innerHTML=heading('General','Configure the university, teaching spaces, and academic timetable.')+`<div class="stats">${['campuses','instructors','classrooms','courses'].map(k=>`<a class="stat" href="#${k==='campuses'?'general':k}">${titles[k]}<strong>${data[k].length}</strong></a>`).join('')}</div>`+['campuses','buildings','faculties','departments','classroomTypes','courseTypes','timeStructure'].map((k,i)=>panel(titles[k],table(k),i===0)).join('')+panel('Minimum Travel Time',['campusTravel','buildingTravel','campusBuildingTravel'].map(k=>panel(titles[k],table(k),true)).join(''));}
function readForm(form,key){
 return Object.fromEntries(schemas[key].map(spec=>{
  if(spec.multiple)return [spec.key,Array.from(form.elements[spec.key].selectedOptions,option=>option.value)];
  const value=form.elements[spec.key]?.value??'';
  return [spec.key,spec.type==='number'&&value!==''?Number(value):value.trim()];
 }));
}
function validate(record,key){if(key==='instructors'&&record.min>record.max)return 'Minimum working hours must not exceed maximum.';if(key==='distributions'&&record.percentage>100)return 'Percentage must be between 0 and 100.';if(key==='timeStructure'&&record.start>=record.end)return 'End time must be later than start time.';if(key==='classrooms'&&!data.buildings.some(b=>b.name===record.building&&b.campus===record.campus))return 'Choose a building belonging to the selected campus.';return '';}
document.addEventListener('submit',e=>{e.preventDefault();let ctx=e.target.id==='edit-form'?activeEdit:e.target.id==='detail-form'?{key:e.target.dataset.key,index:Number(e.target.dataset.index)}:null;if(!ctx)return;const {key,index,parent}=ctx,record=readForm(e.target,key),error=validate(record,key,index,parent)||(typeof validateTeachingPlacement==='function'?validateTeachingPlacement(record,key):'');if(error){notify(error);return;}const rows=rowsFor(key,parent);if(['instructors','classrooms','courses'].includes(key)){const unique=key==='instructors'?'email':'code';if(rows.some((r,i)=>i!==index&&r[unique]===record[unique])){notify('That '+unique+' already exists.');return;}}
 if(['sections','labs'].includes(key)&&rows.some((session,i)=>i!==index&&session.name===record.name)){
  notify(key==='sections'?'This course already has a section with that name.':'This course already has a lab or recitation with that name.');
  return;
 }
 if(typeof checkpoint==='function')checkpoint();
 if(index===undefined){if(key==='courses')Object.assign(record,{sections:[],labs:[],distributions:[]});rows.push(record);}else{const old=rows[index];if(typeof renameReferences==='function')renameReferences(key,old,record,parent);if(key==='instructors'||key==='classrooms'){const from=key==='instructors'?old.name+' '+old.surname:old.code,to=key==='instructors'?record.name+' '+record.surname:record.code,prop=key==='instructors'?'instructor':'classroom';data.courses.forEach(c=>[...c.sections,...c.labs].forEach(s=>{if(s[prop]===from)s[prop]=to;}));}rows[index]={...old,...record};}const saved=persist();dialog.close();render();notify(saved?'Changes saved':'Changes are in memory only. Export data to keep them.');});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const key=b.dataset.key,index=b.dataset.index===undefined?undefined:Number(b.dataset.index),parent=b.dataset.parent===undefined?undefined:Number(b.dataset.parent);if(b.dataset.action==='add'||b.dataset.action==='edit')edit(key,index,parent);if(b.dataset.action==='delete'){if(typeof deletionBlock==='function'){const reason=deletionBlock(key,index,parent);if(reason){notify(reason);return;}}if(!confirm('Delete this record? You can undo this change.'))return;if(typeof checkpoint==='function')checkpoint();rowsFor(key,parent).splice(index,1);persist();render();notify('Record deleted');}if(b.dataset.action==='availability'){if(typeof checkpoint==='function')checkpoint();const record=data[key][index],states=['Available','Preferred','Unavailable'];record.availability||={};record.availability[b.dataset.slot]=states[(states.indexOf(record.availability[b.dataset.slot]||'Available')+1)%3];persist();const state=record.availability[b.dataset.slot];b.textContent=state;b.className=state.toLowerCase();b.setAttribute('aria-label',b.getAttribute('aria-label').replace(/(?:Available|Preferred|Unavailable)$/,state));}});
document.addEventListener('input',e=>{if(!e.target.matches('.search'))return;const wrapper=e.target.closest('.data-table'),q=foldSearch(e.target.value);let count=0;wrapper.querySelectorAll('tbody tr').forEach(row=>{row.hidden=!foldSearch(row.textContent).includes(q);if(!row.hidden)count++;});wrapper.querySelector('.row-count').textContent=count+' matching records';});
document.querySelector('#close-dialog').onclick=document.querySelector('#cancel').onclick=()=>dialog.close();
document.querySelector('#reset').onclick=()=>{if(confirm('Replace the current workspace with the default data? Use Undo to recover your previous records.')){if(typeof checkpoint==='function')checkpoint();data=clone(window.EXAMPLE_DATA);persist();render();notify('Default data restored');}};
function downloadJson(filename,value){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const link=document.createElement('a');
 link.href=url;
 link.download=filename;
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelector('#export').onclick=()=>downloadJson('defterdar-data.json',data);
window.addEventListener('hashchange',()=>render());render();
