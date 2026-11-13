// Run from the repository root: node frontend/verify.cjs
// Uses the development dependency jsdom; the static website itself has no runtime dependencies.
const {JSDOM} = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
});
const window = dom.window;
const document = window.document;
const context = dom.getInternalVMContext();
const evaluate = code => vm.runInContext(code, context);
window.confirm = () => true;
window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
window.HTMLDialogElement.prototype.close = function() { this.open = false; };
for (const file of ['data.js', 'app.js', 'workspace.js', 'occupancy.js', 'staff.js', 'planning.js']) {
  evaluate(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}
evaluate("Object.assign(roomView,{day:'MONDAY',start:'09:30',end:'10:30'});Object.assign(staffView,{day:'MONDAY',start:'09:30',end:'10:30'})");
const route = hash => { window.location.hash = hash; evaluate('render()'); };
const change = (selector, value) => {
  const input = document.querySelector(selector);
  input.value = value;
  input.dispatchEvent(new window.Event('change', {bubbles: true}));
};

try {
  // Existing screens and new deep links render without database or network access.
  for (const hash of ['dashboard', 'general', 'instructors', 'courses', 'rules', 'issues',
    'help', 'login', 'timetable', 'classrooms', 'classrooms/edit/0',
    'courses/edit/0', 'occupancy', 'occupancy/room/TH-101', 'planning']) {
    route(hash);
    assert.ok(document.querySelector('h1'), hash);
  }
  route('occupancy/room/does-not-exist');
  assert.equal(document.querySelector('h1').textContent, 'Classroom not found');
  route('occupancy/room/%E0%A4%A'); // Invalid encoded URL should show a useful empty state.
  assert.equal(document.querySelector('h1').textContent, 'Classroom not found');

  // One of nine rooms is occupied by CS101 on Monday morning in the starting data.
  assert.equal(evaluate("slotOccupancy(data.classrooms, 'MONDAY', '09:30', '10:30').occupied"), 1);
  assert.equal(evaluate("slotOccupancy(data.classrooms, 'MONDAY', '09:30', '10:30').percent"), 11);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '11:20', '12:20').free"), true);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '09:00', '09:30').free"), true);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '11:19', '12:00').occupied"), true);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '09:30', '10:30').seatFill"), 50);

  // Peak demand must not add together sequential classes or double-count rooms.
  evaluate(`data.courses[0].sections.push({...data.courses[0].sections[0], name:'Sequential', start:'11:20', end:'12:20', demand:40})`);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '09:30', '12:20').peakDemand"), 60);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '09:30', '12:20').collision"), false);
  evaluate(`data.courses[0].sections.push({...data.courses[0].sections[0], name:'Conflict', demand:80})`);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '09:30', '10:30').peakDemand"), 140);
  assert.equal(evaluate("roomWindow(data.classrooms[0], 'MONDAY', '09:30', '10:30').collision"), true);
  assert.equal(evaluate("slotOccupancy(data.classrooms, 'MONDAY', '09:30', '10:30').occupied"), 1);
  evaluate('data = clone(window.EXAMPLE_DATA)');

  // An empty but unavailable room cannot be advertised as free.
  evaluate("data.classrooms[1].availability = {'0-9':'Unavailable'}");
  assert.equal(evaluate("roomWindow(data.classrooms[1], 'MONDAY', '09:30', '10:30').free"), false);
  assert.equal(evaluate("roomWindow(data.classrooms[1], 'MONDAY', '09:30', '10:30').blocked"), true);
  assert.equal(evaluate("slotOccupancy(data.classrooms, 'MONDAY', '09:30', '10:30').blocked"), 1);
  evaluate('data = clone(window.EXAMPLE_DATA)');

  // Type and capacity filters affect both views; multiple types form a union.
  evaluate("roomView.types=['Computer Laboratory','Amphitheater']");
  assert.equal(evaluate('roomsInScope().length'), 3);
  evaluate('roomView.minSeats=100');
  assert.equal(evaluate('roomsInScope().length'), 2);
  evaluate("Object.assign(roomView,{types:[],minSeats:0})");
  route('classrooms');
  change('#finder-status', 'occupied');
  assert.equal(document.querySelectorAll('.room-result').length, 1);
  assert.ok(document.querySelector('.room-name').hash.startsWith('#occupancy/room/'));
  change('#finder-status', '');
  change('#finder-end', '08:00');
  assert.equal(document.querySelectorAll('.room-result').length, 0);
  assert.ok(document.querySelector('[role=alert]'));
  change('#finder-end', '10:30');
  change('#finder-day', '');
  assert.equal(document.querySelectorAll('.room-result').length, 9);
  change('#finder-day', 'MONDAY');

  // Search can be broadened after another filter has caused a render.
  let search = document.querySelector('#finder-search');
  search.value = 'TH-101'; search.dispatchEvent(new window.Event('input', {bubbles:true}));
  change('#room-min-seats', '10');
  search = document.querySelector('#finder-search');
  search.value = ''; search.dispatchEvent(new window.Event('input', {bubbles:true}));
  assert.equal([...document.querySelectorAll('.room-result')].filter(row => !row.hidden).length, 9);
  evaluate('roomView.minSeats=0');

  route('occupancy');
  document.querySelector('[data-inspect-day=MONDAY][data-inspect-start="09:30"]').click();
  assert.ok(document.querySelector('#slot-heading').textContent.includes('09:30'));
  assert.equal(document.querySelectorAll('.slot-room').length, 9);
  assert.equal(document.querySelectorAll('.slot-room.occupied').length, 1);
  route('occupancy/room/TH-101');
  assert.equal(document.querySelectorAll('.room-day-track').length, 7);
  assert.ok(Math.abs(parseFloat(document.querySelector('.room-event').style.top)-(50/60*76))<0.001);
  assert.ok(document.querySelector('.room-event').textContent.includes('CS101.01'));

  // No overlapping event is hidden behind another event in a room timetable.
  evaluate("const a=allSessions()[0]; globalThis.placed=layoutEvents([a,{...a,start:'10:00',end:'12:00'},{...a,start:'12:00',end:'13:00'}])");
  assert.equal(evaluate('placed[0].columns'), 2);
  assert.equal(evaluate('placed[1].columns'), 2);
  assert.equal(evaluate('placed[2].columns'), 1);

  // The presentation scenario demonstrates occupancy, capacity, and a valid repair.
  const beforeScenario = evaluate('JSON.stringify(data)');
  evaluate('loadPresentationExample()');
  assert.equal(evaluate("slotOccupancy(data.classrooms,'MONDAY','09:30','10:30').occupied"), 5);
  assert.equal(evaluate('validateImport(clone(data)).courses.length'), 12);
  route('planning');
  const apply = document.querySelector('[data-apply-room="AH-101"]');
  assert.equal(apply.disabled, false);
  assert.ok(document.querySelector('[data-apply-room="TH-201"]').disabled);
  apply.click();
  assert.equal(evaluate("data.courses[5].sections[0].classroom"), 'AH-101');
  assert.equal(evaluate("roomWindow(data.classrooms.find(r=>r.code==='TH-201'),'MONDAY','09:30','10:30').free"), true);
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.courses[5].sections[0].classroom'), 'TH-201');
  document.querySelector('#undo').click();
  assert.equal(evaluate('JSON.stringify(data)'), beforeScenario);

  // Malformed imports never replace the live workspace, and reference guards survive.
  const beforeImport = evaluate('JSON.stringify(data)');
  assert.throws(() => evaluate('validateImport({})'));
  assert.equal(evaluate('JSON.stringify(data)'), beforeImport);
  assert.ok(evaluate("deletionBlock('classrooms',0)").includes('used'));

  // Teaching-team schedules include optional assistants as well as lead teachers.
  evaluate('data=clone(window.EXAMPLE_DATA)');
  assert.equal(evaluate("data.instructors.filter(p=>staffRole(p)==='Teaching Assistant').length"),2);
  assert.equal(evaluate("data.instructors.filter(p=>staffRole(p)==='Learning Assistant').length"),2);
  assert.equal(evaluate("staffWindow(data.instructors.find(p=>p.email==='deniz.kaya@example.com'),'MONDAY','09:30','10:30').busy"),true);
  assert.equal(evaluate("staffWindow(data.instructors.find(p=>p.email==='deniz.kaya@example.com'),'MONDAY','11:20','12:20').free"),true);
  route('instructors/schedule/deniz.kaya%40example.com');
  assert.equal(document.querySelector('h1').textContent,'Deniz Kaya');
  assert.ok(document.querySelector('.room-event').textContent.includes('Teaching Assistant'));
  assert.ok(document.querySelector('.room-event').textContent.includes('TH-101'));
  assert.equal(document.querySelectorAll('.room-day-track').length,7);
  route('instructors/schedule/not-found');
  assert.equal(document.querySelector('h1').textContent,'Staff member not found');
  route('instructors/schedule/%E0%A4%A');
  assert.equal(document.querySelector('h1').textContent,'Staff member not found');
  route('instructors/occupancy');
  document.querySelector('[data-staff-slot-day=MONDAY][data-staff-slot-start="09:30"]').click();
  assert.equal(document.querySelectorAll('#staff-slot-inspector .slot-room').length,13);
  assert.equal(document.querySelectorAll('#staff-slot-inspector .slot-room.occupied').length,3);
  route('instructors');
  assert.equal(document.querySelector('h1').textContent,'Teaching staff');
  assert.ok(document.querySelector('.room-name').hash.startsWith('#instructors/schedule/'));
  evaluate("staffView.roles=['Teaching Assistant','Learning Assistant'];render()");
  assert.equal(document.querySelectorAll('.staff-result').length,4);
  change('#staff-status','busy');
  assert.equal(document.querySelectorAll('.staff-result').length,2);
  change('#staff-start','10:30');change('#staff-end','09:30');
  assert.ok(document.querySelector('[role=alert]'));
  evaluate("Object.assign(staffView,{roles:[],day:'MONDAY',start:'09:30',end:'10:30',status:''})");

  // Teacher filters in the existing timetable include assistant assignments.
  evaluate("timetableFilters.instructor='Deniz Kaya'");
  route('timetable');
  assert.ok([...document.querySelectorAll('.session-card')].some(card=>card.textContent.includes('CS101.01')));
  evaluate("timetableFilters.instructor=''");

  // Assignments are optional, constrained by role, and included in delete/rename guards.
  route('courses/edit/0');evaluate("edit('sections',0,0)");
  let staffForm=document.querySelector('#edit-form');
  assert.equal(staffForm.elements.teachingAssistant.required,false);
  assert.ok(staffForm.elements.teachingAssistant.textContent.includes('Deniz Kaya'));
  assert.equal(staffForm.elements.teachingAssistant.options.length,3);
  assert.ok(evaluate("deletionBlock('instructors',data.instructors.findIndex(p=>p.email==='deniz.kaya@example.com'))").includes('used'));
  assert.equal(evaluate("validate({...data.courses[0].sections[0],teachingAssistant:'',learningAssistant:''},'sections')"),'');
  assert.ok(evaluate("validate({...data.courses[0].sections[0],teachingAssistant:'mert.demir@example.com'},'sections')"));
  assert.ok(evaluate("validate({...data.courses[0].sections[0],instructor:'Deniz Kaya'},'sections')").includes('one assignment'));
  const taIndex=evaluate("data.instructors.findIndex(p=>p.email==='deniz.kaya@example.com')");
  evaluate(`edit('instructors',${taIndex})`);
  staffForm=document.querySelector('#edit-form');staffForm.elements.email.value='deniz.new@example.com';
  staffForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate('data.courses[0].sections[0].teachingAssistant'),'deniz.new@example.com');
  assert.ok(evaluate(`validate({...data.instructors[${taIndex}],role:'Instructor'},'instructors',${taIndex})`).includes('Remove'));
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.courses[0].sections[0].teachingAssistant'),'deniz.kaya@example.com');

  // Staff conflicts include cross-role assignments and block room recommendations.
  evaluate("data.courses[1].sections[0].day='MONDAY';data.courses[1].sections[0].start='09:30';data.courses[1].sections[0].end='11:20';data.courses[1].sections[0].teachingAssistant='deniz.kaya@example.com'");
  assert.equal(evaluate("staffWindow(data.instructors.find(p=>p.email==='deniz.kaya@example.com'),'MONDAY','09:30','10:30').collision"),true);
  assert.ok(evaluate("scheduleIssues().some(i=>i.title==='Teaching staff overlap')"));
  assert.equal(evaluate("roomCandidates(allSessions().find(s=>s.name==='CS101.01'),'',70).filter(c=>!c.reasons.length).length"),0);
  evaluate("data=clone(window.EXAMPLE_DATA);data.instructors.find(p=>p.email==='mert.demir@example.com').availability={'0-9':'Unavailable'}");
  assert.equal(evaluate("staffWindow(data.instructors.find(p=>p.email==='mert.demir@example.com'),'MONDAY','09:30','10:30').blocked"),true);
  assert.ok(evaluate("scheduleIssues().some(i=>i.title==='Assistant unavailable')"));

  // Older exports upgrade in memory; imports and assistant examples preserve existing records.
  evaluate('data=clone(window.EXAMPLE_DATA)');
  const legacy=evaluate("JSON.stringify(normalizeStaffData(clone(data)))");
  evaluate("const legacyWorkspace=clone(data);legacyWorkspace.instructors.forEach(p=>delete p.role);legacyWorkspace.courses.forEach(c=>[...c.sections,...c.labs].forEach(s=>{delete s.teachingAssistant;delete s.learningAssistant}));globalThis.upgraded=validateImport(legacyWorkspace)");
  assert.equal(evaluate("upgraded.instructors.every(p=>p.role==='Instructor')"),true);
  assert.equal(evaluate("upgraded.courses[0].sections[0].teachingAssistant"),'');
  assert.equal(evaluate('JSON.stringify(data)'),legacy);
  evaluate("data.instructors=data.instructors.filter(p=>staffRole(p)==='Instructor');data.courses.forEach(c=>[...c.sections,...c.labs].forEach(s=>{s.teachingAssistant='';s.learningAssistant=''}));addAssistantExamples()");
  assert.equal(evaluate('data.instructors.length'),13);
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.instructors.length'),9);
  evaluate('data=clone(window.EXAMPLE_DATA)');
  assert.equal(evaluate('validateImport(clone(data)).instructors.length'),13);

  // Email-derived policies are editable, persisted, undoable, and kept in their group.
  route('rules');
  const planningRuleCounts={hard:evaluate('planningRuleExamples.hardConstraints.length'),soft:evaluate('planningRuleExamples.softConstraints.length')};
  assert.equal(document.querySelectorAll('.hard .constraint-card').length,planningRuleCounts.hard);
  assert.equal(document.querySelectorAll('.soft .constraint-card').length,planningRuleCounts.soft);
  assert.ok(document.querySelector('.hard').textContent.includes('Registration & Add/Drop schedule freeze'));
  document.querySelector('[data-action="add"][data-key="softConstraints"]').click();
  let editor=document.querySelector('#edit-form');
  for(const [key,value] of Object.entries({name:'Example preference',scope:'Example course',requirement:'Use a preferred room when feasible.',importance:'50'}))editor.elements[key].value=value;
  editor.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate('data.softConstraints.length'),planningRuleCounts.soft+1);
  assert.equal(evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY)).softConstraints.length'),planningRuleCounts.soft+1);
  assert.equal(document.querySelectorAll('.soft .constraint-card').length,planningRuleCounts.soft+1);
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.softConstraints.length'),planningRuleCounts.soft);
  document.querySelector('[data-action="edit"][data-key="hardConstraints"]').click();
  editor=document.querySelector('#edit-form');
  editor.elements.requirement.value='Test revision <script>bad</script>';
  editor.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(document.querySelector('.hard .constraint-card p').textContent.includes('<script>bad</script>'));
  assert.equal(document.querySelectorAll('.constraint-card script').length,0);
  document.querySelector('#undo').click();
  document.querySelector('[data-action="delete"][data-key="softConstraints"]').click();
  assert.equal(evaluate('data.softConstraints.length'),planningRuleCounts.soft-1);
  document.querySelector('#undo').click();
  assert.equal(evaluate('data.softConstraints.length'),planningRuleCounts.soft);

  // Faculty metadata preserves unknown numbers as blank; decimal credits round-trip.
  route('courses');
  assert.equal(document.querySelectorAll('.intake-register th').length,19);
  document.querySelector('[data-action="add"][data-key="courses"]').click();
  assert.equal(document.querySelector('#edit-form [name="plannedSections"]').value,'');
  document.querySelector('#cancel').click();
  route('courses/edit/0');
  const intakeForm=document.querySelector('#detail-form');
  intakeForm.elements.credits.value='2.5';
  intakeForm.elements.plannedSections.value='2';
  intakeForm.elements.classRequirements.value='Computer classroom';
  intakeForm.elements.notes.value='Faculty input';
  intakeForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(evaluate('data.courses[0].credits'),2.5);
  assert.equal(evaluate('data.courses[0].capacity'),'');
  assert.equal(evaluate('validateImport(clone(data)).courses[0].credits'),2.5);
  assert.throws(()=>evaluate("const badMetadata=clone(data);badMetadata.courses[0].plannedSections=-1;validateImport(badMetadata)"));

  // Old backups gain policy defaults without resetting courses; deliberate empty groups stay empty.
  const beforePolicyImport=evaluate('JSON.stringify(data)');
  evaluate("const oldIntake=clone(data);delete oldIntake.hardConstraints;delete oldIntake.softConstraints;oldIntake.courses.forEach(c=>intakeFields.forEach(spec=>delete c[spec.key]));globalThis.policyUpgrade=validateImport(oldIntake)");
  assert.equal(evaluate('policyUpgrade.hardConstraints.length'),planningRuleCounts.hard);
  assert.equal(evaluate('policyUpgrade.courses[0].credits'),'');
  assert.equal(evaluate('JSON.stringify(data)'),beforePolicyImport);
  assert.equal(evaluate('validateImport({...clone(data),softConstraints:[]}).softConstraints.length'),0);
  assert.throws(()=>evaluate('validateImport({...clone(data),hardConstraints:{}})'));

  // Reload the actual script order with a legacy browser save; preserve the saved course.
  const legacyBrowserSave=evaluate('JSON.stringify(oldIntake)');
  const restoredDom=new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only'});
  try {
    restoredDom.window.localStorage.setItem('defterdar-proposal-v2',legacyBrowserSave);
    const restoredContext=restoredDom.getInternalVMContext();
    for(const script of ['data.js','app.js','workspace.js','occupancy.js','staff.js','planning.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,script),'utf8'),restoredContext);
    assert.equal(vm.runInContext('data.courses[0].code',restoredContext),evaluate('data.courses[0].code'));
    assert.equal(vm.runInContext('data.hardConstraints.length',restoredContext),planningRuleCounts.hard);
    assert.equal(vm.runInContext('data.courses[0].credits',restoredContext),'');
  } finally { restoredDom.window.close(); }

  route('dashboard');
  assert.equal(document.querySelectorAll('.planning-stages li').length,6);
  assert.ok(document.querySelector('.planning-workflow').textContent.includes('3–4 months'));
  console.log('PASS: routes, occupancy boundaries, peak seat fill, room conflicts, availability, type/capacity/status filters, search, heatmap drill-down, scaled timetable, event layout, recommendations, room assignment, undo, import, and reference guards.');
  console.log('PASS: teaching staff roles, individual schedules, staff heatmap/finder, assistant assignments, cross-role conflicts, assistant availability, rename/delete guards, undo, legacy import, and optional example loading.');
  console.log('PASS: hard/soft policy CRUD, persistence and undo, escaped text, intake fields and decimal credits, optional numeric inputs, legacy imports and browser saves, empty policy groups, and planning workflow.');
} finally {
  dom.window.close();
}
