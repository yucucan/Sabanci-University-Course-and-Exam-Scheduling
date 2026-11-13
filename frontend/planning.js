/* Faculty intake and constraint catalogue aligned with Sabancı University scheduling workflow and Project #467 MIP model. */
'use strict';

const planningRuleExamples = {
  hardConstraints: [
    {name:'Academic conflict blocks (Cross-faculty)', scope:'University-wide · related courses & same-term cohorts', requirement:'Prevent faculty-designated academic conflict blocks and same-department/term compulsory courses from overlapping, evaluated across all faculties simultaneously.'},
    {name:'Instructor hard unavailability', scope:'Teaching staff · unavailable calendar periods', requirement:'Never assign a teaching session to a time block marked Unavailable in the instructor, TA, or LA calendar. Record preferred hours separately from unavailability.'},
    {name:'Inter-building & inter-campus travel time', scope:'Consecutive instructor & cohort sessions', requirement:'Enforce minimum travel minutes between buildings and campuses for consecutive classes so instructors and students can reach the next location within the break.'},
    {name:'Classroom turnaround gap', scope:'All teaching spaces · consecutive classes', requirement:'Preserve each classroom’s minimum turnaround gap between sequential sessions before the next class begins.'},
    {name:'Common academic event blocks', scope:'University-wide · protected hours', requirement:'Protect university-wide common academic event periods from regular course placements across all faculties.'},
    {name:'Confirmed fixed faculty time blocks', scope:'Courses with mandatory fixed slots', requirement:'Lock confirmed mandatory faculty time blocks (sabit zaman talepleri) in Schedule review. Record ordinary time requests as preferences.'},
    {name:'Approved institutional teaching windows', scope:'All course sessions · 08:40–19:30 structure', requirement:'Assign sessions strictly within permitted institutional teaching days and time intervals (08:40–19:30 slots configured in General).'},
    {name:'Classroom capacity & technical attributes', scope:'Each section and lab · Class Reqs', requirement:'Ensure classroom seat capacity meets expected section demand and matches required physical/technical attributes (Lecture Hall, Computer Laboratory, Science Lab).'},
    {name:'Faculty-defined weekly patterns & section counts', scope:'Course intake · alternative patterns (e.g., 2+2, 3+1)', requirement:'Select exactly one approved weekly hour distribution pattern per section (e.g., 2+2 or 3+1) and preserve faculty-defined section counts.'},
    {name:'Registration & Add/Drop schedule freeze', scope:'Published timetable · protected periods', requirement:'Freeze meeting days and times during student course registration and Add/Drop windows; allow post-registration room re-allocation when enrollments shift.'}
  ],
  softConstraints: [
    {name:'Minimize wasted classroom capacity (Seat fit)', scope:'All assigned classrooms · counterfactual efficiency', requirement:'Minimize empty seats in booked classrooms while preventing section overflow, reserving high-capacity halls for high-demand courses.', importance:90},
    {name:'Avoid student cohort clashes (Enrollment distribution)', scope:'Department & term enrollment distributions', requirement:'Minimize time overlaps weighted by each section’s expected enrollment distribution across departments and terms.', importance:85},
    {name:'Department building preference scores', scope:'Faculty & department building affinity', requirement:'Maximize department-specific building preference scores (0–100) when assigning sections to teaching buildings.', importance:75},
    {name:'Instructor preferred teaching hours', scope:'Teaching staff · Preferred calendar slots', requirement:'Reward placements in time blocks marked Preferred by the instructor and balance daily teaching loads between min and max targets.', importance:70},
    {name:'Preferred classroom requests (Faculty intake)', scope:'Faculty intake · Room request column', requirement:'Honor faculty-requested rooms where possible after capacity, technical attributes, availability, and university-wide conflict blocks are satisfied.', importance:65}
  ]
};
const intakeFields = [
  {...f('credits','SU credit','number'), step:'any'},
  f('openStatus','Open status','select',['Not specified','Planned','Open','Closed']),
  f('doubleCodedCourse','Double coded course'),
  f('specialApproval','Special approval','select',['Not specified','Required','Not required']),
  {...f('weeklyHours','Total hrs/week','number'), step:'any'},
  f('capacity','Capacity','number'),
  f('plannedSections','Number of sections','number'),
  f('sectionCapacity','Capacity of section','number'),
  f('partOfTerm','Part of term'),
  f('notes','Course notes'),
  f('corequisites','Course corequisite relationship'),
  f('instructorRequest','Instructors (faculty request)'),
  f('classRequirements','Class requirements'),
  f('correctionStatus','Correction status','select',['Not specified','Pending review','Revision requested','Reviewed']),
  f('roomRequest','Room (faculty request)')
].map(spec=>({...spec, optional:true, emptyLabel:'Not supplied'}));
schemas.courses[0].label='Course';
schemas.courses[1].label='Course title';
schemas.courses.find(spec=>spec.key==='patterns').label='Distribution of hours';
schemas.courses.push(...intakeFields);
schemas.courses.splice(2,0,{...f('scheduleStatus','In this semester’s schedule','select',['On','Off']),default:'On'});
for (const key of ['hardConstraints','softConstraints']) {
  titles[key]=key==='hardConstraints'?'Hard constraints':'Soft constraints';
  schemas[key]=[f('name','Constraint name'),f('scope','Applies to'),f('requirement','Requirement / preference','textarea')];
  schemas[key].splice(2,0,{...f('staffEmails','Teaching staff','select','staffEmails'),multiple:true,optional:true});
  if(key==='softConstraints')schemas[key].push({...f('importance','Importance (0–100)','number'),max:100,default:50});
}
for(const key of ['standardRules','orderRules'])schemas[key].push({...f('enforcement','Constraint strength','select',['Hard','Soft']),default:'Hard'},{...f('importance','Soft importance (0–100)','number'),max:100,default:50});

function normalizePlanningData(workspace) {
  if(workspace.exams===undefined)workspace.exams=[];
  if(workspace.examWindows===undefined)workspace.examWindows=[];
  if(Array.isArray(workspace.exams))workspace.exams.forEach(exam=>{
    if(!exam||typeof exam!=='object'||Array.isArray(exam)||exam.duration!==undefined)return;
    exam.duration=typeof exam.start==='string'&&typeof exam.end==='string'&&exam.start&&exam.end
      ?minutes(exam.end)-minutes(exam.start):120;
  });
  for (const key of ['hardConstraints','softConstraints']) {
    if(workspace[key]===undefined||(key==='hardConstraints'&&workspace[key].length===8&&workspace[key].some(r=>String(r.requirement).includes('the email'))))workspace[key]=clone(planningRuleExamples[key]);
    if(Array.isArray(workspace[key]))workspace[key].forEach(rule=>{
      if(!rule||typeof rule!=='object')return;
      delete rule.source;
      if(key==='softConstraints'&&rule.importance===undefined)rule.importance=50;
    });
  }
  for(const key of ['standardRules','orderRules'])if(Array.isArray(workspace[key]))workspace[key].forEach(rule=>{
    if(!rule||typeof rule!=='object')return;
    if(rule.enforcement===undefined)rule.enforcement='Hard';
    if(rule.importance===undefined)rule.importance=50;
  });
  const exampleByCode=new Map((window.EXAMPLE_DATA?.courses||[]).map(c=>[c.code,c]));
  if(Array.isArray(workspace.courses))workspace.courses.forEach(course=>{
    if(!course||typeof course!=='object')return;
    if(course.scheduleStatus===undefined)course.scheduleStatus='On';
    const ref=exampleByCode.get(course.code);
    intakeFields.forEach(spec=>{
      if(course[spec.key]===undefined||(course[spec.key]===''&&ref&&ref[spec.key]!==undefined&&ref[spec.key]!==''))course[spec.key]=ref?.[spec.key]??'';
    });
  });
  if(Array.isArray(workspace.buildingTravel)&&workspace.buildingTravel.length===1&&workspace.buildingTravel[0].minutes===10){
    workspace.buildingTravel=clone(window.EXAMPLE_DATA.buildingTravel);
  }
  return workspace;
}
normalizePlanningData(data);
normalizePlanningData(window.EXAMPLE_DATA);

const validateBeforePlanning=validate;
validate=function(record,key,...args){
  const error=validateBeforePlanning(record,key,...args);
  if(error)return error;
  if(key==='courses'&&record.plannedSections!==''&&record.plannedSections!==undefined&&record.plannedSections<1)return 'Number of sections must be at least 1, or left blank until confirmed.';
  if(['softConstraints','standardRules','orderRules'].includes(key)&&(!Number.isInteger(record.importance)||record.importance<0||record.importance>100))return 'Importance must be a whole number between 0 and 100.';
  return '';
};

const planningStages=[
  ['Catalog preparation','Scheduling office + faculties','Share the term course opening, closing, and modification calendar; finalize new catalog entries and course updates.'],
  ['Faculty intake (Spreadsheet #2)','Faculties → internal collection system','Collect course titles, section counts, weekly hour patterns (2+2, 3+1), instructors, double codes, capacities, Class Reqs, and room requests; gather instructor time preferences.'],
  ['Inventory & constraint setup (Spreadsheet #1)','Scheduling office','Load university time structure (08:40–19:30), classroom capacities & attributes, turnaround gaps, inter-building travel matrices, academic conflict blocks, and fixed blocks.'],
  ['Placement and checks','Scheduling office','Review candidate time and room placements. Compare booked capacity and check remaining issues before applying changes.'],
  ['Faculty review (~2 weeks)','Faculties + teaching staff','Share the timetable for the two-week faculty review window. Check requested changes and review their impact on other courses.'],
  ['Publication & post-registration room fit','Scheduling office + faculties','Publish to students. Freeze meeting times during Registration and Add/Drop; review room assignments if actual enrollments shift capacity needs.']
];
function planningWorkflow(){
  return `<section class="panel planning-workflow"><div class="section-heading"><div><span class="eyebrow">SABANCI UNIVERSITY ACADEMIC PLANNING CYCLE</span><h2>From course intake to publication</h2></div><span class="tag">University-wide · Cross-faculty</span></div><div class="panel-content"><p class="muted">Plan for roughly 3–4 months overall. Review courses across faculties together so students can take classes in different departments.</p><ol class="planning-stages">${planningStages.map(([title,owner,text])=>`<li><h3>${title}</h3><small>${owner}</small><p>${text}</p></li>`).join('')}</ol><div class="workflow-links"><a class="text-link" href="#planning">Review schedule →</a> · <a class="text-link" href="#planning/counterfactual">Compare capacity →</a> · <a class="text-link" href="#rules">Review hard and soft constraints →</a></div></div></section>`;
}
function constraintStaffLinks(rule){
  if(!Array.isArray(rule.staffEmails)||!rule.staffEmails.length)return '';
  const links=data.instructors.flatMap((person,index)=>rule.staffEmails.includes(person.email)
    ?[`<li><a class="text-link" href="#instructors/edit/${index}">${esc(staffName(person))}</a> · ${esc(staffRole(person))}</li>`]
    :[]);
  return links.length?`<div class="constraint-staff"><strong>Linked teaching staff</strong><ul>${links.join('')}</ul></div>`:'';
}

function staffConstraintsPanel(person){
  const links=['hardConstraints','softConstraints'].flatMap(key=>data[key].flatMap((rule,index)=>
    Array.isArray(rule.staffEmails)&&rule.staffEmails.includes(person.email)
      ?[`<li><button type="button" class="text-link" data-action="edit" data-key="${key}" data-index="${index}">${esc(rule.name)}</button> · ${key==='hardConstraints'?'Hard':'Soft'}</li>`]
      :[]));
  return panel('Linked constraints',links.length?`<ul>${links.join('')}</ul>`:
    '<p>No constraints linked. Add this person to a constraint under <a class="text-link" href="#rules">Rules</a>.</p>',true);
}

function constraintSection(key,description){
  const hard=key==='hardConstraints';
  return `<section class="panel constraint-section ${hard?'hard':'soft'}" aria-labelledby="${key}-heading"><div class="section-heading"><div><span class="constraint-kind">${hard?'MANDATORY RESTRICTIONS':'WEIGHTED PREFERENCES'}</span><h2 id="${key}-heading">${titles[key]} <span class="count-badge">${data[key].length}</span></h2></div><button class="${hard?'primary':''}" data-action="add" data-key="${key}">+ Add ${hard?'hard':'soft'} constraint</button></div><div class="panel-content"><p>${description}</p><div class="constraint-grid">${data[key].map((rule,index)=>`<article class="constraint-card" data-constraint-index="${index}" data-constraint-key="${key}"><h3>${esc(rule.name)}</h3><small class="constraint-scope">${esc(rule.scope)}</small><p>${esc(rule.requirement)}</p>${constraintStaffLinks(rule)}${hard?'':`<label class="importance-editor">Priority <input type="number" min="0" max="100" step="1" value="${rule.importance}" data-rule-importance="${index}" aria-label="Importance of ${esc(rule.name)}"><span class="priority-scale">/ 100</span></label>`}<div class="constraint-card-bottom"><label class="constraint-strength">Constraint type<select data-constraint-type="${key}" data-index="${index}" aria-label="Constraint type for ${esc(rule.name)}"><option ${hard?'selected':''}>Hard</option><option ${hard?'':'selected'}>Soft</option></select></label><div class="actions"><button data-action="edit" data-key="${key}" data-index="${index}" aria-label="Edit ${esc(rule.name)}">Edit</button><button class="danger" data-action="delete" data-key="${key}" data-index="${index}" aria-label="Delete ${esc(rule.name)}">Delete</button></div></div></article>`).join('')||'<p class="empty">No constraints in this group. Add one above.</p>'}</div></div></section>`;
}
function rulesPage(){
  main.innerHTML=heading('Scheduling rules','Record mandatory restrictions and weighted preferences.')+
    `<div class="constraint-intro"><div><span class="eyebrow">UNIVERSITY-WIDE SCHEDULING</span><h2>Requirements and preferences</h2><p>Hard restrictions describe requirements for a schedule. Soft restrictions record preferences for faculty review.</p></div><div class="constraint-totals"><button data-constraint-jump="hardConstraints-heading"><strong>${data.hardConstraints.length}</strong><span>Hard constraints</span></button><button data-constraint-jump="softConstraints-heading"><strong>${data.softConstraints.length}</strong><span>Soft objectives</span></button></div></div>`+
    `<div class="notice"><strong>Manage constraints.</strong> Choose Hard or Soft on each constraint. By default, soft constraints are listed from highest to lowest priority.</div>`+
    constraintSection('hardConstraints','Review institutional and physical restrictions before publishing the timetable.')+
    constraintSection('softConstraints','Use these priorities during faculty review. Schedule review ranks rooms using its seat fit and building preference settings.')+
    panel('Course & academic block relationships',`<p class="muted">Define cross-faculty academic conflict blocks (Same/Different Time or Day) and lecture-before-lab ordering constraints.</p>`+panel('Standard relationships (Academic blocks)',table('standardRules'),true)+panel('Order relationships (Prerequisite sequence in week)',table('orderRules'),true))+
    `<section class="panel"><div class="panel-content"><h2>Schedule checks</h2><p><a class="text-link" href="#issues">Schedule checks</a> evaluates room capacity, availability, resource overlaps, travel, turnaround gaps, cohort overlaps, and structured course relationships. Review other policy requirements with faculty before publishing.</p></div></section>`;
}

const intakeColumns=[
  ['Course',c=>c.code],['Course title',c=>c.name],['SU credit',c=>c.credits],['Open status',c=>c.openStatus],
  ['Double coded course',c=>c.doubleCodedCourse],['Special approval',c=>c.specialApproval],['Total hrs/week',c=>c.weeklyHours],
  ['Dist. of hours',c=>c.patterns],['Capacity',c=>c.capacity],['Number of sections',c=>c.plannedSections],
  ['Capacity of section',c=>c.sectionCapacity],['Part of term',c=>c.partOfTerm],['Course notes',c=>c.notes],
  ['Course coreq. rel.',c=>c.corequisites],['Instructors',c=>c.instructorRequest],['Class reqs',c=>c.classRequirements],
  ['Correction status',c=>c.correctionStatus],['Room',c=>c.roomRequest],['In schedule',c=>c.scheduleStatus||'On']
];
function facultyIntakeRegister(){
  return panel('Faculty intake register · Department spreadsheet (#2) columns',`<p class="muted">Mirrors the 18 columns collected from faculties via the internal intake system alongside catalogue ECTS. Instructor and Room columns record initial faculty requests; review placements in Schedule review or edit them per section.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Faculty intake register; scroll horizontally for all columns"><table class="intake-register"><thead><tr>${intakeColumns.map(([label])=>`<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${data.courses.map((course,index)=>`<tr data-intake-index="${index}">${intakeColumns.map(([,value],column)=>`<td>${column===0?`<a class="text-link" href="#courses/edit/${index}">${esc(value(course))}</a>`:value(course)!==''&&value(course)!==undefined?esc(value(course)):'<span class="muted">Not supplied</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,true);
}
function coursesPage(){
  const visible=['code','name','department','openStatus','patterns','weeklyHours','capacity','plannedSections'];
  const all=schemas.courses;
  let content;
  // The full schema remains available in add/detail forms and the intake register.
  try{schemas.courses=visible.map(key=>all.find(spec=>spec.key===key));content=table('courses');}finally{schemas.courses=all;}
  main.innerHTML=heading('Courses','Manage faculty intake submissions, alternative weekly patterns, and section enrollments.')+
    `<div class="notice"><strong>Department course intake.</strong> Faculties submit weekly hour patterns (e.g., 2+2, 3+1), section counts, capacities, double-coded links, corequisites, and room/instructor requests.</div>`+
    `<section class="panel"><div class="panel-content">${content}</div></section>`+facultyIntakeRegister();
}

const renderBeforePlanning=render;
render=function(){
  // Also covers reset, Undo, imported legacy workspaces, and presentation examples.
  normalizePlanningData(data);
  renderBeforePlanning();
  const [page,action,index]=(location.hash.slice(1)||'dashboard').split('/');
  if(page==='rules')rulesPage();
  if(page==='instructors'&&action==='edit'&&data.instructors[Number(index)]){
    main.insertAdjacentHTML('beforeend',staffConstraintsPanel(data.instructors[Number(index)]));
  }
  if(page==='courses'&&!action)coursesPage();
  if(page==='courses'&&action==='edit'&&data.courses[Number(index)]){
    main.querySelector('.page-heading p').textContent='Faculty intake attributes, alternative weekly patterns (e.g., 2+2 or 3+1), enrollment distributions, and section assignments.';
    main.querySelector('#detail-form').insertAdjacentHTML('afterbegin','<p class="notice"><strong>Faculty intake.</strong> Faculties specify candidate weekly hour distributions (<em>Dist. of hours</em>, e.g., 2+2, 3+1), section counts, capacities, double-coded courses, corequisites, and technical room requirements (<em>Class reqs</em>). Enrollment distributions by term and department inform cohort checks.</p>');
  }
  if(page==='dashboard')main.insertAdjacentHTML('beforeend',planningWorkflow());
  if(page==='general')main.insertAdjacentHTML('afterbegin','<div class="notice"><strong>University Inventory Spreadsheet (#1):</strong> configure campuses, buildings, classroom capacities & attributes, turnaround gaps, inter-building travel times, and the 08:40–19:30 academic time structure across all faculties. <a href="#rules">Review hard constraints and soft objectives →</a></div>');
  if(page==='help')main.insertAdjacentHTML('afterbegin',planningWorkflow());
};
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-constraint-jump]');
  if(target)document.getElementById(target.dataset.constraintJump)?.scrollIntoView({behavior:'smooth',block:'start'});
});
render();
