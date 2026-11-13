'use strict';

const inventoryColumns = ['Record_Type','Code_Or_From','Name_Or_To','Campus','Building','Classroom_Type','Capacity','Turnaround_Gap_Min','Travel_Min','Slot_Window','Availability'];
const intakeCsvFields = [
  ['Course','code'],['Course Title','name'],['SU Credit','credits'],['Catalogue ECTS','catalogEcts'],
  ['Open Status','openStatus'],['Double Coded Course','doubleCodedCourse'],['Special Approval','specialApproval'],
  ['Total Hrs/Week','weeklyHours'],['Dist. Of Hours','patterns'],['Capacity','capacity'],['Number Of Sections','plannedSections'],
  ['Capacity Of Section','sectionCapacity'],['Part Of Term','partOfTerm'],['Course Notes','notes'],
  ['Course Coreq. Rel.','corequisites'],['Instructors','instructorRequest'],['Class Reqs','classRequirements'],
  ['Correction Status','correctionStatus'],['Room','roomRequest'],['Subject','department'],['In Schedule','scheduleStatus'],
  ['Term Distributions','distributions']
];
const formulaPrefix = /^(?:\s*[=+\-@]|[\t\r])/;

function csvString(headers, rows) {
  const cell = value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && (formulaPrefix.test(text) || text.startsWith("'"))) text = "'" + text;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}

function downloadCsvFile(filename, headers, rows) {
  const url = URL.createObjectURL(new Blob([csvString(headers, rows)], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function universityCsvRows() {
  return [
    ...data.campuses.map(r => ['Campus',r.name]),
    ...data.buildings.map(r => ['Building',r.name,'',r.campus]),
    ...data.classroomTypes.map(r => ['Classroom_Type',r.name]),
    ...data.classrooms.map(r => ['Classroom',r.code,r.name,r.campus,r.building,r.type,r.capacity,r.gap,'','',r.availability?JSON.stringify(r.availability):'']),
    ...data.buildingTravel.map(r => ['Building_Travel',r.from,r.to,'','','','','',r.minutes]),
    ...data.campusTravel.map(r => ['Campus_Travel',r.from,r.to,'','','','','',r.minutes]),
    ...data.campusBuildingTravel.map(r => ['Campus_Building_Travel',r.from,r.to,'','','','','',r.minutes]),
    ...data.timeStructure.map(r => ['Time_Structure',r.day,`${r.start}-${r.end}`])
  ].map(row => inventoryColumns.map((_,index)=>row[index]??''));
}

function departmentCsvRows() {
  return data.courses.map(course => intakeCsvFields.map(([,key]) => key === 'distributions' ? JSON.stringify(course.distributions) : course[key]));
}

function exportUniversitySpreadsheetCsv() {
  downloadCsvFile('university-inventory.csv', inventoryColumns, universityCsvRows());
}

function exportDepartmentIntakeCsv() {
  downloadCsvFile('department-intake.csv', intakeCsvFields.map(([label])=>label), departmentCsvRows());
}

function exportScheduleCsv() {
  downloadCsvFile('current-schedule.csv', ['Section','Type','Course','Day','Start','End','Room','Demand','Instructor','TA','LA','Fixed Time'],
    allSessions().map(s=>[sessionLabel(s),sessionType(s),s.course,s.day,s.start,s.end,s.classroom,s.demand,s.instructor,s.teachingAssistant,s.learningAssistant,s.fixedTime===true?'Yes':'No']));
}

function readCsv(text) {
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let line = 1, rowLine = 1, row = [], value = '', quoted = false, closed = false;
  const pushCell = () => { row.push(value); value = ''; closed = false; };
  const pushRow = () => {
    pushCell();
    if (row.some(cell => cell.trim())) rows.push({line:rowLine, cells:row});
    row = [];
  };
  for (let i=0; i<input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i+1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else { value += char; if (char === '\n') line++; }
    } else if (char === ',') pushCell();
    else if (char === '\n' || char === '\r') {
      pushRow();
      if (char === '\r' && input[i+1] === '\n') i++;
      rowLine = ++line;
    } else if (char === '"' && !value && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error(`Row ${rowLine}: unexpected text after a quoted field or unescaped quote.`);
      value += char;
    }
  }
  if (quoted) throw new Error(`Row ${rowLine}: unclosed quoted field.`);
  pushRow();
  return rows;
}

function inventoryCsvRecord(row) {
  const code = row.Code_Or_From?.trim(), name = row.Name_Or_To?.trim();
  const travel = {from:code, to:name, minutes:csvNumber(row.Travel_Min,'Travel_Min')};
  switch (row.Record_Type) {
    case 'Campus': return ['campuses',['name'],{name:code}];
    case 'Building': return ['buildings',['name'],{name:code,campus:row.Campus}];
    case 'Classroom_Type': return ['classroomTypes',['name'],{name:code}];
    case 'Classroom': {
      const room = {code,name,campus:row.Campus,building:row.Building,type:row.Classroom_Type,capacity:csvNumber(row.Capacity,'Capacity'),gap:csvNumber(row.Turnaround_Gap_Min,'Turnaround_Gap_Min')};
      if (row.Availability) room.availability = JSON.parse(row.Availability);
      return ['classrooms',['code'],room];
    }
    case 'Building_Travel': return ['buildingTravel',['from','to'],travel];
    case 'Campus_Travel': return ['campusTravel',['from','to'],travel];
    case 'Campus_Building_Travel': return ['campusBuildingTravel',['from','to'],travel];
    case 'Time_Structure': {
      const range = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(name || '');
      if (!range) throw new Error('Name_Or_To must contain a time range such as 08:40-09:30.');
      const [,start,end] = range;
      return ['timeStructure',['day','start','end'],{day:code,start,end}];
    }
    default: throw new Error(`Unknown record type “${row.Record_Type}”.`);
  }
}

function csvNumber(value, label) {
  if (value===undefined || value.trim()==='') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
  return number;
}

function courseCsvRecord(row, candidate) {
  const code = row.Course.trim();
  const prior = candidate.courses.find(course => course.code === code);
  const record = {...(prior || {sections:[],labs:[],distributions:[],scheduleStatus:'On',patterns:''}),code};
  for (const [label,key] of intakeCsvFields) {
    if (row[label] === undefined || key === 'code') continue;
    if (key === 'distributions') { record.distributions = row[label] ? JSON.parse(row[label]) : []; continue; }
    const spec = schemas.courses.find(field=>field.key===key);
    record[key] = spec?.type === 'number' ? csvNumber(row[label],label) : key === 'notes' ? row[label] : row[label].trim();
  }
  if (!record.department) record.department = code.match(/^[A-Z]+/)?.[0] || '';
  return ['courses',['code'],record];
}

function stageSpreadsheet(kind, text) {
  const result = {baseline:JSON.stringify(data), candidate:null, rows:[], errors:[]};
  try {
    const rows = readCsv(text);
    const headers = rows.shift()?.cells.map(s=>s.trim()) || [];
    const required = kind==='inventory' ? ['Record_Type','Code_Or_From','Name_Or_To'] : ['Course','Course Title'];
    const missing = required.filter(label=>!headers.includes(label));
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);
    if (new Set(headers).size!==headers.length || headers.includes('')) throw new Error('Column names must be unique and nonblank.');
    if (!rows.length) throw new Error('Add at least one data row.');
    if (rows.length>10000) throw new Error('Use at most 10,000 data rows.');
    const next = clone(data), seen = new Set();
    for (const row of rows) {
      try {
        if (row.cells.length!==headers.length) throw new Error(`Expected ${headers.length} columns, found ${row.cells.length}.`);
        const values = Object.fromEntries(headers.map((key,i)=>{
          const value=row.cells[i];
          return [key,value.startsWith("'")&&(value[1]==="'"||formulaPrefix.test(value.slice(1)))?value.slice(1):value];
        }));
        const [key,identity,record] = kind==='inventory' ? inventoryCsvRecord(values) : courseCsvRecord(values,next);
        const id = JSON.stringify([key,...identity.map(field=>record[field])]);
        if (seen.has(id)) throw new Error('Duplicate record in this file.');
        seen.add(id);
        const index = next[key].findIndex(existing=>identity.every(field=>existing[field]===record[field]));
        const before = index===-1?null:next[key][index];
        const merged = {...before,...record};
        if (index===-1) next[key].push(merged); else next[key][index]=merged;
        const action = !before ? 'Add' : JSON.stringify(before)===JSON.stringify(merged) ? 'Unchanged' : 'Update';
        result.rows.push({line:row.line,key,record:merged,label:identity.map(field=>record[field]).join(' · '),action});
      } catch (error) { result.errors.push(`Row ${row.line}: ${error.message}`); }
    }
    normalizePlanningData(next);
    inspectWorkspace(next, () => {
      for (const row of result.rows) {
        const message = validate(row.record,row.key) || validateTeachingPlacement(row.record,row.key);
        if (message) result.errors.push(`Row ${row.line}: ${message}`);
        if (row.key==='courses' && (!Array.isArray(row.record.distributions) || row.record.distributions.some(r=>!r || validate(r,'distributions')))) {
          result.errors.push(`Row ${row.line}: invalid term distributions.`);
        }
        const availability = row.record.availability;
        if (availability!==undefined && (!availability || typeof availability!=='object' || Array.isArray(availability) ||
          Object.entries(availability).some(([slot,state])=>!/^[0-6]-([0-9]|1[0-9]|2[0-3])$/.test(slot)||!['Available','Preferred','Unavailable'].includes(state)))) {
          result.errors.push(`Row ${row.line}: invalid room availability.`);
        }
      }
    });
    if (!result.errors.length) result.candidate = validateImport(next);
  } catch (error) { result.errors.push(error.message); }
  return result;
}

function openSpreadsheetModal() {
  const modal = document.querySelector('#spreadsheet-dialog');
  modal.innerHTML = `<div class="dialog-heading"><h2 id="spreadsheet-dialog-title">Spreadsheet import and export</h2><button type="button" id="close-spreadsheet-dialog" aria-label="Close">×</button></div>
    <p>Download a CSV to see the available columns. Imports add or update matching records and keep existing sections and labs. Review the rows before applying changes.</p>
    <div class="spreadsheet-modal-grid">
    <section class="spreadsheet-card"><h3>University inventory</h3><p>Rooms, buildings, availability, travel times, and all configured teaching blocks.</p><button type="button" data-export-uni-csv>Download inventory CSV</button><label>Import inventory CSV<input type="file" accept=".csv,text/csv" data-csv-kind="inventory"></label></section>
    <section class="spreadsheet-card"><h3>Department intake</h3><p>Course details, semester inclusion, and term distributions.</p><button type="button" data-export-dept-csv>Download intake CSV</button><label>Import intake CSV<input type="file" accept=".csv,text/csv" data-csv-kind="intake"></label></section>
    <section class="spreadsheet-card"><h3>Schedule and backup</h3><button type="button" data-export-schedule-csv>Download schedule CSV</button><button type="button" id="modal-export-json">Export workspace JSON</button><button type="button" id="modal-import-json">Import workspace JSON</button></section></div>
    <div id="csv-preview" aria-live="polite"></div>`;
  modal.showModal();
  modal.querySelector('#close-spreadsheet-dialog').onclick = () => modal.close();
  for (const action of ['import','export']) modal.querySelector(`#modal-${action}-json`).onclick = () => { modal.close(); document.querySelector(`#${action}`).click(); };
  const preview = modal.querySelector('#csv-preview');
  let latest = 0;
  for (const input of modal.querySelectorAll('[data-csv-kind]')) input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const version = ++latest;
    preview.textContent = 'Reading CSV…';
    try {
      if (!/\.csv$/i.test(file.name) || file.size>5*1024*1024) throw new Error('Choose a CSV file smaller than 5 MB.');
      const contents = await file.text();
      if (version!==latest || !modal.open || !preview.isConnected) return;
      const staged = stageSpreadsheet(input.dataset.csvKind, contents);
      const changed = staged.rows.filter(r=>r.action!=='Unchanged').length;
      preview.innerHTML = `<h3>Import review</h3><p>${esc(file.name)} · ${staged.rows.length} rows read · ${changed} additions or updates</p>
        ${staged.errors.length?`<ul role="alert">${staged.errors.slice(0,30).map(error=>`<li>${esc(error)}</li>`).join('')}</ul>`:''}
        ${staged.errors.length>30?`<p>${staged.errors.length-30} further errors</p>`:''}
        ${staged.rows.length?`<div class="table-wrap"><table><thead><tr><th>CSV row</th><th>Record</th><th>Action</th></tr></thead><tbody>${staged.rows.slice(0,50).map(r=>`<tr><td>${r.line}</td><td>${esc(r.label)}</td><td>${r.action}</td></tr>`).join('')}</tbody></table></div>`:''}
        ${staged.rows.length>50?'<p>Showing the first 50 rows.</p>':''}<button type="button" class="primary" id="apply-csv" ${staged.candidate&&changed?'':'disabled'}>Apply CSV changes</button>`;
      preview.querySelector('#apply-csv').onclick = () => {
        if (!staged.candidate || !changed) return;
        if (staged.baseline !== JSON.stringify(data)) { preview.textContent='The workspace changed. Select the CSV again to review it.'; return; }
        checkpoint();
        data = staged.candidate;
        const saved = persist();
        modal.close();
        render();
        notify(saved?'CSV changes applied. Use Undo to recover your previous records.':'CSV changes applied for this session. Export data to keep them.');
      };
    } catch (error) {
      if (version===latest && preview.isConnected) preview.textContent = error.message;
    } finally { if (version===latest) input.value = ''; }
  };
}
