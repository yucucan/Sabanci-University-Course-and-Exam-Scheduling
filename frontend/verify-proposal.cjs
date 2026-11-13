// Actual delivered script order, catalogue and proposal interactions.
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,document=window.document,context=dom.getInternalVMContext();
const evaluate=code=>vm.runInContext(code,context);
const errors=[];
window.addEventListener('error',event=>errors.push(event.error||event.message));
window.confirm=()=>true;
window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
for(const script of scripts)evaluate(fs.readFileSync(path.join(__dirname,script),'utf8'));
const route=hash=>{window.location.hash=hash;evaluate('render()');};
const change=(selector,value)=>{const input=document.querySelector(selector);assert.ok(input,selector);input.value=value;input.dispatchEvent(new window.Event('change',{bubbles:true}));};
const visible=selector=>[...document.querySelectorAll(selector)].filter(el=>!el.hidden);
(async()=>{
try{
  assert.equal(evaluate('data.courses.length'),40);
  assert.equal(evaluate('new Set(data.courses.map(c=>c.code)).size'),40);
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS202').name"),'Data Structures');
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS202').catalogEcts"),6);
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS202').credits"),3);
  assert.equal(evaluate("data.courses.find(c=>c.code==='IF100').name"),'Computational Approaches to Problem Solving');
  assert.equal(evaluate("data.courses.some(c=>/^[A-Z]+4/.test(c.code))"),false);
  assert.equal(evaluate("data.courses.some(c=>c.code==='CS408'||c.code==='ME480'||c.code==='ME481')"),false);
  assert.equal(evaluate('validateImport(clone(data)).courses.length'),40);
  assert.equal(evaluate('scheduleIssues().length'),0);
  for(const hash of ['dashboard','general','instructors','classrooms','courses','rules','issues','planning','planning/session','planning/counterfactual','help','timetable','occupancy','occupancy/room/DEMO-101','instructors/schedule/demo.staff.1%40example.com','courses/edit/0','classrooms/edit/0','instructors/edit/0','login']){
    route(hash);assert.ok(document.querySelector('h1'),hash);
    assert.ok(document.title.startsWith('Defterdar'),hash);
    assert.ok(!document.querySelector('#main').textContent.includes('Kitai'),hash);
    assert.doesNotMatch(document.title+' '+document.body.textContent,
      /\b(?:draft|proposal|proposed|prototype)\b|About these examples|Load presentation example/i,hash);
  }
  const feedbackRecords=[];
  let rejectFeedback=false;
  let staticFeedback=false;
  const olderFeedback=Array.from({length:51},(_,index)=>({kind:'bug',summary:'Older bug '+index,details:'Earlier feedback'}));
  window.fetch=async (url,options)=>{
    if(staticFeedback)return {ok:false,status:404};
    if(url==='/api/feedback?all=1')return {ok:true,json:async()=>({entries:[...feedbackRecords,...olderFeedback],complete:true})};
    assert.equal(url,'/api/feedback');
    if(options?.method==='POST'){
      if(rejectFeedback)return {ok:false};
      feedbackRecords.unshift(JSON.parse(options.body));
      return {ok:true};
    }
    return {ok:true,json:async()=>({entries:[...feedbackRecords]})};
  };
  const settleFeedback=()=>new Promise(resolve=>setTimeout(resolve,0));
  route('feedback');
  await settleFeedback();
  assert.equal(document.querySelector('#main h1').textContent,'Improvements and bugs');
  assert.ok(document.querySelector('#sidebar a[href="#feedback"].active'));
  const feedbackForm=document.querySelector('#feedback-form');
  const saveFeedback=(summary,details)=>{
    feedbackForm.elements.summary.value=summary;
    feedbackForm.elements.details.value=details;
    feedbackForm.querySelector('button[type="submit"]').click();
  };
  saveFeedback('   ','Steps to reproduce');
  assert.equal(feedbackRecords.length,0);
  change('#feedback-form select','bug');
  assert.match(document.querySelector('#feedback-details-note').textContent,/steps/);
  rejectFeedback=true;
  saveFeedback('Room filter issue','Steps to reproduce');
  await settleFeedback();
  assert.equal(feedbackForm.elements.summary.value,'Room filter issue');
  rejectFeedback=false;
  saveFeedback('Room filter issue','Steps to reproduce\n<img src=x onerror=alert(1)>');
  await settleFeedback();
  assert.match(document.querySelector('#feedback-details-note').textContent,/scheduling task/);
  saveFeedback('Show archived schedules','Compare against the prior semester.');
  await settleFeedback();
  route('dashboard');
  route('feedback');
  await settleFeedback();
  assert.equal(document.querySelector('#feedback-improvements h3').textContent,'Show archived schedules');
  const reportedBug=document.querySelector('#feedback-bugs li');
  assert.equal(reportedBug.querySelector('h3').textContent,'Room filter issue');
  assert.equal(reportedBug.querySelector('img'),null);
  assert.match(reportedBug.querySelector('p').textContent,/\n<img src=x/);
  const downloads=[];
  window.captureFeedbackDownload=(filename,entries)=>downloads.push({filename,entries});
  evaluate('const originalJsonDownload=downloadJson;downloadJson=captureFeedbackDownload;');
  document.querySelector('#download-feedback').click();
  await settleFeedback();
  assert.equal(downloads[0].filename,'defterdar-feedback.json');
  assert.equal(downloads[0].entries.length,53);
  assert.deepEqual(downloads[0].entries.slice(0,2).map(entry=>entry.kind),['improvement','bug']);
  staticFeedback=true;
  route('dashboard');
  route('feedback');
  await settleFeedback();
  assert.match(document.querySelector('#feedback-visibility').textContent,/saved in this browser/);
  const localForm=document.querySelector('#feedback-form');
  localForm.elements.summary.value='Offline suggestion';
  localForm.elements.details.value='Make exam filters easier to find.';
  localForm.querySelector('button[type="submit"]').click();
  assert.equal(evaluate('readLocalFeedback().length'),1);
  document.querySelector('#download-feedback').click();
  assert.equal(downloads[1].entries[0].summary,'Offline suggestion');
  evaluate('downloadJson=originalJsonDownload;');

  route('exams');
  assert.equal(document.querySelector('#main h1').textContent,'Exam scheduling');
  assert.ok(document.querySelector('#sidebar a[href="#exams"].active'));
  const examListPanel=document.querySelector('[data-key="exams"]').closest('section');
  assert.ok(examListPanel.nextElementSibling.querySelector('[data-key="examWindows"]'));
  assert.equal(document.querySelector('#generate-exam-review'),null);
  const addExamRecord=(key,values)=>{
    document.querySelector(`[data-action="add"][data-key="${key}"]`).click();
    const form=document.querySelector('#edit-form');
    for(const [key,value] of Object.entries(values))form.elements[key].value=value;
    form.querySelector('[type="submit"]').click();
  };
  const examInput={course:'CS202',type:'Midterm',duration:60,demand:15,invigilator:'demo.staff.1@example.com'};
  document.querySelector('[data-action="add"][data-key="exams"]').click();
  const examForm=document.querySelector('#edit-form');
  assert.equal(examForm.elements.preferredClassroomType.value,'');
  assert.equal(examForm.elements.preferredClassroomType.options.length,evaluate('data.classroomTypes.length+1'));
  for(const name of ['date','start','end','classroom'])assert.equal(examForm.elements.namedItem(name),null);
  document.querySelector('#cancel').click();
  addExamRecord('exams',examInput);
  assert.equal(evaluate('data.exams.filter(examIsAssigned).length'),0);
  document.querySelector('[data-action="edit"][data-key="exams"]').click();
  examForm.elements.date.value='2026-11-21';
  examForm.querySelector('[type="submit"]').click();
  assert.equal(evaluate('data.exams[0].date'),'');
  examForm.elements.start.value='09:00';
  examForm.elements.end.value='10:00';
  examForm.elements.classroom.value='DEMO-101';
  examForm.querySelector('[type="submit"]').click();
  addExamRecord('exams',examInput);
  const preferredClassroomType=evaluate('data.classroomTypes[0].name');
  addExamRecord('exams',{...examInput,type:'Final',duration:90,preferredClassroomType});
  addExamRecord('exams',{...examInput,demand:500});
  addExamRecord('examWindows',{type:'Midterm',date:'2026-11-21',start:'09:00',end:'11:00'});
  addExamRecord('examWindows',{type:'Final',date:'2026-12-19',start:'13:00',end:'15:00'});
  const allocationLink=document.querySelector('#sidebar a[href="#exam-allocation"]');
  assert.equal(allocationLink.querySelector('span').textContent,'Allocate rooms and times');
  route(allocationLink.hash);
  assert.equal(document.querySelector('#main h1').textContent,'Allocate rooms and times');
  assert.ok(allocationLink.classList.contains('active'));
  assert.equal(document.querySelector('[data-key="exams"],[data-key="examWindows"]'),null);
  route('exams/allocate');
  assert.equal(window.location.hash,'#exam-allocation');
  document.querySelector('#generate-exam-review').click();
  assert.equal(evaluate('data.exams.filter(examIsAssigned).length'),1);
  assert.match(document.querySelector('#exam-review-title').parentElement.textContent,/2 proposed · 1 awaiting allocation/);
  assert.match(document.querySelector('#exam-review-title').parentElement.textContent,/No classroom seats 500 students/);
  document.querySelector('#apply-exam-review').click();
  assert.deepEqual(JSON.parse(evaluate('JSON.stringify(data.exams.slice(0,3).map(exam=>[exam.date,exam.start,exam.end]))')),[
    ['2026-11-21','09:00','10:00'],['2026-11-21','10:00','11:00'],['2026-12-19','13:00','14:30']
  ]);
  assert.equal(evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY)).exams.filter(examIsAssigned).length'),3);
  route(document.querySelector('#main a[href="#exams"]').hash);
  assert.match(document.querySelector('[data-key="exams"] tbody').textContent,/2026-12-19.*13:00.*14:30/);
  assert.equal(evaluate('validateImport(clone(data)).examWindows.length'),2);
  assert.equal(evaluate('validateImport(clone(data)).exams[2].preferredClassroomType'),preferredClassroomType);
  assert.equal(evaluate("validateImport((()=>{const old=clone(data);delete old.exams[0].duration;return old})()).exams[0].duration"),60);
  assert.equal(evaluate("validateImport((()=>{const old=clone(data);delete old.exams;delete old.examWindows;return old})()).examWindows.length"),0);
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.exams.filter(examIsAssigned).length'),1);
  for(let index=0;index<7;index++)document.querySelector('#undo').click();
  assert.equal(evaluate('data.exams.length'),0);
  assert.deepEqual(JSON.parse(evaluate(`JSON.stringify(inspectWorkspace(clone(data),()=>{
    const session=allSessions().find(isScheduled);
    const weekday=days.findIndex(day=>day.toUpperCase()===session.day);
    const date='2026-11-'+(16+weekday);
    const room=data.classrooms.find(room=>room.code===session.classroom);
    room.availability={};
    data.classrooms=[room];
    data.examWindows=[{type:'Midterm',date,start:session.start,end:session.end}];
    data.exams=[{type:'Midterm',course:session.course,demand:1,duration:minutes(session.end)-minutes(session.start)}];
    const conflicts=buildExamReview(true).placements.length;
    const noClasses=buildExamReview(false).placements.length;
    room.availability[weekday+'-'+Number(session.start.slice(0,2))]='Unavailable';
    const unavailable=buildExamReview(false).placements.length;
    return [conflicts,noClasses,unavailable];
  }))`)),[0,1,0]);
  assert.deepEqual(JSON.parse(evaluate(`JSON.stringify(inspectWorkspace(clone(data),()=>{
    const date='2026-11-16';
    const preferred={code:'LAB',type:'Lab',capacity:40,availability:{'0-8':'Unavailable'}};
    data.classrooms=[{code:'STANDARD',type:'Classroom',capacity:30},preferred];
    data.examWindows=[{type:'Midterm',date,start:'08:40',end:'10:30'}];
    data.exams=[{type:'Midterm',course:'CS202',demand:30,duration:50,preferredClassroomType:'Lab'}];
    const preferredAssignment=buildExamReview(false).placements[0].assignment;
    preferred.capacity=20;
    const fallbackAssignment=buildExamReview(false).placements[0].assignment;
    return [preferredAssignment.classroom,preferredAssignment.start,fallbackAssignment.classroom,fallbackAssignment.start];
  }))`)),['LAB','09:40','STANDARD','08:40']);
  // All list records appear initially; filtering tools are hidden, not applied by default.
  for(const [page,selector,count]of [['instructors','.staff-result',10],['classrooms','.room-result',8],['courses','.data-table[data-key="courses"] tbody tr',40]]){
    evaluate(`resetViewFilters('${page}')`);route(page);
    assert.equal(visible(selector).length,count,page);
    assert.equal(document.querySelector('#view-filter-panel').hidden,true,page);
    assert.equal(document.querySelector('#view-sort-panel').hidden,true,page);
    document.querySelector('[data-toggle-controls="filters"]').click();
    assert.equal(document.querySelector('#view-filter-panel').hidden,false);
    document.querySelector('[data-toggle-controls="filters"]').click();
    assert.equal(document.querySelector('#view-filter-panel').hidden,true);
  }
  route('instructors');
  const staffSearch=document.querySelector('#staff-search');staffSearch.value='ipek';staffSearch.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(visible('.staff-result').length,1);
  assert.ok(visible('.staff-result')[0].textContent.includes('İpek Demo'));
  staffSearch.value='';staffSearch.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(visible('.staff-result').length,10);
  assert.equal(document.querySelector('#staff-day').value,'');
  assert.equal(document.querySelector('#staff-start').value,'08:40');
  assert.equal(document.querySelector('#staff-end').value,'19:30');
  change('#view-sort','hours-desc');
  assert.ok(document.querySelector('.staff-result').textContent.includes('Deniz Demo'));
  change('#view-sort','hours');
  const hours = [...document.querySelectorAll('.staff-result')].map(row=>Number(row.cells[3].textContent.match(/^[\d.]+/)[0]));
  assert.deepEqual(hours,[...hours].sort((a,b)=>a-b));
  change('#view-sort','name-desc');
  const names=[...document.querySelectorAll('.staff-result .room-name strong')].map(el=>el.textContent);
  assert.deepEqual(names,[...names].sort((a,b)=>b.localeCompare(a,'en',{numeric:true,sensitivity:'base'})));
  route('classrooms');
  assert.equal(document.querySelector('#finder-day').value,'');
  assert.equal(document.querySelector('#finder-start').value,'08:40');
  assert.equal(document.querySelector('#finder-end').value,'19:30');
  change('#view-sort','capacity-desc');
  assert.ok(document.querySelector('.room-result').textContent.includes('DEMO-201'));
  change('#room-min-seats','82');
  assert.equal(document.querySelectorAll('.room-result').length,2);
  evaluate("resetViewFilters('classrooms')");route('classrooms');
  change('#finder-status','free');
  assert.ok(document.querySelectorAll('.room-result').length<8);
  document.querySelector('nav a[href="#classrooms"]').click();evaluate('render()');
  assert.equal(document.querySelectorAll('.room-result').length,8);
  assert.equal(document.querySelector('#view-filter-panel').hidden,true);

  // Course filters support arbitrary capacities, unknown values, keyboard search and sorting.
  evaluate("resetViewFilters('courses')");route('courses');
  const search=document.querySelector('#course-search');search.value='CS202';search.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,1);
  assert.equal(visible('[data-intake-index]').length,1);
  assert.ok(document.querySelector('[data-clear-view]'));
  document.querySelector('[data-clear-view]').click();
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,40);
  change('#course-department','IE');
  const subjectColumn=document.querySelector('[data-sort="department"]').closest('th').cellIndex;
  assert.ok(visible('.data-table[data-key="courses"] tbody tr').every(row=>row.cells[subjectColumn].textContent==='IE'));
  change('#course-department','');change('#course-min','137');
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,1);
  change('#course-min','');change('#view-sort','capacity-desc');
  assert.equal(document.querySelector('.data-table[data-key="courses"] tbody tr').cells[0].textContent,'MATH101');
  change('#course-min','99999');
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,0);
  evaluate("resetViewFilters('courses')");

  // Rule conversions preserve text and importance, support zero, and participate in Undo/import.
  route('rules');
  const hardCount=evaluate('data.hardConstraints.length'),softCount=evaluate('data.softConstraints.length');
  assert.equal(document.querySelector('[name="source"]'),null);
  assert.equal(evaluate('schemas.hardConstraints.some(s=>s.key===\'source\')'),false);
  const originalRules=evaluate('JSON.stringify([data.hardConstraints,data.softConstraints])');
  const priorities=[...document.querySelectorAll('.soft [data-rule-importance]')].map(input=>Number(input.value));
  assert.deepEqual(priorities,[...priorities].sort((a,b)=>b-a));
  change('[data-constraint-type="hardConstraints"][data-index="0"]','Soft');
  assert.equal(evaluate('data.hardConstraints.length'),hardCount-1);
  assert.equal(evaluate('data.softConstraints.length'),softCount+1);
  assert.equal(evaluate('data.softConstraints.at(-1).importance'),50);
  change(`[data-rule-importance="${softCount}"]`,'0');
  assert.equal(evaluate('data.softConstraints.at(-1).importance'),0);
  change(`[data-rule-importance="${softCount}"]`,'101');
  assert.equal(evaluate('data.softConstraints.at(-1).importance'),0);
  assert.equal(document.querySelector(`[data-rule-importance="${softCount}"]`).value,'0');
  change(`[data-constraint-type="softConstraints"][data-index="${softCount}"]`,'Hard');
  assert.equal(evaluate('data.hardConstraints.at(-1).importance'),0);
  change(`[data-constraint-type="hardConstraints"][data-index="${hardCount-1}"]`,'Soft');
  assert.equal(evaluate('data.softConstraints.at(-1).importance'),0);
  assert.equal(evaluate('validateImport(clone(data)).softConstraints.at(-1).importance'),0);
  for(let i=0;i<4;i++)document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify([data.hardConstraints,data.softConstraints])'),originalRules);
  document.querySelector('[data-convert-rule="standardRules"]').click();
  assert.equal(evaluate('data.standardRules[0].enforcement'),'Soft');
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.standardRules[0].enforcement'),'Hard');
  assert.throws(()=>evaluate('const invalidWeight=clone(data);invalidWeight.softConstraints[0].importance=101;validateImport(invalidWeight)'));
  document.querySelector('[data-action="add"][data-key="hardConstraints"]').click();
  const constraintForm=document.querySelector('#edit-form');
  const staffOptions=[...constraintForm.elements.staffEmails.options];
  const staffSelected=[
    staffOptions.find(option=>option.textContent.includes(' · Instructor · ')),
    staffOptions.find(option=>option.textContent.includes(' · Teaching Assistant · ')),
    staffOptions.find(option=>option.textContent.includes(' · Learning Assistant · '))
  ];
  staffSelected.forEach(option=>{option.selected=true;});
  constraintForm.elements.name.value='Linked staff test';
  constraintForm.elements.scope.value='Teaching team';
  constraintForm.elements.requirement.value='Review this requirement with the teaching team.';
  constraintForm.querySelector('[type="submit"]').click();
  const linkedEmails=staffSelected.map(option=>option.value);
  assert.deepEqual(JSON.parse(evaluate('JSON.stringify(data.hardConstraints.at(-1).staffEmails)')).sort(),linkedEmails.sort());
  const linkedCard=document.querySelector(`[data-constraint-key="hardConstraints"][data-constraint-index="${hardCount}"]`);
  assert.equal(linkedCard.querySelectorAll('.constraint-staff a').length,3);
  change(`[data-constraint-type="hardConstraints"][data-index="${hardCount}"]`,'Soft');
  assert.deepEqual(JSON.parse(evaluate('JSON.stringify(validateImport(clone(data)).softConstraints.at(-1).staffEmails)')).sort(),linkedEmails);
  assert.throws(()=>evaluate("validateImport({...clone(data),hardConstraints:[{...data.hardConstraints[0],staffEmails:['unknown@example.com']}]})"),/existing teaching staff/);
  const linkedStaffIndex=evaluate(`data.instructors.findIndex(person=>person.email===${JSON.stringify(linkedEmails[0])})`);
  assert.ok(evaluate(`referenceLinks('instructors',data.instructors[${linkedStaffIndex}]).some(link=>link.prop==='staffEmails')`));
  assert.ok(evaluate(`inspectWorkspace(clone(data),()=>{
    const person=data.instructors[${linkedStaffIndex}];
    renameReferences('instructors',person,{...person,email:'renamed@example.com'});
    return data.softConstraints.at(-1).staffEmails.includes('renamed@example.com');
  })`));
  route(`instructors/edit/${linkedStaffIndex}`);
  const linkedRuleButton=document.querySelector(`[data-action="edit"][data-key="softConstraints"][data-index="${softCount}"]`);
  assert.equal(linkedRuleButton.textContent,'Linked staff test');
  linkedRuleButton.click();
  assert.deepEqual([...constraintForm.elements.staffEmails.selectedOptions].map(option=>option.value).sort(),linkedEmails);
  document.querySelector('#cancel').click();
  document.querySelector('#undo').click();
  document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify([data.hardConstraints,data.softConstraints])'),originalRules);

  // A full teaching grid starts at :40, shows empty slots, and supports weekends.
  route('timetable');
  assert.equal(document.querySelectorAll('.proposal-day-track').length,5);
  assert.equal(document.querySelectorAll('.proposal-empty-slot').length,55);
  assert.equal(document.querySelector('.proposal-time-axis span').textContent.trim().slice(0,5),'08:40');
  assert.ok(document.querySelector('.proposal-time-axis').textContent.includes('18:40'));
  assert.equal(document.querySelectorAll('.session-card').length,13);
  assert.equal(document.querySelector('#timetable-course').closest('label').firstChild.textContent,'Courses');
  change('#timetable-course','CS202');
  assert.equal(document.querySelectorAll('.session-card').length,2);
  assert.equal(document.querySelectorAll('.proposal-empty-slot').length,55);
  evaluate("resetViewFilters('timetable');data.courses.find(c=>c.code==='CS202').sections.push({...data.courses.find(c=>c.code==='CS202').sections[0],name:'CS202.makeup',day:'SATURDAY',start:'08:40',end:'10:30'})");
  route('timetable');
  assert.equal(document.querySelectorAll('.proposal-day-track').length,7);
  assert.ok(document.querySelector('[data-calendar-day="SATURDAY"]').textContent.includes('CS202.makeup'));
  assert.ok(evaluate("isScheduled(allSessions().find(s=>s.name==='CS202.makeup'))"));
  evaluate("data.instructors[0].availability={'5-9':'Unavailable'}");
  assert.ok(evaluate("scheduleIssues().some(i=>i.title==='Instructor unavailable'&&i.description.includes('CS202.makeup'))"));
  assert.equal(evaluate('validateImport(clone(data)).courses.length'),40);
  evaluate('data=clone(window.EXAMPLE_DATA)');
  route('general');
  assert.equal(document.querySelector('.data-table[data-key="buildingScores"]'),null);
  assert.ok(evaluate("options(schemas.timeStructure[0].options).includes('Saturday')"));
  assert.ok(evaluate("options(schemas.timeStructure[0].options).includes('Sunday')"));
  assert.ok([...document.querySelectorAll('.data-table .toolbar')].every(toolbar=>toolbar.textContent.includes('Filters')&&toolbar.textContent.includes('Sort')));

  // Heatmap uses teaching blocks, with weekend cells included only when requested.
  route('occupancy');
  assert.equal(document.querySelectorAll('.heat-cell').length,55);
  assert.equal(document.querySelector('#occupancy-step'),null);
  document.querySelector('#occupancy-weekends').click();
  assert.equal(document.querySelectorAll('.heat-cell').length,77);
  assert.equal(document.querySelector('[data-inspect-day="MONDAY"]').dataset.inspectStart,'08:40');
  assert.equal(document.querySelector('[data-inspect-day="MONDAY"]').dataset.inspectEnd,'09:30');
  evaluate("data.timeStructure.push({day:'Saturday',start:'20:40',end:'21:30'})");route('occupancy');
  assert.ok(document.querySelector('[data-inspect-day="SATURDAY"][data-inspect-start="20:40"]'));
  document.querySelector('[data-inspect-day="SATURDAY"][data-inspect-start="20:40"]').click();
  document.querySelector('#occupancy-weekends').click();
  assert.equal(document.querySelector('#slot-heading'),null);
  assert.equal(document.querySelectorAll('.heat-cell').length,55);
  evaluate('data=clone(window.EXAMPLE_DATA)');

  // Create sections directly from a catalogue course before staffing or scheduling.
  route('courses');
  const emptyCourse=evaluate("data.courses.findIndex(course=>course.sections.length===0)");
  const sectionLink=document.querySelector(`[data-key="courses"] tr[data-row-index="${emptyCourse}"] a.text-link`);
  assert.equal(sectionLink.textContent,'Add sections');
  route(sectionLink.hash);
  const sectionTable=document.querySelector('[data-key="sections"]');
  assert.ok(sectionTable.closest('details').open);
  const labTable=document.querySelector('[data-key="labs"]');
  assert.equal(sectionTable.closest('details').nextElementSibling,labTable.closest('details'));
  const addSection=name=>{
    document.querySelector('[data-key="sections"] [data-action="add"]').click();
    const form=document.querySelector('#edit-form');
    form.elements.name.value=name;
    form.elements.demand.value='25';
    form.querySelector('[type="submit"]').click();
  };
  addSection('Section A');
  addSection('Section B');
  assert.equal(evaluate(`data.courses[${emptyCourse}].sections.length`),2);
  addSection('Section B');
  assert.equal(evaluate(`data.courses[${emptyCourse}].sections.length`),2);
  document.querySelector('#cancel').click();
  assert.equal(evaluate(`validateImport(clone(data)).courses[${emptyCourse}].sections[0].instructor`),'');
  assert.equal(evaluate(`allSessions().filter(s=>s.courseIndex===${emptyCourse}&&s.kind==='Section'&&!isScheduled(s)).length`),2);
  document.querySelector('[data-key="labs"] [data-action="add"]').click();
  const labForm=document.querySelector('#edit-form');
  assert.deepEqual([...labForm.elements.linkedSection.options].map(option=>option.value),['','Section A','Section B']);
  labForm.elements.name.value='Recitation 1';
  labForm.elements.activityType.value='Recitation';
  labForm.elements.linkedSection.value='Section A';
  labForm.elements.demand.value='25';
  labForm.querySelector('[type="submit"]').click();
  assert.equal(evaluate(`validateImport(clone(data)).courses[${emptyCourse}].labs[0].linkedSection`),'Section A');
  assert.equal(evaluate(`sessionType(allSessions().find(s=>s.courseIndex===${emptyCourse}&&s.name==='Recitation 1'))`),'Recitation');
  assert.match(evaluate(`deletionBlock('sections',0,${emptyCourse})`),/used/);
  assert.throws(()=>evaluate(`inspectWorkspace(clone(data),()=>{
    data.courses[${emptyCourse}].labs[0].linkedSection='Missing section';
    validateImport(clone(data));
  })`),/linked lecture section/i);
  document.querySelector('[data-key="sections"] [data-action="edit"][data-index="0"]').click();
  labForm.elements.name.value='Section A revised';
  labForm.querySelector('[type="submit"]').click();
  assert.equal(evaluate(`data.courses[${emptyCourse}].labs[0].linkedSection`),'Section A revised');
  assert.ok(evaluate(`inspectWorkspace(clone(data),()=>{
    const course=data.courses[${emptyCourse}];
    const time={day:'MONDAY',start:'08:40',end:'09:30'};
    Object.assign(course.sections[0],time);
    Object.assign(course.labs[0],time);
    return scheduleIssues().some(issue=>issue.courseIndex===${emptyCourse}&&issue.title==='Linked lecture overlap');
  })`));
  document.querySelector('#undo').click();
  document.querySelector('#undo').click();
  document.querySelector('#undo').click();
  document.querySelector('#undo').click();
  assert.equal(evaluate(`data.courses[${emptyCourse}].sections.length`),0);

  // A section can have a two-block meeting and a separate one-block meeting.
  assert.equal(evaluate("teachingBlockCount('08:40','11:30')"),3);
  assert.ok(evaluate("configuredBlocks(170).some(s=>s.start==='08:40'&&s.end==='11:30')"));
  assert.equal(evaluate("configuredBlocks(230).length"),0);
  const splitIndex=evaluate("data.courses.findIndex(c=>c.code==='CS201')");
  route(`courses/edit/${splitIndex}`);
  document.querySelector('.data-table[data-key="sections"] [data-action="edit"]').click();
  const sectionForm=document.querySelector('#edit-form');
  sectionForm.querySelector('[data-add-meeting]').click();
  sectionForm.querySelector('[data-meeting-field="day"]').value='TUESDAY';
  sectionForm.querySelector('[data-meeting-field="end"]').value='09:10';
  sectionForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate("allSessions().filter(s=>s.name==='CS201.A').length"),1);
  sectionForm.querySelector('[data-meeting-field="end"]').value='09:30';
  sectionForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate("allSessions().filter(s=>s.name==='CS201.A').length"),2);
  assert.equal(evaluate("new Set(allSessions().filter(s=>s.name==='CS201.A').map(sessionKey)).size"),2);
  assert.equal(evaluate("validateImport(clone(data)).courses.find(c=>c.code==='CS201').sections[0].additionalMeetings[0].end"),'09:30');
  assert.ok(evaluate("roomWindow(data.classrooms.find(r=>r.code==='DEMO-101'),'TUESDAY','08:40','09:30').sessions.some(s=>s.name==='CS201.A'&&s.meetingIndex===1)"));
  route('timetable');
  assert.ok(document.querySelector('[data-calendar-day="TUESDAY"]').textContent.includes('CS201.A · Meeting 2'));
  document.querySelector('#undo').click();

  // Keyboard-entered percentages stay complementary and reject invalid input.
  route('planning/session');change('#planning-seat-weight','23');
  assert.equal(evaluate('planningView.spaceWeight'),23);
  assert.equal(document.querySelector('#planning-building-weight').value,'77');
  change('#planning-building-weight','12');
  assert.equal(document.querySelector('#planning-seat-weight').value,'88');
  assert.equal(document.querySelector('#planning-weight').value,'88');
  change('#planning-seat-weight','101');
  assert.equal(document.querySelector('#planning-seat-weight').value,'88');
  change('#planning-seat-weight','0');
  assert.equal(evaluate('planningView.spaceWeight'),0);

  // Unlimited capacities are genuine editable numbers, not fixed example selections.
  route('classrooms/edit/0');
  const roomForm=document.querySelector('#detail-form');roomForm.elements.capacity.value='12347';
  assert.equal(roomForm.elements.capacity.getAttribute('max'),null);
  roomForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate('data.classrooms[0].capacity'),12347);
  document.querySelector('#undo').click();
  route('courses/edit/0');
  const courseForm=document.querySelector('#detail-form');courseForm.elements.capacity.value='11113';
  courseForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate('data.courses[0].capacity'),11113);
  assert.equal(evaluate('validateImport(clone(data)).courses[0].capacity'),11113);
  document.querySelector('#undo').click();

  // The new presentation scenario keeps unique catalogue codes and has a repairable conflict.
  const beforeScenario=evaluate('JSON.stringify(data)');evaluate('loadPresentationExample()');
  assert.equal(evaluate('validateImport(clone(data)).courses.length'),40);
  assert.ok(evaluate("scheduleIssues().some(i=>i.title==='Room capacity overflow'&&i.description.includes('IE311.B'))"));
  evaluate("planningView.session=sessionKey(allSessions().find(s=>s.name==='IE311.B'))");route('planning/session');
  const repair=document.querySelector('[data-apply-room="DEMO-103"]');assert.equal(repair.disabled,false);repair.click();
  assert.ok(!evaluate("scheduleIssues().some(i=>i.title==='Room capacity overflow'&&i.description.includes('IE311.B'))"));
  document.querySelector('#undo').click();document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify(data)'),beforeScenario);
  route('help');
  assert.equal(document.querySelectorAll('.guide-function').length,10);
  assert.ok(!document.querySelector('#main').textContent.includes('Customize the files'));
  assert.ok(document.querySelector('#main').textContent.includes('Filters'));
  assert.ok(document.querySelector('#main').textContent.includes('Undo'));
  assert.deepEqual([...document.querySelectorAll('nav a span')].slice(0,2).map(el=>el.textContent),['Overview','General']);

  // Semester inclusion removes sessions from the live plan while retaining all stored assignments.
  const beforeInclusion=evaluate('JSON.stringify(data)');
  const cs202Index=evaluate("data.courses.findIndex(c=>c.code==='CS202')");
  const cs202Assignments=evaluate("JSON.stringify([data.courses.find(c=>c.code==='CS202').sections,data.courses.find(c=>c.code==='CS202').labs])");
  const originalHours=evaluate('occupiedMinutes(sessionsForStaff(data.instructors[0],true))');
  evaluate("resetViewFilters('courses')");route('courses');
  document.querySelector(`[data-course-schedule="${cs202Index}"]`).click();
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS202').scheduleStatus"),'Off');
  assert.equal(document.querySelector(`[data-course-schedule="${cs202Index}"]`).getAttribute('aria-checked'),'false');
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,40);
  assert.equal(evaluate('allSessions().length'),11);
  assert.equal(evaluate('allSessions({includeDisabled:true}).length'),13);
  assert.equal(evaluate("JSON.stringify([data.courses.find(c=>c.code==='CS202').sections,data.courses.find(c=>c.code==='CS202').labs])"),cs202Assignments);
  assert.ok(evaluate('occupiedMinutes(sessionsForStaff(data.instructors[0],true))')<originalHours);
  assert.equal(evaluate("roomWindow(data.classrooms.find(r=>r.code==='DEMO-PC1'),'FRIDAY','16:40','18:30').free"),true);
  assert.equal(evaluate("staffWindow(data.instructors[6],'FRIDAY','16:40','18:30').free"),true);
  assert.equal(evaluate("JSON.parse(localStorage.getItem(STORAGE_KEY)).courses.find(c=>c.code==='CS202').scheduleStatus"),'Off');
  assert.equal(evaluate("validateImport(clone(data)).courses.find(c=>c.code==='CS202').scheduleStatus"),'Off');
  assert.throws(()=>evaluate("const badInclusion=clone(data);badInclusion.courses[0].scheduleStatus='Maybe';validateImport(badInclusion)"));
  change('#course-schedule-status','Off');
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,1);
  assert.equal(visible('[data-intake-index]').length,1);
  change('#course-schedule-status','On');
  assert.equal(visible('.data-table[data-key="courses"] tbody tr').length,39);
  evaluate("timetableFilters.course='CS202'");route('timetable');
  assert.equal(evaluate('timetableFilters.course'),'');
  assert.equal(document.querySelectorAll('.session-card').length,11);
  assert.ok(!document.querySelector('.proposal-calendar').textContent.includes('CS202'));
  assert.equal(document.querySelector('#timetable-course option[value="CS202"]'),null);
  route('planning/session');
  assert.ok([...document.querySelector('#planning-session').options].every(option=>!option.textContent.includes('CS202')));
  // Integrity guards still consider assignments in courses excluded from the schedule.
  assert.ok(evaluate("deletionBlock('classrooms',data.classrooms.findIndex(r=>r.code==='DEMO-PC1')).includes('used')"));
  evaluate("data.courses.find(c=>c.code==='CS201').scheduleStatus='Off'");
  assert.ok(evaluate("validate({...data.instructors[6],role:'Instructor'},'instructors',6).includes('assignments')"));
  evaluate("data.courses.find(c=>c.code==='CS201').scheduleStatus='On'");
  // Inactive courses do not contribute warnings, unscheduled sessions, or capacity conflicts.
  evaluate("const excludedCourse=data.courses.find(c=>c.code==='CS202');excludedCourse.distributions[0].percentage=10;excludedCourse.sections[0].demand=99999;excludedCourse.labs[0].day=''");
  assert.equal(evaluate("scheduleIssues().some(issue=>issue.courseIndex===data.courses.findIndex(c=>c.code==='CS202'))"),false);
  document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify(data)'),beforeInclusion);
  evaluate("resetViewFilters('courses')");route('courses');
  document.querySelector(`[data-course-schedule="${cs202Index}"]`).click();
  document.querySelector(`[data-course-schedule="${cs202Index}"]`).click();
  assert.equal(evaluate('JSON.stringify(data)'),beforeInclusion);
  assert.equal(evaluate('allSessions().length'),13);
  // The details form also controls inclusion, including a plan with no enabled courses.
  route('courses/edit/'+cs202Index);
  const inclusionForm=document.querySelector('#detail-form');inclusionForm.elements.scheduleStatus.value='Off';
  inclusionForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS202').scheduleStatus"),'Off');
  document.querySelector('#undo').click();
  evaluate("data.courses.forEach(c=>c.scheduleStatus='Off')");route('timetable');
  assert.equal(document.querySelectorAll('.session-card').length,0);
  assert.equal(document.querySelectorAll('.proposal-empty-slot').length,55);
  route('planning');assert.equal(document.querySelectorAll('[data-apply-room]').length,0);
  assert.equal(evaluate('scheduleIssues().length'),0);
  evaluate('data=clone(window.EXAMPLE_DATA)');

  // Real script-order reload preserves a new save, leaves old storage untouched, and restores older rules safely.
  evaluate("data.courses.find(c=>c.code==='CS202').scheduleStatus='Off';persist()");
  const savedWorkspace=evaluate('JSON.stringify(data)');
  const legacyWorkspace=evaluate("JSON.stringify((()=>{const legacy=clone(data);delete legacy.hardConstraints;delete legacy.softConstraints;for(const c of legacy.courses)delete c.scheduleStatus;for(const r of [...legacy.standardRules,...legacy.orderRules]){delete r.enforcement;delete r.importance;}legacy.courses[0].notes='Earlier browser data';return legacy;})())");
  const restored=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
  try{
    restored.window.confirm=()=>true;
    restored.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    restored.window.localStorage.setItem('defterdar-proposal-v2',savedWorkspace);
    restored.window.localStorage.setItem('kitai-static-demo-v1',legacyWorkspace);
    const reloadContext=restored.getInternalVMContext();
    for(const script of scripts)vm.runInContext(fs.readFileSync(path.join(__dirname,script),'utf8'),reloadContext);
    assert.equal(vm.runInContext('JSON.stringify(data)',reloadContext),savedWorkspace);
    assert.equal(vm.runInContext("data.courses.find(c=>c.code==='CS202').scheduleStatus",reloadContext),'Off');
    restored.window.document.querySelector('#restore-earlier-demo').click();
    assert.equal(vm.runInContext('data.courses[0].notes',reloadContext),'Earlier browser data');
    assert.equal(vm.runInContext('data.hardConstraints.length',reloadContext),hardCount);
    assert.equal(vm.runInContext('data.standardRules[0].importance',reloadContext),50);
    assert.equal(vm.runInContext("data.courses.every(c=>c.scheduleStatus==='On')",reloadContext),true);
    assert.equal(restored.window.localStorage.getItem('kitai-static-demo-v1'),legacyWorkspace);
    restored.window.document.querySelector('#undo').click();
    assert.equal(vm.runInContext('JSON.stringify(data)',reloadContext),savedWorkspace);
  }finally{restored.window.close();}

  // Candidate generation is read-only until Apply and respects locked times.
  route('planning');
  evaluate('loadPresentationExample(true)');
  const manualSchedule=evaluate('JSON.stringify(data)');
  const beforeIssues=evaluate('scheduleIssues().length');
  document.querySelector('[data-generate-schedule]').click();
  assert.equal(evaluate('JSON.stringify(data)'),manualSchedule);
  assert.ok(evaluate('scheduleReview.issues.length')<beforeIssues);
  assert.ok(document.querySelectorAll('#schedule-changes tbody tr').length>0);
  document.querySelector('[data-apply-schedule-review]').click();
  assert.ok(evaluate('JSON.stringify(data)')!==manualSchedule);
  assert.equal(evaluate('scheduleComparison.after.seatFillPct'),evaluate('computeScheduleMetrics().seatFillPct'));
  route('planning/counterfactual');
  assert.ok(document.querySelector('#main').textContent.includes('Before changes'));
  assert.ok(document.querySelector('#main').textContent.includes('Free seat-hours'));
  document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify(data)'),manualSchedule);
  evaluate("data.courses.find(c=>c.code==='MATH101').sections[0].fixedTime=true");
  assert.equal(evaluate(`(()=>{
    const session=allSessions().find(s=>s.name==='MATH101.A');
    const candidate=buildScheduleReview('initial',70).candidate;
    return sessionRecord(candidate,session).day===session.day && sessionRecord(candidate,session).start===session.start;
  })()`),true);
  assert.equal(evaluate(`(()=>{
    const sessions=allSessions();
    const candidate=buildScheduleReview('postreg',70).candidate;
    return sessions.every(s=>{const next=sessionRecord(candidate,s);return next.day===s.day&&next.start===s.start&&next.end===s.end;});
  })()`),true);

  // Both equality rules honor Hard/Soft and return findings when schedules differ.
  evaluate('data=clone(window.EXAMPLE_DATA)');
  assert.equal(evaluate(`(()=>{
    data.standardRules.push({name:'Match days',type:'Same Day',elements:'CS201,MATH101',enforcement:'Hard'});
    data.standardRules.push({name:'Match starts',type:'Same Time',elements:'CS201,CS202.A',enforcement:'Soft'});
    const findings=scheduleIssues();data.standardRules.splice(-2);
    return findings.some(i=>i.title.includes('Match days')&&i.severity==='error')&&findings.some(i=>i.title.includes('Match starts')&&i.severity==='warning');
  })()`),true);

  // Complete CSVs round-trip. The picker stages edits and invalid rows cannot be applied.
  assert.equal(evaluate("universityCsvRows().filter(r=>r[0]==='Time_Structure').length"),77);
  assert.equal(evaluate("stageSpreadsheet('inventory',csvString(inventoryColumns,universityCsvRows())).errors.length"),0);
  assert.equal(evaluate("stageSpreadsheet('intake',csvString(intakeCsvFields.map(([label])=>label),departmentCsvRows())).errors.length"),0);
  route('courses');
  document.querySelector('#spreadsheets-btn').click();
  const csvInput=document.querySelector('[data-csv-kind="intake"]');
  const pickCsv=async text=>{
    Object.defineProperty(csvInput,'files',{configurable:true,value:[{name:'intake.csv',size:text.length,text:async()=>text}]});
    await csvInput.onchange();
  };
  const beforeCsv=evaluate('JSON.stringify(data)');
  await pickCsv('Course,Course Title,Capacity\nCS201,Introduction to Computing,no');
  assert.match(document.querySelector('#csv-preview').textContent,/Row 2.*Capacity must be a number/);
  assert.equal(document.querySelector('#apply-csv').disabled,true);
  await pickCsv('Course,Course Title,Capacity,Course Notes\r\nCS201,Introduction to Computing,140,"Review, then publish\r\nConfirm with faculty."');
  assert.equal(evaluate('JSON.stringify(data)'),beforeCsv);
  document.querySelector('#apply-csv').click();
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS201').capacity"),140);
  assert.equal(evaluate("data.courses.find(c=>c.code==='CS201').notes"),'Review, then publish\r\nConfirm with faculty.');
  document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify(data)'),beforeCsv);
  console.log('PASS: candidate review and Apply, fixed and post-registration times, measured comparison, equality rules, and CSV validation, preview, import, and Undo.');

  // Upgrade the earlier full catalogue once, preserving retained edits and a recoverable backup.
  const fullCatalogueFixture=evaluate(`JSON.stringify((()=>{
    const earlier=clone(window.EXAMPLE_DATA);
    earlier.courses.find(c=>c.code==='CS201').scheduleStatus='Off';
    earlier.courses.find(c=>c.code==='CS201').notes='Retained faculty edits';
    const archivedCodes=['ME480','ME481','CS408','CS301',...Array.from({length:302},(_,i)=>'ARCHIVE'+i)];
    for(const code of archivedCodes)earlier.courses.push({code,name:'Test-only archived catalogue record',department:'CS',patterns:'',sections:[],labs:[],distributions:[]});
    const oldCourse=earlier.courses.find(c=>c.code==='CS408'),current=earlier.courses.find(c=>c.code==='CS202');
    oldCourse.sections=current.sections.map(s=>({...s,name:s.name.replace('CS202','CS408')}));
    oldCourse.labs=current.labs.map(s=>({...s,name:s.name.replace('CS202','CS408')}));
    earlier.orderRules.push({name:'Archived course relationship',before:'CS408.A',after:'CS408.L-A',enforcement:'Hard',importance:50});
    return earlier;
  })())`);
  for(const migratedAlready of [false,true]){
    const upgrade=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
    try{
      upgrade.window.localStorage.setItem('defterdar-proposal-v2',fullCatalogueFixture);
      if(migratedAlready)upgrade.window.localStorage.setItem('defterdar-proposal-v2-intro-catalogue-v1','done');
      const upgradeContext=upgrade.getInternalVMContext();
      for(const script of scripts)vm.runInContext(fs.readFileSync(path.join(__dirname,script),'utf8'),upgradeContext);
      assert.equal(vm.runInContext('data.courses.length',upgradeContext),migratedAlready?346:40);
      assert.equal(vm.runInContext("data.courses.find(c=>c.code==='CS201').scheduleStatus",upgradeContext),'Off');
      assert.equal(vm.runInContext("data.courses.find(c=>c.code==='CS201').notes",upgradeContext),'Retained faculty edits');
      if(!migratedAlready){
        assert.equal(upgrade.window.localStorage.getItem('defterdar-proposal-v2-before-intro-catalogue'),fullCatalogueFixture);
        assert.ok(upgrade.window.document.querySelector('#download-catalogue-backup'));
        assert.equal(vm.runInContext("data.orderRules.some(r=>r.name==='Archived course relationship')",upgradeContext),false);
        assert.equal(vm.runInContext('validateImport(clone(data)).courses.length',upgradeContext),40);
      }
    }finally{upgrade.window.close();}
  }
  console.log('PASS: catalogue, metadata distinctions, unique codes, all routes, import, branding and clean starting checks.');
  console.log('PASS: hidden filters, all-record defaults, sorting, arbitrary capacities, rule conversions/importance, weekend grids/checks/import, configured slots, numeric percentages, scenario repair/Undo, first-time guide, and saved/legacy workspace restoration.');
  console.log('PASS: course On/Off switches, active-only timetables/occupancy/staff hours/planning/checks, preserved assignments and integrity guards, inclusion filter/detail form, Undo, all-off plans, persistence and legacy defaults.');
  console.log('PASS: 40-course foundational selection, valid sample assignments/relationships, one-time older-catalogue upgrade, preserved edits/inclusion, backup download and deliberate-import compatibility.');
}finally{dom.window.close();}
assert.deepEqual(errors,[]);
})().catch(error=>{console.error(error);process.exitCode=1;});
